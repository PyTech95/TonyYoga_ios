"""Class manager for Tony and the studio team.

Everything about live classes in one place:
- Weekly series (a class template plus its dates): create with days, time and time zone, edit
  (optionally for all future dates, telling booked students), add more weeks, end a series.
- One class: reschedule, change teacher / capacity / place / meeting link, cancel with automatic
  email + app notification and class credits returned.
- Roster: who is booked, waiting and cancelled, with membership, credits and first-class flags;
  check-in / attended / no-show, add or remove a student, move someone off the waitlist, message
  the class, download the roster.
- Reports: fill rate, attendance, no-shows, busiest times, and members who stopped booking.

Instructors (role "instructor") can open the roster and take attendance for their own classes.
"""
import asyncio
import csv
import io
from datetime import date, datetime, time, timedelta, timezone
from typing import List, Optional

from fastapi import Depends, HTTPException, Request
from fastapi.responses import Response
from pydantic import AwareDatetime, BaseModel, Field

from access_terms import parse_dt
from core import api, db, gen_id, logger, now_utc, require_role
from labels import plan_name

ACTIVE = ("confirmed", "waitlist")


def _tz(name: Optional[str]):
    try:
        from zoneinfo import ZoneInfo
        return ZoneInfo(name or "UTC")
    except Exception:
        return timezone.utc


def _fmt(iso: str, tzname: Optional[str] = None) -> str:
    d = parse_dt(iso)
    if not d:
        return ""
    if tzname:
        d = d.astimezone(_tz(tzname))
        return d.strftime("%a %d %b, %H:%M ") + (tzname.split("/")[-1].replace("_", " "))
    return d.strftime("%a %d %b, %H:%M UTC")


async def _staff(request: Request) -> dict:
    return await require_role(request, ["admin", "instructor"])


async def _admin(request: Request) -> dict:
    return await require_role(request, ["admin"])


async def _instance(iid: str, user: Optional[dict] = None) -> dict:
    inst = await db.class_instances.find_one({"id": iid}, {"_id": 0})
    if not inst:
        raise HTTPException(404, "Class not found")
    if user and user.get("role") == "instructor" and inst.get("instructor_id") != user["id"]:
        raise HTTPException(403, "This isn't one of your classes.")
    return inst


async def _audit(admin: dict, user_id: str, action: str, details: str):
    await db.member_audit.insert_one({"id": gen_id(), "user_id": user_id, "action": action, "details": details[:500],
                                      "admin_email": (admin or {}).get("email"), "at": now_utc().isoformat()})


async def _notify(user_id: str, title: str, body: str, url: str, email: bool = True, key: Optional[str] = None):
    try:
        from notify import notify_member
        await notify_member(user_id, title, body, url, email=email, dedupe_key=key)
    except Exception as exc:
        logger.warning("class notification failed (%s)", type(exc).__name__)


async def _counts(ids: List[str]) -> dict:
    out = {i: {"confirmed": 0, "waitlist": 0, "attended": 0, "no_show": 0, "cancelled": 0} for i in ids}
    for b in await db.bookings.find({"class_instance_id": {"$in": ids}}, {"_id": 0, "class_instance_id": 1, "status": 1, "check_in_flag": 1, "attendance": 1}).to_list(200000):
        c = out.get(b["class_instance_id"])
        if c is None:
            continue
        st = b.get("status")
        if st in ("confirmed", "attended"):
            c["confirmed"] += 1
            if b.get("check_in_flag") or b.get("attendance") == "attended" or st == "attended":
                c["attended"] += 1
            elif b.get("attendance") == "no_show":
                c["no_show"] += 1
        elif st == "waitlist":
            c["waitlist"] += 1
        elif st == "cancelled":
            c["cancelled"] += 1
    return out


async def _people(ids: List[str]) -> dict:
    return {u["id"]: u for u in await db.users.find({"id": {"$in": list(set(ids))}}, {"_id": 0, "id": 1, "name": 1, "email": 1, "phone": 1}).to_list(5000)}


def _row(inst: dict, counts: dict, staff: dict) -> dict:
    c = counts.get(inst["id"], {})
    cap = int(inst.get("capacity") or 0)
    t = staff.get(inst.get("instructor_id")) or {}
    return {k: inst.get(k) for k in ("id", "template_id", "title", "start_time", "end_time", "duration_minutes", "location_type", "location_detail",
                                      "capacity", "status", "style", "level", "is_recorded", "cancel_reason")} | {
        "instructor": {"id": inst.get("instructor_id"), "name": t.get("name")}, "booked": c.get("confirmed", 0), "waitlist": c.get("waitlist", 0),
        "attended": c.get("attended", 0), "no_show": c.get("no_show", 0), "spots_left": max(0, cap - c.get("confirmed", 0)),
        "fill": round(c.get("confirmed", 0) * 100 / cap) if cap else 0, "has_meeting": bool(inst.get("zoom_join_url")),
        "past": str(inst.get("end_time") or inst.get("start_time")) < now_utc().isoformat()}


# ---------------------------------------------------------------------------
# Calendar + series

@api.get("/admin/classes/calendar")
async def class_calendar(request: Request, start: Optional[str] = None, days: int = 14, template_id: Optional[str] = None):
    user = await _staff(request)
    first = datetime.combine(date.fromisoformat(start[:10]) if start else now_utc().date(), time.min, tzinfo=timezone.utc)
    last = first + timedelta(days=max(1, min(120, days)))
    q = {"start_time": {"$gte": first.isoformat(), "$lt": last.isoformat()}}
    if template_id:
        q["template_id"] = template_id
    if user.get("role") == "instructor":
        q["instructor_id"] = user["id"]
    rows = await db.class_instances.find(q, {"_id": 0}).sort("start_time", 1).to_list(3000)
    counts = await _counts([r["id"] for r in rows])
    staff = await _people([r.get("instructor_id") for r in rows if r.get("instructor_id")])
    return {"from": first.isoformat(), "to": last.isoformat(), "classes": [_row(r, counts, staff) for r in rows],
            "instructors": await db.users.find({"role": {"$in": ["admin", "instructor"]}, "active": {"$ne": False}}, {"_id": 0, "id": 1, "name": 1, "email": 1, "role": 1}).to_list(200)}


@api.get("/admin/classes/series")
async def class_series(request: Request):
    await _staff(request)
    templates = await db.class_templates.find({}, {"_id": 0}).to_list(500)
    now_iso = now_utc().isoformat()
    since = (now_utc() - timedelta(days=30)).isoformat()
    out = []
    for t in templates:
        upcoming = await db.class_instances.find({"template_id": t["id"], "start_time": {"$gte": now_iso}, "status": {"$ne": "cancelled"}},
                                                 {"_id": 0, "id": 1, "start_time": 1}).sort("start_time", 1).to_list(500)
        recent = await db.class_instances.find({"template_id": t["id"], "start_time": {"$gte": since, "$lt": now_iso}, "status": {"$ne": "cancelled"}},
                                               {"_id": 0, "id": 1, "capacity": 1}).to_list(500)
        counts = await _counts([r["id"] for r in recent])
        fills = [counts[r["id"]]["confirmed"] / r["capacity"] for r in recent if r.get("capacity")]
        attended = sum(counts[r["id"]]["attended"] for r in recent)
        booked = sum(counts[r["id"]]["confirmed"] for r in recent)
        subscribers = await db.access_grants.count_documents({"kind": "class_template", "target_id": t["id"], "revoked_at": {"$in": [None, ""]},
                                                              "ends_at": {"$gt": now_iso}})
        instructor = await db.users.find_one({"id": t.get("instructor_id")}, {"_id": 0, "name": 1}) or {}
        out.append({**{k: t.get(k) for k in ("id", "title", "description", "instructor_id", "location_type", "location_detail", "style", "level",
                                              "duration_minutes", "capacity", "schedule", "active")},
                    "instructor_name": instructor.get("name"), "upcoming": len(upcoming), "next_start": upcoming[0]["start_time"] if upcoming else None,
                    "last_start": upcoming[-1]["start_time"] if upcoming else None, "fill_30d": round(sum(fills) * 100 / len(fills)) if fills else None,
                    "attendance_30d": round(attended * 100 / booked) if booked else None, "subscribers": subscribers})
    out.sort(key=lambda s: (s["next_start"] is None, s["next_start"] or "", s["title"] or ""))
    return out


class SeriesIn(BaseModel):
    title: str = Field(min_length=2, max_length=120)
    description: str = Field(default="", max_length=3000)
    instructor_id: str
    location_type: str = Field(default="online", pattern="^(online|in_person)$")
    location_detail: Optional[str] = Field(default=None, max_length=300)
    style: str = Field(default="hot", max_length=40)
    level: str = Field(default="all", max_length=40)
    duration_minutes: int = Field(default=60, ge=10, le=480)
    capacity: int = Field(default=20, ge=1, le=1000)
    weekdays: List[int] = Field(min_length=1, max_length=7)  # 0 = Monday
    time: str = Field(pattern=r"^\d{2}:\d{2}$")
    timezone: str = Field(default="Europe/Madrid", max_length=60)
    start_date: date
    weeks: int = Field(default=8, ge=1, le=52)
    is_recorded: bool = False
    create_meetings: bool = True


def _dates(weekdays: List[int], hhmm: str, tzname: str, start: date, weeks: int, after: Optional[datetime] = None) -> List[datetime]:
    tz = _tz(tzname)
    h, m = (int(x) for x in hhmm.split(":"))
    out = []
    for offset in range(weeks * 7):
        d = start + timedelta(days=offset)
        if d.weekday() in weekdays:
            local = datetime.combine(d, time(h, m), tzinfo=tz)
            utc = local.astimezone(timezone.utc)
            if after and utc <= after:
                continue
            out.append(utc)
    return out


async def _make_instances(t: dict, starts: List[datetime], is_recorded: bool, create_meetings: bool) -> List[dict]:
    rows = []
    for s in starts:
        if await db.class_instances.find_one({"template_id": t["id"], "start_time": s.isoformat()}):
            continue
        rows.append({"id": gen_id(), "template_id": t["id"], "title": t["title"], "instructor_id": t["instructor_id"],
                     "location_type": t["location_type"], "location_detail": t.get("location_detail"), "style": t.get("style"), "level": t.get("level"),
                     "duration_minutes": t["duration_minutes"], "start_time": s.isoformat(), "end_time": (s + timedelta(minutes=t["duration_minutes"])).isoformat(),
                     "capacity": t["capacity"], "is_recorded": is_recorded, "status": "scheduled", "bookings_count": 0, "created_at": now_utc().isoformat()})
    if rows:
        await db.class_instances.insert_many([{**r} for r in rows])
    if create_meetings and t["location_type"] == "online":
        try:
            from routers.zoom import create_meeting_for_instance
            for r in rows[:60]:
                meeting = await create_meeting_for_instance(r)
                if meeting:
                    await db.class_instances.update_one({"id": r["id"]}, {"$set": meeting})
        except Exception as exc:
            logger.warning("Zoom meetings for new series skipped (%s)", type(exc).__name__)
    return rows


@api.post("/admin/classes/series")
async def create_series(payload: SeriesIn, request: Request):
    admin = await _admin(request)
    if not await db.users.find_one({"id": payload.instructor_id, "role": {"$in": ["admin", "instructor"]}}):
        raise HTTPException(422, "Choose a teacher for the class.")
    if any(d < 0 or d > 6 for d in payload.weekdays):
        raise HTTPException(422, "Weekdays go from 0 (Monday) to 6 (Sunday).")
    tid = gen_id()
    template = {"id": tid, "title": payload.title, "description": payload.description, "instructor_id": payload.instructor_id,
                "location_type": payload.location_type, "location_detail": payload.location_detail, "style": payload.style, "level": payload.level,
                "duration_minutes": payload.duration_minutes, "capacity": payload.capacity, "active": True,
                "schedule": {"weekdays": sorted(set(payload.weekdays)), "time": payload.time, "timezone": payload.timezone},
                "created_by": admin["id"], "created_at": now_utc().isoformat()}
    await db.class_templates.insert_one({**template})
    starts = _dates(template["schedule"]["weekdays"], payload.time, payload.timezone, payload.start_date, payload.weeks, after=now_utc())
    rows = await _make_instances(template, starts, payload.is_recorded, payload.create_meetings)
    return {"series": template, "created": len(rows), "first_start": rows[0]["start_time"] if rows else None}


class SeriesPatch(BaseModel):
    title: Optional[str] = Field(default=None, min_length=2, max_length=120)
    description: Optional[str] = Field(default=None, max_length=3000)
    instructor_id: Optional[str] = None
    location_type: Optional[str] = Field(default=None, pattern="^(online|in_person)$")
    location_detail: Optional[str] = Field(default=None, max_length=300)
    style: Optional[str] = Field(default=None, max_length=40)
    level: Optional[str] = Field(default=None, max_length=40)
    duration_minutes: Optional[int] = Field(default=None, ge=10, le=480)
    capacity: Optional[int] = Field(default=None, ge=1, le=1000)
    time: Optional[str] = Field(default=None, pattern=r"^\d{2}:\d{2}$")
    timezone: Optional[str] = Field(default=None, max_length=60)
    apply_to_future: bool = True
    notify: bool = True


@api.patch("/admin/classes/series/{template_id}")
async def update_series(template_id: str, payload: SeriesPatch, request: Request):
    admin = await _admin(request)
    t = await db.class_templates.find_one({"id": template_id}, {"_id": 0})
    if not t:
        raise HTTPException(404, "Class series not found")
    data = payload.model_dump(exclude_none=True, exclude={"apply_to_future", "notify", "time", "timezone"})
    if "instructor_id" in data and not await db.users.find_one({"id": data["instructor_id"], "role": {"$in": ["admin", "instructor"]}}):
        raise HTTPException(422, "Choose a teacher for the class.")
    sched = dict(t.get("schedule") or {})
    if payload.time:
        sched["time"] = payload.time
    if payload.timezone:
        sched["timezone"] = payload.timezone
    await db.class_templates.update_one({"id": template_id}, {"$set": {**data, "schedule": sched, "updated_at": now_utc().isoformat()}})
    changed, moved = 0, 0
    if payload.apply_to_future:
        future = await db.class_instances.find({"template_id": template_id, "start_time": {"$gt": now_utc().isoformat()}, "status": {"$ne": "cancelled"}},
                                               {"_id": 0}).to_list(1000)
        for inst in future:
            update = {k: v for k, v in data.items() if k in ("title", "instructor_id", "location_type", "location_detail", "style", "level", "capacity", "duration_minutes")}
            start = parse_dt(inst["start_time"])
            new_start = start
            if payload.time:
                tz = _tz(sched.get("timezone"))
                local = start.astimezone(tz)
                h, m = (int(x) for x in payload.time.split(":"))
                new_start = datetime.combine(local.date(), time(h, m), tzinfo=tz).astimezone(timezone.utc)
                update["start_time"] = new_start.isoformat()
            dur = update.get("duration_minutes") or inst["duration_minutes"]
            update["end_time"] = (new_start + timedelta(minutes=dur)).isoformat()
            await db.class_instances.update_one({"id": inst["id"]}, {"$set": update})
            changed += 1
            if "capacity" in update:
                await _fill_from_waitlist(inst["id"])
            if payload.notify and (new_start != start or "instructor_id" in update or "location_detail" in update):
                moved += await _tell_booked(inst["id"], "Class updated",
                                            f"{update.get('title', inst['title'])} is now {_fmt(update.get('start_time', inst['start_time']), sched.get('timezone'))}"
                                            + (" with a different teacher." if "instructor_id" in update and update["instructor_id"] != inst.get("instructor_id") else "."),
                                            key=f"series-change:{inst['id']}:{update.get('start_time', '')}:{update.get('instructor_id', '')}")
    return {"ok": True, "classes_changed": changed, "students_told": moved}


class ExtendIn(BaseModel):
    weeks: int = Field(ge=1, le=52)


@api.post("/admin/classes/series/{template_id}/extend")
async def extend_series(template_id: str, payload: ExtendIn, request: Request):
    await _admin(request)
    t = await db.class_templates.find_one({"id": template_id}, {"_id": 0})
    if not t:
        raise HTTPException(404, "Class series not found")
    sched = t.get("schedule") or {}
    last = await db.class_instances.find_one({"template_id": template_id}, {"_id": 0, "start_time": 1, "is_recorded": 1}, sort=[("start_time", -1)])
    if not sched.get("weekdays") or not sched.get("time"):
        if not last:
            raise HTTPException(409, "This series has no weekly pattern yet. Create it again from the class manager.")
        d = parse_dt(last["start_time"])
        sched = {"weekdays": [d.weekday()], "time": d.strftime("%H:%M"), "timezone": "UTC"}
        await db.class_templates.update_one({"id": template_id}, {"$set": {"schedule": sched}})
    after = max(parse_dt((last or {}).get("start_time")) or now_utc(), now_utc())
    start_day = after.astimezone(_tz(sched.get("timezone"))).date() + timedelta(days=1)
    starts = _dates(sched["weekdays"], sched["time"], sched.get("timezone") or "UTC", start_day, payload.weeks, after=after)
    rows = await _make_instances(t, starts, bool((last or {}).get("is_recorded")), True)
    return {"created": len(rows), "last_start": rows[-1]["start_time"] if rows else None}


class CancelIn(BaseModel):
    reason: str = Field(default="", max_length=300)
    notify: bool = True
    compensate: str = Field(default="credit", pattern="^(credit|none)$")  # give a class credit to students who paid for this class


async def cancel_instance(inst: dict, payload: CancelIn, admin: dict) -> dict:
    if inst.get("status") == "cancelled":
        return {"cancelled": 0, "told": 0}
    now = now_utc().isoformat()
    await db.class_instances.update_one({"id": inst["id"]}, {"$set": {"status": "cancelled", "cancel_reason": payload.reason, "cancelled_at": now,
                                                                     "cancelled_by": admin.get("email"), "bookings_count": 0}})
    bookings = await db.bookings.find({"class_instance_id": inst["id"], "status": {"$in": list(ACTIVE)}}, {"_id": 0}).to_list(5000)
    told = 0
    for b in bookings:
        await db.bookings.update_one({"id": b["id"]}, {"$set": {"status": "cancelled", "cancelled_reason": "class_cancelled", "cancelled_at": now}})
        extra = ""
        if b.get("reserved_pass_id"):
            await db.class_passes.update_one({"id": b["reserved_pass_id"]}, {"$inc": {"remaining": 1}})
            extra = " Your class credit is back on your account."
        elif payload.compensate == "credit" and b.get("status") == "confirmed" and b.get("access_source") == "one_time":
            pid = gen_id()
            await db.class_passes.insert_one({"_id": pid, "id": pid, "user_id": b["user_id"], "active": True, "remaining": 1, "source": "class_cancelled",
                                              "class_instance_id": inst["id"], "created_at": now})
            extra = " We added a free class credit to your account."
        if payload.notify:
            await _notify(b["user_id"], "Class cancelled", f"{inst['title']} on {_fmt(inst['start_time'])} is cancelled."
                          + (f" {payload.reason}" if payload.reason else "") + extra, "/schedule", key=f"class-cancel:{inst['id']}:{b['user_id']}")
            told += 1
    return {"cancelled": len(bookings), "told": told}


@api.post("/admin/classes/series/{template_id}/end")
async def end_series(template_id: str, payload: CancelIn, request: Request, from_date: Optional[str] = None):
    admin = await _admin(request)
    start = max(parse_dt(from_date + "T00:00:00+00:00") if from_date else now_utc(), now_utc())
    rows = await db.class_instances.find({"template_id": template_id, "start_time": {"$gte": start.isoformat()}, "status": {"$ne": "cancelled"}}, {"_id": 0}).to_list(2000)
    total, told = 0, 0
    for inst in rows:
        r = await cancel_instance(inst, payload, admin)
        total += 1
        told += r["told"]
    await db.class_templates.update_one({"id": template_id}, {"$set": {"active": False, "ended_at": now_utc().isoformat()}})
    return {"classes_cancelled": total, "students_told": told}


# ---------------------------------------------------------------------------
# One class

class OneOffIn(BaseModel):
    template_id: str
    start_time: AwareDatetime
    capacity: Optional[int] = Field(default=None, ge=1, le=1000)
    is_recorded: bool = False


@api.post("/admin/classes/one-off")
async def one_off(payload: OneOffIn, request: Request):
    await _admin(request)
    t = await db.class_templates.find_one({"id": payload.template_id}, {"_id": 0})
    if not t:
        raise HTTPException(404, "Class series not found")
    t = {**t, "capacity": payload.capacity or t["capacity"]}
    rows = await _make_instances(t, [payload.start_time.astimezone(timezone.utc)], payload.is_recorded, True)
    if not rows:
        raise HTTPException(409, "There is already a class at that time.")
    return rows[0]


class InstancePatch(BaseModel):
    start_time: Optional[AwareDatetime] = None
    duration_minutes: Optional[int] = Field(default=None, ge=10, le=480)
    capacity: Optional[int] = Field(default=None, ge=1, le=1000)
    instructor_id: Optional[str] = None
    title: Optional[str] = Field(default=None, min_length=2, max_length=120)
    location_type: Optional[str] = Field(default=None, pattern="^(online|in_person)$")
    location_detail: Optional[str] = Field(default=None, max_length=300)
    zoom_join_url: Optional[str] = Field(default=None, max_length=500)
    is_recorded: Optional[bool] = None
    staff_note: Optional[str] = Field(default=None, max_length=1000)
    notify: bool = True


async def _fill_from_waitlist(iid: str) -> int:
    """Move people off the waitlist while there are seats (oldest first)."""
    inst = await db.class_instances.find_one({"id": iid}, {"_id": 0})
    promoted = 0
    if not inst or inst.get("status") == "cancelled":
        return 0
    confirmed = await db.bookings.count_documents({"class_instance_id": iid, "status": "confirmed"})
    seats = int(inst.get("capacity") or 0) - confirmed
    for b in await db.bookings.find({"class_instance_id": iid, "status": "waitlist"}, {"_id": 0}).sort("created_at", 1).to_list(max(0, seats)):
        await db.bookings.update_one({"id": b["id"]}, {"$set": {"status": "confirmed", "promoted_at": now_utc().isoformat()}})
        promoted += 1
        await _notify(b["user_id"], "A spot opened — you're in!", f"{inst['title']} · {_fmt(inst['start_time'])}", f"/schedule/{iid}", key=f"promoted:{b['id']}")
    await db.class_instances.update_one({"id": iid}, {"$set": {"bookings_count": confirmed + promoted}})
    return promoted


async def _tell_booked(iid: str, title: str, body: str, key: Optional[str] = None, audience=ACTIVE) -> int:
    n = 0
    for b in await db.bookings.find({"class_instance_id": iid, "status": {"$in": list(audience)}}, {"_id": 0, "user_id": 1}).to_list(5000):
        await _notify(b["user_id"], title, body, f"/schedule/{iid}", key=f"{key}:{b['user_id']}" if key else None)
        n += 1
    return n


@api.patch("/admin/classes/{instance_id}")
async def update_instance(instance_id: str, payload: InstancePatch, request: Request):
    admin = await _admin(request)
    inst = await _instance(instance_id)
    if inst.get("status") == "cancelled":
        raise HTTPException(409, "This class is cancelled.")
    update = payload.model_dump(exclude_none=True, exclude={"notify", "start_time"})
    if "instructor_id" in update and not await db.users.find_one({"id": update["instructor_id"], "role": {"$in": ["admin", "instructor"]}}):
        raise HTTPException(422, "Choose a teacher for the class.")
    if update.get("zoom_join_url") and not update["zoom_join_url"].startswith("https://"):
        raise HTTPException(422, "The meeting link must start with https://")
    start = parse_dt(inst["start_time"])
    if payload.start_time:
        start = payload.start_time.astimezone(timezone.utc)
        if start <= now_utc():
            raise HTTPException(422, "Choose a time in the future.")
        update["start_time"] = start.isoformat()
    if payload.start_time or payload.duration_minutes:
        update["end_time"] = (start + timedelta(minutes=payload.duration_minutes or inst["duration_minutes"])).isoformat()
    if payload.capacity is not None:
        confirmed = await db.bookings.count_documents({"class_instance_id": instance_id, "status": "confirmed"})
        if payload.capacity < confirmed:
            raise HTTPException(409, f"{confirmed} people are already booked. Remove some first or keep at least {confirmed} places.")
    if not update:
        return inst
    await db.class_instances.update_one({"id": instance_id}, {"$set": {**update, "updated_at": now_utc().isoformat(), "updated_by": admin.get("email")}})
    promoted = await _fill_from_waitlist(instance_id) if payload.capacity is not None else 0
    told = 0
    if payload.notify and (payload.start_time or "instructor_id" in update or "location_detail" in update or "zoom_join_url" in update):
        what = []
        if payload.start_time:
            what.append(f"new time {_fmt(update['start_time'])}")
        if "instructor_id" in update and update["instructor_id"] != inst.get("instructor_id"):
            t = await db.users.find_one({"id": update["instructor_id"]}, {"_id": 0, "name": 1}) or {}
            what.append(f"taught by {t.get('name') or 'another teacher'}")
        if "location_detail" in update:
            what.append(f"place: {update['location_detail']}")
        if "zoom_join_url" in update:
            what.append("new meeting link (open the class page)")
        if what:
            told = await _tell_booked(instance_id, "Class changed", f"{update.get('title', inst['title'])}: " + "; ".join(what) + ".",
                                      key=f"class-change:{instance_id}:{now_utc().strftime('%Y%m%d%H%M')}")
    return {**(await _instance(instance_id)), "promoted": promoted, "students_told": told}


@api.post("/admin/classes/{instance_id}/cancel")
async def cancel_class(instance_id: str, payload: CancelIn, request: Request):
    admin = await _admin(request)
    inst = await _instance(instance_id)
    from operation_lock import operation_lock
    async with operation_lock(f"class-booking:{instance_id}"):
        return await cancel_instance(inst, payload, admin)


# ---------------------------------------------------------------------------
# Roster, attendance, add / remove / promote, message

async def roster_rows(inst: dict) -> dict:
    bookings = await db.bookings.find({"class_instance_id": inst["id"]}, {"_id": 0}).sort("created_at", 1).to_list(5000)
    ids = [b["user_id"] for b in bookings]
    users = {u["id"]: u for u in await db.users.find({"id": {"$in": ids}}, {"_id": 0, "id": 1, "name": 1, "email": 1, "phone": 1, "admin_note": 1, "tags": 1}).to_list(5000)}
    plans = {p["id"]: p for p in await db.membership_plans.find({}, {"_id": 0}).to_list(200)}
    now_iso = now_utc().isoformat()
    groups = {"confirmed": [], "waitlist": [], "cancelled": []}
    pos = 0
    for b in bookings:
        u = users.get(b["user_id"], {})
        sub = await db.subscriptions.find_one({"user_id": b["user_id"], "status": {"$in": ["active", "trialing", "past_due"]}, "end_date": {"$gt": now_iso}},
                                              {"_id": 0, "plan_id": 1, "end_date": 1, "status": 1})
        credits = sum(int(p.get("remaining") or 0) for p in await db.class_passes.find({"user_id": b["user_id"], "active": True}, {"_id": 0, "remaining": 1}).to_list(50))
        prior = await db.bookings.count_documents({"user_id": b["user_id"], "status": {"$in": ["confirmed", "attended"]}, "check_in_flag": True,
                                                   "class_instance_id": {"$ne": inst["id"]}})
        row = {"booking_id": b["id"], "user_id": b["user_id"], "name": u.get("name") or "Student", "email": u.get("email"), "phone": u.get("phone"),
               "note": u.get("admin_note"), "tags": u.get("tags") or [], "status": b["status"],
               "attendance": "attended" if b.get("check_in_flag") else (b.get("attendance") or "booked"), "checked_in_at": b.get("checked_in_at"),
               "source": b.get("access_source") or ("pass" if b.get("reserved_pass_id") else "free"), "booked_at": b.get("created_at"),
               "membership": plan_name(plans.get(sub["plan_id"])) if sub and plans.get(sub["plan_id"]) else None,
               "membership_status": (sub or {}).get("status"), "credits": credits, "first_class": prior == 0, "booked_by": b.get("booked_by")}
        if b["status"] == "waitlist":
            pos += 1
            row["position"] = pos
        groups["confirmed" if b["status"] in ("confirmed", "attended") else "waitlist" if b["status"] == "waitlist" else "cancelled"].append(row)
    return groups


@api.get("/admin/classes/{instance_id}/roster")
async def class_roster(instance_id: str, request: Request):
    user = await _staff(request)
    inst = await _instance(instance_id, user)
    counts = await _counts([instance_id])
    staff = await _people([inst.get("instructor_id")] if inst.get("instructor_id") else [])
    full = {k: v for k, v in inst.items() if k not in ("zoom_start_url",)}
    groups = await roster_rows(inst)
    if user.get("role") != "admin":
        # Teachers see who is coming, not the studio's private notes about members.
        for rows in groups.values():
            for r in rows:
                r.pop("note", None)
                r.pop("tags", None)
    return {"class": {**_row(inst, counts, staff), "zoom_join_url": full.get("zoom_join_url"), "staff_note": inst.get("staff_note"),
                      "recording_expires_at": inst.get("recording_expires_at")}, **groups}


class AttendanceIn(BaseModel):
    booking_id: Optional[str] = None
    status: str = Field(pattern="^(attended|no_show|booked)$")
    all: bool = False


@api.post("/admin/classes/{instance_id}/attendance")
async def take_attendance(instance_id: str, payload: AttendanceIn, request: Request):
    user = await _staff(request)
    inst = await _instance(instance_id, user)
    if parse_dt(inst["start_time"]) - timedelta(hours=1) > now_utc() and payload.status != "booked":
        raise HTTPException(409, "Attendance opens one hour before the class starts.")
    q = {"class_instance_id": instance_id, "status": "confirmed"}
    if not payload.all:
        if not payload.booking_id:
            raise HTTPException(422, "Choose a student.")
        q["id"] = payload.booking_id
    rows = await db.bookings.find(q, {"_id": 0}).to_list(5000)
    if not rows:
        raise HTTPException(404, "Booking not found")
    now = now_utc().isoformat()
    for b in rows:
        if payload.status == "attended":
            await db.bookings.update_one({"id": b["id"]}, {"$set": {"check_in_flag": True, "checked_in_at": b.get("checked_in_at") or now,
                                                                   "attendance": "attended", "checked_in_by": user.get("email")}})
            if not b.get("check_in_flag"):
                try:
                    from routers.streaks import record_practice
                    await record_practice(b["user_id"], source="class", ref_id=instance_id)
                except Exception:
                    pass
        else:
            await db.bookings.update_one({"id": b["id"]}, {"$set": {"check_in_flag": False, "attendance": payload.status, "checked_in_by": user.get("email")},
                                                          "$unset": {"checked_in_at": ""}})
    return {"ok": True, "updated": len(rows)}


class AddIn(BaseModel):
    user_id: Optional[str] = None
    email: Optional[str] = Field(default=None, max_length=200)
    waitlist: bool = False
    use_credit: bool = False
    notify: bool = True


@api.post("/admin/classes/{instance_id}/add")
async def add_to_class(instance_id: str, payload: AddIn, request: Request):
    admin = await _admin(request)
    inst = await _instance(instance_id)
    if inst.get("status") == "cancelled":
        raise HTTPException(409, "This class is cancelled.")
    q = {"id": payload.user_id} if payload.user_id else {"email": (payload.email or "").strip().lower()}
    student = await db.users.find_one(q, {"_id": 0, "id": 1, "name": 1, "email": 1})
    if not student:
        raise HTTPException(404, "No student with that email. Add them first in Students.")
    from operation_lock import operation_lock
    async with operation_lock(f"class-booking:{instance_id}"):
        if await db.bookings.find_one({"user_id": student["id"], "class_instance_id": instance_id, "status": {"$in": list(ACTIVE)}}):
            raise HTTPException(409, "Already booked into this class.")
        pass_id = None
        if payload.use_credit:
            pack = await db.class_passes.find_one_and_update({"user_id": student["id"], "active": True, "remaining": {"$gt": 0}}, {"$inc": {"remaining": -1}}, projection={"_id": 0})
            if not pack:
                raise HTTPException(409, "This student has no class credits.")
            pass_id = pack["id"]
        status = "waitlist" if payload.waitlist else "confirmed"
        booking = {"id": gen_id(), "user_id": student["id"], "class_instance_id": instance_id, "status": status, "check_in_flag": False,
                   "created_at": now_utc().isoformat(), "access_source": "pass" if pass_id else "admin", "reserved_pass_id": pass_id,
                   "booked_by": admin.get("email")}
        await db.bookings.insert_one({**booking})
        if status == "confirmed":
            await db.class_instances.update_one({"id": instance_id}, {"$inc": {"bookings_count": 1}})
    await _audit(admin, student["id"], "booked", f"{inst['title']} · {_fmt(inst['start_time'])}" + (" (waitlist)" if payload.waitlist else ""))
    if payload.notify:
        await _notify(student["id"], "You're booked" if status == "confirmed" else "You're on the waitlist", f"{inst['title']} · {_fmt(inst['start_time'])}",
                      f"/schedule/{instance_id}", key=f"admin-book:{booking['id']}")
    return booking


class BookingRef(BaseModel):
    booking_id: str
    notify: bool = True


@api.post("/admin/classes/{instance_id}/promote")
async def promote(instance_id: str, payload: BookingRef, request: Request):
    """Give a waiting student a seat now (even when the class is full; the capacity grows by one)."""
    admin = await _admin(request)
    inst = await _instance(instance_id)
    from operation_lock import operation_lock
    async with operation_lock(f"class-booking:{instance_id}"):
        b = await db.bookings.find_one({"id": payload.booking_id, "class_instance_id": instance_id, "status": "waitlist"}, {"_id": 0})
        if not b:
            raise HTTPException(404, "This person isn't on the waitlist.")
        confirmed = await db.bookings.count_documents({"class_instance_id": instance_id, "status": "confirmed"})
        if confirmed >= int(inst.get("capacity") or 0):
            await db.class_instances.update_one({"id": instance_id}, {"$set": {"capacity": confirmed + 1}})
        await db.bookings.update_one({"id": b["id"]}, {"$set": {"status": "confirmed", "promoted_at": now_utc().isoformat(), "promoted_by": admin.get("email")}})
        await db.class_instances.update_one({"id": instance_id}, {"$set": {"bookings_count": confirmed + 1}})
    if payload.notify:
        await _notify(b["user_id"], "A spot opened — you're in!", f"{inst['title']} · {_fmt(inst['start_time'])}", f"/schedule/{instance_id}", key=f"promoted:{b['id']}")
    return {"ok": True}


class RemoveIn(BookingRef):
    reason: Optional[str] = Field(default=None, max_length=300)


@api.post("/admin/classes/{instance_id}/remove")
async def remove_from_class(instance_id: str, payload: RemoveIn, request: Request):
    admin = await _admin(request)
    inst = await _instance(instance_id)
    b = await db.bookings.find_one({"id": payload.booking_id, "class_instance_id": instance_id}, {"_id": 0})
    if not b or b.get("status") not in ACTIVE:
        raise HTTPException(404, "Booking not found")
    from routers.scheduling import _cancel_booking
    from operation_lock import operation_lock
    async with operation_lock(f"class-booking:{instance_id}"):
        await _cancel_booking(b["id"], {"id": b["user_id"]})  # returns a credit and moves the waitlist up
    await db.bookings.update_one({"id": b["id"]}, {"$set": {"cancelled_by": admin.get("email"), "cancelled_reason": payload.reason or "removed by the studio"}})
    await _audit(admin, b["user_id"], "booking_cancelled", f"Removed from {inst['title']} · {_fmt(inst['start_time'])}")
    if payload.notify:
        await _notify(b["user_id"], "Booking cancelled", f"Your place in {inst['title']} ({_fmt(inst['start_time'])}) was cancelled by the studio."
                      + (f" {payload.reason}" if payload.reason else ""), "/my-classes", key=f"removed:{b['id']}")
    return {"ok": True}


class ClassMessage(BaseModel):
    title: str = Field(min_length=2, max_length=120)
    body: str = Field(min_length=2, max_length=2000)
    audience: str = Field(default="confirmed", pattern="^(confirmed|waitlist|all)$")
    email: bool = True


@api.post("/admin/classes/{instance_id}/message")
async def message_class(instance_id: str, payload: ClassMessage, request: Request):
    user = await _staff(request)
    inst = await _instance(instance_id, user)
    statuses = {"confirmed": ["confirmed"], "waitlist": ["waitlist"], "all": list(ACTIVE)}[payload.audience]
    rows = await db.bookings.find({"class_instance_id": instance_id, "status": {"$in": statuses}}, {"_id": 0, "user_id": 1}).to_list(5000)
    from notify import notify_member
    for b in rows:
        await notify_member(b["user_id"], payload.title, payload.body, f"/schedule/{instance_id}", email=payload.email,
                            email_subject=f"{payload.title} — {inst['title']}")
    await db.class_messages.insert_one({"_id": gen_id(), "class_instance_id": instance_id, "title": payload.title, "audience": payload.audience,
                                        "recipients": len(rows), "by": user.get("email"), "at": now_utc().isoformat()})
    return {"sent": len(rows)}


@api.get("/admin/classes/{instance_id}/roster.csv")
async def roster_csv(instance_id: str, request: Request):
    user = await _staff(request)
    inst = await _instance(instance_id, user)
    groups = await roster_rows(inst)
    out = io.StringIO()
    w = csv.writer(out)
    w.writerow(["status", "position", "name", "email", "phone", "attendance", "membership", "credits", "first_class", "source", "booked_at"])
    for key in ("confirmed", "waitlist", "cancelled"):
        for r in groups[key]:
            w.writerow([r["status"], r.get("position", ""), r["name"], r["email"], r.get("phone") or "", r["attendance"], r.get("membership") or "",
                        r["credits"], "yes" if r["first_class"] else "", r["source"], (r.get("booked_at") or "")[:16]])
    name = f"roster-{inst['title'][:30].replace(' ', '-').lower()}-{inst['start_time'][:10]}.csv"
    return Response(out.getvalue(), media_type="text/csv", headers={"Content-Disposition": f'attachment; filename="{name}"'})


# ---------------------------------------------------------------------------
# Reports

@api.get("/admin/classes/reports")
async def class_reports(request: Request, days: int = 30, tz: str = "Europe/Madrid"):
    await _admin(request)
    zone = _tz(tz)
    days = max(7, min(365, days))
    now = now_utc()
    since = (now - timedelta(days=days)).isoformat()
    held = await db.class_instances.find({"start_time": {"$gte": since, "$lt": now.isoformat()}}, {"_id": 0}).to_list(20000)
    live = [c for c in held if c.get("status") != "cancelled"]
    counts = await _counts([c["id"] for c in held])
    booked = sum(counts[c["id"]]["confirmed"] for c in live)
    attended = sum(counts[c["id"]]["attended"] for c in live)
    no_show = sum(counts[c["id"]]["no_show"] for c in live)
    cap = sum(int(c.get("capacity") or 0) for c in live)
    series = {}
    heat = {}
    for c in live:
        s = series.setdefault(c.get("template_id") or c["title"], {"title": c["title"], "classes": 0, "booked": 0, "attended": 0, "capacity": 0, "no_show": 0})
        cc = counts[c["id"]]
        s["classes"] += 1
        s["booked"] += cc["confirmed"]
        s["attended"] += cc["attended"]
        s["no_show"] += cc["no_show"]
        s["capacity"] += int(c.get("capacity") or 0)
        d = parse_dt(c["start_time"]).astimezone(zone)
        k = f"{d.weekday()}-{d.hour:02d}"
        h = heat.setdefault(k, {"weekday": d.weekday(), "hour": d.hour, "classes": 0, "booked": 0})
        h["classes"] += 1
        h["booked"] += cc["confirmed"]
    rows = []
    for s in series.values():
        rows.append({**s, "fill": round(s["booked"] * 100 / s["capacity"]) if s["capacity"] else 0,
                     "attendance": round(s["attended"] * 100 / s["booked"]) if s["booked"] else None})
    rows.sort(key=lambda r: -r["booked"])
    attendees = {}
    for b in await db.bookings.find({"class_instance_id": {"$in": [c["id"] for c in live]}, "check_in_flag": True}, {"_id": 0, "user_id": 1}).to_list(100000):
        attendees[b["user_id"]] = attendees.get(b["user_id"], 0) + 1
    top_ids = sorted(attendees, key=lambda k: -attendees[k])[:10]
    people = await _people(top_ids)
    # Members with an active membership who haven't booked a class for 14 days
    active_subs = await db.subscriptions.find({"status": {"$in": ["active", "trialing"]}, "end_date": {"$gt": now.isoformat()},
                                               "start_date": {"$lte": now.isoformat()}}, {"_id": 0, "user_id": 1, "plan_id": 1}).to_list(50000)
    cutoff = (now - timedelta(days=14)).isoformat()
    quiet = []
    for sub in active_subs[:3000]:
        last = await db.bookings.find_one({"user_id": sub["user_id"], "status": {"$in": ["confirmed", "attended"]}}, {"_id": 0, "created_at": 1}, sort=[("created_at", -1)])
        if not last or str(last.get("created_at")) < cutoff:
            quiet.append({"user_id": sub["user_id"], "last_booking": (last or {}).get("created_at")})
    qp = await _people([q["user_id"] for q in quiet[:200]])
    for q in quiet:
        q.update(name=(qp.get(q["user_id"]) or {}).get("name"), email=(qp.get(q["user_id"]) or {}).get("email"))
    return {"days": days, "totals": {"classes": len(live), "cancelled": len(held) - len(live), "booked": booked, "attended": attended, "no_show": no_show,
                                     "fill": round(booked * 100 / cap) if cap else 0, "attendance": round(attended * 100 / booked) if booked else None},
            "series": rows, "heatmap": sorted(heat.values(), key=lambda h: (h["weekday"], h["hour"])),
            "top_students": [{"user_id": i, "name": (people.get(i) or {}).get("name"), "email": (people.get(i) or {}).get("email"), "classes": attendees[i]} for i in top_ids],
            "quiet_members": [q for q in quiet if q.get("email")][:100]}


# ---------------------------------------------------------------------------
# Student side: my classes, calendar feed

@api.get("/me/classes")
async def my_classes(request: Request):
    from core import get_current_user
    user = await get_current_user(request)
    rows = await db.bookings.find({"user_id": user["id"]}, {"_id": 0}).sort("created_at", -1).to_list(1000)
    insts = {i["id"]: i for i in await db.class_instances.find({"id": {"$in": [r["class_instance_id"] for r in rows]}},
                                                              {"_id": 0, "zoom_start_url": 0, "zoom_join_url": 0, "zoom_meeting_id": 0, "recording_url": 0}).to_list(1000)}
    staff = await _people([i.get("instructor_id") for i in insts.values() if i.get("instructor_id")])
    now_iso = now_utc().isoformat()
    upcoming, past, cancelled = [], [], []
    for b in rows:
        i = insts.get(b["class_instance_id"])
        if not i:
            continue
        item = {"booking_id": b["id"], "class_id": i["id"], "title": i["title"], "start_time": i["start_time"], "end_time": i.get("end_time"),
                "location_type": i.get("location_type"), "location": "Online (Zoom)" if i.get("location_type") == "online" else i.get("location_detail"),
                "instructor": (staff.get(i.get("instructor_id")) or {}).get("name"), "status": b["status"], "class_status": i.get("status"),
                "attendance": "attended" if b.get("check_in_flag") else b.get("attendance"), "source": b.get("access_source"),
                "cancel_reason": i.get("cancel_reason") if i.get("status") == "cancelled" else None}
        if b["status"] == "cancelled" or i.get("status") == "cancelled":
            if str(i["start_time"]) > (now_utc() - timedelta(days=30)).isoformat():
                cancelled.append(item)
        elif str(i.get("end_time") or i["start_time"]) >= now_iso:
            if b["status"] == "waitlist":
                ahead = await db.bookings.count_documents({"class_instance_id": i["id"], "status": "waitlist", "created_at": {"$lt": b["created_at"]}})
                item["position"] = ahead + 1
            upcoming.append(item)
        else:
            past.append(item)
    upcoming.sort(key=lambda x: x["start_time"])
    past.sort(key=lambda x: x["start_time"], reverse=True)
    attended = sum(1 for p in past if p["attendance"] == "attended")
    credits = sum(int(p.get("remaining") or 0) for p in await db.class_passes.find({"user_id": user["id"], "active": True}, {"_id": 0, "remaining": 1}).to_list(50))
    month = now_utc().strftime("%Y-%m")
    return {"upcoming": upcoming, "past": past[:100], "cancelled": cancelled[:30], "credits": credits,
            "stats": {"attended": attended, "this_month": sum(1 for p in past if p["attendance"] == "attended" and p["start_time"].startswith(month)),
                      "no_show": sum(1 for p in past if p["attendance"] == "no_show")}}


@api.get("/me/calendar")
async def my_calendar_link(request: Request, rotate: bool = False):
    """A private calendar address (Google / Apple / Outlook can subscribe to it)."""
    import secrets as _s
    from core import get_current_user
    from notify import site_url
    user = await get_current_user(request)
    token = (await db.users.find_one({"id": user["id"]}, {"_id": 0, "calendar_token": 1}) or {}).get("calendar_token")
    if not token or rotate:
        token = _s.token_urlsafe(24)
        await db.users.update_one({"id": user["id"]}, {"$set": {"calendar_token": token}})
    import os
    api_base = (os.environ.get("PUBLIC_API_URL") or site_url("")).rstrip("/")
    url = f"{api_base}/api/calendar/{token}.ics"
    return {"url": url, "webcal": url.replace("https://", "webcal://").replace("http://", "webcal://")}


def _ics_escape(s: str) -> str:
    return (s or "").replace("\\", "\\\\").replace(";", "\\;").replace(",", "\\,").replace("\n", "\\n")


@api.get("/calendar/{token}.ics")
async def calendar_feed(token: str):
    user = await db.users.find_one({"calendar_token": token}, {"_id": 0, "id": 1, "name": 1})
    if not user or len(token) < 16:
        raise HTTPException(404, "Calendar not found")
    from notify import site_url
    since = (now_utc() - timedelta(days=7)).isoformat()
    rows = await db.bookings.find({"user_id": user["id"], "status": {"$in": ["confirmed", "attended"]}}, {"_id": 0}).to_list(1000)
    insts = await db.class_instances.find({"id": {"$in": [r["class_instance_id"] for r in rows]}, "start_time": {"$gte": since}, "status": {"$ne": "cancelled"}},
                                          {"_id": 0, "id": 1, "title": 1, "start_time": 1, "end_time": 1, "location_type": 1, "location_detail": 1}).to_list(1000)
    teacher = await db.teacher_enrollments.find({"user_id": user["id"], "kind": "class", "status": "booked", "start_time": {"$gte": since}}, {"_id": 0}).to_list(500)
    stamp = now_utc().strftime("%Y%m%dT%H%M%SZ")
    lines = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Tony Yoga//Classes//EN", "CALSCALE:GREGORIAN", "METHOD:PUBLISH",
             "X-WR-CALNAME:Tony Yoga classes", "REFRESH-INTERVAL;VALUE=DURATION:PT1H"]

    def dt(iso):
        return parse_dt(iso).strftime("%Y%m%dT%H%M%SZ")
    for i in insts:
        end = i.get("end_time") or (parse_dt(i["start_time"]) + timedelta(hours=1)).isoformat()
        lines += ["BEGIN:VEVENT", f"UID:{i['id']}@tonyoga.com", f"DTSTAMP:{stamp}", f"DTSTART:{dt(i['start_time'])}", f"DTEND:{dt(end)}",
                  f"SUMMARY:{_ics_escape(i['title'])}", f"LOCATION:{_ics_escape('Online — join from the Tony Yoga app' if i.get('location_type') == 'online' else (i.get('location_detail') or ''))}",
                  f"URL:{site_url('/schedule/' + i['id'])}", "END:VEVENT"]
    for e in teacher:
        start = parse_dt(e["start_time"])
        lines += ["BEGIN:VEVENT", f"UID:{e['id']}@tonyoga.com", f"DTSTAMP:{stamp}", f"DTSTART:{dt(e['start_time'])}", f"DTEND:{(start + timedelta(hours=1)).strftime('%Y%m%dT%H%M%SZ')}",
                  f"SUMMARY:{_ics_escape(e.get('offering_title') or 'Class')}", f"URL:{site_url('/my-yoga')}", "END:VEVENT"]
    lines.append("END:VCALENDAR")
    return Response("\r\n".join(lines) + "\r\n", media_type="text/calendar; charset=utf-8", headers={"Cache-Control": "private, max-age=600"})
