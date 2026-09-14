"""Meditation & Breathwork module (Phase 2).

First-class calm content: guided meditations, breathwork/pranayama and yoga nidra.
Public read (published), admin CRUD, plus a rotating "daily" recommendation.
"""
import re
from datetime import date
from typing import Optional
from fastapi import Request, HTTPException

from core import api, db, gen_id, now_utc, require_role
from models import MeditationCreate, MeditationUpdate

KINDS = ["meditation", "breathwork", "nidra"]
FOCUS_AREAS = ["Sleep", "Stress relief", "Grounding", "Energy", "Focus", "Anxiety relief", "Gratitude", "Breath control"]


def _yt_id(url):
    if not url:
        return None
    m = re.search(r"(?:youtube\.com/(?:watch\?v=|embed/|shorts/|live/)|youtu\.be/)([\w-]{11})", str(url))
    if m:
        return m.group(1)
    s = str(url).strip()
    return s if re.fullmatch(r"[\w-]{11}", s) else None


def _shape(m: dict) -> dict:
    m = {k: v for k, v in m.items() if k != "_id"}
    return m


@api.get("/meditations")
async def list_meditations(kind: Optional[str] = None, focus: Optional[str] = None,
                           duration: Optional[str] = None, q: Optional[str] = None):
    query = {"is_published": True}
    if kind and kind in KINDS:
        query["kind"] = kind
    rows = await db.meditations.find(query, {"_id": 0}).sort([("order_index", 1), ("title", 1)]).to_list(1000)
    def keep(m):
        if focus and focus not in (m.get("focus_areas") or []):
            return False
        if duration:
            d = m.get("duration_minutes") or 0
            if duration == "5-15" and not (d <= 15): return False
            if duration == "20-40" and not (15 < d <= 40): return False
            if duration == "60+" and not (d > 40): return False
        if q and q.strip().lower() not in (m.get("title") or "").lower():
            return False
        return True
    return [m for m in rows if keep(m)]


@api.get("/meditations/facets")
async def meditation_facets():
    present = set()
    for m in await db.meditations.find({"is_published": True}, {"_id": 0, "focus_areas": 1}).to_list(1000):
        present.update(m.get("focus_areas") or [])
    focus = [f for f in FOCUS_AREAS if f in present] + sorted(present - set(FOCUS_AREAS))
    return {"kinds": KINDS, "focus_areas": focus, "durations": ["5-15", "20-40", "60+"]}


@api.get("/meditations/daily")
async def daily_meditation():
    """Deterministic 'meditation of the day' so it's stable across a day but rotates."""
    rows = await db.meditations.find({"is_published": True}, {"_id": 0}).sort([("order_index", 1), ("title", 1)]).to_list(1000)
    if not rows:
        return None
    idx = date.today().toordinal() % len(rows)
    return rows[idx]


@api.get("/meditations/{med_id}")
async def get_meditation(med_id: str):
    m = await db.meditations.find_one({"id": med_id, "is_published": True}, {"_id": 0})
    if not m:
        raise HTTPException(404, "Not found")
    return m


# ---------- Admin ----------
@api.get("/admin/meditations")
async def admin_list_meditations(request: Request):
    await require_role(request, ["admin", "instructor"])
    return await db.meditations.find({}, {"_id": 0}).sort([("order_index", 1), ("title", 1)]).to_list(2000)


def _validate(payload):
    if payload.kind and payload.kind not in KINDS:
        raise HTTPException(422, f"kind must be one of {KINDS}")
    if payload.media_kind and payload.media_kind not in ("video", "audio"):
        raise HTTPException(422, "media_kind must be video or audio")


def _build(payload) -> dict:
    yid = _yt_id(payload.youtube_url) if payload.youtube_url else None
    return {
        "title": payload.title,
        "kind": payload.kind or "meditation",
        "media_kind": payload.media_kind or ("video" if yid else "audio"),
        "youtube_url": payload.youtube_url or "",
        "youtube_id": yid,
        "audio_url": payload.audio_url or "",
        "duration_minutes": int(payload.duration_minutes) if payload.duration_minutes else None,
        "focus_areas": payload.focus_areas or [],
        "level": payload.level or "beginner",
        "language": payload.language or "both",
        "cover_image": payload.cover_image or (f"https://img.youtube.com/vi/{yid}/hqdefault.jpg" if yid else ""),
        "description": payload.description or "",
    }


@api.post("/admin/meditations")
async def admin_create_meditation(payload: MeditationCreate, request: Request):
    await require_role(request, ["admin", "instructor"])
    _validate(payload)
    last = await db.meditations.find({}).sort("order_index", -1).to_list(1)
    nxt = (last[0].get("order_index", 0) + 1) if last else 0
    doc = {
        "id": gen_id(), **_build(payload),
        "order_index": payload.order_index if payload.order_index is not None else nxt,
        "is_published": bool(payload.is_published),
        "created_at": now_utc().isoformat(),
    }
    await db.meditations.insert_one(doc)
    doc.pop("_id", None)
    return doc


@api.patch("/admin/meditations/{med_id}")
async def admin_update_meditation(med_id: str, payload: MeditationUpdate, request: Request):
    await require_role(request, ["admin", "instructor"])
    _validate(payload)
    updates = {k: v for k, v in payload.model_dump(exclude_unset=True).items()}
    if "youtube_url" in updates:
        updates["youtube_id"] = _yt_id(updates.get("youtube_url"))
    if updates:
        await db.meditations.update_one({"id": med_id}, {"$set": updates})
    m = await db.meditations.find_one({"id": med_id}, {"_id": 0})
    if not m:
        raise HTTPException(404, "Not found")
    return m


@api.delete("/admin/meditations/{med_id}")
async def admin_delete_meditation(med_id: str, request: Request):
    await require_role(request, ["admin", "instructor"])
    await db.meditations.delete_one({"id": med_id})
    return {"ok": True}
