"""PayPal Orders v2 integration (one-time payments).

Endpoints (all under /api):
    POST /paypal/create-order      Create a PayPal order for an item, return approve URL
    GET  /paypal/capture/{oid}     Capture the order after buyer approves, fulfil purchase
    POST /webhook/paypal           Webhook — PAYMENT.CAPTURE.COMPLETED etc.

Modes: sandbox (default) vs live. Credentials + mode come from the settings
document (DB) with env fallback.

Fulfillment reuses the same `_fulfill_payment(txn)` helper as Stripe, so any
purchase (membership, program, product, drop-in, class pack, private session,
cart) works identically once captured.
"""
import base64
import os
from typing import Any, Dict, Optional
from fastapi import Depends, HTTPException, Request
import httpx

from core import api, db, logger, now_utc, gen_id, get_current_user, require_role
from models import CheckoutRequest
from routers.settings import get_setting
from routers.payments import _resolve_price, _fulfill_payment


SANDBOX_BASE = "https://api-m.sandbox.paypal.com"
LIVE_BASE = "https://api-m.paypal.com"


@api.post("/admin/paypal/verify")
async def paypal_verify(request: Request):
    """Admin: verify the configured PayPal credentials by requesting an OAuth token.
    Lets Tony confirm keys work before switching to Live. Never charges anything."""
    await require_role(request, ["admin"])
    creds = await _paypal_creds()
    if not creds["client_id"] or not creds["client_secret"]:
        return {"ok": False, "error": "No PayPal credentials saved yet."}
    try:
        await _paypal_access_token()
        return {"ok": True, "mode": creds["mode"], "message": f"Connected to PayPal ({creds['mode']})."}
    except HTTPException as e:
        return {"ok": False, "mode": creds["mode"], "error": f"PayPal rejected the credentials ({e.detail}). Check the keys match the {creds['mode']} environment."}
    except Exception as e:
        return {"ok": False, "mode": creds["mode"], "error": str(e)}


async def _paypal_token_for(client_id: str, secret: str, base: str) -> bool:
    """Try an OAuth token against a specific PayPal base URL. True if the creds work there."""
    auth = base64.b64encode(f"{client_id}:{secret}".encode()).decode()
    async with httpx.AsyncClient(timeout=15) as c:
        r = await c.post(
            f"{base}/v1/oauth2/token",
            headers={"Accept": "application/json", "Content-Type": "application/x-www-form-urlencoded",
                     "Authorization": f"Basic {auth}"},
            data="grant_type=client_credentials",
        )
    if r.status_code == 200:
        return bool(r.json().get("access_token"))
    if r.status_code in (400, 401):
        return False
    r.raise_for_status()
    return False


@api.post("/admin/paypal/connect")
async def paypal_connect(payload: dict, request: Request):
    """Save & Verify PayPal in one step. Accepts {client_id, client_secret, enabled?}.
    Blank fields keep the currently-saved value. AUTO-DETECTS sandbox vs live so the
    admin never has to choose a mode. On success, saves creds + detected mode + enables PayPal."""
    admin = await require_role(request, ["admin"])
    from routers.settings import save_settings, get_setting as _gs

    def _clean(v):
        v = (v or "").strip()
        return None if (not v or set(v) <= {"\u2022", "*"}) else v

    client_id = _clean(payload.get("client_id")) or (await _gs("paypal_client_id")) or os.environ.get("PAYPAL_CLIENT_ID", "")
    client_secret = _clean(payload.get("client_secret")) or (await _gs("paypal_client_secret")) or os.environ.get("PAYPAL_CLIENT_SECRET", "")
    if not client_id or not client_secret:
        return {"ok": False, "error": "Enter both your PayPal Client ID and Secret."}

    detected = None
    try:
        if await _paypal_token_for(client_id, client_secret, LIVE_BASE):
            detected = "live"
        elif await _paypal_token_for(client_id, client_secret, SANDBOX_BASE):
            detected = "sandbox"
    except Exception as e:
        return {"ok": False, "error": f"Couldn't reach PayPal right now: {str(e)[:120]}. Please try again."}

    if not detected:
        return {"ok": False, "error": "PayPal rejected these credentials. Double-check the Client ID and Secret were copied correctly (no extra spaces) from your PayPal app."}

    enabled = payload.get("enabled")
    await save_settings({
        "paypal_client_id": client_id,
        "paypal_client_secret": client_secret,
        "paypal_mode": detected,
        "paypal_enabled": True if enabled is None else bool(enabled),
    }, admin)
    return {"ok": True, "mode": detected, "connected": True,
            "message": f"PayPal connected ({detected}). It's now the primary checkout button."}



async def _paypal_creds() -> Dict[str, str]:
    """DB settings first, env fallback."""
    return {
        "client_id": (await get_setting("paypal_client_id")) or os.environ.get("PAYPAL_CLIENT_ID", ""),
        "client_secret": (await get_setting("paypal_client_secret")) or os.environ.get("PAYPAL_CLIENT_SECRET", ""),
        "mode": (await get_setting("paypal_mode")) or os.environ.get("PAYPAL_MODE", "sandbox"),
    }


async def _paypal_base_url() -> str:
    creds = await _paypal_creds()
    return LIVE_BASE if creds["mode"] == "live" else SANDBOX_BASE


async def _paypal_access_token() -> str:
    creds = await _paypal_creds()
    if not creds["client_id"] or not creds["client_secret"]:
        raise HTTPException(400, "PayPal credentials not configured")
    auth = base64.b64encode(f"{creds['client_id']}:{creds['client_secret']}".encode()).decode()
    async with httpx.AsyncClient(timeout=15) as c:
        r = await c.post(
            f"{await _paypal_base_url()}/v1/oauth2/token",
            headers={
                "Accept": "application/json",
                "Content-Type": "application/x-www-form-urlencoded",
                "Authorization": f"Basic {auth}",
            },
            data="grant_type=client_credentials",
        )
    if r.status_code != 200:
        logger.error(f"PayPal auth failed: {r.status_code} {r.text}")
        raise HTTPException(502, "PayPal auth failed")
    return r.json()["access_token"]


@api.post("/paypal/create-order")
async def paypal_create_order(payload: CheckoutRequest, user: dict = Depends(get_current_user)):
    """Create a PayPal Orders v2 order and return the approve URL for redirect."""
    from routers.payments import (
        _reserve_store_credit, _release_store_credit, _credit_eligible, _fulfill_credit_only,
    )
    amount, currency, meta = await _resolve_price(payload.item_type, payload.item_id, payload.quantity, user["id"])
    access_snapshot = meta.pop("_access_snapshot", None)

    # Gift-card store credit: reserve and deduct from the amount to charge.
    credit_applied = 0.0
    if getattr(payload, "apply_credit", False) and _credit_eligible(payload.item_type):
        credit_applied = await _reserve_store_credit(user["id"], float(amount))
    charge_amount = round(float(amount) - credit_applied, 2)
    if credit_applied > 0 and charge_amount <= 0.009:
        await _fulfill_credit_only(user=user, item_type=payload.item_type, item_id=payload.item_id,
                                   quantity=payload.quantity, currency=currency,
                                   credit_applied=credit_applied, meta=meta, access_snapshot=access_snapshot)
        return {"credit_only": True, "credit_applied": credit_applied}

    value = f"{float(charge_amount):.2f}"

    try:
        token = await _paypal_access_token()
    except Exception:
        await _release_store_credit(user["id"], credit_applied)
        raise
    order_body: Dict[str, Any] = {
        "intent": "CAPTURE",
        "purchase_units": [{
            "reference_id": payload.item_id,
            "description": meta.get("plan_name") or meta.get("program_title") or f"{payload.item_type} purchase",
            "amount": {"currency_code": currency.upper(), "value": value},
            "custom_id": user["id"],
        }],
        "application_context": {
            "brand_name": "Tony Yoga",
            "user_action": "PAY_NOW",
            "return_url": f"{payload.origin_url}/checkout/success?paypal=1",
            "cancel_url": f"{payload.origin_url}/checkout/cancel?paypal=1",
        },
    }
    async with httpx.AsyncClient(timeout=15) as c:
        r = await c.post(
            f"{await _paypal_base_url()}/v2/checkout/orders",
            headers={"Content-Type": "application/json", "Authorization": f"Bearer {token}"},
            json=order_body,
        )
    if r.status_code not in (200, 201):
        await _release_store_credit(user["id"], credit_applied)
        logger.error(f"PayPal order create failed: {r.status_code} {r.text}")
        raise HTTPException(502, "PayPal order creation failed")
    data = r.json()
    approve_url = next((l["href"] for l in data.get("links", []) if l.get("rel") == "approve"), None)
    if not approve_url:
        await _release_store_credit(user["id"], credit_applied)
        raise HTTPException(502, "PayPal did not return an approve URL")

    # Record in payment_transactions so we can fulfil on capture and via webhook.
    metadata = {
        "user_id": user["id"], "user_email": user["email"],
        "item_type": payload.item_type, "item_id": payload.item_id,
        "quantity": str(payload.quantity), **meta,
    }
    await db.payment_transactions.insert_one({
        "id": gen_id(), "session_id": data["id"],  # reuse session_id column for order_id
        "provider": "paypal",
        "user_id": user["id"], "user_email": user["email"],
        "amount": float(charge_amount), "currency": currency.upper(),
        "credit_applied": credit_applied,
        "item_type": payload.item_type, "item_id": payload.item_id,
        "quantity": payload.quantity, "metadata": metadata,
        "payment_status": "initiated", "status": "open",
        "mode": "payment",
        **({"access_snapshot": access_snapshot} if access_snapshot else {}),
        "created_at": now_utc().isoformat(),
    })
    return {"url": approve_url, "order_id": data["id"]}


@api.post("/paypal/capture/{order_id}")
async def paypal_capture_order(order_id: str, request: Request):
    """Capture a PayPal order after the buyer approved it. Idempotent.
    Auth is optional — the buyer already authenticated on PayPal, and the order_id
    itself is unguessable, so a returning tab that lost its JWT can still finalise."""
    txn = await db.payment_transactions.find_one({"session_id": order_id, "provider": "paypal"})
    if not txn:
        raise HTTPException(404, "PayPal order not found")
    if txn.get("payment_status") == "paid":
        if (txn.get("access_snapshot") or txn.get("item_type") == "private_session") and not txn.get("fulfilled_at"):
            await _fulfill_payment(txn)
        return {"status": "already_captured", "order_id": order_id}

    token = await _paypal_access_token()
    async with httpx.AsyncClient(timeout=20) as c:
        r = await c.post(
            f"{await _paypal_base_url()}/v2/checkout/orders/{order_id}/capture",
            headers={"Content-Type": "application/json", "Authorization": f"Bearer {token}"},
        )
    # 201 = captured; 422 with COMPL* = already captured previously
    if r.status_code not in (200, 201):
        # Race: buyer may already have been captured via webhook
        if r.status_code == 422 and "ORDER_ALREADY_CAPTURED" in r.text:
            return {"status": "already_captured", "order_id": order_id}
        logger.error(f"PayPal capture failed: {r.status_code} {r.text}")
        raise HTTPException(502, "PayPal capture failed")
    data = r.json()
    status = data.get("status")
    if status != "COMPLETED":
        raise HTTPException(400, f"Unexpected capture status: {status}")

    await db.payment_transactions.update_one(
        {"session_id": order_id},
        {"$set": {"payment_status": "paid", "status": "complete",
                  "completed_at": now_utc().isoformat(),
                  "paypal_capture_response": data}},
    )
    txn = await db.payment_transactions.find_one({"session_id": order_id})
    await _fulfill_payment(txn)
    return {"status": "captured", "order_id": order_id}


@api.post("/webhook/paypal")
async def paypal_webhook(request: Request):
    """PayPal webhook. Handles PAYMENT.CAPTURE.COMPLETED for capture-race safety.

    Signature verification is opportunistic: if a webhook_id is configured
    (paypal_webhook_id setting) we call PayPal's verify-webhook-signature API;
    otherwise we accept and match the order_id defensively.
    """
    body = await request.body()
    try:
        event = await request.json()
    except Exception as e:
        logger.error(f"PayPal webhook JSON parse failed: {e}")
        raise HTTPException(400, "Invalid JSON")

    etype = event.get("event_type")
    resource = event.get("resource", {}) or {}

    # Best-effort signature verification if a webhook id is configured
    webhook_id = await get_setting("paypal_webhook_id")
    if webhook_id:
        try:
            token = await _paypal_access_token()
            async with httpx.AsyncClient(timeout=10) as c:
                v = await c.post(
                    f"{await _paypal_base_url()}/v1/notifications/verify-webhook-signature",
                    headers={"Content-Type": "application/json", "Authorization": f"Bearer {token}"},
                    json={
                        "auth_algo": request.headers.get("paypal-auth-algo", ""),
                        "cert_url": request.headers.get("paypal-cert-url", ""),
                        "transmission_id": request.headers.get("paypal-transmission-id", ""),
                        "transmission_sig": request.headers.get("paypal-transmission-sig", ""),
                        "transmission_time": request.headers.get("paypal-transmission-time", ""),
                        "webhook_id": webhook_id,
                        "webhook_event": event,
                    },
                )
            if v.status_code != 200 or v.json().get("verification_status") != "SUCCESS":
                logger.warning(f"PayPal webhook signature verify failed: {v.text}")
                raise HTTPException(401, "Invalid webhook signature")
        except HTTPException:
            raise
        except Exception as e:
            logger.warning(f"PayPal signature verify errored, accepting anyway: {e}")

    if etype == "PAYMENT.CAPTURE.COMPLETED":
        # Custom_id was set to user_id; supplementary_data.related_ids.order_id links to Orders v2
        order_id: Optional[str] = None
        supp = resource.get("supplementary_data", {}) or {}
        order_id = supp.get("related_ids", {}).get("order_id")
        if order_id:
            txn = await db.payment_transactions.find_one({"session_id": order_id, "provider": "paypal"})
            if txn and (txn.get("payment_status") != "paid" or ((txn.get("access_snapshot") or txn.get("item_type") == "private_session") and not txn.get("fulfilled_at"))):
                await db.payment_transactions.update_one(
                    {"session_id": order_id},
                    {"$set": {"payment_status": "paid", "status": "complete",
                              "completed_at": now_utc().isoformat(),
                              "paypal_webhook_capture": resource.get("id")}},
                )
                await _fulfill_payment(await db.payment_transactions.find_one({"session_id": order_id}))

    return {"received": True}
