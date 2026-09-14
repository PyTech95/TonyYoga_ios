"""Wishlist — thin wrapper over favorites/toggle with enriched item details."""
from typing import Optional
from fastapi import Depends
from pydantic import BaseModel

from core import api, db, get_current_user

VALID_TYPES = {"product", "program", "workshop", "video"}
COLLECTIONS = {
    "product": ("products", ["id", "title", "price", "currency", "images", "category"]),
    "program": ("programs", ["id", "title", "level", "duration_weeks", "price", "currency", "cover_image", "description"]),
    "workshop": ("workshops", ["id", "title", "system", "location", "start_date", "price_eur", "cover_image"]),
    "video": ("videos", ["id", "title", "level", "style", "duration_minutes", "cover_image", "visibility"]),
}


class WishlistToggle(BaseModel):
    target_type: str
    target_id: str


@api.post("/wishlist/toggle")
async def wishlist_toggle(payload: WishlistToggle, user: dict = Depends(get_current_user)):
    if payload.target_type not in VALID_TYPES:
        return {"favorited": False, "error": "invalid target_type"}
    existing = await db.favorites.find_one({
        "user_id": user["id"],
        "target_type": payload.target_type,
        "target_id": payload.target_id,
    })
    if existing:
        await db.favorites.delete_one({"id": existing["id"]})
        return {"favorited": False}
    from core import gen_id, now_utc
    await db.favorites.insert_one({
        "id": gen_id(),
        "user_id": user["id"],
        "target_type": payload.target_type,
        "target_id": payload.target_id,
        "created_at": now_utc().isoformat(),
    })
    return {"favorited": True}


@api.get("/wishlist/mine")
async def wishlist_mine(user: dict = Depends(get_current_user), target_type: Optional[str] = None):
    """Return favorited items enriched with the target document."""
    q = {"user_id": user["id"]}
    if target_type in VALID_TYPES:
        q["target_type"] = target_type
    rows = await db.favorites.find(q, {"_id": 0}).sort("created_at", -1).to_list(500)
    # Group ids by type and bulk fetch
    by_type = {}
    for r in rows:
        by_type.setdefault(r["target_type"], []).append(r["target_id"])
    hydrated = {}
    for tt, ids in by_type.items():
        if tt not in COLLECTIONS:
            continue
        coll_name, fields = COLLECTIONS[tt]
        proj = {f: 1 for f in fields}
        proj["_id"] = 0
        docs = await db[coll_name].find({"id": {"$in": ids}}, proj).to_list(500)
        hydrated[tt] = {d["id"]: d for d in docs}
    out = []
    for r in rows:
        item = hydrated.get(r["target_type"], {}).get(r["target_id"])
        if not item:
            continue  # target deleted
        out.append({"target_type": r["target_type"], "created_at": r["created_at"], "item": item})
    return out


@api.get("/wishlist/status")
async def wishlist_status(target_type: str, target_id: str, user: dict = Depends(get_current_user)):
    """Cheap check: is a specific item favorited?"""
    doc = await db.favorites.find_one({
        "user_id": user["id"], "target_type": target_type, "target_id": target_id,
    })
    return {"favorited": bool(doc)}
