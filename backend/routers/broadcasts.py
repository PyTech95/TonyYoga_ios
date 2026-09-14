"""Podcast / Broadcast episodes — Tony's audio & video talks.

Admins author episodes (audio or video), optionally schedule a release time and
tie an episode to a program. Published episodes appear in the public Broadcasts
section; on publish we best-effort push-notify subscribers. A background tick
auto-publishes scheduled episodes when their time arrives.
"""
from datetime import datetime, timezone
from typing import List, Optional

from fastapi import Depends, HTTPException, Request
from pydantic import BaseModel

from core import api, db, now_utc, gen_id, logger, require_role, get_optional_user

MEDIA_TYPES = {"audio", "video"}


class BroadcastIn(BaseModel):
    title: str
    description: Optional[str] = ""
    media_type: str = "audio"          # audio | video
    media_url: str
    cover_image: Optional[str] = None
    tags: List[str] = []
    program_id: Optional[str] = None   # optional: bonus episode for a course
    series: Optional[str] = None       # optional: named series/season
    publish_at: Optional[str] = None   # ISO; future => scheduled
    notify_push: bool = True


class BroadcastPatch(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None
    media_type: Optional[str] = None
    media_url: Optional[str] = None
    cover_image: Optional[str] = None
    tags: Optional[List[str]] = None
    program_id: Optional[str] = None
    series: Optional[str] = None
    publish_at: Optional[str] = None
    is_published: Optional[bool] = None


def _parse(dt) -> Optional[datetime]:
    if not dt:
        return None
    try:
        return datetime.fromisoformat(str(dt).replace("Z", "+00:00"))
    except Exception:
        return None


async def _notify_subscribers(ep: dict):
    """Best-effort push + WhatsApp to everyone with an active subscription/number."""
    title = ep.get("title", "A new broadcast is live.")
    try:
        from routers.push import notify_user
        rows = await db.push_subscriptions.find({"active": True}, {"_id": 0, "user_id": 1}).to_list(5000)
        seen = set()
        for r in rows:
            uid = r.get("user_id")
            if not uid or uid in seen:
                continue
            seen.add(uid)
            await notify_user(uid, "New episode from Tony", title, "/broadcasts")
    except Exception as e:
        logger.warning(f"broadcast push notify failed: {e}")
    # WhatsApp fan-out (best-effort; no-op when unconfigured). Only users with a number.
    try:
        from whatsapp_service import whatsapp_enabled, send_whatsapp
        if await whatsapp_enabled():
            users = await db.users.find(
                {"$or": [{"phone": {"$nin": [None, ""]}}, {"whatsapp": {"$nin": [None, ""]}}]},
                {"_id": 0, "phone": 1, "whatsapp": 1},
            ).to_list(2000)
            for u in users:
                to = u.get("whatsapp") or u.get("phone")
                if to:
                    await send_whatsapp(to, f"New from Tony Yoga 🎧 — {title}. Listen: open the app → Podcast.")
    except Exception as e:
        logger.warning(f"broadcast whatsapp notify failed: {e}")


# ---------------- Admin ----------------
@api.post("/admin/broadcasts")
async def create_broadcast(payload: BroadcastIn, request: Request):
    await require_role(request, ["admin", "instructor"])
    if payload.media_type not in MEDIA_TYPES:
        raise HTTPException(400, "media_type must be 'audio' or 'video'.")
    if not (payload.media_url or "").strip():
        raise HTTPException(400, "A media URL is required.")
    now = now_utc()
    publish_dt = _parse(payload.publish_at)
    is_published = publish_dt is None or publish_dt <= now
    doc = {
        "id": gen_id(),
        "title": payload.title.strip(),
        "description": payload.description or "",
        "media_type": payload.media_type,
        "media_url": payload.media_url.strip(),
        "cover_image": payload.cover_image or None,
        "tags": [t.strip() for t in (payload.tags or []) if t.strip()],
        "program_id": payload.program_id or None,
        "series": (payload.series or "").strip() or None,
        "publish_at": publish_dt.isoformat() if publish_dt else now.isoformat(),
        "is_published": is_published,
        "notify_push": bool(payload.notify_push),
        "notified": False,
        "views": 0,
        "created_at": now.isoformat(),
    }
    await db.broadcasts.insert_one(doc)
    doc.pop("_id", None)
    if is_published and doc["notify_push"]:
        doc["notified"] = True
        await db.broadcasts.update_one({"id": doc["id"]}, {"$set": {"notified": True}})
        await _notify_subscribers(doc)
    return doc


@api.get("/admin/broadcasts")
async def admin_list_broadcasts(request: Request):
    await require_role(request, ["admin", "instructor"])
    return await db.broadcasts.find({}, {"_id": 0}).sort("publish_at", -1).to_list(1000)


@api.patch("/admin/broadcasts/{broadcast_id}")
async def update_broadcast(broadcast_id: str, payload: BroadcastPatch, request: Request):
    await require_role(request, ["admin", "instructor"])
    updates = {k: v for k, v in payload.model_dump(exclude_unset=True).items() if v is not None}
    if "media_type" in updates and updates["media_type"] not in MEDIA_TYPES:
        raise HTTPException(400, "media_type must be 'audio' or 'video'.")
    if "publish_at" in updates:
        dt = _parse(updates["publish_at"])
        updates["publish_at"] = dt.isoformat() if dt else now_utc().isoformat()
    if not updates:
        raise HTTPException(400, "No fields to update")
    res = await db.broadcasts.update_one({"id": broadcast_id}, {"$set": updates})
    if res.matched_count == 0:
        raise HTTPException(404, "Broadcast not found")
    return await db.broadcasts.find_one({"id": broadcast_id}, {"_id": 0})


@api.post("/admin/broadcasts/{broadcast_id}/publish")
async def publish_broadcast(broadcast_id: str, request: Request):
    await require_role(request, ["admin", "instructor"])
    ep = await db.broadcasts.find_one({"id": broadcast_id}, {"_id": 0})
    if not ep:
        raise HTTPException(404, "Broadcast not found")
    await db.broadcasts.update_one(
        {"id": broadcast_id},
        {"$set": {"is_published": True, "publish_at": now_utc().isoformat(), "notified": True}},
    )
    if ep.get("notify_push", True) and not ep.get("notified"):
        await _notify_subscribers(ep)
    return {"ok": True}


@api.delete("/admin/broadcasts/{broadcast_id}")
async def delete_broadcast(broadcast_id: str, request: Request):
    await require_role(request, ["admin", "instructor"])
    res = await db.broadcasts.delete_one({"id": broadcast_id})
    if res.deleted_count == 0:
        raise HTTPException(404, "Broadcast not found")
    return {"ok": True}


# ---------------- Public ----------------
@api.get("/broadcasts")
async def list_broadcasts(media_type: Optional[str] = None, tag: Optional[str] = None, series: Optional[str] = None):
    now_iso = now_utc().isoformat()
    query: dict = {"is_published": True, "publish_at": {"$lte": now_iso}}
    if media_type in MEDIA_TYPES:
        query["media_type"] = media_type
    if tag:
        query["tags"] = tag
    if series:
        query["series"] = series
    return await db.broadcasts.find(query, {"_id": 0}).sort("publish_at", -1).to_list(500)


@api.get("/broadcasts/series")
async def list_series():
    """Distinct published series names (for the podcast section's series filter)."""
    now_iso = now_utc().isoformat()
    names = await db.broadcasts.distinct(
        "series", {"is_published": True, "publish_at": {"$lte": now_iso}, "series": {"$nin": [None, ""]}}
    )
    return sorted(n for n in names if n)


@api.get("/broadcasts/{broadcast_id}")
async def get_broadcast(broadcast_id: str, user: Optional[dict] = Depends(get_optional_user)):
    ep = await db.broadcasts.find_one({"id": broadcast_id}, {"_id": 0})
    if not ep:
        raise HTTPException(404, "Broadcast not found")
    is_staff = bool(user and user.get("role") in ("admin", "instructor"))
    published = ep.get("is_published") and (_parse(ep.get("publish_at")) or now_utc()) <= now_utc()
    if not published and not is_staff:
        raise HTTPException(404, "Broadcast not found")
    await db.broadcasts.update_one({"id": broadcast_id}, {"$inc": {"views": 1}})
    return ep


# ---------------- Background tick ----------------
async def broadcasts_publish_tick():
    """Publish scheduled episodes whose time has arrived + notify once."""
    now_iso = now_utc().isoformat()
    due = await db.broadcasts.find(
        {"is_published": False, "publish_at": {"$lte": now_iso}}, {"_id": 0}
    ).to_list(200)
    for ep in due:
        await db.broadcasts.update_one({"id": ep["id"]}, {"$set": {"is_published": True, "notified": True}})
        if ep.get("notify_push", True) and not ep.get("notified"):
            await _notify_subscribers(ep)
        logger.info(f"Auto-published broadcast: {ep.get('title')}")
