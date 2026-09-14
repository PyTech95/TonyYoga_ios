"""Student subscription history and class-series pricing controls."""
from typing import Optional, List
from pydantic import BaseModel
from fastapi import Depends, Request, HTTPException
from core import api, db, get_current_user, require_role
from access_terms import ClassPricing, state_of


class GrantView(BaseModel):
    id: str
    kind: str
    target_id: str
    title: str
    starts_at: str
    ends_at: str
    status: str
    return_path: Optional[str] = None


@api.get("/access/mine", response_model=List[GrantView])
async def my_access(user=Depends(get_current_user)):
    rows = await db.access_grants.find({"user_id": user["id"]}, {"_id": 0}).sort("created_at", -1).to_list(300)
    return [{**r, "status": state_of(r)} for r in rows]


@api.patch("/admin/class-templates/{template_id}/pricing", response_model=ClassPricing)
async def save_class_pricing(template_id: str, payload: ClassPricing, request: Request):
    await require_role(request, ["admin"])
    value = payload.model_dump(mode="json")
    res = await db.class_templates.update_one({"id": template_id}, {"$set": {"purchase_options": value}})
    if not res.matched_count:
        raise HTTPException(404, "Class series not found")
    return value
