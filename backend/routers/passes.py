"""Class Pack Passes — drop-ins and 5-class packs."""
from typing import Dict
from fastapi import Depends, HTTPException
from pydantic import BaseModel

from core import api, db, now_utc, gen_id, get_current_user

# Simple catalog — could later live in DB, but static for MVP
PASS_CATALOG: Dict[str, dict] = {
    "drop_in": {"id": "drop_in", "title": "Drop-in class", "credits": 1, "price": 22.0, "currency": "eur", "description": "One class credit. No membership required."},
    "class_pack": {"id": "class_pack", "title": "5-class pack", "credits": 5, "price": 99.0, "currency": "eur", "description": "Five class credits · save €11 vs. drop-ins. Never expires."},
}


@api.get("/passes/catalog")
async def passes_catalog():
    return list(PASS_CATALOG.values())


@api.get("/passes/mine")
async def my_passes(user: dict = Depends(get_current_user)):
    """Return one aggregated row summarising the user's remaining credits."""
    docs = await db.class_passes.find({"user_id": user["id"], "active": True}, {"_id": 0}).to_list(50)
    total = sum(int(d.get("remaining", 0)) for d in docs)
    # Recent usage
    used = await db.pass_usages.find({"user_id": user["id"]}, {"_id": 0}).sort("used_at", -1).to_list(20)
    return {
        "remaining": total,
        "passes": docs,
        "recent_usage": used,
    }


class UsePassRequest(BaseModel):
    class_instance_id: str


@api.post("/passes/use")
async def use_pass(payload: UsePassRequest, user: dict = Depends(get_current_user)):
    """Consume one pass credit for a class booking. Idempotent per (user, class_instance)."""
    # Skip if already recorded
    existing = await db.pass_usages.find_one({"user_id": user["id"], "class_instance_id": payload.class_instance_id})
    if existing:
        return {"ok": True, "already_used": True}
    pack = await db.class_passes.find_one_and_update(
        {"user_id": user["id"], "active": True, "remaining": {"$gt": 0}},
        {"$inc": {"remaining": -1}},
    )
    if not pack:
        raise HTTPException(400, "No class passes remaining")
    await db.pass_usages.insert_one({
        "id": gen_id(),
        "user_id": user["id"],
        "class_instance_id": payload.class_instance_id,
        "pack_id": pack["id"],
        "used_at": now_utc().isoformat(),
    })
    remaining = await db.class_passes.find_one({"id": pack["id"]}, {"remaining": 1})
    return {"ok": True, "remaining": int(remaining.get("remaining", 0))}
