"""Web Push Notifications via VAPID."""
import os
import asyncio
import json
import base64
import logging
from typing import Optional
from fastapi import Depends, HTTPException, Request
from pydantic import BaseModel
from pywebpush import webpush, WebPushException
from cryptography.hazmat.primitives.asymmetric import ec
from cryptography.hazmat.primitives import serialization

from core import api, db, now_utc, gen_id, get_current_user, require_role

logger = logging.getLogger("tony-yoga.push")

VAPID_EMAIL_DEFAULT = os.environ.get("VAPID_CLAIM_EMAIL", "mailto:tony@tonysanchezyoga.com")


def generate_vapid_keys() -> tuple[str, str]:
    """Generate a VAPID (P-256) keypair as base64url strings.

    Returns (private_key, public_key) where private_key is usable by pywebpush
    and public_key is the applicationServerKey the browser subscribes with.
    """
    def b64url(b: bytes) -> str:
        return base64.urlsafe_b64encode(b).rstrip(b"=").decode("ascii")

    pk = ec.generate_private_key(ec.SECP256R1())
    private_value = pk.private_numbers().private_value.to_bytes(32, "big")
    public_point = pk.public_key().public_bytes(
        serialization.Encoding.X962, serialization.PublicFormat.UncompressedPoint
    )
    return b64url(private_value), b64url(public_point)


async def _get_vapid() -> dict:
    """Resolve VAPID config from admin settings (DB) with .env fallback."""
    from routers.settings import get_setting
    return {
        "private": (await get_setting("vapid_private_key")) or "",
        "public": (await get_setting("vapid_public_key")) or "",
        "email": (await get_setting("vapid_claim_email")) or VAPID_EMAIL_DEFAULT,
        "enabled": bool(await get_setting("push_enabled")),
    }


class PushSubscription(BaseModel):
    endpoint: str
    keys: dict
    user_agent: Optional[str] = None


class BroadcastRequest(BaseModel):
    title: str
    body: str
    url: Optional[str] = None
    audience: str = "all"  # all | members


@api.get("/push/public-key")
async def get_public_key():
    vapid = await _get_vapid()
    ready = bool(vapid['enabled'] and vapid['private'] and vapid['public'])
    return {"public_key": vapid["public"] if ready else "", "enabled": ready}


@api.get('/admin/notifications/status')
async def notification_status(request: Request):
    await require_role(request, ['admin'])
    vapid = await _get_vapid()
    configured = bool(vapid['private'] and vapid['public'])
    subscribers = await db.push_subscriptions.count_documents({'active': True})
    return {'in_app': {'status': 'available'},
            'web_push': {'enabled': vapid['enabled'], 'configured': configured,
                         'ready': configured and vapid['enabled'], 'subscribers': subscribers},
            'native_push': {'android': 'not_integrated', 'ios': 'not_integrated'},
            'note': 'Native Android/iOS push requires the native projects and FCM/APNs setup. Browser push is separate.'}


@api.post("/push/subscribe")
async def subscribe_push(sub: PushSubscription, user: dict = Depends(get_current_user)):
    await db.push_subscriptions.update_one(
        {"endpoint": sub.endpoint},
        {
            "$setOnInsert": {
                "id": gen_id(),
                "endpoint": sub.endpoint,
                "created_at": now_utc().isoformat(),
            },
            "$set": {
                "user_id": user["id"],
                "keys": sub.keys,
                "user_agent": sub.user_agent,
                "active": True,
                "updated_at": now_utc().isoformat(),
            },
        },
        upsert=True,
    )
    return {"ok": True}


@api.post("/push/unsubscribe")
async def unsubscribe_push(body: dict, user: dict = Depends(get_current_user)):
    await db.push_subscriptions.update_one(
        {"user_id": user["id"], "endpoint": body.get("endpoint")},
        {"$set": {"active": False}},
    )
    return {"ok": True}


async def notify_user(user_id: str, title: str, body: str, url: str = "/") -> int:
    """Send a push notification to all of a single user's active subscriptions."""
    import asyncio
    vapid = await _get_vapid()
    if not vapid.get("enabled") or not vapid.get("private"):
        return 0
    subs = await db.push_subscriptions.find({"user_id": user_id, "active": True}, {"_id": 0}).to_list(10)
    payload = {"title": title, "body": body, "url": url}
    sent = 0
    for s in subs:
        # pywebpush is blocking — offload so we never stall the event loop.
        if await asyncio.to_thread(_send_one, s, payload, vapid):
            sent += 1
    return sent


def _send_one(sub: dict, payload: dict, vapid: dict) -> bool:
    return _send_result(sub, payload, vapid)['accepted']


def _send_result(sub: dict, payload: dict, vapid: dict) -> dict:
    if not vapid or not vapid.get('enabled') or not vapid.get("private"):
        return {'accepted': False, 'stale': False}
    try:
        webpush(
            subscription_info={"endpoint": sub["endpoint"], "keys": sub["keys"]},
            data=json.dumps(payload),
            vapid_private_key=vapid["private"],
            vapid_claims={"sub": vapid["email"]},
            timeout=10,
        )
        return {'accepted': True, 'stale': False}
    except WebPushException as e:
        status = getattr(getattr(e, 'response', None), 'status_code', None)
        logger.warning('Push failed (status=%s)', status)
        return {'accepted': False, 'stale': status in (404, 410)}
    except Exception as e:
        logger.warning('Push unavailable (%s)', type(e).__name__)
        return {'accepted': False, 'stale': False}


@api.post("/admin/push/broadcast")
async def broadcast_push(payload: BroadcastRequest, request: Request):
    await require_role(request, ["admin"])
    vapid = await _get_vapid()
    if not (vapid['enabled'] and vapid['private'] and vapid['public']):
        raise HTTPException(503, 'Browser push is disabled or not configured. Configure Web Push in Settings first.')
    if payload.audience == "members":
        member_ids = [s["user_id"] for s in await db.subscriptions.find({"status": "active"}, {"user_id": 1}).to_list(5000)]
        subs = await db.push_subscriptions.find({"active": True, "user_id": {"$in": member_ids}}, {"_id": 0}).to_list(5000)
    else:
        subs = await db.push_subscriptions.find({"active": True}, {"_id": 0}).to_list(5000)
    sent = 0; failed = 0
    msg = {"title": payload.title, "body": payload.body, "url": payload.url or "/"}
    for s in subs:
        result = await asyncio.to_thread(_send_result, s, msg, vapid)
        if result['accepted']:
            sent += 1
        else:
            failed += 1
            if result['stale']:
                await db.push_subscriptions.update_one({"endpoint": s["endpoint"]}, {"$set": {"active": False}})
    return {"sent": sent, "failed": failed, "total_subscriptions": len(subs)}


# ---------- Automatic class reminders ----------
from datetime import datetime, timedelta

async def send_reminders_tick():
    """Called from server.py background loop every 60s.

    Sends a push to any user whose booking starts within the next N minutes
    (default 30) that hasn't already been reminded. Idempotent via
    `reminded_at` field on the booking.
    """
    lead_minutes = int(os.environ.get("REMINDER_LEAD_MINUTES", "30"))
    from core import now_utc  # local import to keep push.py drift-free
    vapid = await _get_vapid()
    from whatsapp_service import whatsapp_enabled, notify_user_whatsapp
    wa_on = await whatsapp_enabled()
    push_on = bool(vapid.get("enabled") and vapid.get("private"))
    if not push_on and not wa_on:
        return 0
    from routers.settings import get_setting
    try:
        lead_minutes = int(await get_setting("reminder_lead_minutes") or 30)
    except (TypeError, ValueError):
        lead_minutes = int(os.environ.get("REMINDER_LEAD_MINUTES", "30"))
    now = now_utc()
    window_end = now + timedelta(minutes=lead_minutes)

    # Any class starting between now and (now + lead) whose bookings haven't been
    # reminded yet. Using a window from "now" (not lead±1) means a delayed/missed
    # 60s tick still catches the reminder; the reminded_at guard prevents duplicates.
    upcoming = await db.class_instances.find(
        {
            "start_time": {"$gt": now.isoformat(), "$lte": window_end.isoformat()},
            "status": {"$ne": "cancelled"},
        },
        {"_id": 0},
    ).to_list(500)
    if not upcoming:
        return 0

    total_sent = 0
    for ci in upcoming:
        # All confirmed bookings that haven't been reminded yet
        bookings = await db.bookings.find(
            {"class_instance_id": ci["id"], "status": "confirmed", "reminded_at": {"$exists": False}},
            {"_id": 0},
        ).to_list(500)
        if not bookings:
            continue
        for b in bookings:
            subs = await db.push_subscriptions.find(
                {"user_id": b["user_id"], "active": True}, {"_id": 0}
            ).to_list(10)
            loc = ci['location_detail'] or ('Online' if ci['location_type'] == 'online' else 'Studio')
            payload = {
                "title": f"{ci['title']} starts in {lead_minutes} minutes",
                "body": f"{loc} · Tap to open.",
                "url": f"/schedule/{ci['id']}",
            }
            for s in subs:
                if push_on and await asyncio.to_thread(_send_one, s, payload, vapid):
                    total_sent += 1
            # WhatsApp reminder (best-effort; no-op if user has no number / not configured)
            if wa_on:
                try:
                    await notify_user_whatsapp(
                        b["user_id"],
                        f"Reminder: {ci['title']} starts in {lead_minutes} min · {loc}. See you on the mat! 🧘",
                    )
                except Exception:
                    pass
            await db.bookings.update_one(
                {"id": b["id"]},
                {"$set": {"reminded_at": now.isoformat()}},
            )
    if total_sent:
        logger.info(f"reminder tick: sent {total_sent} pushes")
    return total_sent
