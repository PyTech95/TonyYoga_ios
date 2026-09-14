"""In-app notification center — one unified feed per user.

Aggregates the signals we already produce (announcements, new podcast/broadcast
episodes, and soon-to-expire class recordings) into a single sorted feed with an
unread count driven by a per-user `notifications_seen_at` watermark.
"""
from fastapi import Depends

from core import api, db, now_utc, gen_id, get_current_user


async def push_notification(user_id: str, title: str, body: str, url: str = "/", ntype: str = "personal", dedupe_key: str = None):
    """Insert a per-user in-app notification (surfaced in the notification bell)."""
    if not user_id:
        return
    notification = {
        "id": gen_id(), "user_id": user_id, "type": ntype,
        "title": title, "body": body, "url": url,
        "created_at": now_utc().isoformat(),
    }
    if dedupe_key:
        result = await db.user_notifications.update_one({"_id": dedupe_key}, {"$setOnInsert": notification}, upsert=True)
        return bool(result.upserted_id)
    await db.user_notifications.insert_one(notification)
    return True


async def push_admins(title: str, body: str, url: str = "/admin", ntype: str = "personal", dedupe_key: str = None):
    """Notify every admin user."""
    admins = await db.users.find({"role": "admin"}, {"id": 1}).to_list(50)
    for a in admins:
        await push_notification(a["id"], title, body, url, ntype, f"{dedupe_key}-{a['id']}" if dedupe_key else None)


@api.get("/notifications")
async def list_notifications(user: dict = Depends(get_current_user)):
    seen_at = user.get("notifications_seen_at") or "2000-01-01T00:00:00+00:00"
    items = []

    role = user.get("role", "student")
    for a in await db.announcements.find(
        {"audience": {"$in": ["all", role]}}, {"_id": 0}
    ).sort("created_at", -1).to_list(30):
        items.append({
            "type": "announcement", "title": a.get("title"),
            "body": (a.get("body") or "")[:160], "at": a.get("created_at"), "url": "/home",
        })

    now_iso = now_utc().isoformat()
    for b in await db.broadcasts.find(
        {"is_published": True, "publish_at": {"$lte": now_iso}}, {"_id": 0}
    ).sort("publish_at", -1).to_list(15):
        items.append({
            "type": "broadcast", "title": f"New episode: {b.get('title')}",
            "body": (b.get("description") or "")[:120],
            "at": b.get("publish_at") or b.get("created_at"),
            "url": f"/broadcasts/{b.get('id')}",
        })

    my = await db.bookings.find(
        {"user_id": user["id"], "status": {"$in": ["confirmed", "attended"]}},
        {"_id": 0, "class_instance_id": 1},
    ).to_list(300)
    ids = [b["class_instance_id"] for b in my]
    if ids:
        recs = await db.class_instances.find(
            {"id": {"$in": ids}, "recording_url": {"$nin": [None, ""]},
             "recording_expires_at": {"$gt": now_iso}},
            {"_id": 0},
        ).to_list(300)
        for ci in recs:
            items.append({
                "type": "recording", "title": f"Recording ready: {ci.get('title')}",
                "body": f"Available to rewatch until {str(ci.get('recording_expires_at'))[:10]}",
                "at": ci.get("recording_available_at") or ci.get("start_time"),
                "url": f"/schedule/{ci.get('id')}",
            })

    for n in await db.user_notifications.find(
        {"user_id": user["id"]}, {"_id": 0}
    ).sort("created_at", -1).to_list(40):
        items.append({
            "type": n.get("type", "personal"), "title": n.get("title"),
            "body": (n.get("body") or "")[:200], "at": n.get("created_at"),
            "url": n.get("url") or "/",
        })

    items = [i for i in items if i.get("at")]
    items.sort(key=lambda i: str(i["at"]), reverse=True)
    items = items[:40]
    unread = sum(1 for i in items if str(i["at"]) > str(seen_at))
    return {"items": items, "unread": unread, "seen_at": seen_at}


@api.post("/notifications/seen")
async def mark_notifications_seen(user: dict = Depends(get_current_user)):
    ts = now_utc().isoformat()
    await db.users.update_one({"id": user["id"]}, {"$set": {"notifications_seen_at": ts}})
    return {"ok": True, "seen_at": ts}
