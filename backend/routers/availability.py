"""Tony's actual openings, with expiring checkout holds and atomic reservations."""
from datetime import date, time, datetime, timedelta, timezone
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError
from typing import List, Optional
from pydantic import BaseModel, Field
from fastapi import Request, HTTPException, Depends
from pymongo import ReturnDocument
from core import api, db, now_utc, gen_id, require_role, get_current_user
from access_terms import parse_dt
from operation_lock import operation_lock


class SlotWindow(BaseModel):
    date: date
    start: time
    end: time
    timezone: str = "Europe/Madrid"
    repeat_weeks: int = Field(default=1, ge=1, le=12)


class SlotView(BaseModel):
    id: str
    start_time: str
    end_time: str
    duration_minutes: int
    timezone: str
    status: str


def effective_status(slot):
    if slot.get("status") == "held" and (parse_dt(slot.get("hold_until")) or now_utc()) <= now_utc():
        return "open"
    return slot.get("status", "open")


async def schedule_conflict(start, end, ignore_request=None):
    # Compare normalized datetimes so older offset-bearing records remain safe.
    classes = await db.class_instances.find({"status": {"$ne": "cancelled"}}, {"_id": 0, "start_time": 1, "end_time": 1}).to_list(5000)
    for row in classes:
        s, e = parse_dt(row.get("start_time")), parse_dt(row.get("end_time"))
        if s and e and s < end and e > start:
            return True
    requests = await db.private_session_requests.find({"status": {"$nin": ["cancelled", "pending_payment"]}, "id": {"$ne": ignore_request}}, {"_id": 0, "sessions": 1}).to_list(1000)
    for row in requests:
        for session in row.get("sessions", []):
            s = parse_dt(session.get("start_time"))
            if s and s < end and s + timedelta(minutes=session.get("duration_minutes", 60)) > start:
                return True
    return False


@api.get("/private-sessions/availability", response_model=List[SlotView])
async def list_openings():
    slots = await db.private_slots.find({"start_time": {"$gt": now_utc().isoformat()}}, {"_id": 0}).sort("start_time", 1).to_list(1000)
    out = []
    for slot in slots:
        if effective_status(slot) == "open" and not await schedule_conflict(parse_dt(slot["start_time"]), parse_dt(slot["end_time"])):
            out.append({**slot, "status": "open"})
    return out


@api.get("/admin/private-availability", response_model=List[SlotView])
async def admin_openings(request: Request):
    await require_role(request, ["admin"])
    slots = await db.private_slots.find({"end_time": {"$gt": now_utc().isoformat()}}, {"_id": 0}).sort("start_time", 1).to_list(1000)
    return [{**s, "status": effective_status(s)} for s in slots]


@api.post("/admin/private-availability", response_model=List[SlotView])
async def add_openings(payload: SlotWindow, request: Request):
    await require_role(request, ["admin"])
    from routers.settings import get_setting
    duration = int(await get_setting("private_session_duration_min"))
    try:
        zone = ZoneInfo(payload.timezone)
    except (ZoneInfoNotFoundError, ValueError):
        raise HTTPException(422, "Choose a valid time zone.")
    if payload.end <= payload.start:
        raise HTTPException(422, "End time must be after start time on the same day.")
    proposed = []
    for week in range(payload.repeat_weeks):
        day = payload.date + timedelta(weeks=week)
        local = datetime.combine(day, payload.start, zone)
        finish = datetime.combine(day, payload.end, zone)
        # Reject DST transition windows rather than silently moving an opening.
        if local.utcoffset() != finish.utcoffset() or local.fold or local.replace(fold=1).utcoffset() != local.utcoffset():
            raise HTTPException(422, "Choose a window outside the daylight-saving clock change.")
        if local.astimezone(timezone.utc).astimezone(zone).replace(tzinfo=None) != local.replace(tzinfo=None):
            raise HTTPException(422, "This local time does not exist due to a clock change.")
        start, end = local.astimezone(timezone.utc), finish.astimezone(timezone.utc)
        if start <= now_utc():
            raise HTTPException(422, "Choose a future date and time.")
        while start + timedelta(minutes=duration) <= end:
            slot_end = start + timedelta(minutes=duration)
            proposed.append({"id": gen_id(), "start_time": start.isoformat(), "end_time": slot_end.isoformat(), "duration_minutes": duration, "timezone": payload.timezone, "status": "open"})
            start = slot_end
    if not proposed:
        raise HTTPException(422, f"The window must fit at least one {duration}-minute session.")
    async with operation_lock("private-availability"):
        for slot in proposed:
            overlap = await db.private_slots.find_one({"start_time": {"$lt": slot["end_time"]}, "end_time": {"$gt": slot["start_time"]}}, {"_id": 0})
            if overlap or await schedule_conflict(parse_dt(slot["start_time"]), parse_dt(slot["end_time"])):
                raise HTTPException(409, "This window overlaps an opening or a scheduled class. Nothing was added.")
        await db.private_slots.insert_many([dict(s) for s in proposed])
    return proposed


@api.delete("/admin/private-availability/{slot_id}")
async def remove_opening(slot_id: str, request: Request):
    await require_role(request, ["admin"])
    async with operation_lock("private-availability"):
        slot = await db.private_slots.find_one({"id": slot_id}, {"_id": 0})
        if not slot:
            raise HTTPException(404, "Opening not found")
        if effective_status(slot) != "open":
            raise HTTPException(409, "Reserved openings cannot be removed. Cancel the booking first.")
        await db.private_slots.delete_one({"id": slot_id})
    return {"ok": True}


async def hold_slots(slot_ids, request_id):
    if not slot_ids or len(set(slot_ids)) != len(slot_ids):
        raise HTTPException(422, "Select different available openings for your sessions.")
    held = []
    until = (now_utc() + timedelta(minutes=35)).isoformat()
    async with operation_lock("private-availability"):
        try:
            for sid in slot_ids:
                slot = await db.private_slots.find_one_and_update({
                    "id": sid, "start_time": {"$gt": now_utc().isoformat()},
                    "$or": [{"status": "open"}, {"status": "held", "hold_until": {"$lte": now_utc().isoformat()}}],
                }, {"$set": {"status": "held", "request_id": request_id, "hold_until": until}}, projection={"_id": 0}, return_document=ReturnDocument.AFTER)
                if not slot:
                    raise HTTPException(409, "An opening was just taken. Please choose another time.")
                held.append(slot)
                if await schedule_conflict(parse_dt(slot["start_time"]), parse_dt(slot["end_time"])):
                    raise HTTPException(409, "Tony is no longer free at that time. Please choose another opening.")
        except Exception:
            await release_slots(request_id, held_only=True)
            raise
    return [{k: s[k] for k in ("id", "start_time", "end_time", "duration_minutes", "timezone")} for s in held], until


async def release_slots(request_id, held_only=False):
    query = {"request_id": request_id}
    if held_only:
        query["status"] = "held"
    await db.private_slots.update_many(query, {"$set": {"status": "open"}, "$unset": {"request_id": "", "hold_until": ""}})


async def validate_request_hold(req):
    if not req.get("selected_slots"):
        return  # legacy pending requests
    for s in req["selected_slots"]:
        slot = await db.private_slots.find_one({"id": s["id"], "request_id": req["id"], "status": "held", "hold_until": {"$gt": now_utc().isoformat()}, "start_time": {"$gt": now_utc().isoformat()}}, {"_id": 0})
        if not slot:
            raise HTTPException(409, "Your opening hold expired. Please choose your times again.")


async def confirm_request_slots(req):
    conflicts = []
    async with operation_lock("private-availability"):
        for s in req.get("selected_slots", []):
            claimed = await db.private_slots.update_one({"id": s["id"], "request_id": req["id"], "status": {"$in": ["held", "booked"]}, "start_time": {"$gt": now_utc().isoformat()}}, {"$set": {"status": "booked"}, "$unset": {"hold_until": ""}})
            if not claimed.matched_count:
                conflicts.append(s["id"])
    await db.private_session_requests.update_one({"id": req["id"]}, {"$set": {"slot_conflicts": conflicts}})
    return conflicts


@api.post("/private-sessions/{request_id}/release")
async def abandon_hold(request_id: str, user=Depends(get_current_user)):
    req = await db.private_session_requests.find_one({"id": request_id, "user_id": user["id"]}, {"_id": 0})
    if not req or req.get("status") != "pending_payment":
        raise HTTPException(409, "Only unpaid requests can be released.")
    async with operation_lock("private-availability"):
        await release_slots(request_id, held_only=True)
        await db.private_session_requests.update_one({"id": request_id, "status": "pending_payment"}, {"$set": {"status": "cancelled"}})
    return {"ok": True}