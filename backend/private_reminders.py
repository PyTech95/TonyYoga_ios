"""Durable in-app reminders, independent of browser push and email credentials."""
import hashlib
import math
from datetime import datetime, timedelta, timezone
from core import db, now_utc, logger
from routers.settings import get_setting
from routers.notifications import push_notification


def parse_start(value):
    start = datetime.fromisoformat(str(value).replace("Z", "+00:00"))
    if start.tzinfo is None:
        start = start.replace(tzinfo=timezone.utc)
    return start.astimezone(timezone.utc)


async def private_reminders_tick():
    now = now_utc()
    sent = 0
    errors = 0
    enabled = bool(await get_setting("private_reminders_enabled"))
    lead = int(await get_setting("private_reminder_lead_minutes"))
    if enabled:
        # Parse stored ISO dates before comparing; legacy records may contain offsets.
        async for req in db.private_session_requests.find({"status": "scheduled"}, {"_id": 0}):
            for session in req.get("sessions", []):
                try:
                    start = parse_start(session["start_time"])
                    if not now < start <= now + timedelta(minutes=lead):
                        continue
                    if session.get("status") in ("cancelled", "completed"):
                        continue
                    key = hashlib.sha256(f"{req['id']}:{session['session_id']}:{start.isoformat()}".encode()).hexdigest()
                    minutes = max(1, math.ceil((start - now).total_seconds() / 60))
                    inserted = await push_notification(req["user_id"], "Your private session starts soon",
                        f"Your session with Tony starts in {minutes} minutes ({start:%d %b, %H:%M} UTC).",
                        f"/private-sessions#session-{session['session_id']}", "private_session_reminder", f"reminder-{key}")
                    sent += int(inserted)
                except Exception:
                    errors += 1
                    logger.warning("A private session reminder will be retried on the next tick")
    await db.background_jobs.update_one({"_id": "private_reminders"}, {"$set": {
        "last_run_at": now.isoformat(), "enabled": enabled, "last_sent": sent, "errors": errors},
        "$inc": {"total_sent": sent}}, upsert=True)
    return sent