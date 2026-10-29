"""Read-only provider checks. No test charge or meeting is created during setup."""
import asyncio
import httpx
import os
import stripe

if os.environ.get("STRIPE_API_BASE"):  # local tests only
    stripe.api_base = os.environ["STRIPE_API_BASE"]
from fastapi import HTTPException
from core import db, now_utc

STRIPE_FIELDS = {"stripe_secret_key", "stripe_publishable_key", "stripe_webhook_secret", "stripe_mode"}
ZOOM_FIELDS = {"zoom_account_id", "zoom_client_id", "zoom_client_secret", "zoom_host_user_id"}


async def effective_config(update, fields):
    from routers.settings import get_setting
    return {key: update[key] if key in update else await get_setting(key) for key in fields}


async def verify_stripe(config):
    key = config["stripe_secret_key"] or ""
    if not key.startswith(("sk_test_", "sk_live_", "rk_test_", "rk_live_")) or len(key) < 20:
        raise HTTPException(422, "Enter a valid Stripe secret or restricted key.")
    mode = "live" if key.startswith(("sk_live_", "rk_live_")) else "test"
    pk = config.get("stripe_publishable_key") or ""
    if pk and not pk.startswith(f"pk_{mode}_"):
        raise HTTPException(422, "Stripe publishable and secret keys must use the same mode.")
    wh = config.get("stripe_webhook_secret") or ""
    if wh and not wh.startswith("whsec_"):
        raise HTTPException(422, "Stripe webhook signing secret must start with whsec_.")
    try:
        balance = await asyncio.to_thread(stripe.Balance.retrieve, api_key=key)
    except stripe.error.StripeError:
        raise HTTPException(422, "Stripe rejected the key or its permissions. Check the key and Balance read permission.")
    except Exception:
        raise HTTPException(502, "Stripe could not be reached. Nothing was saved; try again shortly.")
    if bool(balance.get("livemode")) != (mode == "live"):
        raise HTTPException(422, "Stripe account mode does not match the key.")
    return {"stripe_mode": mode, "stripe_verified_at": now_utc().isoformat()}


async def verify_zoom(config):
    if not all(config.get(k) for k in ZOOM_FIELDS):
        raise HTTPException(422, "Zoom requires Account ID, Client ID, Client Secret, and host email or user ID.")
    from urllib.parse import quote
    try:
        async with httpx.AsyncClient(timeout=20) as client:
            token = await client.post("https://zoom.us/oauth/token",
                auth=(config["zoom_client_id"], config["zoom_client_secret"]),
                data={"grant_type": "account_credentials", "account_id": config["zoom_account_id"]})
            if token.is_error:
                raise HTTPException(422, "Zoom rejected these credentials. Check the Server-to-Server OAuth app is activated.")
            body = token.json()
            scopes = set((body.get("scope") or "").split())
            if not scopes.intersection({"meeting:write:admin", "meeting:write:meeting:admin", "meeting:write"}):
                raise HTTPException(422, "Zoom needs the meeting creation scope (meeting:write:meeting:admin or meeting:write:admin).")
            host = await client.get(f"https://api.zoom.us/v2/users/{quote(config['zoom_host_user_id'], safe='')}",
                headers={"Authorization": f"Bearer {body['access_token']}"})
            if host.is_error:
                raise HTTPException(422, "Zoom host could not be verified. Check the host and user:read:user:admin scope.")
            if host.json().get("status") != "active":
                raise HTTPException(422, "The selected Zoom host must be active.")
    except (httpx.HTTPError, KeyError, ValueError):
        raise HTTPException(502, "Zoom could not be verified. Nothing was saved; try again shortly.")
    return {"zoom_verified_at": now_utc().isoformat()}


async def validate_integration_update(update):
    """Used by ALL admin settings writes, including the general save endpoint."""
    from routers.settings import get_setting
    for provider, fields, verify in (("stripe", STRIPE_FIELDS, verify_stripe), ("zoom", ZOOM_FIELDS, verify_zoom)):
        changed = bool(fields.intersection(update))
        enabling = update.get(f"{provider}_enabled") is True
        if not changed and not enabling:
            continue
        config = await effective_config(update, fields)
        if changed and any(update.get(k) == "" for k in fields if k in update):
            update.update({f"{provider}_enabled": False, f"{provider}_verified_at": ""})
            continue
        if provider == "stripe":
            old_mode = await get_setting("stripe_mode")
            key = config.get("stripe_secret_key") or ""
            new_mode = "live" if key.startswith(("sk_live_", "rk_live_")) else "test"
            if new_mode != old_mode and "stripe_webhook_secret" not in update:
                raise HTTPException(422, "Changing Stripe mode requires that mode's webhook signing secret.")
        update.update(await verify(config))
        if provider == "stripe" and enabling and not config.get("stripe_webhook_secret"):
            raise HTTPException(422, "Add a Stripe webhook signing secret before enabling card payments.")
        if provider == "stripe" and changed:
            update["stripe_webhook_received_at"] = ""
            update["stripe_webhook_verified_at"] = ""


async def integration_status():
    from routers.settings import get_setting
    result = {}
    for name, fields in (("stripe", STRIPE_FIELDS - {"stripe_mode", "stripe_publishable_key"}), ("zoom", ZOOM_FIELDS)):
        config = await effective_config({}, fields)
        missing = [key for key, value in config.items() if not value]
        verified = await get_setting(f"{name}_verified_at")
        enabled = bool(await get_setting(f"{name}_enabled"))
        state = "not_configured" if missing else "unverified" if not verified else "enabled" if enabled else "disabled"
        result[name] = {"state": state, "enabled": enabled, "verified_at": verified, "missing": missing}
    result["stripe"].update({"mode": await get_setting("stripe_mode"),
        "webhook_received_at": await get_setting("stripe_webhook_received_at"),
        "webhook_verified_at": await get_setting("stripe_webhook_verified_at")})
    return result