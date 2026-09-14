"""Course bundles — sell several programs together at a discounted price."""
from typing import Optional
from fastapi import Request, HTTPException, Depends

from core import api, db, gen_id, now_utc, require_role, get_optional_user
from models import BundleCreate, BundleUpdate


async def _hydrate(bundle: dict, user: Optional[dict] = None) -> dict:
    """Attach the member programs (lightweight) + savings + ownership for the viewer."""
    progs = await db.programs.find(
        {"id": {"$in": bundle.get("program_ids", [])}},
        {"_id": 0, "id": 1, "title": 1, "cover_image": 1, "price": 1, "level": 1, "duration_weeks": 1, "access_term": 1},
    ).to_list(100)
    # Keep the admin-specified order
    order = {pid: i for i, pid in enumerate(bundle.get("program_ids", []))}
    progs.sort(key=lambda p: order.get(p["id"], 999))
    individual_total = round(sum(float(p.get("price", 0) or 0) for p in progs), 2)
    owns_all = False
    if user:
        owned = 0
        for p in progs:
            from access_terms import program_access
            if (await program_access(user["id"], p["id"]))["has_access"]:
                owned += 1
        owns_all = bool(progs) and owned == len(progs)
    return {
        **bundle,
        "programs": progs,
        "individual_total": individual_total,
        "savings": round(max(0.0, individual_total - float(bundle.get("price", 0) or 0)), 2),
        "viewer": {"owns_all": owns_all, "is_authenticated": bool(user)},
    }


@api.get("/bundles")
async def list_bundles(user: Optional[dict] = Depends(get_optional_user)):
    rows = await db.bundles.find({"active": True}, {"_id": 0}).sort("created_at", -1).to_list(100)
    return [await _hydrate(b, user) for b in rows]


@api.get("/bundles/{bundle_id}")
async def get_bundle(bundle_id: str, user: Optional[dict] = Depends(get_optional_user)):
    b = await db.bundles.find_one({"id": bundle_id}, {"_id": 0})
    if not b:
        raise HTTPException(404, "Bundle not found")
    return await _hydrate(b, user)


@api.get("/admin/bundles")
async def admin_list_bundles(request: Request):
    await require_role(request, ["admin"])
    rows = await db.bundles.find({}, {"_id": 0}).sort("created_at", -1).to_list(200)
    return [await _hydrate(b) for b in rows]


@api.post("/admin/bundles")
async def admin_create_bundle(payload: BundleCreate, request: Request):
    await require_role(request, ["admin"])
    doc = {
        "id": gen_id(),
        "title": payload.title,
        "description": payload.description or "",
        "program_ids": payload.program_ids or [],
        "price": float(payload.price or 0),
        "currency": (payload.currency or "eur"),
        "cover_image": payload.cover_image,
        "active": bool(payload.active),
        "created_at": now_utc().isoformat(),
    }
    await db.bundles.insert_one(doc)
    doc.pop("_id", None)
    return await _hydrate(doc)


@api.patch("/admin/bundles/{bundle_id}")
async def admin_update_bundle(bundle_id: str, payload: BundleUpdate, request: Request):
    await require_role(request, ["admin"])
    updates = {k: v for k, v in payload.model_dump(exclude_none=True).items()}
    if "price" in updates:
        updates["price"] = float(updates["price"])
    if updates:
        await db.bundles.update_one({"id": bundle_id}, {"$set": updates})
    b = await db.bundles.find_one({"id": bundle_id}, {"_id": 0})
    if not b:
        raise HTTPException(404, "Bundle not found")
    return await _hydrate(b)


@api.delete("/admin/bundles/{bundle_id}")
async def admin_delete_bundle(bundle_id: str, request: Request):
    await require_role(request, ["admin"])
    await db.bundles.delete_one({"id": bundle_id})
    return {"ok": True}
