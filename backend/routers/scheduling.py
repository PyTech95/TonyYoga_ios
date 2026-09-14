"""Instructors, applications, classes (templates/instances/bookings), private sessions."""
import os
import asyncio
import secrets
from datetime import datetime, timedelta
from typing import Optional, Dict, Any

from fastapi import Depends, HTTPException, Request
from pydantic import BaseModel, Field, AwareDatetime

from core import api, db, now_utc, gen_id, sha256_hex, get_current_user, get_optional_user, require_role, logger
from access_terms import class_access, class_pricing, parse_dt
from operation_lock import operation_lock
from models import (
    InstructorApplication, ApprovalAction,
    ClassTemplateCreate, ClassInstanceCreate, BookingCreate, CheckInRequest,
)
from email_service import (
    send_magic_link as email_magic_link,
    send_booking_confirmation as email_booking_confirmation,
    send_waitlist_promoted as email_waitlist_promoted,
)


# ---------------- Instructors ----------------
@api.get("/instructors")
async def list_instructors():
    return await db.users.find({"role": "instructor", "active": True}, {"_id": 0, "password_hash": 0}).to_list(200)


@api.get("/instructors/{instructor_id}")
async def get_instructor(instructor_id: str):
    inst = await db.users.find_one({"id": instructor_id, "role": "instructor"}, {"_id": 0, "password_hash": 0})
    if not inst:
        raise HTTPException(404, "Not found")
    return inst


@api.post("/instructor-applications")
async def submit_application(payload: InstructorApplication):
    doc = {**payload.model_dump(), "id": gen_id(), "status": "pending", "created_at": now_utc().isoformat()}
    await db.instructor_applications.insert_one(doc)
    doc.pop("_id", None)
    return doc


@api.get("/admin/instructor-applications")
async def list_applications(request: Request):
    await require_role(request, ["admin"])
    return await db.instructor_applications.find({}, {"_id": 0}).to_list(500)


@api.post("/admin/instructor-applications/decision")
async def application_decision(payload: ApprovalAction, request: Request):
    await require_role(request, ["admin"])
    app_doc = await db.instructor_applications.find_one({"id": payload.application_id})
    if not app_doc:
        raise HTTPException(404, "Application not found")
    if payload.action == "approve":
        existing = await db.users.find_one({"email": app_doc["email"]})
        if not existing:
            await db.users.insert_one({
                "id": gen_id(), "email": app_doc["email"], "name": app_doc["name"],
                "role": "instructor", "bio": app_doc.get("bio", ""),
                "styles": app_doc.get("styles", []), "years_experience": app_doc.get("years_experience", 0),
                "active": True, "source": "instructor_application", "created_at": now_utc().isoformat(),
            })
        else:
            await db.users.update_one({"email": app_doc["email"]}, {"$set": {"role": "instructor", "active": True}})
        token_plain = secrets.token_urlsafe(32)
        await db.magic_link_tokens.insert_one({
            "id": gen_id(), "email": app_doc["email"],
            "token_sha": sha256_hex(token_plain), "type": "instructor_onboarding",
            "expires_at": (now_utc() + timedelta(days=7)).isoformat(),
            "used_at": None, "created_at": now_utc().isoformat(),
        })
        await db.instructor_applications.update_one(
            {"id": payload.application_id},
            {"$set": {"status": "approved", "decided_at": now_utc().isoformat(), "notes": payload.notes}},
        )
        frontend_url = os.environ.get("FRONTEND_URL", "")
        magic_url = f"{frontend_url}/magic-link?token={token_plain}"
        await email_magic_link(app_doc["email"], magic_url, "instructor_onboarding")
        return {"ok": True, "magic_url": magic_url}
    else:
        await db.instructor_applications.update_one(
            {"id": payload.application_id},
            {"$set": {"status": "rejected", "decided_at": now_utc().isoformat(), "notes": payload.notes}},
        )
        return {"ok": True}


# ---------------- Classes ----------------
@api.post("/admin/class-templates")
async def create_template(payload: ClassTemplateCreate, request: Request):
    user = await require_role(request, ["admin", "instructor"])
    doc = {**payload.model_dump(mode="json"), "id": gen_id(), "created_by": user["id"], "created_at": now_utc().isoformat()}
    await db.class_templates.insert_one(doc)
    doc.pop("_id", None)
    return doc


@api.patch("/admin/class-templates/{template_id}")
async def patch_template(template_id: str, payload: Dict[str, Any], request: Request):
    await require_role(request, ["admin"])
    allowed = {"title", "description", "instructor_id", "location_type", "location_detail",
               "style", "level", "duration_minutes", "capacity", "props_needed"}
    update = {k: v for k, v in payload.items() if k in allowed}
    if not update:
        return {"updated": 0}
    res = await db.class_templates.update_one({"id": template_id}, {"$set": update})
    if res.matched_count == 0:
        raise HTTPException(404, "Template not found")
    return {"updated": len(update)}


@api.delete("/admin/class-templates/{template_id}")
async def delete_template(template_id: str, request: Request):
    await require_role(request, ["admin"])
    # Don't allow deleting templates that still have upcoming instances
    upcoming = await db.class_instances.count_documents({
        "template_id": template_id,
        "start_time": {"$gte": now_utc().isoformat()},
    })
    if upcoming > 0:
        raise HTTPException(400, f"Cannot delete: {upcoming} upcoming class(es) still use this template")
    res = await db.class_templates.delete_one({"id": template_id})
    if res.deleted_count == 0:
        raise HTTPException(404, "Template not found")
    return {"deleted": 1}


@api.get("/class-templates")
async def list_templates():
    return await db.class_templates.find({}, {"_id": 0}).to_list(500)


@api.post("/admin/class-instances")
async def create_instance(payload: ClassInstanceCreate, request: Request):
    await require_role(request, ["admin", "instructor"])
    template = await db.class_templates.find_one({"id": payload.template_id})
    if not template:
        raise HTTPException(404, "Template not found")
    instance = {
        "id": gen_id(), "template_id": payload.template_id, "title": template["title"],
        "instructor_id": template["instructor_id"], "location_type": template["location_type"],
        "location_detail": template.get("location_detail"),
        "style": template["style"], "level": template["level"],
        "duration_minutes": template["duration_minutes"],
        "start_time": payload.start_time.isoformat(),
        "end_time": (payload.start_time + timedelta(minutes=template["duration_minutes"])).isoformat(),
        "capacity": payload.capacity or template["capacity"],
        "is_recorded": payload.is_recorded, "status": "scheduled",
        "bookings_count": 0, "created_at": now_utc().isoformat(),
    }
    await db.class_instances.insert_one(instance)
    # Auto-provision a Zoom meeting for online classes (best-effort; MOCK when Zoom unconfigured).
    if instance["location_type"] == "online":
        try:
            from routers.zoom import create_meeting_for_instance
            meeting = await create_meeting_for_instance(instance)
            if meeting:
                await db.class_instances.update_one({"id": instance["id"]}, {"$set": meeting})
                instance.update(meeting)
        except Exception as e:
            logger.warning(f"Zoom auto-create skipped for {instance['id']}: {e}")
    instance.pop("_id", None)
    return instance


@api.patch("/admin/class-instances/{instance_id}")
async def patch_instance(instance_id: str, payload: Dict[str, Any], request: Request):
    """Update a scheduled class. Admin sets `status=cancelled` to cancel
    (per user spec, no auto-refunds or auto-emails — admin handles those)."""
    await require_role(request, ["admin"])
    allowed = {"start_time", "capacity", "is_recorded", "status", "location_detail",
               "location_type", "title", "style", "level"}
    update = {k: v for k, v in payload.items() if k in allowed}
    if not update:
        return {"updated": 0}
    # Recompute end_time when start_time or duration changes
    if "start_time" in update:
        inst = await db.class_instances.find_one({"id": instance_id})
        if not inst:
            raise HTTPException(404, "Class not found")
        # Accept ISO string or datetime
        start = update["start_time"]
        if isinstance(start, datetime):
            start_dt = start
            update["start_time"] = start.isoformat()
        else:
            start_dt = datetime.fromisoformat(str(start).replace("Z", "+00:00"))
            update["start_time"] = start_dt.isoformat()
        update["end_time"] = (start_dt + timedelta(minutes=inst["duration_minutes"])).isoformat()
    res = await db.class_instances.update_one({"id": instance_id}, {"$set": update})
    if res.matched_count == 0:
        raise HTTPException(404, "Class not found")
    # When a class is cancelled, also cancel its outstanding bookings so the
    # bookings_count and waitlist don't lie to analytics/admin queries.
    # (Per user spec we still do NOT auto-email or auto-refund.)
    if update.get("status") == "cancelled":
        await db.bookings.update_many(
            {"class_instance_id": instance_id, "status": {"$in": ["confirmed", "waitlist"]}},
            {"$set": {"status": "cancelled", "cancelled_reason": "class_cancelled",
                      "cancelled_at": now_utc().isoformat()}},
        )
        await db.class_instances.update_one({"id": instance_id}, {"$set": {"bookings_count": 0}})
    return {"updated": len(update)}


@api.delete("/admin/class-instances/{instance_id}")
async def delete_instance(instance_id: str, request: Request):
    await require_role(request, ["admin"])
    inst = await db.class_instances.find_one({"id": instance_id})
    if not inst:
        raise HTTPException(404, "Class not found")
    # Mark any active bookings as cancelled (no refunds — admin handles per spec)
    await db.bookings.update_many(
        {"class_instance_id": instance_id, "status": {"$in": ["confirmed", "waitlist"]}},
        {"$set": {"status": "cancelled", "cancelled_reason": "class_deleted",
                  "cancelled_at": now_utc().isoformat()}},
    )
    await db.class_instances.delete_one({"id": instance_id})
    return {"deleted": 1}


@api.get("/instructor/class-instances")
async def instructor_class_instances(request: Request):
    """Upcoming classes taught by the current instructor (or all, for admin)."""
    user = await require_role(request, ["instructor", "admin"])
    now_iso = now_utc().isoformat()
    q = {"start_time": {"$gte": now_iso}}
    if user.get("role") == "instructor":
        q["instructor_id"] = user["id"]
    rows = await db.class_instances.find(q, {"_id": 0}).sort("start_time", 1).to_list(500)
    return rows


@api.patch("/instructor/class-instances/{instance_id}/cancel")
async def instructor_cancel_instance(instance_id: str, request: Request):
    """An instructor cancels one of their own classes (cancels its bookings too)."""
    user = await require_role(request, ["instructor", "admin"])
    inst = await db.class_instances.find_one({"id": instance_id})
    if not inst:
        raise HTTPException(404, "Class not found")
    if user.get("role") == "instructor" and inst.get("instructor_id") != user["id"]:
        raise HTTPException(403, "Not your class")
    await db.class_instances.update_one({"id": instance_id}, {"$set": {"status": "cancelled"}})
    await db.bookings.update_many(
        {"class_instance_id": instance_id, "status": {"$in": ["confirmed", "waitlist"]}},
        {"$set": {"status": "cancelled", "cancelled_reason": "instructor_cancelled",
                  "cancelled_at": now_utc().isoformat()}},
    )
    await db.class_instances.update_one({"id": instance_id}, {"$set": {"bookings_count": 0}})
    return {"ok": True}



@api.post("/admin/class-instances/bulk-generate")
async def bulk_generate_instances(payload: Dict[str, Any], request: Request):
    """Repeat a template weekly. Body: {template_id, start_date (ISO), weeks_count, weekday (0=Mon..6=Sun), hour, minute, capacity?, is_recorded?}."""
    await require_role(request, ["admin"])
    template = await db.class_templates.find_one({"id": payload.get("template_id")})
    if not template:
        raise HTTPException(404, "Template not found")
    try:
        start_date = datetime.fromisoformat(str(payload["start_date"]).replace("Z", "+00:00"))
        weeks_count = int(payload.get("weeks_count", 4))
        weekday = int(payload["weekday"])  # 0..6
        hour = int(payload.get("hour", 8))
        minute = int(payload.get("minute", 0))
    except (KeyError, ValueError, TypeError) as e:
        raise HTTPException(400, f"Invalid payload: {e}")
    if not (0 <= weekday <= 6) or not (1 <= weeks_count <= 52):
        raise HTTPException(400, "weekday 0..6, weeks_count 1..52")

    # Find first matching weekday on or after start_date
    days_ahead = (weekday - start_date.weekday()) % 7
    first = start_date.replace(hour=hour, minute=minute, second=0, microsecond=0) + timedelta(days=days_ahead)
    capacity = int(payload.get("capacity") or template["capacity"])
    is_recorded = bool(payload.get("is_recorded", False))

    instances = []
    for w in range(weeks_count):
        start = first + timedelta(weeks=w)
        instances.append({
            "id": gen_id(), "template_id": template["id"], "title": template["title"],
            "instructor_id": template["instructor_id"], "location_type": template["location_type"],
            "location_detail": template.get("location_detail"),
            "style": template["style"], "level": template["level"],
            "duration_minutes": template["duration_minutes"],
            "start_time": start.isoformat(),
            "end_time": (start + timedelta(minutes=template["duration_minutes"])).isoformat(),
            "capacity": capacity, "is_recorded": is_recorded,
            "status": "scheduled", "bookings_count": 0,
            "created_at": now_utc().isoformat(),
        })
    if instances:
        await db.class_instances.insert_many(instances)
    return {"created": len(instances), "first_start": first.isoformat()}


@api.get("/admin/class-instances/{instance_id}/bookings")
async def list_instance_bookings(instance_id: str, request: Request):
    await require_role(request, ["admin", "instructor"])
    bookings = await db.bookings.find({"class_instance_id": instance_id}, {"_id": 0}).to_list(500)
    user_ids = list({b["user_id"] for b in bookings})
    users = {u["id"]: u for u in await db.users.find(
        {"id": {"$in": user_ids}}, {"_id": 0, "password_hash": 0}
    ).to_list(500)}
    for b in bookings:
        u = users.get(b["user_id"], {})
        b["user_name"] = u.get("name", "Unknown")
        b["user_email"] = u.get("email", "")
    return bookings


@api.get("/class-instances")
async def list_instances(
    location_type: Optional[str] = None, style: Optional[str] = None, level: Optional[str] = None,
    instructor_id: Optional[str] = None, upcoming: bool = True,
    include_cancelled: bool = False,
    user: Optional[dict] = Depends(get_optional_user),
):
    query: Dict[str, Any] = {}
    if location_type: query["location_type"] = location_type
    if style: query["style"] = style
    if level: query["level"] = level
    if instructor_id: query["instructor_id"] = instructor_id
    if upcoming:
        query["start_time"] = {"$gte": now_utc().isoformat()}
    if not include_cancelled:
        query["status"] = {"$ne": "cancelled"}
    rows = await db.class_instances.find(query, {"_id": 0}).sort("start_time", 1).to_list(500)
    instructor_ids = list({r["instructor_id"] for r in rows})
    instructors = {u["id"]: u for u in await db.users.find({"id": {"$in": instructor_ids}}, {"_id": 0, "password_hash": 0}).to_list(500)}
    for r in rows:
        # Host-only / gated fields must not leak through the public list endpoint.
        r.pop("zoom_start_url", None)
        r.pop("recording_url", None)
        if not user or user.get("role") not in ("admin", "instructor"):
            r.pop("zoom_join_url", None)
            r.pop("zoom_meeting_id", None)
            if r.get("location_type") == "online":
                r["location_detail"] = "Online (Zoom)"
        inst = instructors.get(r["instructor_id"], {})
        r["instructor_name"] = inst.get("name", "Tony Sanchez")
        r["instructor_photo"] = inst.get("photo_url")
    return rows


@api.get("/class-instances/{instance_id}")
async def get_instance(instance_id: str, user: Optional[dict] = Depends(get_optional_user)):
    inst = await db.class_instances.find_one({"id": instance_id}, {"_id": 0})
    if not inst:
        raise HTTPException(404, "Class not found")
    # Host-only / gated fields must not leak through the public class endpoint.
    inst.pop("zoom_start_url", None)
    inst.pop("recording_url", None)
    pricing = await class_pricing(inst)
    inst["purchase_options"] = pricing
    staff = bool(user and user.get("role") in ("admin", "instructor"))
    access = await class_access(user["id"], inst) if user else None
    booking = await db.bookings.find_one({"user_id": user["id"], "class_instance_id": instance_id, "status": "confirmed"}, {"_id": 0}) if user else None
    passes = await db.class_passes.find_one({"user_id": user["id"], "active": True, "remaining": {"$gt": 0}}, {"_id": 0, "remaining": 1}) if user else None
    inst["viewer"] = {"access": access, "can_book": bool(access or passes or pricing["mode"] == "free")}
    join_access = await class_access(user["id"], inst, for_join=True) if user else None
    legacy_or_pass = booking and booking.get("access_source") in (None, "pass", "free")
    if not staff and not (booking and (join_access or legacy_or_pass) and inst.get("status") != "cancelled"):
        inst.pop("zoom_join_url", None)
        inst.pop("zoom_meeting_id", None)
    if not staff and inst.get("location_type") == "online":
        inst["location_detail"] = "Online (Zoom)"
    instructor = await db.users.find_one({"id": inst["instructor_id"]}, {"_id": 0, "password_hash": 0})
    inst["instructor"] = instructor
    return inst


@api.post("/bookings")
async def book_class(payload: BookingCreate, user: dict = Depends(get_current_user)):
    async with operation_lock(f"class-booking:{payload.class_instance_id}"):
        return await _book_class(payload, user)


async def _book_class(payload, user):
    if user.get("role") in ("admin", "instructor"):
        raise HTTPException(403, "Staff accounts don't book classes as attendees.")
    instance = await db.class_instances.find_one({"id": payload.class_instance_id})
    if not instance:
        raise HTTPException(404, "Class not found")
    if instance.get("status") == "cancelled" or parse_dt(instance["start_time"]) <= now_utc():
        raise HTTPException(409, "This class is no longer open for booking.")
    existing = await db.bookings.find_one({
        "user_id": user["id"], "class_instance_id": payload.class_instance_id,
        "status": {"$in": ["confirmed", "waitlist"]},
    })
    if existing:
        raise HTTPException(400, "Already booked")

    pricing = await class_pricing(instance)
    access = await class_access(user["id"], instance)
    pass_id = None
    source = access["source"] if access else "free"
    if pricing["mode"] != "free" and not access:
        pack = await db.class_passes.find_one_and_update({"user_id": user["id"], "active": True, "remaining": {"$gt": 0}}, {"$inc": {"remaining": -1}}, projection={"_id": 0})
        if not pack:
            raise HTTPException(402, "Buy this class or a subscription covering its scheduled time.")
        pass_id, source = pack["id"], "pass"

    # Atomic capacity claim: only increments if bookings_count < capacity
    updated = await db.class_instances.find_one_and_update(
        {
            "id": payload.class_instance_id,
            "$expr": {"$lt": ["$bookings_count", "$capacity"]},
        },
        {"$inc": {"bookings_count": 1}},
    )
    status = "confirmed" if updated else "waitlist"

    booking = {
        "id": gen_id(), "user_id": user["id"],
        "class_instance_id": payload.class_instance_id,
        "status": status, "check_in_flag": False, "created_at": now_utc().isoformat(),
        "access_source": source, "access_grant_id": (access or {}).get("grant_id"), "reserved_pass_id": pass_id,
    }
    await db.bookings.insert_one(booking)

    if status == "confirmed":
        when = datetime.fromisoformat(instance["start_time"]).strftime("%A %b %d, %I:%M %p UTC")
        location = instance.get("location_detail") or ("Online" if instance["location_type"] == "online" else "Studio")
        # Fire-and-forget: a slow/unreachable SMTP host must never block or delay booking.
        asyncio.create_task(email_booking_confirmation(user["email"], instance["title"], when, location))
    booking.pop("_id", None)
    return booking


@api.get("/bookings/mine")
async def my_bookings(user: dict = Depends(get_current_user)):
    rows = await db.bookings.find({"user_id": user["id"]}, {"_id": 0}).to_list(500)
    ids = [r["class_instance_id"] for r in rows]
    instances = {i["id"]: i for i in await db.class_instances.find({"id": {"$in": ids}}, {"_id": 0}).to_list(500)}
    for r in rows:
        r["class"] = instances.get(r["class_instance_id"])
        if r["class"]:
            r["class"] = dict(r["class"])
            for key in ("zoom_start_url", "zoom_join_url", "zoom_meeting_id", "recording_url"):
                r["class"].pop(key, None)
            if r["class"].get("location_type") == "online":
                r["class"]["location_detail"] = "Online (Zoom)"
    return rows


@api.delete("/bookings/{booking_id}")
async def cancel_booking(booking_id: str, user: dict = Depends(get_current_user)):
    booking = await db.bookings.find_one({"id": booking_id})
    if not booking or booking["user_id"] != user["id"]:
        raise HTTPException(404, "Booking not found")
    async with operation_lock(f"class-booking:{booking['class_instance_id']}"):
        return await _cancel_booking(booking_id, user)


async def _cancel_booking(booking_id, user):
    booking = await db.bookings.find_one({"id": booking_id, "user_id": user["id"]}, {"_id": 0})
    if not booking or booking.get("status") == "cancelled":
        return {"ok": True}
    if booking["status"] == "confirmed":
        await db.class_instances.update_one({"id": booking["class_instance_id"]}, {"$inc": {"bookings_count": -1}})
        next_wl = await db.bookings.find_one(
            {"class_instance_id": booking["class_instance_id"], "status": "waitlist"},
            sort=[("created_at", 1)],
        )
        if next_wl:
            await db.bookings.update_one({"id": next_wl["id"]}, {"$set": {"status": "confirmed"}})
            await db.class_instances.update_one({"id": booking["class_instance_id"]}, {"$inc": {"bookings_count": 1}})
            # A spot opened — notify the promoted student by push + email (fire-and-forget).
            asyncio.create_task(_notify_waitlist_promoted(next_wl["user_id"], booking["class_instance_id"]))
    await db.bookings.update_one({"id": booking_id}, {"$set": {"status": "cancelled"}})
    if booking.get("reserved_pass_id") and not booking.get("check_in_flag"):
        await db.class_passes.update_one({"id": booking["reserved_pass_id"]}, {"$inc": {"remaining": 1}})
    return {"ok": True}


async def _notify_waitlist_promoted(user_id: str, instance_id: str):
    """Push + email a student who was just moved off the waitlist into a confirmed seat."""
    try:
        inst = await db.class_instances.find_one({"id": instance_id})
        if not inst:
            return
        when = datetime.fromisoformat(inst["start_time"]).strftime("%A %b %d, %I:%M %p UTC")
        location = inst.get("location_detail") or ("Online" if inst["location_type"] == "online" else "Studio")
        from routers.push import notify_user
        await notify_user(
            user_id,
            "A spot opened — you're in!",
            f"{inst['title']} · {when}",
            f"/schedule/{instance_id}",
        )
        u = await db.users.find_one({"id": user_id})
        if u and u.get("email"):
            await email_waitlist_promoted(u["email"], inst["title"], when, location)
    except Exception as e:
        logger.warning(f"waitlist promotion notify failed: {e}")


@api.post("/admin/bookings/check-in")
async def check_in(payload: CheckInRequest, request: Request):
    await require_role(request, ["admin", "instructor"])
    await db.bookings.update_one({"id": payload.booking_id},
                                  {"$set": {"check_in_flag": True, "checked_in_at": now_utc().isoformat()}})
    # Auto-log practice + consume a pass credit (if user has any) on check-in
    booking = await db.bookings.find_one({"id": payload.booking_id}, {"_id": 0})
    if booking and booking.get("user_id"):
        uid = booking["user_id"]
        try:
            from routers.streaks import record_practice
            await record_practice(uid, source="class", ref_id=booking.get("class_instance_id"))
        except Exception:
            pass
        # Deduct one class pass if the user has any (no-op if they're on a membership).
        try:
            has_sub = await db.subscriptions.find_one({"user_id": uid, "status": {"$in": ["active", "trialing"]}})
            if not has_sub and not booking.get("access_source"):
                # Idempotent per booking check-in
                existing_use = await db.pass_usages.find_one({"user_id": uid, "class_instance_id": booking.get("class_instance_id")})
                if not existing_use:
                    pack = await db.class_passes.find_one_and_update(
                        {"user_id": uid, "active": True, "remaining": {"$gt": 0}},
                        {"$inc": {"remaining": -1}},
                    )
                    if pack:
                        await db.pass_usages.insert_one({
                            "id": gen_id(), "user_id": uid,
                            "class_instance_id": booking.get("class_instance_id"),
                            "pack_id": pack["id"],
                            "used_at": now_utc().isoformat(),
                        })
        except Exception:
            pass
    return {"ok": True}


# ---------------- Private sessions (1:1 with Tony) ----------------
PRIVATE_SESSION_PRICE_EUR = 120.0


class PrivateSessionRequestBody(BaseModel):
    sessions: int = Field(default=1, ge=1, le=50)
    slot_ids: list[str] = Field(default_factory=list, max_length=50)
    focus_area: str = ""
    notes: str = ""
    preferred_time: Optional[str] = None


@api.post("/private-sessions/request")
async def request_private_session(payload: PrivateSessionRequestBody, user: dict = Depends(get_current_user)):
    """Create a pending 1:1 request. The user then pays to confirm it (bundle price or per-session)."""
    from routers.settings import private_session_amount, get_all_settings
    settings = await get_all_settings()
    pkg_counts = {int(p["sessions"]) for p in (settings.get("private_session_packages") or []) if p.get("sessions")}
    requested = int(payload.sessions or 1)
    # Allow 1–3 by default, plus any admin-defined package size.
    allowed = requested in pkg_counts or 1 <= requested <= 3
    if not allowed:
        raise HTTPException(422, "Choose an available session package.")
    n = requested
    n = max(1, min(50, n))
    amount = await private_session_amount(n)
    if len(payload.slot_ids) != n:
        raise HTTPException(422, f"Choose {n} available opening(s), one for each session.")
    from routers.availability import hold_slots, release_slots
    request_id = gen_id()
    selected, hold_until = await hold_slots(payload.slot_ids, request_id)
    doc = {
        "id": request_id, "user_id": user["id"], "user_email": user.get("email"),
        "selected_slots": selected, "hold_until": hold_until,
        "user_name": user.get("name"),
        "sessions_total": n, "sessions_paid": 0, "sessions_scheduled": 0, "sessions": [],
        "focus_area": (payload.focus_area or "").strip()[:500],
        "notes": (payload.notes or "").strip()[:1000],
        "preferred_time": "; ".join(s["start_time"] + " UTC" for s in selected),
        "status": "pending_payment",
        "amount": amount, "currency": "eur",
        "created_at": now_utc().isoformat(),
    }
    try:
        await db.private_session_requests.insert_one(doc)
    except Exception:
        await release_slots(request_id, held_only=True)
        raise
    return {"id": doc["id"], "sessions": n, "amount_eur": amount,
            "selected_slots": selected, "hold_until": hold_until,
            "price_each_eur": round(amount / n, 2) if n else amount}


@api.get("/private-sessions/mine")
async def list_my_private(user: dict = Depends(get_current_user)):
    rows = await db.private_session_requests.find(
        {"user_id": user["id"], "status": {"$ne": "pending_payment"}}, {"_id": 0}
    ).sort("created_at", -1).to_list(100)
    for row in rows:
        row.pop("admin_notes", None)
        row.pop("scheduling_lock", None)
        row.pop("scheduling_lock_until", None)
        for session in row.get("sessions", []):
            session.pop("start_url", None)
            if session.get("zoom_mock"):
                session["join_url"] = None
    return rows


# ---- Admin ----
@api.get("/admin/private-sessions")
async def admin_list_private(request: Request):
    await require_role(request, ["admin"])
    return await db.private_session_requests.find(
        {"status": {"$ne": "pending_payment"}}, {"_id": 0}
    ).sort("created_at", -1).to_list(300)


class PrivateSessionUpdate(BaseModel):
    sessions_total: Optional[int] = Field(default=None, ge=0, le=20)
    status: Optional[str] = None
    admin_notes: Optional[str] = None


@api.patch("/admin/private-sessions/{req_id}")
async def admin_update_private(req_id: str, payload: PrivateSessionUpdate, request: Request):
    await require_role(request, ["admin"])
    current = await db.private_session_requests.find_one({"id": req_id}, {"_id": 0})
    if not current:
        raise HTTPException(404, "Request not found")
    if payload.sessions_total is not None and payload.sessions_total < current.get("sessions_scheduled", 0):
        raise HTTPException(422, "Cannot grant fewer sessions than already scheduled.")
    if payload.status and payload.status not in {"cancelled", "completed"}:
        raise HTTPException(422, "Only cancelled or completed may be set manually.")
    updates: Dict[str, Any] = {}
    if payload.sessions_total is not None:
        updates["sessions_total"] = max(0, int(payload.sessions_total))
    if payload.status:
        updates["status"] = payload.status
        if payload.status == "cancelled":
            from routers.availability import release_slots
            async with operation_lock("private-availability"):
                await release_slots(req_id)
    if payload.admin_notes is not None:
        updates["admin_notes"] = payload.admin_notes[:1000]
    if not updates:
        raise HTTPException(400, "Nothing to update")
    r = await db.private_session_requests.update_one({"id": req_id}, {"$set": updates})
    if r.matched_count == 0:
        raise HTTPException(404, "Request not found")
    return await db.private_session_requests.find_one({"id": req_id}, {"_id": 0})


class PrivateSessionSchedule(BaseModel):
    start_time: AwareDatetime
    duration_minutes: int = Field(default=60, ge=15, le=180)


@api.post("/admin/private-sessions/{req_id}/schedule")
async def admin_schedule_private(req_id: str, payload: PrivateSessionSchedule, request: Request):
    await require_role(request, ["admin"])
    req = await db.private_session_requests.find_one({"id": req_id})
    if not req:
        raise HTTPException(404, "Request not found")
    from datetime import timezone
    start_time = payload.start_time.astimezone(timezone.utc)
    if start_time <= now_utc():
        raise HTTPException(422, "Choose a future date and time.")
    if req.get("status") not in ("paid", "scheduled") or req.get("sessions_paid", 0) < 1:
        raise HTTPException(409, "Only paid, active requests can be scheduled.")
    if req.get("sessions_scheduled", 0) >= req.get("sessions_total", 0):
        raise HTTPException(409, "All granted sessions are already scheduled.")
    if req.get("selected_slots"):
        reserved = next((s for s in req["selected_slots"] if parse_dt(s["start_time"]) == start_time), None)
        if not reserved or reserved["duration_minutes"] != payload.duration_minutes:
            raise HTTPException(422, "Choose one of this student's reserved openings with its original duration.")
        if any(parse_dt(s["start_time"]) == start_time for s in req.get("sessions", [])):
            raise HTTPException(409, "This opening is already scheduled.")
        slot = await db.private_slots.find_one({"id": reserved["id"], "request_id": req_id, "status": "booked"}, {"_id": 0})
        if not slot:
            raise HTTPException(409, "This opening needs rebooking; it is no longer reserved.")
    from routers.availability import schedule_conflict
    if await schedule_conflict(start_time, start_time + timedelta(minutes=payload.duration_minutes), ignore_request=req_id):
        raise HTTPException(409, "Tony already has a class at this time.")
    from routers.zoom import create_meeting_for_instance
    from routers.notifications import push_notification, push_admins
    sess_id = gen_id()
    lock = await db.private_session_requests.update_one({"id": req_id,
        "status": {"$in": ["paid", "scheduled"]},
        "$expr": {"$lt": ["$sessions_scheduled", "$sessions_total"]},
        "$or": [{"scheduling_lock_until": {"$exists": False}}, {"scheduling_lock_until": {"$lt": now_utc().isoformat()}}]},
        {"$set": {"scheduling_lock": sess_id, "scheduling_lock_until": (now_utc() + timedelta(minutes=3)).isoformat()}})
    if not lock.modified_count:
        raise HTTPException(409, "A session is being scheduled. Please wait and reload.")
    try:
        meeting = await create_meeting_for_instance({
            "id": sess_id,
            "title": f"Private session · {req.get('user_name') or req.get('user_email') or 'Tony Yoga'}",
            "start_time": start_time.isoformat(), "duration_minutes": payload.duration_minutes,
        })
    except Exception as exc:
        await db.private_session_requests.update_one({"id": req_id, "scheduling_lock": sess_id},
            {"$unset": {"scheduling_lock": "", "scheduling_lock_until": ""}})
        if isinstance(exc, HTTPException):
            raise
        raise HTTPException(502, "Zoom is unavailable. The session was not scheduled; please try again.")
    session = {
        "session_id": sess_id, "start_time": start_time.isoformat(),
        "duration_minutes": payload.duration_minutes,
        "join_url": meeting.get("zoom_join_url"), "start_url": meeting.get("zoom_start_url"),
        "zoom_meeting_id": meeting.get("zoom_meeting_id"), "zoom_mock": meeting.get("zoom_mock", False),
        "created_at": now_utc().isoformat(),
    }
    await db.private_session_requests.update_one(
        {"id": req_id, "scheduling_lock": sess_id},
        {"$push": {"sessions": session}, "$inc": {"sessions_scheduled": 1}, "$set": {"status": "scheduled"},
         "$unset": {"scheduling_lock": "", "scheduling_lock_until": ""}},
    )
    when = start_time.strftime("%d %b %Y, %H:%M")
    try:
        await push_notification(
            req["user_id"], "Your private session is scheduled",
            f"Tony scheduled your private session for {when} (UTC). Tap to join on Zoom.",
            "/private-sessions",
        )
        await push_admins(
            "Private session scheduled",
            f"Scheduled a session for {req.get('user_name') or req.get('user_email')} at {when} UTC.",
            "/admin?tab=private",
        )
    except Exception as e:
        logger.warning(f"schedule notify failed: {e}")
    try:
        from email_service import send_email
        if req.get("user_email") and session.get("join_url"):
            await send_email(
                req["user_email"], "Your private session with Tony is scheduled",
                f"<p>Your private session is booked for <strong>{when} UTC</strong>.</p>"
                f"<p><a href='{session['join_url']}'>Join on Zoom</a></p>",
                f"Your private session is booked for {when} UTC. Join: {session['join_url']}",
            )
    except Exception as e:
        logger.warning(f"schedule email skipped: {e}")
    return await db.private_session_requests.find_one({"id": req_id}, {"_id": 0})
