"""WhatsApp outbound notifications via Twilio.

Reads credentials from app_settings (twilio_account_sid / twilio_auth_token /
twilio_whatsapp_from) with env fallback. Degrades gracefully to a logged no-op
when unconfigured, so class reminders and episode alerts never break.
"""
import asyncio
import logging

logger = logging.getLogger("tony-yoga")


def _digits(num: str) -> str:
    return "".join(ch for ch in (num or "") if ch.isdigit() or ch == "+")


async def whatsapp_enabled() -> bool:
    from routers.settings import get_setting
    if (await get_setting("whatsapp_enabled")) is False:
        return False
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


async def send_whatsapp(to: str, body: str) -> bool:
    """Best-effort WhatsApp message. Returns False (no raise) when unconfigured."""
    from routers.settings import get_setting
    if not to or not _digits(to):
        return False
    if not await whatsapp_enabled():
        logger.info(f"[whatsapp:noop] would send to {to}: {body[:60]}")
        return False
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
