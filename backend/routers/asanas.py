"""Asana Index — a searchable pose library (name, Sanskrit, benefits, clip).

Public read (published poses only) + admin CRUD. A pose can optionally carry a
YouTube clip (start/end seconds) and be linked to a program.
"""
import re
from typing import Optional, List
from fastapi import Request, HTTPException

from core import api, db, gen_id, now_utc, require_role
from models import AsanaCreate, AsanaUpdate


def _yt_id(url: Optional[str]) -> Optional[str]:
    if not url:
        return None
    s = str(url).strip()
    patterns = [
        r"youtube\.com/watch\?v=([\w-]{11})",
        r"youtu\.be/([\w-]{11})",
        r"youtube\.com/embed/([\w-]{11})",
        r"youtube\.com/shorts/([\w-]{11})",
        r"youtube\.com/live/([\w-]{11})",
    ]
    for p in patterns:
        m = re.search(p, s)
        if m:
            return m.group(1)
    if re.fullmatch(r"[\w-]{11}", s):
        return s
    return None


def _public_view(a: dict) -> dict:
    a = {k: v for k, v in a.items() if k != "_id"}
    return a


@api.get("/asanas")
async def list_asanas(q: Optional[str] = None, category: Optional[str] = None):
    """Public, published poses. Searchable by name/sanskrit/benefits + category filter."""
    query: dict = {"is_published": True}
    if category and category.lower() != "all":
        query["category"] = category
    rows = await db.asanas.find(query, {"_id": 0}).sort([("order_index", 1), ("name", 1)]).to_list(1000)
    if q:
        needle = q.strip().lower()
        def matches(a: dict) -> bool:
            hay = " ".join([
                str(a.get("name") or ""),
                str(a.get("sanskrit") or ""),
                str(a.get("description") or ""),
                str(a.get("category") or ""),
                " ".join(a.get("benefits") or []),
            ]).lower()
            return needle in hay
        rows = [a for a in rows if matches(a)]
    return rows


@api.get("/asanas/categories")
async def asana_categories():
    cats = await db.asanas.distinct("category", {"is_published": True})
    return sorted([c for c in cats if c])


@api.get("/asanas/{asana_id}")
async def get_asana(asana_id: str):
    a = await db.asanas.find_one({"id": asana_id, "is_published": True}, {"_id": 0})
    if not a:
        raise HTTPException(404, "Asana not found")
    return a


# ---------- Admin ----------
@api.get("/admin/asanas")
async def admin_list_asanas(request: Request):
    await require_role(request, ["admin", "instructor"])
    return await db.asanas.find({}, {"_id": 0}).sort([("order_index", 1), ("name", 1)]).to_list(2000)


def _build_doc(payload) -> dict:
    yid = _yt_id(payload.youtube_url) if payload.youtube_url else None
    return {
        "name": payload.name,
        "sanskrit": payload.sanskrit or "",
        "benefits": payload.benefits or [],
        "description": payload.description or "",
        "category": payload.category or "",
        "difficulty": payload.difficulty or "",
        "cover_image": payload.cover_image or (f"https://img.youtube.com/vi/{yid}/hqdefault.jpg" if yid else ""),
        "youtube_url": payload.youtube_url or "",
        "youtube_id": yid,
        "start_seconds": int(payload.start_seconds or 0),
        "end_seconds": int(payload.end_seconds) if payload.end_seconds else None,
        "program_id": payload.program_id or None,
    }


@api.post("/admin/asanas")
async def admin_create_asana(payload: AsanaCreate, request: Request):
    await require_role(request, ["admin", "instructor"])
    last = await db.asanas.find({}).sort("order_index", -1).to_list(1)
    nxt = (last[0].get("order_index", 0) + 1) if last else 0
    doc = {
        "id": gen_id(),
        **_build_doc(payload),
        "order_index": payload.order_index if payload.order_index is not None else nxt,
        "is_published": bool(payload.is_published),
        "created_at": now_utc().isoformat(),
    }
    await db.asanas.insert_one(doc)
    doc.pop("_id", None)
    return doc


@api.patch("/admin/asanas/{asana_id}")
async def admin_update_asana(asana_id: str, payload: AsanaUpdate, request: Request):
    await require_role(request, ["admin", "instructor"])
    updates = {k: v for k, v in payload.model_dump(exclude_unset=True).items()}
    if "youtube_url" in updates:
        yid = _yt_id(updates.get("youtube_url"))
        updates["youtube_id"] = yid
        if yid and not updates.get("cover_image"):
            existing = await db.asanas.find_one({"id": asana_id}, {"_id": 0, "cover_image": 1})
            if not (existing or {}).get("cover_image"):
                updates["cover_image"] = f"https://img.youtube.com/vi/{yid}/hqdefault.jpg"
    if updates:
        await db.asanas.update_one({"id": asana_id}, {"$set": updates})
    a = await db.asanas.find_one({"id": asana_id}, {"_id": 0})
    if not a:
        raise HTTPException(404, "Asana not found")
    return a


@api.delete("/admin/asanas/{asana_id}")
async def admin_delete_asana(asana_id: str, request: Request):
    await require_role(request, ["admin", "instructor"])
    await db.asanas.delete_one({"id": asana_id})
    return {"ok": True}
