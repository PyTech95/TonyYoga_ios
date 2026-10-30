"""WhatsApp outbound notifications: Twilio or the Meta WhatsApp Cloud API.

Admin → Settings → WhatsApp picks the provider:
  * twilio (default): twilio_account_sid / twilio_auth_token / twilio_whatsapp_from
  * meta: meta_whatsapp_token / meta_whatsapp_phone_number_id (+ optional approved template)
Unconfigured → a logged no-op, so reminders and alerts never break a request.

WhatsApp only delivers free text to people who wrote to the business number in the last 24 hours.
For alerts to the owner's phone, Meta needs an approved template: set meta_whatsapp_template to
its name (one body variable {{1}}); the message text fills that variable.
"""
import asyncio
import logging
import os

import httpx

logger = logging.getLogger("tony-yoga")

META_BASE = os.environ.get("META_GRAPH_BASE", "https://graph.facebook.com")


def _digits(num: str) -> str:
    return "".join(ch for ch in (num or "") if ch.isdigit() or ch == "+")


async def _provider() -> str:
    from routers.settings import get_setting
    return "meta" if (await get_setting("whatsapp_provider") or "twilio") == "meta" else "twilio"


async def whatsapp_enabled() -> bool:
    from routers.settings import get_setting
    if (await get_setting("whatsapp_enabled")) is False:
        return False
    if await _provider() == "meta":
        return bool(await get_setting("meta_whatsapp_token") and await get_setting("meta_whatsapp_phone_number_id"))
    sid = await get_setting("twilio_account_sid")
    token = await get_setting("twilio_auth_token")
    frm = await get_setting("twilio_whatsapp_from")
    return bool(sid and token and frm)


def _send_sync(sid: str, token: str, frm: str, to: str, body: str) -> bool:
    try:
        from twilio.rest import Client
        client = Client(sid, token)
        from_addr = frm if frm.startswith("whatsapp:") else f"whatsapp:{_digits(frm)}"
        to_addr = to if to.startswith("whatsapp:") else f"whatsapp:{_digits(to)}"
        client.messages.create(from_=from_addr, to=to_addr, body=body[:1500])
        return True
    except Exception as e:
        logger.warning(f"WhatsApp send failed: {e}")
        return False


async def _send_meta(to: str, body: str) -> bool:
    from routers.settings import get_setting
    token = (await get_setting("meta_whatsapp_token") or "").strip()
    phone_id = "".join(ch for ch in str(await get_setting("meta_whatsapp_phone_number_id") or "") if ch.isdigit())
    version = (await get_setting("meta_whatsapp_api_version") or "v23.0").strip()
    template = (await get_setting("meta_whatsapp_template") or "").strip()
    number = "".join(ch for ch in to.replace("whatsapp:", "") if ch.isdigit())
    if not (token and phone_id and number):
        return False
    if template:
        # Template variables may not contain new lines, tabs or 4+ spaces in a row.
        text = " · ".join(line.strip() for line in body.splitlines() if line.strip())[:1000]
        payload = {"messaging_product": "whatsapp", "to": number, "type": "template",
                   "template": {"name": template, "language": {"code": (await get_setting("meta_whatsapp_template_language") or "en")},
                                "components": [{"type": "body", "parameters": [{"type": "text", "text": text}]}]}}
    else:
        payload = {"messaging_product": "whatsapp", "to": number, "type": "text", "text": {"preview_url": False, "body": body[:4000]}}
    try:
        async with httpx.AsyncClient(timeout=httpx.Timeout(20.0, connect=10.0)) as client:
            resp = await client.post(f"{META_BASE}/{version}/{phone_id}/messages", json=payload,
                                     headers={"Authorization": f"Bearer {token}"})
        if resp.status_code == 200:
            return True
        try:
            err = (resp.json().get("error") or {})
            reason = f"{err.get('code')} {err.get('message')}"[:300]
        except Exception:
            reason = resp.text[:300]
        logger.warning("WhatsApp (Meta) send failed: HTTP %s %s", resp.status_code, reason)
        return False
    except Exception as e:
        logger.warning("WhatsApp (Meta) send failed: %s", type(e).__name__)
        return False


async def send_whatsapp(to: str, body: str) -> bool:
    """Best-effort WhatsApp message. Returns False (no raise) when unconfigured."""
    from routers.settings import get_setting
    if not to or not _digits(to):
        return False
    if not await whatsapp_enabled():
        logger.info(f"[whatsapp:noop] would send to {to}: {body[:60]}")
        return False
    if await _provider() == "meta":
        return await _send_meta(to, body)
    sid = await get_setting("twilio_account_sid")
    token = await get_setting("twilio_auth_token")
    frm = await get_setting("twilio_whatsapp_from")
    return await asyncio.to_thread(_send_sync, sid, token, frm, to, body)


async def notify_user_whatsapp(user_id: str, body: str) -> bool:
    """Look up a user's phone/whatsapp number and message them. No-op if absent."""
    from core import db
    u = await db.users.find_one({"id": user_id}, {"_id": 0, "phone": 1, "whatsapp": 1})
    if not u:
        return False
    to = u.get("whatsapp") or u.get("phone")
    if not to:
        return False
    return await send_whatsapp(to, body)
