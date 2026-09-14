"""Workshops & retreats router."""
from typing import Optional, List
from fastapi import HTTPException, Depends, Request
from pydantic import BaseModel, EmailStr
from datetime import datetime, timezone

from core import api, db, now_utc, gen_id, get_current_user, require_role
from email_service import send_email


class WorkshopCreate(BaseModel):
    title: str
    subtitle: Optional[str] = None
    system: str           # Core 26+ | Core 40 | Core 84 | Yoga Holiday
    description: str
    location: str = "Villa San Pedro · Málaga, Spain"
    start_date: datetime
    end_date: datetime
    nights: int = 6
    meals_included: bool = True
    price_eur: float = 1600.0
    teacher_training_price_eur: Optional[float] = None
    cover_image: Optional[str] = None
    schedule: Optional[str] = "9:00–1:00 pm / 3:00–6:00 pm"
    capacity: int = 14
    deposit_eur: float = 500.0
    gallery: Optional[List[str]] = None
    student_video_url: Optional[str] = None
    is_active: bool = True


class WorkshopUpdate(BaseModel):
    title: Optional[str] = None
    subtitle: Optional[str] = None
    system: Optional[str] = None
    description: Optional[str] = None
    location: Optional[str] = None
    start_date: Optional[datetime] = None
    end_date: Optional[datetime] = None
    nights: Optional[int] = None
    price_eur: Optional[float] = None
    teacher_training_price_eur: Optional[float] = None
    cover_image: Optional[str] = None
    schedule: Optional[str] = None
    capacity: Optional[int] = None
    deposit_eur: Optional[float] = None
    gallery: Optional[List[str]] = None
    student_video_url: Optional[str] = None
    is_active: Optional[bool] = None


class WorkshopRegistration(BaseModel):
    workshop_id: str
    name: str
    email: EmailStr
    phone: Optional[str] = None
    yoga_status: str = "Perpetual Yogi"   # Perpetual Yogi / Instructor / Aspiring Instructor
    years_of_practice: int = 0
    notes: Optional[str] = None
    wants_teacher_training: bool = False


# ---------- Public ----------
@api.get("/workshops")
async def list_workshops():
    # Only upcoming, active retreats — never surface past dates.
    now_iso = datetime.now(timezone.utc).isoformat()
    rows = await db.workshops.find(
        {"is_active": True, "end_date": {"$gte": now_iso}}, {"_id": 0}
    ).sort("start_date", 1).to_list(100)
    return rows


@api.get("/workshops/{workshop_id}")
async def get_workshop(workshop_id: str):
    w = await db.workshops.find_one({"id": workshop_id}, {"_id": 0})
    if not w:
        raise HTTPException(404, "Workshop not found")
    registrations = await db.workshop_registrations.count_documents({"workshop_id": workshop_id, "status": {"$ne": "cancelled"}})
    w["registered_count"] = registrations
    return w


@api.post("/workshops/register")
async def register_for_workshop(payload: WorkshopRegistration, user: dict = Depends(get_current_user)):
    workshop = await db.workshops.find_one({"id": payload.workshop_id})
    if not workshop:
        raise HTTPException(404, "Workshop not found")
    count = await db.workshop_registrations.count_documents({"workshop_id": payload.workshop_id, "status": {"$ne": "cancelled"}})
    if count >= workshop.get("capacity", 14):
        raise HTTPException(400, "Workshop full")
    doc = {
        "id": gen_id(),
        "user_id": user["id"],
        "workshop_id": payload.workshop_id,
        "name": payload.name, "email": str(payload.email).lower(),
        "phone": payload.phone, "yoga_status": payload.yoga_status,
        "years_of_practice": payload.years_of_practice,
        "wants_teacher_training": payload.wants_teacher_training,
        "notes": payload.notes,
        "status": "pending",
        "created_at": now_utc().isoformat(),
    }
    await db.workshop_registrations.insert_one(doc)

    # Notify admin + student
    admin_email = "tonyoga.online@gmail.com"
    html = f"""
    <h3>New workshop registration</h3>
    <p><strong>{workshop['title']}</strong> · {workshop['start_date'][:10]} → {workshop['end_date'][:10]}</p>
    <p><strong>{payload.name}</strong> ({payload.email})<br/>
    Yoga status: {payload.yoga_status}<br/>
    Years of practice: {payload.years_of_practice}<br/>
    {'Wants teacher training' if payload.wants_teacher_training else ''}</p>
    <p>{payload.notes or ''}</p>
    """
    await send_email(admin_email, f"Workshop registration · {workshop['title']}", html)
    await send_email(payload.email, f"Reserved · {workshop['title']}",
                     f"<p>Thank you for reserving a place on <strong>{workshop['title']}</strong>.</p>"
                     f"<p>Tony will be in touch within 48 hours with payment details and what to bring.</p>")
    doc.pop("_id", None)
    return doc


# ---------- Admin ----------
@api.get("/admin/workshops")
async def admin_list_workshops(request: Request):
    await require_role(request, ["admin", "support"])
    return await db.workshops.find({}, {"_id": 0}).sort("start_date", 1).to_list(200)


@api.post("/admin/workshops")
async def create_workshop(payload: WorkshopCreate, request: Request):
    await require_role(request, ["admin"])
    doc = {
        **payload.model_dump(),
        "id": gen_id(),
        "start_date": payload.start_date.isoformat(),
        "end_date": payload.end_date.isoformat(),
        "created_at": now_utc().isoformat(),
    }
    await db.workshops.insert_one(doc)
    doc.pop("_id", None)
    return doc


@api.patch("/admin/workshops/{workshop_id}")
async def update_workshop(workshop_id: str, payload: WorkshopUpdate, request: Request):
    await require_role(request, ["admin"])
    updates = {k: v for k, v in payload.model_dump(exclude_unset=True).items() if v is not None}
    if "start_date" in updates:
        updates["start_date"] = updates["start_date"].isoformat()
    if "end_date" in updates:
        updates["end_date"] = updates["end_date"].isoformat()
    if not updates:
        raise HTTPException(400, "Nothing to update")
    r = await db.workshops.update_one({"id": workshop_id}, {"$set": updates})
    if r.matched_count == 0:
        raise HTTPException(404, "Retreat not found")
    return await db.workshops.find_one({"id": workshop_id}, {"_id": 0})


@api.delete("/admin/workshops/{workshop_id}")
async def delete_workshop(workshop_id: str, request: Request):
    await require_role(request, ["admin"])
    r = await db.workshops.delete_one({"id": workshop_id})
    if r.deleted_count == 0:
        raise HTTPException(404, "Retreat not found")
    return {"ok": True}


@api.get("/admin/workshops/registrations")
async def list_registrations(request: Request, workshop_id: Optional[str] = None):
    await require_role(request, ["admin"])
    q = {"workshop_id": workshop_id} if workshop_id else {}
    return await db.workshop_registrations.find(q, {"_id": 0}).to_list(500)
