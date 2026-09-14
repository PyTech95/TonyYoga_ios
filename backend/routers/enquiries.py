"""Public enquiry / 'ask a question' capture (e.g. Teacher Training leads)."""
from typing import Optional

from fastapi import Request, HTTPException
from pydantic import BaseModel

from core import api, db, gen_id, now_utc, require_role

VALID_STATUS = ("new", "handled", "archived")


class EnquiryIn(BaseModel):
    name: str
    email: str
    phone: Optional[str] = ""
    interest: Optional[str] = ""   # e.g. "200-hour", "300-hour", "General question"
    message: str
    source: Optional[str] = "teacher_training"


class StatusIn(BaseModel):
    status: str


@api.post("/enquiries")
async def create_enquiry(payload: EnquiryIn):
    """Capture a website enquiry, acknowledge the sender, and notify the team."""
    email = (payload.email or "").strip().lower()
    if "@" not in email or "." not in email.split("@")[-1]:
        raise HTTPException(400, "Please enter a valid email.")
    if not (payload.message or "").strip():
        raise HTTPException(400, "Please include a short message.")
    doc = {
        "id": gen_id(),
        "name": (payload.name or "").strip(),
        "email": email,
        "phone": (payload.phone or "").strip(),
        "interest": (payload.interest or "").strip(),
        "message": payload.message.strip(),
        "source": (payload.source or "teacher_training").strip() or "teacher_training",
        "status": "new",
        "created_at": now_utc().isoformat(),
    }
    await db.enquiries.insert_one({**doc})
    try:
        from email_service import send_enquiry_ack, send_enquiry_admin
        await send_enquiry_ack(email, doc["name"], doc["interest"])
        await send_enquiry_admin(doc)
    except Exception:
        pass
    return {"ok": True}


@api.get("/admin/enquiries")
async def list_enquiries(request: Request):
    await require_role(request, ["admin"])
    docs = await db.enquiries.find({}, {"_id": 0}).sort("created_at", -1).to_list(2000)
    new_count = sum(1 for d in docs if d.get("status") == "new")
    return {"enquiries": docs, "new_count": new_count}


@api.post("/admin/enquiries/{eid}/status")
async def set_enquiry_status(eid: str, payload: StatusIn, request: Request):
    await require_role(request, ["admin"])
    if payload.status not in VALID_STATUS:
        raise HTTPException(400, "Invalid status.")
    res = await db.enquiries.update_one({"id": eid}, {"$set": {"status": payload.status}})
    if not res.matched_count:
        raise HTTPException(404, "Enquiry not found.")
    return {"ok": True}
