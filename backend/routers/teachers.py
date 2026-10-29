"""Teacher Hub: Tony-certified teachers run their own classes, courses and students on Tony Yoga.

- Teachers apply (/teachers/apply). Tony's team approves them, picks a tier and issues a
  Tony-Certified certificate (ID, level, renewal date) that anyone can verify.
- Approved teachers with an active monthly fee (paid by card through Stripe, or "comped" by the
  admin) appear in the public directory with their own profile, classes, courses and class packs.
- Students pay the teacher directly through Stripe Connect Express (direct charges: the teacher is
  the seller; an optional platform fee per sale), or pay the teacher in person ("offline").
- Teachers see their students, rosters and income, send messages and log continuing-education hours.
- The admin sees everything, can pause or remove a teacher and exports the yearly DAC7 report.
"""
import asyncio
import csv
import io
import re
import secrets
from datetime import datetime, timedelta, timezone
from typing import List, Optional

from fastapi import Depends, HTTPException, Request
from fastapi.responses import Response
from pydantic import AwareDatetime, BaseModel, EmailStr, Field

from access_terms import parse_dt
from core import api, checkout_return_base, db, gen_id, get_current_user, get_optional_user, logger, now_utc, require_role
from routers.settings import get_setting

PUBLIC_FIELDS = ("id", "slug", "display_name", "headline", "bio", "photo", "city", "country", "languages", "styles", "online", "in_person",
                 "website", "instagram", "featured", "tier_id")


def _slugify(text: str) -> str:
    return re.sub(r"[^a-z0-9]+", "-", (text or "").lower()).strip("-")[:40] or "teacher"


async def _tiers() -> dict:
    return {t["id"]: t for t in (await get_setting("teacher_tiers") or [])}


async def _enabled_or_admin(request: Request):
    if await get_setting("teachers_enabled"):
        return
    user = await get_optional_user(request)
    if not user or user.get("role") != "admin":
        raise HTTPException(404, "The teacher directory isn't open yet.")


def fee_ok(teacher: dict, tiers: dict) -> bool:
    """Is the teacher's monthly fee in order (paid, comped, free tier or within 7 days of a failed card)?"""
    tier = tiers.get(teacher.get("tier_id")) or {}
    if float(tier.get("price") or 0) <= 0:
        return True
    b = teacher.get("billing") or {}
    now = now_utc()
    until = parse_dt(b.get("paid_until"))
    if b.get("mode") == "comped":
        return until is None or until > now
    if b.get("status") in ("active", "trialing"):
        return until is None or until + timedelta(days=3) > now
    if b.get("status") == "past_due":
        since = parse_dt(b.get("past_due_since")) or now
        return since + timedelta(days=7) > now
    return False


def listed(teacher: dict, tiers: dict) -> bool:
    return teacher.get("status") == "approved" and fee_ok(teacher, tiers)


def can_take_online(teacher: dict) -> bool:
    return teacher.get("payment_mode") == "online" and bool(teacher.get("stripe_account_id")) and bool(teacher.get("charges_enabled"))


async def _my_teacher(user: dict, allow_unapproved: bool = False) -> dict:
    t = await db.teachers.find_one({"user_id": user["id"]}, {"_id": 0})
    if not t:
        raise HTTPException(404, "You don't have a teacher profile yet.")
    if not allow_unapproved and t.get("status") not in ("approved", "paused"):
        raise HTTPException(403, "Your teacher profile is waiting for approval.")
    return t


def _session_public(s: dict) -> dict:
    return {k: s.get(k) for k in ("id", "start_time", "duration_min", "cancelled", "booked")}


def _offering_public(o: dict, counts: Optional[dict] = None) -> dict:
    out = {k: o.get(k) for k in ("id", "teacher_id", "kind", "title", "description", "image", "level", "language", "location_type", "location",
                                  "price", "currency", "capacity", "access_days", "credits", "active")}
    now_iso = now_utc().isoformat()
    sessions = []
    for s in o.get("sessions") or []:
        if s.get("cancelled") or str(s.get("start_time")) < now_iso:
            continue
        booked = (counts or {}).get(s["id"], 0)
        sessions.append({**_session_public(s), "booked": booked, "spots_left": max(0, int(o.get("capacity") or 0) - booked) if o.get("capacity") else None})
    sessions.sort(key=lambda s: s["start_time"])
    out["sessions"] = sessions[:30]
    out["lesson_count"] = len(o.get("lessons") or [])
    out["lessons_preview"] = [{"title": l.get("title"), "duration_min": l.get("duration_min")} for l in (o.get("lessons") or [])[:20]]
    return out


async def _session_counts(offering_ids: List[str]) -> dict:
    rows = await db.teacher_enrollments.find({"offering_id": {"$in": offering_ids}, "status": {"$in": ["booked", "attended"]}, "session_id": {"$ne": None}},
                                             {"_id": 0, "session_id": 1}).to_list(20000)
    out = {}
    for r in rows:
        out[r["session_id"]] = out.get(r["session_id"], 0) + 1
    return out


# ---------------------------------------------------------------------------
# Public directory

@api.get("/teachers/info")
async def teachers_info(request: Request):
    await _enabled_or_admin(request)
    user = await get_optional_user(request)
    mine = await db.teachers.find_one({"user_id": user["id"]}, {"_id": 0, "status": 1, "slug": 1}) if user else None
    return {"tiers": list((await _tiers()).values()), "label": await get_setting("teacher_certified_label") or "Tony-Certified",
            "ce_hours_per_year": int(await get_setting("teacher_ce_hours_per_year") or 20), "mine": mine}


@api.get("/teachers")
async def teachers_directory(request: Request, q: Optional[str] = None, country: Optional[str] = None, style: Optional[str] = None,
                             online: Optional[bool] = None):
    await _enabled_or_admin(request)
    tiers = await _tiers()
    rows = await db.teachers.find({"status": "approved"}, {"_id": 0}).to_list(2000)
    out = []
    for t in rows:
        if not listed(t, tiers):
            continue
        if country and country.lower() not in str(t.get("country") or "").lower():
            continue
        if style and style.lower() not in " ".join(t.get("styles") or []).lower():
            continue
        if online is not None and bool(t.get("online")) != online:
            continue
        if q and q.lower() not in " ".join(str(t.get(k) or "") for k in ("display_name", "city", "country", "headline", "bio")).lower():
            continue
        cert = t.get("certificate") or {}
        out.append({**{k: t.get(k) for k in PUBLIC_FIELDS}, "certified": bool(cert.get("id")), "certificate_level": cert.get("level"),
                    "offerings": await db.teacher_offerings.count_documents({"teacher_id": t["id"], "active": True})})
    out.sort(key=lambda t: (not t.get("featured"), t.get("display_name") or ""))
    return out


@api.get("/teachers/verify/{cert_id}")
async def verify_certificate(cert_id: str):
    t = await db.teachers.find_one({"certificate.id": cert_id.upper()}, {"_id": 0})
    if not t:
        raise HTTPException(404, "No teacher has this certificate number.")
    cert = t["certificate"]
    valid = t.get("status") in ("approved", "paused") and (not cert.get("renews_at") or cert["renews_at"] >= now_utc().date().isoformat())
    return {"name": t.get("display_name"), "slug": t.get("slug") if t.get("status") == "approved" else None, "id": cert["id"],
            "level": cert.get("level"), "issued_at": cert.get("issued_at"), "renews_at": cert.get("renews_at"), "valid": valid,
            "label": await get_setting("teacher_certified_label") or "Tony-Certified"}


@api.get("/teachers/{slug}")
async def teacher_profile(slug: str, request: Request):
    await _enabled_or_admin(request)
    t = await db.teachers.find_one({"slug": slug}, {"_id": 0})
    viewer = await get_optional_user(request)
    is_owner = viewer and t and viewer["id"] == t.get("user_id")
    if not t or (not listed(t, await _tiers()) and not is_owner and (viewer or {}).get("role") != "admin"):
        raise HTTPException(404, "Teacher not found")
    offerings = await db.teacher_offerings.find({"teacher_id": t["id"], "active": True}, {"_id": 0}).sort("created_at", -1).to_list(200)
    counts = await _session_counts([o["id"] for o in offerings])
    cert = t.get("certificate") or {}
    return {**{k: t.get(k) for k in PUBLIC_FIELDS}, "certificate": {k: cert.get(k) for k in ("id", "level", "issued_at", "renews_at")} if cert.get("id") else None,
            "payments": "online" if can_take_online(t) else "offline", "offline_payment_note": t.get("offline_payment_note"),
            "offerings": [_offering_public(o, counts) for o in offerings], "preview": not listed(t, await _tiers())}


class TeacherApply(BaseModel):
    display_name: str = Field(min_length=2, max_length=80)
    headline: Optional[str] = Field(default=None, max_length=120)
    bio: str = Field(min_length=20, max_length=3000)
    city: str = Field(min_length=1, max_length=80)
    country: str = Field(min_length=2, max_length=60)
    country_code: Optional[str] = Field(default=None, pattern="^[A-Za-z]{2}$")
    trainings: str = Field(min_length=3, max_length=1000)  # which Tony trainings, when
    experience_years: Optional[int] = Field(default=None, ge=0, le=70)
    languages: List[str] = Field(default_factory=list)
    styles: List[str] = Field(default_factory=list)
    online: bool = True
    in_person: bool = False
    website: Optional[str] = Field(default=None, max_length=200)
    instagram: Optional[str] = Field(default=None, max_length=100)
    tier_id: Optional[str] = Field(default=None, max_length=20)


def _clean_links(data: dict):
    from routers.hotels import web_link
    for f in ("website",):
        if data.get(f):
            data[f] = web_link(data[f])
    if data.get("instagram"):
        ig = data["instagram"].strip()
        if re.match(r"^https?://", ig, re.I):
            if not re.match(r"^https://(www\.)?instagram\.com/[A-Za-z0-9._]+/?$", ig, re.I):
                raise HTTPException(422, "Use your Instagram name, for example @tonyyoga.")
            ig = "@" + ig.rstrip("/").rsplit("/", 1)[1]
        ig = "@" + ig.lstrip("@")
        if not re.match(r"^@[A-Za-z0-9._]{1,30}$", ig):
            raise HTTPException(422, "Use your Instagram name, for example @tonyyoga.")
        data["instagram"] = ig
    return data


@api.post("/teachers/apply")
async def teachers_apply(payload: TeacherApply, request: Request, user: dict = Depends(get_current_user)):
    await _enabled_or_admin(request)
    existing = await db.teachers.find_one({"user_id": user["id"]}, {"_id": 0})
    if existing and existing.get("status") not in ("declined",):
        raise HTTPException(409, "You already have a teacher profile.")
    tiers = await _tiers()
    base = _slugify(payload.display_name)
    slug, n = base, 2
    while await db.teachers.find_one({"slug": slug, "user_id": {"$ne": user["id"]}}):
        slug, n = f"{base}-{n}", n + 1
    doc = {**_clean_links(payload.model_dump()), "id": (existing or {}).get("id") or gen_id(), "user_id": user["id"], "email": user.get("email"), "slug": slug,
           "languages": [x[:30] for x in payload.languages[:10]], "styles": [x[:40] for x in payload.styles[:10]],
           "tier_id": payload.tier_id if payload.tier_id in tiers else next(iter(tiers), None), "status": "applied",
           "payment_mode": "offline", "billing": {"mode": "none", "status": "none"}, "applied_at": now_utc().isoformat(),
           "created_at": (existing or {}).get("created_at") or now_utc().isoformat()}
    if doc.get("country_code"):
        doc["country_code"] = doc["country_code"].upper()
    await db.teachers.update_one({"user_id": user["id"]}, {"$set": doc}, upsert=True)
    from routers.notifications import push_admins
    await push_admins("New teacher application", f"{payload.display_name} ({payload.city}, {payload.country}) applied to teach on Tony Yoga.", "/admin?tab=teachers")
    return {"ok": True, "status": "applied"}


# ---------------------------------------------------------------------------
# Students: booking, my classes, course lessons

async def _offering_for_student(offering_id: str, session_id: Optional[str]):
    o = await db.teacher_offerings.find_one({"id": offering_id, "active": True}, {"_id": 0})
    if not o:
        raise HTTPException(404, "This class or course isn't available.")
    t = await db.teachers.find_one({"id": o["teacher_id"]}, {"_id": 0})
    if not t or not listed(t, await _tiers()):
        raise HTTPException(404, "This teacher isn't taking bookings right now.")
    session = None
    if o["kind"] == "class":
        session = next((s for s in o.get("sessions") or [] if s["id"] == session_id), None)
        if not session or session.get("cancelled") or str(session["start_time"]) < now_utc().isoformat():
            raise HTTPException(409, "Choose a class date that is still open.")
        if o.get("capacity"):
            taken = await db.teacher_enrollments.count_documents({"session_id": session_id, "status": {"$in": ["booked", "attended"]}})
            if taken >= int(o["capacity"]):
                raise HTTPException(409, "This class is full.")
    return o, t, session


async def _already(user_id: str, o: dict, session_id: Optional[str]):
    q = {"user_id": user_id, "offering_id": o["id"], "status": {"$in": ["booked", "attended", "enrolled"]}}
    if o["kind"] == "class":
        q["session_id"] = session_id
    elif o["kind"] == "pack":
        return None
    return await db.teacher_enrollments.find_one(q, {"_id": 0})


async def _enroll(user: dict, o: dict, t: dict, session: Optional[dict], *, payment: str, paid: bool, amount=0.0, currency=None,
                  txn_id: Optional[str] = None, eid: Optional[str] = None) -> dict:
    eid = eid or gen_id()
    now = now_utc()
    doc = {"id": eid, "teacher_id": t["id"], "offering_id": o["id"], "offering_title": o["title"], "kind": o["kind"],
           "session_id": (session or {}).get("id"), "start_time": (session or {}).get("start_time"), "user_id": user["id"],
           "user_email": user.get("email"), "user_name": user.get("name"), "status": "booked" if o["kind"] == "class" else "enrolled",
           "payment": payment, "paid": paid, "amount": amount, "currency": currency or o.get("currency"), "transaction_id": txn_id,
           "created_at": now.isoformat()}
    if o["kind"] == "course":
        days = int(o.get("access_days") or 0)
        doc["ends_at"] = (now + timedelta(days=days)).isoformat() if days else None
    if o["kind"] == "pack":
        doc["credits_total"] = int(o.get("credits") or 5)
    if o["kind"] == "pack":
        doc["credits_granted"] = bool(paid)
    res = await db.teacher_enrollments.update_one({"_id": eid}, {"$setOnInsert": {**doc, "_id": eid}}, upsert=True)
    if o["kind"] == "pack" and paid and res.upserted_id is not None:
        await db.teacher_credits.update_one({"teacher_id": t["id"], "user_id": user["id"]}, {"$inc": {"remaining": doc["credits_total"]},
                                                                                             "$setOnInsert": {"id": gen_id(), "teacher_id": t["id"], "user_id": user["id"]}}, upsert=True)
    await db.teacher_students.update_one({"teacher_id": t["id"], "user_id": user["id"]},
                                         {"$set": {"email": user.get("email"), "name": user.get("name"), "last_activity_at": now.isoformat()},
                                          "$setOnInsert": {"id": gen_id(), "teacher_id": t["id"], "user_id": user["id"], "source": "booking", "created_at": now.isoformat()}},
                                         upsert=True)
    if res.upserted_id is not None:
        from notify import notify_member
        when = f" on {str(session['start_time'])[:16].replace('T', ' ')} UTC" if session else ""
        await notify_member(user["id"], f"Booked with {t['display_name']}", f"{o['title']}{when}. " +
                            ("Pay the teacher at the class." if payment == "offline" and not paid else "See it in My Yoga."), "/my-yoga")
        await notify_member(t["user_id"], "New booking", f"{user.get('name') or user.get('email')} booked {o['title']}{when}.", "/teach?tab=students", email=False)
    return doc


class BookIn(BaseModel):
    session_id: Optional[str] = None
    use_credit: bool = False


@api.post("/teacher-offerings/{offering_id}/book")
async def book_teacher_offering(offering_id: str, payload: BookIn, user: dict = Depends(get_current_user)):
    """Free classes, classes paid at the studio, and classes paid with a teacher's class pack."""
    o, t, session = await _offering_for_student(offering_id, payload.session_id)
    if await _already(user["id"], o, payload.session_id):
        raise HTTPException(409, "You're already booked.")
    price = float(o.get("price") or 0)
    if payload.use_credit and o["kind"] == "class":
        r = await db.teacher_credits.update_one({"teacher_id": t["id"], "user_id": user["id"], "remaining": {"$gte": 1}}, {"$inc": {"remaining": -1}})
        if not r.modified_count:
            raise HTTPException(409, "You have no class credits with this teacher.")
        return await _enroll(user, o, t, session, payment="credit", paid=True)
    if price <= 0:
        return await _enroll(user, o, t, session, payment="free", paid=True)
    if can_take_online(t):
        raise HTTPException(409, "Please pay online to book this class.")
    if o["kind"] == "course":
        raise HTTPException(409, "This course opens after the teacher confirms your payment. Contact the teacher.")
    return await _enroll(user, o, t, session, payment="offline", paid=False, amount=price)


@api.post("/teacher-enrollments/{enrollment_id}/cancel")
async def cancel_teacher_booking(enrollment_id: str, user: dict = Depends(get_current_user)):
    e = await db.teacher_enrollments.find_one({"id": enrollment_id, "user_id": user["id"]}, {"_id": 0})
    if not e or e.get("kind") != "class" or e["status"] != "booked":
        raise HTTPException(404, "Booking not found")
    start = parse_dt(e.get("start_time"))
    if start and start - now_utc() < timedelta(hours=12):
        raise HTTPException(409, "Bookings can be cancelled up to 12 hours before the class. Please message the teacher.")
    await db.teacher_enrollments.update_one({"id": enrollment_id}, {"$set": {"status": "cancelled", "cancelled_at": now_utc().isoformat()}})
    note = ""
    if e.get("payment") == "credit":
        await db.teacher_credits.update_one({"teacher_id": e["teacher_id"], "user_id": user["id"]}, {"$inc": {"remaining": 1}})
        note = " Your class credit was returned."
    elif e.get("payment") == "online":
        note = " The teacher will refund you."
    t = await db.teachers.find_one({"id": e["teacher_id"]}, {"_id": 0, "user_id": 1})
    if t:
        from notify import notify_member
        await notify_member(t["user_id"], "Booking cancelled", f"{user.get('name') or user.get('email')} cancelled {e['offering_title']}.", "/teach?tab=students", email=e.get("payment") == "online")
    return {"ok": True, "note": note.strip()}


@api.get("/me/teacher-classes")
async def my_teacher_classes(user: dict = Depends(get_current_user)):
    rows = await db.teacher_enrollments.find({"user_id": user["id"], "status": {"$in": ["booked", "attended", "enrolled"]}}, {"_id": 0}).sort("created_at", -1).to_list(200)
    teachers = {t["id"]: t for t in await db.teachers.find({"id": {"$in": list({r["teacher_id"] for r in rows})}}, {"_id": 0}).to_list(200)}
    offers = {o["id"]: o for o in await db.teacher_offerings.find({"id": {"$in": list({r["offering_id"] for r in rows})}}, {"_id": 0}).to_list(500)}
    now = now_utc()
    out = []
    for r in rows:
        o = offers.get(r["offering_id"]) or {}
        t = teachers.get(r["teacher_id"]) or {}
        start = parse_dt(r.get("start_time"))
        if r["kind"] == "class" and start and start + timedelta(minutes=int(next((s.get("duration_min") for s in o.get("sessions") or [] if s["id"] == r.get("session_id")), 60) or 60)) < now:
            continue
        join = None
        paid_ok = r.get("paid") or r.get("payment") in ("free", "credit", "online")
        if r["kind"] == "class" and o.get("location_type") == "online" and start and start - timedelta(minutes=60) <= now and paid_ok:
            join = o.get("zoom_url")
        active = r["kind"] != "course" or not r.get("ends_at") or r["ends_at"] > now.isoformat()
        out.append({**{k: r.get(k) for k in ("id", "kind", "offering_id", "offering_title", "session_id", "start_time", "status", "payment", "paid", "ends_at")},
                    "teacher": {"name": t.get("display_name"), "slug": t.get("slug"), "photo": t.get("photo")}, "location_type": o.get("location_type"),
                    "location": o.get("location"), "join_url": join, "active": active, "lesson_count": len(o.get("lessons") or [])})
    credits = await db.teacher_credits.find({"user_id": user["id"], "remaining": {"$gt": 0}}, {"_id": 0}).to_list(50)
    for c in credits:
        t = teachers.get(c["teacher_id"]) or await db.teachers.find_one({"id": c["teacher_id"]}, {"_id": 0, "display_name": 1, "slug": 1}) or {}
        c["teacher"] = {"name": t.get("display_name"), "slug": t.get("slug")}
    out.sort(key=lambda x: (x["kind"] != "class", str(x.get("start_time") or "")))
    return {"items": out, "credits": credits}


@api.get("/me/teacher-courses/{offering_id}")
async def my_teacher_course(offering_id: str, user: dict = Depends(get_current_user)):
    o = await db.teacher_offerings.find_one({"id": offering_id, "kind": "course"}, {"_id": 0})
    if not o:
        raise HTTPException(404, "Course not found")
    t = await db.teachers.find_one({"id": o["teacher_id"]}, {"_id": 0}) or {}
    e = await db.teacher_enrollments.find_one({"user_id": user["id"], "offering_id": offering_id, "status": "enrolled"}, {"_id": 0})
    owner = t.get("user_id") == user["id"] or user.get("role") == "admin"
    if not owner and (not e or (e.get("ends_at") and e["ends_at"] < now_utc().isoformat())):
        raise HTTPException(403, "This course isn't open on your account.")
    return {"id": o["id"], "title": o["title"], "description": o.get("description"), "teacher": {"name": t.get("display_name"), "slug": t.get("slug")},
            "lessons": o.get("lessons") or [], "ends_at": (e or {}).get("ends_at")}


# ---------------------------------------------------------------------------
# Online payments to the teacher (Stripe Connect direct charges)

async def _price_offering(item_id, quantity, user_id, extra):
    o, t, session = await _offering_for_student(item_id, extra.get("session_id"))
    if not can_take_online(t):
        raise HTTPException(409, "This teacher takes payment in person. Use Book instead.")
    if float(o.get("price") or 0) <= 0:
        raise HTTPException(409, "This one is free. Use Book instead.")
    if await _already(user_id, o, extra.get("session_id")):
        raise HTTPException(409, "You're already booked.")
    tier = (await _tiers()).get(t.get("tier_id")) or {}
    fee = round(float(o["price"]) * float(tier.get("platform_fee_percent") or 0) / 100, 2)
    when = f" · {str(session['start_time'])[:10]}" if session else ""
    return float(o["price"]), (o.get("currency") or "eur"), {
        "product_name": f"{o['title']} with {t['display_name']}{when}"[:120], "teacher_id": t["id"], "session_id": (session or {}).get("id") or "",
        "_payee": {"stripe_account": t["stripe_account_id"], "application_fee": fee, "teacher_id": t["id"]}}


async def _fulfil_offering(txn):
    o = await db.teacher_offerings.find_one({"id": txn["item_id"]}, {"_id": 0})
    t = await db.teachers.find_one({"id": (o or {}).get("teacher_id")}, {"_id": 0})
    user = await db.users.find_one({"id": txn["user_id"]}, {"_id": 0, "password_hash": 0})
    if not o or not t or not user:
        logger.warning("teacher offering payment %s could not be matched", txn.get("id"))
        return
    sid = (txn.get("metadata") or {}).get("session_id") or None
    session = next((s for s in o.get("sessions") or [] if s["id"] == sid), None) if sid else None
    await _enroll(user, o, t, session, payment="online", paid=True, amount=txn.get("amount"), currency=txn.get("currency"),
                  txn_id=txn["id"], eid=f"txn:{txn['id']}")


async def _describe_offering(txn):
    return (txn.get("metadata") or {}).get("product_name") or "Class with a Tony-certified teacher"


async def _offering_message(txn):
    return "You're booked", f"{(txn.get('metadata') or {}).get('product_name') or 'Your class'} is in My Yoga."


async def _offering_link(txn):
    return "/my-yoga"


from payment_items import register, STRIPE_HOOKS  # noqa: E402

register("teacher_offering", price=_price_offering, fulfill=_fulfil_offering, describe=_describe_offering, message=_offering_message,
         link=_offering_link, credit=False, meta_keys=("session_id",))


# ---------------------------------------------------------------------------
# Teacher portal

@api.get("/teacher/me")
async def teacher_me(user: dict = Depends(get_current_user)):
    t = await db.teachers.find_one({"user_id": user["id"]}, {"_id": 0})
    if not t:
        return None
    tiers = await _tiers()
    month = now_utc().strftime("%Y-%m")
    income = await _income(t["id"], now_utc().year)
    upcoming = []
    for o in await db.teacher_offerings.find({"teacher_id": t["id"], "active": True, "kind": "class"}, {"_id": 0}).to_list(200):
        counts = await _session_counts([o["id"]])
        for s in _offering_public(o, counts)["sessions"][:5]:
            upcoming.append({**s, "offering_id": o["id"], "title": o["title"]})
    upcoming.sort(key=lambda s: s["start_time"])
    ce = await db.teacher_ce_log.find({"teacher_id": t["id"]}, {"_id": 0}).to_list(500)
    year_hours = sum(float(x.get("hours") or 0) for x in ce if str(x.get("date", "")).startswith(str(now_utc().year)))
    t = {k: v for k, v in t.items() if k not in ("admin_note",)}
    return {**t, "tier": tiers.get(t.get("tier_id")), "tiers": list(tiers.values()), "listed": listed(t, tiers), "fee_ok": fee_ok(t, tiers),
            "can_take_online": can_take_online(t),
            "stats": {"students": await db.teacher_students.count_documents({"teacher_id": t["id"]}),
                      "offerings": await db.teacher_offerings.count_documents({"teacher_id": t["id"], "active": True}),
                      "income_month": income["months"].get(month, {}), "income_year": income["total"]},
            "upcoming": upcoming[:8], "ce_hours_year": year_hours, "ce_hours_required": int(await get_setting("teacher_ce_hours_per_year") or 20),
            "label": await get_setting("teacher_certified_label") or "Tony-Certified"}


class TeacherProfileIn(BaseModel):
    display_name: Optional[str] = Field(default=None, min_length=2, max_length=80)
    headline: Optional[str] = Field(default=None, max_length=120)
    bio: Optional[str] = Field(default=None, max_length=3000)
    photo: Optional[str] = Field(default=None, max_length=500)
    city: Optional[str] = Field(default=None, max_length=80)
    country: Optional[str] = Field(default=None, max_length=60)
    country_code: Optional[str] = Field(default=None, pattern="^[A-Za-z]{2}$")
    languages: Optional[List[str]] = None
    styles: Optional[List[str]] = None
    online: Optional[bool] = None
    in_person: Optional[bool] = None
    website: Optional[str] = Field(default=None, max_length=200)
    instagram: Optional[str] = Field(default=None, max_length=100)
    payment_mode: Optional[str] = Field(default=None, pattern="^(online|offline)$")
    offline_payment_note: Optional[str] = Field(default=None, max_length=300)


@api.patch("/teacher/me")
async def teacher_update(payload: TeacherProfileIn, user: dict = Depends(get_current_user)):
    t = await _my_teacher(user, allow_unapproved=True)
    update = {k: v for k, v in payload.model_dump().items() if v is not None}
    _clean_links(update)
    for f in ("photo",):
        if update.get(f) and not (update[f].startswith("https://") or update[f].startswith("/")):
            raise HTTPException(422, f"{f.capitalize()} must be a https:// link.")
    if update.get("payment_mode") == "online" and not t.get("charges_enabled"):
        raise HTTPException(409, "Connect your Stripe account first to take online payments.")
    if "country_code" in update:
        update["country_code"] = update["country_code"].upper()
    for f in ("languages", "styles"):
        if f in update:
            update[f] = [str(x)[:40] for x in update[f][:10]]
    await db.teachers.update_one({"id": t["id"]}, {"$set": {**update, "updated_at": now_utc().isoformat()}})
    return await teacher_me(user)


class TaxIn(BaseModel):
    legal_name: str = Field(min_length=2, max_length=160)
    entity: str = Field(default="individual", pattern="^(individual|company)$")
    tax_id: str = Field(min_length=3, max_length=40)
    vat_number: Optional[str] = Field(default=None, max_length=40)
    date_of_birth: Optional[str] = Field(default=None, pattern=r"^\d{4}-\d{2}-\d{2}$")
    address: str = Field(min_length=5, max_length=400)
    country_of_residence: str = Field(min_length=2, max_length=60)


@api.put("/teacher/me/tax")
async def teacher_tax(payload: TaxIn, user: dict = Depends(get_current_user)):
    """Details the EU DAC7 rules require for teachers who are paid through the platform."""
    t = await _my_teacher(user, allow_unapproved=True)
    if payload.entity == "individual" and not payload.date_of_birth:
        raise HTTPException(422, "Date of birth is required for individuals (EU DAC7 reporting).")
    await db.teachers.update_one({"id": t["id"]}, {"$set": {"tax": {**payload.model_dump(), "updated_at": now_utc().isoformat()}}})
    return {"ok": True}


class SessionIn(BaseModel):
    start_time: AwareDatetime
    duration_min: int = Field(default=60, ge=10, le=600)


class LessonIn(BaseModel):
    title: str = Field(min_length=1, max_length=140)
    video_url: str = Field(min_length=8, max_length=500)
    duration_min: Optional[int] = Field(default=None, ge=1, le=600)
    description: Optional[str] = Field(default=None, max_length=1000)


class OfferingIn(BaseModel):
    kind: str = Field(pattern="^(class|course|pack)$")
    title: str = Field(min_length=2, max_length=120)
    description: Optional[str] = Field(default="", max_length=3000)
    image: Optional[str] = Field(default=None, max_length=500)
    level: Optional[str] = Field(default="all", max_length=20)
    language: Optional[str] = Field(default=None, max_length=20)
    location_type: str = Field(default="online", pattern="^(online|in_person)$")
    location: Optional[str] = Field(default=None, max_length=300)
    zoom_url: Optional[str] = Field(default=None, max_length=500)
    price: float = Field(default=0, ge=0, le=10000)
    currency: str = Field(default="eur", pattern="^(eur|usd|gbp)$")
    capacity: Optional[int] = Field(default=None, ge=1, le=1000)
    access_days: Optional[int] = Field(default=0, ge=0, le=3650)
    credits: Optional[int] = Field(default=None, ge=2, le=100)
    sessions: List[SessionIn] = Field(default_factory=list)
    lessons: List[LessonIn] = Field(default_factory=list)
    active: bool = True


def _check_urls(payload: OfferingIn):
    if payload.zoom_url and not payload.zoom_url.startswith("https://"):
        raise HTTPException(422, "The meeting link must start with https://")
    for l in payload.lessons:
        if not l.video_url.startswith("https://"):
            raise HTTPException(422, "Lesson videos must be https:// links (YouTube, Vimeo, Google Drive…).")
    if payload.image and not (payload.image.startswith("https://") or payload.image.startswith("/")):
        raise HTTPException(422, "Image must be a https:// link.")
    if payload.kind == "pack" and not payload.credits:
        raise HTTPException(422, "Say how many classes the pack includes.")
    if payload.kind == "course" and not payload.lessons:
        raise HTTPException(422, "Add at least one lesson to the course.")


@api.get("/teacher/offerings")
async def teacher_offerings(user: dict = Depends(get_current_user)):
    t = await _my_teacher(user)
    rows = await db.teacher_offerings.find({"teacher_id": t["id"]}, {"_id": 0}).sort("created_at", -1).to_list(500)
    counts = await _session_counts([o["id"] for o in rows])
    out = []
    for o in rows:
        pub = _offering_public(o, counts)
        out.append({**o, "sessions": [{**s, "booked": counts.get(s["id"], 0)} for s in sorted(o.get("sessions") or [], key=lambda s: s["start_time"])],
                    "upcoming": pub["sessions"], "enrolled": await db.teacher_enrollments.count_documents({"offering_id": o["id"], "status": {"$in": ["enrolled", "booked", "attended"]}})})
    return out


@api.post("/teacher/offerings")
async def teacher_create_offering(payload: OfferingIn, user: dict = Depends(get_current_user)):
    t = await _my_teacher(user)
    _check_urls(payload)
    tier = (await _tiers()).get(t.get("tier_id")) or {}
    limit = int(tier.get("max_offerings") or 0)
    if payload.active and limit and await db.teacher_offerings.count_documents({"teacher_id": t["id"], "active": True}) >= limit:
        raise HTTPException(409, f"Your {tier.get('name', '')} plan includes up to {limit} active classes or courses. Upgrade or archive one.")
    doc = {**payload.model_dump(exclude={"sessions", "lessons"}), "id": gen_id(), "teacher_id": t["id"], "created_at": now_utc().isoformat(),
           "sessions": [{"id": gen_id(), "start_time": s.start_time.astimezone(timezone.utc).isoformat(), "duration_min": s.duration_min} for s in payload.sessions[:60]],
           "lessons": [{"id": gen_id(), **l.model_dump()} for l in payload.lessons[:200]]}
    await db.teacher_offerings.insert_one({**doc, "_id": doc["id"]})
    doc.pop("_id", None)
    return doc


@api.put("/teacher/offerings/{offering_id}")
async def teacher_update_offering(offering_id: str, payload: OfferingIn, user: dict = Depends(get_current_user)):
    t = await _my_teacher(user)
    o = await db.teacher_offerings.find_one({"id": offering_id, "teacher_id": t["id"]}, {"_id": 0})
    if not o:
        raise HTTPException(404, "Not found")
    _check_urls(payload)
    if payload.active and not o.get("active"):
        tier = (await _tiers()).get(t.get("tier_id")) or {}
        limit = int(tier.get("max_offerings") or 0)
        if limit and await db.teacher_offerings.count_documents({"teacher_id": t["id"], "active": True}) >= limit:
            raise HTTPException(409, f"Your plan includes up to {limit} active classes or courses.")
    old_sessions = {s["id"]: s for s in o.get("sessions") or []}
    sessions = list(old_sessions.values())
    known = {(s["start_time"][:16]) for s in sessions}
    for s in payload.sessions[:60]:
        iso = s.start_time.astimezone(timezone.utc).isoformat()
        if iso[:16] not in known:
            sessions.append({"id": gen_id(), "start_time": iso, "duration_min": s.duration_min})
    old_lessons = {l.get("video_url"): l for l in o.get("lessons") or []}
    lessons = [{"id": (old_lessons.get(l.video_url) or {}).get("id") or gen_id(), **l.model_dump()} for l in payload.lessons[:200]]
    update = {**payload.model_dump(exclude={"sessions", "lessons"}), "sessions": sessions, "lessons": lessons, "updated_at": now_utc().isoformat()}
    await db.teacher_offerings.update_one({"id": offering_id}, {"$set": update})
    return await db.teacher_offerings.find_one({"id": offering_id}, {"_id": 0})


@api.post("/teacher/offerings/{offering_id}/sessions/{session_id}/cancel")
async def teacher_cancel_session(offering_id: str, session_id: str, user: dict = Depends(get_current_user)):
    t = await _my_teacher(user)
    o = await db.teacher_offerings.find_one({"id": offering_id, "teacher_id": t["id"]}, {"_id": 0})
    if not o or not any(s["id"] == session_id for s in o.get("sessions") or []):
        raise HTTPException(404, "Class date not found")
    sessions = [{**s, "cancelled": True} if s["id"] == session_id else s for s in o["sessions"]]
    await db.teacher_offerings.update_one({"id": offering_id}, {"$set": {"sessions": sessions}})
    booked = await db.teacher_enrollments.find({"session_id": session_id, "status": "booked"}, {"_id": 0}).to_list(1000)
    from notify import notify_member
    for e in booked:
        await db.teacher_enrollments.update_one({"id": e["id"]}, {"$set": {"status": "cancelled", "cancelled_by_teacher": True, "cancelled_at": now_utc().isoformat()}})
        if e.get("payment") == "credit":
            await db.teacher_credits.update_one({"teacher_id": t["id"], "user_id": e["user_id"]}, {"$inc": {"remaining": 1}})
        extra = " Your class credit was returned." if e.get("payment") == "credit" else (" You'll get a refund from the teacher." if e.get("payment") == "online" else "")
        await notify_member(e["user_id"], "Class cancelled", f"{t['display_name']} cancelled {o['title']} on {str(e.get('start_time'))[:10]}.{extra}", "/my-yoga")
    return {"ok": True, "notified": len(booked)}


@api.get("/teacher/roster/{offering_id}")
async def teacher_roster(offering_id: str, session_id: Optional[str] = None, user: dict = Depends(get_current_user)):
    t = await _my_teacher(user)
    o = await db.teacher_offerings.find_one({"id": offering_id, "teacher_id": t["id"]}, {"_id": 0, "id": 1})
    if not o:
        raise HTTPException(404, "Not found")
    q = {"offering_id": offering_id}
    if session_id:
        q["session_id"] = session_id
    return await db.teacher_enrollments.find(q, {"_id": 0}).sort("created_at", 1).to_list(2000)


class EnrollmentUpdate(BaseModel):
    paid: Optional[bool] = None
    status: Optional[str] = Field(default=None, pattern="^(booked|attended|no_show|cancelled|enrolled)$")


@api.patch("/teacher/enrollments/{enrollment_id}")
async def teacher_update_enrollment(enrollment_id: str, payload: EnrollmentUpdate, user: dict = Depends(get_current_user)):
    t = await _my_teacher(user)
    e = await db.teacher_enrollments.find_one({"id": enrollment_id, "teacher_id": t["id"]}, {"_id": 0})
    if not e:
        raise HTTPException(404, "Not found")
    update = {k: v for k, v in payload.model_dump().items() if v is not None}
    if payload.paid and e.get("payment") == "offline":
        update["paid_at"] = now_utc().isoformat()
    if e.get("kind") == "pack" and payload.paid and not e.get("credits_granted"):
        # A class pack paid in person: its credits open once the teacher confirms the payment.
        claimed = await db.teacher_enrollments.update_one({"id": enrollment_id, "credits_granted": {"$ne": True}}, {"$set": {"credits_granted": True}})
        if claimed.modified_count:
            await db.teacher_credits.update_one({"teacher_id": t["id"], "user_id": e["user_id"]}, {"$inc": {"remaining": int(e.get("credits_total") or 0)},
                                                                                                  "$setOnInsert": {"id": gen_id(), "teacher_id": t["id"], "user_id": e["user_id"]}}, upsert=True)
    await db.teacher_enrollments.update_one({"id": enrollment_id}, {"$set": update})
    return await db.teacher_enrollments.find_one({"id": enrollment_id}, {"_id": 0})


class GrantIn(BaseModel):
    email: EmailStr
    name: Optional[str] = Field(default=None, max_length=120)
    offering_id: Optional[str] = None
    session_id: Optional[str] = None
    paid: bool = True
    note: Optional[str] = Field(default=None, max_length=500)


@api.get("/teacher/students")
async def teacher_students(user: dict = Depends(get_current_user)):
    t = await _my_teacher(user)
    rows = await db.teacher_students.find({"teacher_id": t["id"]}, {"_id": 0}).sort("last_activity_at", -1).to_list(5000)
    for r in rows:
        es = await db.teacher_enrollments.find({"teacher_id": t["id"], "user_id": r["user_id"]}, {"_id": 0, "status": 1, "paid": 1, "amount": 1, "payment": 1}).to_list(500)
        r["bookings"] = len(es)
        r["attended"] = sum(1 for e in es if e["status"] == "attended")
        r["unpaid"] = sum(1 for e in es if e.get("payment") == "offline" and not e.get("paid") and e["status"] != "cancelled")
        c = await db.teacher_credits.find_one({"teacher_id": t["id"], "user_id": r["user_id"]}, {"_id": 0, "remaining": 1})
        r["credits"] = (c or {}).get("remaining", 0)
    return rows


@api.post("/teacher/students")
async def teacher_add_student(payload: GrantIn, user: dict = Depends(get_current_user)):
    """Add an existing (offline) student: they get an account invite and, optionally, a class or course."""
    t = await _my_teacher(user)
    tier = (await _tiers()).get(t.get("tier_id")) or {}
    limit = int(tier.get("max_students") or 0)
    if limit and await db.teacher_students.count_documents({"teacher_id": t["id"]}) >= limit:
        raise HTTPException(409, f"Your {tier.get('name', '')} plan includes up to {limit} students. Upgrade to add more.")
    from routers.members import create_member, _invite_link, _send_invite
    email = payload.email.lower()
    student = await db.users.find_one({"email": email}, {"_id": 0, "password_hash": 0})
    if not student:
        student = await create_member(payload.name or email.split("@")[0], email, source="teacher", note=f"Added by teacher {t['display_name']}")
        await _send_invite(student, await _invite_link(student, hours=24 * 7), f"{t['display_name']} added you as a student on Tony Yoga.")
    elif not await db.teacher_students.find_one({"teacher_id": t["id"], "user_id": student["id"]}):
        from notify import notify_member
        await notify_member(student["id"], f"{t['display_name']} added you as a student",
                            f"You'll see {t['display_name']}'s classes and messages on Tony Yoga. Don't know this teacher? Remove them in My Yoga.",
                            "/my-yoga", dedupe_key=f"teacher-add:{t['id']}:{student['id']}")
    invited = True  # same answer whether or not the email already had an account
    await db.teacher_students.update_one({"teacher_id": t["id"], "user_id": student["id"]},
                                         {"$set": {"email": email, "name": payload.name or email.split("@")[0], "note": payload.note, "last_activity_at": now_utc().isoformat()},
                                          "$setOnInsert": {"id": gen_id(), "teacher_id": t["id"], "user_id": student["id"], "source": "manual", "created_at": now_utc().isoformat()}},
                                         upsert=True)
    enrolled = None
    if payload.offering_id:
        o = await db.teacher_offerings.find_one({"id": payload.offering_id, "teacher_id": t["id"]}, {"_id": 0})
        if not o:
            raise HTTPException(404, "Class or course not found")
        session = next((s for s in o.get("sessions") or [] if s["id"] == payload.session_id), None) if payload.session_id else None
        if o["kind"] == "class" and not session:
            raise HTTPException(422, "Choose the class date.")
        enrolled = await _enroll(student, o, t, session, payment="offline", paid=payload.paid, amount=float(o.get("price") or 0))
    return {"ok": True, "invited": invited, "enrollment": enrolled}


@api.post("/me/teachers/{teacher_id}/leave")
async def leave_teacher(teacher_id: str, user: dict = Depends(get_current_user)):
    """Remove yourself from a teacher's student list (no more messages from them)."""
    await db.teacher_students.delete_one({"teacher_id": teacher_id, "user_id": user["id"]})
    return {"ok": True}


@api.get("/me/teachers")
async def my_teachers(user: dict = Depends(get_current_user)):
    rows = await db.teacher_students.find({"user_id": user["id"]}, {"_id": 0, "teacher_id": 1}).to_list(100)
    ts = await db.teachers.find({"id": {"$in": [r["teacher_id"] for r in rows]}}, {"_id": 0, "id": 1, "display_name": 1, "slug": 1, "photo": 1}).to_list(100)
    return ts


class StudentNote(BaseModel):
    note: Optional[str] = Field(default=None, max_length=1000)
    tags: Optional[List[str]] = None


@api.patch("/teacher/students/{student_id}")
async def teacher_note_student(student_id: str, payload: StudentNote, user: dict = Depends(get_current_user)):
    t = await _my_teacher(user)
    update = {k: v for k, v in payload.model_dump().items() if v is not None}
    if "tags" in update:
        update["tags"] = [str(x)[:30] for x in update["tags"][:10]]
    r = await db.teacher_students.update_one({"id": student_id, "teacher_id": t["id"]}, {"$set": update})
    if not r.matched_count:
        raise HTTPException(404, "Student not found")
    return {"ok": True}


class MessageIn(BaseModel):
    subject: str = Field(min_length=2, max_length=120)
    body: str = Field(min_length=2, max_length=3000)
    offering_id: Optional[str] = None
    session_id: Optional[str] = None


@api.post("/teacher/messages")
async def teacher_message(payload: MessageIn, user: dict = Depends(get_current_user)):
    t = await _my_teacher(user)
    today = now_utc().replace(hour=0, minute=0, second=0, microsecond=0).isoformat()
    if await db.teacher_messages.count_documents({"teacher_id": t["id"], "created_at": {"$gte": today}}) >= 10:
        raise HTTPException(429, "You can send up to 10 messages a day.")
    if payload.offering_id:
        q = {"teacher_id": t["id"], "offering_id": payload.offering_id, "status": {"$in": ["booked", "attended", "enrolled"]}}
        if payload.session_id:
            q["session_id"] = payload.session_id
        ids = list({e["user_id"] for e in await db.teacher_enrollments.find(q, {"_id": 0, "user_id": 1}).to_list(5000)})
    else:
        ids = [s["user_id"] for s in await db.teacher_students.find({"teacher_id": t["id"]}, {"_id": 0, "user_id": 1}).to_list(5000)]
    import html as _h
    from notify import notify_member
    for uid in ids:
        await notify_member(uid, f"{t['display_name']}: {payload.subject}", payload.body[:300], f"/teachers/{t['slug']}",
                            email_subject=f"{payload.subject} — {t['display_name']}", email_html=_h.escape(payload.body).replace("\n", "<br/>"),
                            cta_label="Open Tony Yoga", ntype="teacher")
    await db.teacher_messages.insert_one({"_id": gen_id(), "teacher_id": t["id"], "subject": payload.subject, "recipients": len(ids), "created_at": now_utc().isoformat()})
    return {"ok": True, "sent": len(ids)}


async def _income(teacher_id: str, year: int) -> dict:
    start, end = f"{year}-01-01", f"{year + 1}-01-01"
    rows = await db.teacher_enrollments.find({"teacher_id": teacher_id, "created_at": {"$gte": start, "$lt": end}, "paid": True,
                                              "payment": {"$in": ["online", "offline"]}}, {"_id": 0}).to_list(50000)
    months, total, fees = {}, {}, {}
    for r in rows:
        cur = str(r.get("currency") or "eur").upper()
        m = str(r.get("paid_at") or r["created_at"])[:7]
        bucket = months.setdefault(m, {})
        bucket[cur] = round(bucket.get(cur, 0) + float(r.get("amount") or 0), 2)
        total[cur] = round(total.get(cur, 0) + float(r.get("amount") or 0), 2)
    for txn in await db.payment_transactions.find({"payee_teacher_id": teacher_id, "payment_status": "paid", "completed_at": {"$gte": start, "$lt": end}},
                                                  {"_id": 0, "application_fee": 1, "currency": 1}).to_list(50000):
        cur = str(txn.get("currency") or "eur").upper()
        fees[cur] = round(fees.get(cur, 0) + float(txn.get("application_fee") or 0), 2)
    return {"year": year, "months": months, "total": total, "platform_fees": fees, "sales": len(rows)}


@api.get("/teacher/income")
async def teacher_income(year: Optional[int] = None, user: dict = Depends(get_current_user)):
    t = await _my_teacher(user)
    return await _income(t["id"], year or now_utc().year)


class CEIn(BaseModel):
    date: str = Field(pattern=r"^\d{4}-\d{2}-\d{2}$")
    hours: float = Field(gt=0, le=200)
    title: str = Field(min_length=2, max_length=160)
    provider: Optional[str] = Field(default=None, max_length=120)
    certificate_url: Optional[str] = Field(default=None, max_length=500)


@api.get("/teacher/ce")
async def teacher_ce(user: dict = Depends(get_current_user)):
    t = await _my_teacher(user, allow_unapproved=True)
    return await db.teacher_ce_log.find({"teacher_id": t["id"]}, {"_id": 0}).sort("date", -1).to_list(1000)


@api.post("/teacher/ce")
async def teacher_add_ce(payload: CEIn, user: dict = Depends(get_current_user)):
    t = await _my_teacher(user, allow_unapproved=True)
    if payload.certificate_url and not payload.certificate_url.startswith("https://"):
        raise HTTPException(422, "Certificate link must start with https://")
    doc = {**payload.model_dump(), "id": gen_id(), "teacher_id": t["id"], "status": "logged", "created_at": now_utc().isoformat()}
    await db.teacher_ce_log.insert_one({**doc, "_id": doc["id"]})
    return doc


@api.delete("/teacher/ce/{entry_id}")
async def teacher_delete_ce(entry_id: str, user: dict = Depends(get_current_user)):
    t = await _my_teacher(user, allow_unapproved=True)
    await db.teacher_ce_log.delete_one({"id": entry_id, "teacher_id": t["id"], "status": "logged"})
    return {"ok": True}


# ---------- Stripe Connect (teacher's own payouts) ----------

async def _stripe_key():
    from routers.payments import _require_stripe_key
    return await _require_stripe_key()


class OriginIn(BaseModel):
    origin_url: Optional[str] = None
    client: Optional[str] = None
    tier_id: Optional[str] = None


@api.post("/teacher/stripe/connect")
async def teacher_stripe_connect(payload: OriginIn, user: dict = Depends(get_current_user)):
    import stripe
    t = await _my_teacher(user)
    key = await _stripe_key()
    base, _ = checkout_return_base(payload.origin_url, payload.client)
    try:
        if not t.get("stripe_account_id"):
            acct = await asyncio.to_thread(stripe.Account.create, api_key=key, type="express", email=t.get("email") or user.get("email"),
                                           country=(t.get("country_code") or "ES").upper(), business_type="individual",
                                           capabilities={"card_payments": {"requested": True}, "transfers": {"requested": True}},
                                           business_profile={"product_description": "Yoga classes and courses", "mcc": "7997"},
                                           metadata={"teacher_id": t["id"]})
            await db.teachers.update_one({"id": t["id"]}, {"$set": {"stripe_account_id": acct["id"], "charges_enabled": bool(acct.get("charges_enabled"))}})
            t["stripe_account_id"] = acct["id"]
        link = await asyncio.to_thread(stripe.AccountLink.create, api_key=key, account=t["stripe_account_id"], type="account_onboarding",
                                       refresh_url=f"{base}/teach?tab=payments&stripe=retry", return_url=f"{base}/teach?tab=payments&stripe=return")
    except stripe.error.StripeError as exc:
        logger.warning("Stripe Connect onboarding failed (%s)", type(exc).__name__)
        raise HTTPException(502, "Stripe couldn't start the payout setup. Please try again later.")
    return {"url": link["url"]}


@api.get("/teacher/stripe/status")
async def teacher_stripe_status(user: dict = Depends(get_current_user)):
    import stripe
    t = await _my_teacher(user)
    if not t.get("stripe_account_id"):
        return {"connected": False}
    try:
        acct = await asyncio.to_thread(stripe.Account.retrieve, t["stripe_account_id"], api_key=await _stripe_key())
    except stripe.error.StripeError:
        raise HTTPException(502, "Stripe is unavailable right now.")
    state = {"charges_enabled": bool(acct.get("charges_enabled")), "payouts_enabled": bool(acct.get("payouts_enabled")),
             "details_submitted": bool(acct.get("details_submitted"))}
    await db.teachers.update_one({"id": t["id"]}, {"$set": state})
    return {"connected": True, **state}


@api.post("/teacher/stripe/dashboard")
async def teacher_stripe_dashboard(user: dict = Depends(get_current_user)):
    import stripe
    t = await _my_teacher(user)
    if not t.get("stripe_account_id"):
        raise HTTPException(409, "Connect Stripe first.")
    try:
        link = await asyncio.to_thread(stripe.Account.create_login_link, t["stripe_account_id"], api_key=await _stripe_key())
    except stripe.error.StripeError:
        raise HTTPException(502, "Stripe is unavailable right now.")
    return {"url": link["url"]}


# ---------- Tony's monthly fee ----------

@api.post("/teacher/billing/checkout")
async def teacher_billing_checkout(payload: OriginIn, user: dict = Depends(get_current_user)):
    import stripe
    t = await _my_teacher(user)
    tiers = await _tiers()
    tier = tiers.get(payload.tier_id or t.get("tier_id"))
    if not tier:
        raise HTTPException(404, "Plan not found")
    if t.get("status") != "approved":
        raise HTTPException(409, "Your profile must be approved before you start a plan.")
    b = t.get("billing") or {}
    if float(tier.get("price") or 0) <= 0:
        if b.get("mode") == "stripe" and b.get("status") in ("active", "trialing", "past_due"):
            raise HTTPException(409, "Cancel your current plan in Manage billing first; then choose the free plan.")
        await db.teachers.update_one({"id": t["id"]}, {"$set": {"tier_id": tier["id"], "billing": {"mode": "free", "status": "active"}}})
        return {"free": True}
    if b.get("mode") == "stripe" and b.get("status") in ("active", "trialing", "past_due") and b.get("stripe_subscription_id"):
        raise HTTPException(409, "Your plan is already running. Use Manage billing to change it.")
    from routers.payments import _to_minor_units
    base, extra_q = checkout_return_base(payload.origin_url, payload.client)
    meta = {"teacher_id": t["id"], "kind": "teacher_fee", "tier_id": tier["id"], "user_id": user["id"]}
    line = ({"price": tier["stripe_price_id"], "quantity": 1} if tier.get("stripe_price_id") else
            {"price_data": {"currency": tier.get("currency", "eur"), "unit_amount": _to_minor_units(tier["price"], tier.get("currency", "eur")),
                            "recurring": {"interval": "month"}, "product_data": {"name": f"Tony Yoga Teacher Hub — {tier['name']}"}}, "quantity": 1})
    try:
        session = await asyncio.to_thread(stripe.checkout.Session.create, api_key=await _stripe_key(), mode="subscription", line_items=[line],
                                          customer_email=user.get("email"), metadata=meta, subscription_data={"metadata": meta},
                                          success_url=f"{base}/teach?tab=billing&billing_session={{CHECKOUT_SESSION_ID}}{extra_q}",
                                          cancel_url=f"{base}/teach?tab=billing{extra_q}")
    except stripe.error.StripeError as exc:
        logger.warning("teacher fee checkout failed (%s)", type(exc).__name__)
        raise HTTPException(503, "Card payments are unavailable right now.")
    await db.teachers.update_one({"id": t["id"]}, {"$set": {"billing.checkout_session_id": session["id"], "billing.pending_tier_id": tier["id"]}})
    return {"url": session["url"], "session_id": session["id"]}


async def _confirm_teacher_fee(t: dict, session_id: str) -> dict:
    import stripe
    s = await asyncio.to_thread(stripe.checkout.Session.retrieve, session_id, api_key=await _stripe_key(), expand=["subscription"])
    if (s.get("metadata") or {}).get("teacher_id") != t["id"]:
        raise HTTPException(409, "This payment belongs to another teacher.")
    sub = s.get("subscription") or {}
    if s.get("status") == "complete" and isinstance(sub, dict) and sub.get("status") in ("active", "trialing"):
        end = sub.get("current_period_end") or ((sub.get("items") or {}).get("data") or [{}])[0].get("current_period_end")
        billing = {"mode": "stripe", "status": sub["status"], "stripe_subscription_id": sub.get("id"),
                   "stripe_customer_id": sub.get("customer") if isinstance(sub.get("customer"), str) else s.get("customer"),
                   "paid_until": datetime.fromtimestamp(end, tz=timezone.utc).isoformat() if end else None, "since": now_utc().isoformat()}
        tier_id = (s.get("metadata") or {}).get("tier_id") or t.get("tier_id")
        await db.teachers.update_one({"id": t["id"]}, {"$set": {"billing": billing, "tier_id": tier_id}})
        return {"active": True}
    if s.get("status") == "expired":
        await db.teachers.update_one({"id": t["id"]}, {"$unset": {"billing.checkout_session_id": ""}})
    return {"active": False, "status": s.get("status")}


@api.post("/teacher/billing/confirm/{session_id}")
async def teacher_billing_confirm(session_id: str, user: dict = Depends(get_current_user)):
    t = await _my_teacher(user)
    return await _confirm_teacher_fee(t, session_id)


@api.post("/teacher/billing/portal")
async def teacher_billing_portal(payload: OriginIn, user: dict = Depends(get_current_user)):
    import stripe
    t = await _my_teacher(user)
    customer = (t.get("billing") or {}).get("stripe_customer_id")
    if not customer:
        raise HTTPException(409, "There's no card on file for your plan.")
    base, _ = checkout_return_base(payload.origin_url, payload.client)
    try:
        p = await asyncio.to_thread(stripe.billing_portal.Session.create, customer=customer, return_url=f"{base}/teach?tab=billing", api_key=await _stripe_key())
    except stripe.error.StripeError:
        raise HTTPException(502, "The billing page is unavailable right now.")
    return {"url": p["url"]}


async def _teacher_stripe_hook(etype: str, obj: dict):
    """Keep teachers' monthly fee in sync with Stripe (renewals, failed cards, cancellations)."""
    meta = obj.get("metadata") or {}
    if etype in ("checkout.session.completed", "checkout.session.async_payment_succeeded") and meta.get("kind") == "teacher_fee" and meta.get("teacher_id"):
        t = await db.teachers.find_one({"id": meta["teacher_id"]}, {"_id": 0})
        if t:
            await _confirm_teacher_fee(t, obj.get("id"))
        return
    if etype.startswith("customer.subscription."):
        if meta.get("kind") == "teacher_fee" and meta.get("teacher_id"):
            linked = await db.teachers.find_one({"id": meta["teacher_id"]}, {"_id": 0, "billing": 1})
            if linked and (linked.get("billing") or {}).get("stripe_subscription_id") != obj.get("id") and obj.get("status") in ("active", "trialing"):
                await db.teachers.update_one({"id": meta["teacher_id"]}, {"$set": {"billing.mode": "stripe", "billing.stripe_subscription_id": obj.get("id"),
                                                                                   "billing.stripe_customer_id": obj.get("customer") if isinstance(obj.get("customer"), str) else None,
                                                                                   "tier_id": meta.get("tier_id") or None}})
        if meta.get("kind") != "teacher_fee" and not await db.teachers.find_one({"billing.stripe_subscription_id": obj.get("id")}):
            return
        status = obj.get("status")
        mapped = "cancelled" if etype.endswith("deleted") or status in ("canceled", "incomplete_expired", "unpaid") else ("past_due" if status == "past_due" else status)
        end = obj.get("current_period_end") or ((obj.get("items") or {}).get("data") or [{}])[0].get("current_period_end")
        update = {"billing.status": mapped}
        if end:
            update["billing.paid_until"] = datetime.fromtimestamp(end, tz=timezone.utc).isoformat()
        if mapped == "past_due":
            await db.teachers.update_one({"billing.stripe_subscription_id": obj.get("id"), "billing.past_due_since": {"$exists": False}},
                                         {"$set": {"billing.past_due_since": now_utc().isoformat()}})
        else:
            await db.teachers.update_one({"billing.stripe_subscription_id": obj.get("id")}, {"$unset": {"billing.past_due_since": ""}})
        await db.teachers.update_one({"billing.stripe_subscription_id": obj.get("id")}, {"$set": update})
    elif etype in ("invoice.paid", "invoice.payment_succeeded", "invoice.payment_failed"):
        sub_id = obj.get("subscription") or ((obj.get("parent") or {}).get("subscription_details") or {}).get("subscription")
        t = await db.teachers.find_one({"billing.stripe_subscription_id": sub_id}, {"_id": 0}) if sub_id else None
        if not t:
            return
        if etype == "invoice.payment_failed":
            from notify import notify_member
            await notify_member(t["user_id"], "Teacher Hub payment failed", "Please update your card within 7 days to keep your profile listed.",
                                "/teach?tab=billing", dedupe_key=f"teacherfee-fail:{obj.get('id')}")
        else:
            amount = float(obj.get("amount_paid") or 0) / 100
            await db.teacher_fee_payments.update_one({"_id": obj.get("id")}, {"$setOnInsert": {
                "id": obj.get("id"), "teacher_id": t["id"], "amount": amount, "currency": obj.get("currency"), "paid_at": now_utc().isoformat()}}, upsert=True)


STRIPE_HOOKS.append(_teacher_stripe_hook)


# ---------------------------------------------------------------------------
# Admin

def _cert_id(n: int) -> str:
    return f"TY-{now_utc().year}-{n:04d}"


@api.get("/admin/teachers")
async def admin_teachers(request: Request, status: Optional[str] = None):
    await require_role(request, ["admin"])
    tiers = await _tiers()
    rows = await db.teachers.find({"status": status} if status else {}, {"_id": 0}).sort("created_at", -1).to_list(2000)
    out = []
    year = now_utc().year
    for t in rows:
        inc = await _income(t["id"], year)
        fees = await db.teacher_fee_payments.find({"teacher_id": t["id"], "paid_at": {"$gte": f"{year}-01-01"}}, {"_id": 0, "amount": 1}).to_list(100)
        out.append({**{k: v for k, v in t.items() if k != "tax"}, "has_tax_details": bool(t.get("tax")), "listed": listed(t, tiers), "fee_ok": fee_ok(t, tiers),
                    "students": await db.teacher_students.count_documents({"teacher_id": t["id"]}),
                    "offerings": await db.teacher_offerings.count_documents({"teacher_id": t["id"], "active": True}),
                    "income_year": inc["total"], "fees_year": round(sum(f["amount"] for f in fees), 2)})
    return {"teachers": out, "tiers": list(tiers.values()), "enabled": bool(await get_setting("teachers_enabled"))}


@api.get("/admin/teachers/{teacher_id}")
async def admin_teacher(teacher_id: str, request: Request):
    await require_role(request, ["admin"])
    t = await db.teachers.find_one({"id": teacher_id}, {"_id": 0})
    if not t:
        raise HTTPException(404, "Teacher not found")
    year = now_utc().year
    return {**t, "offerings": await db.teacher_offerings.find({"teacher_id": teacher_id}, {"_id": 0}).to_list(500),
            "students": await db.teacher_students.find({"teacher_id": teacher_id}, {"_id": 0}).to_list(5000),
            "income": await _income(teacher_id, year), "ce": await db.teacher_ce_log.find({"teacher_id": teacher_id}, {"_id": 0}).sort("date", -1).to_list(500),
            "fees": await db.teacher_fee_payments.find({"teacher_id": teacher_id}, {"_id": 0}).sort("paid_at", -1).to_list(100),
            "listed": listed(t, await _tiers())}


class TeacherAdminIn(BaseModel):
    status: Optional[str] = Field(default=None, pattern="^(applied|approved|paused|removed|declined)$")
    tier_id: Optional[str] = Field(default=None, max_length=20)
    featured: Optional[bool] = None
    certificate_level: Optional[str] = Field(default=None, max_length=80)
    certificate_renews_at: Optional[str] = Field(default=None, pattern=r"^\d{4}-\d{2}-\d{2}$")
    comp_until: Optional[str] = Field(default=None, pattern=r"^(\d{4}-\d{2}-\d{2}|forever)$")  # waive the monthly fee
    end_comp: bool = False
    admin_note: Optional[str] = Field(default=None, max_length=2000)
    message: Optional[str] = Field(default=None, max_length=1000)
    verify_ce_ids: Optional[List[str]] = None


@api.patch("/admin/teachers/{teacher_id}")
async def admin_update_teacher(teacher_id: str, payload: TeacherAdminIn, request: Request):
    admin = await require_role(request, ["admin"])
    t = await db.teachers.find_one({"id": teacher_id}, {"_id": 0})
    if not t:
        raise HTTPException(404, "Teacher not found")
    update = {}
    now = now_utc()
    if payload.tier_id is not None:
        if payload.tier_id not in await _tiers():
            raise HTTPException(422, "Unknown tier")
        update["tier_id"] = payload.tier_id
    if payload.featured is not None:
        update["featured"] = payload.featured
    if payload.admin_note is not None:
        update["admin_note"] = payload.admin_note
    if payload.status:
        update["status"] = payload.status
    cert = dict(t.get("certificate") or {})
    if payload.status == "approved" and not cert.get("id"):
        n = await db.teachers.count_documents({"certificate.id": {"$regex": f"^TY-{now.year}-"}}) + 1
        while await db.teachers.find_one({"certificate.id": _cert_id(n)}):
            n += 1
        cert.update(id=_cert_id(n), issued_at=now.date().isoformat(), renews_at=(now.date() + timedelta(days=365)).isoformat(),
                    level=payload.certificate_level or cert.get("level") or "Tony-Certified teacher", issued_by=admin.get("email"))
        update["approved_at"] = now.isoformat()
    if payload.certificate_level:
        cert["level"] = payload.certificate_level
    if payload.certificate_renews_at:
        cert["renews_at"] = payload.certificate_renews_at
    if cert:
        update["certificate"] = cert
    if payload.comp_until:
        update["billing"] = {**(t.get("billing") or {}), "mode": "comped", "status": "active",
                             "paid_until": None if payload.comp_until == "forever" else f"{payload.comp_until}T23:59:59+00:00", "comped_by": admin.get("email")}
    if payload.end_comp and (t.get("billing") or {}).get("mode") == "comped":
        update["billing"] = {"mode": "none", "status": "none"}
    if update:
        await db.teachers.update_one({"id": teacher_id}, {"$set": {**update, "updated_at": now.isoformat()}})
    if payload.verify_ce_ids:
        await db.teacher_ce_log.update_many({"teacher_id": teacher_id, "id": {"$in": payload.verify_ce_ids}}, {"$set": {"status": "verified", "verified_by": admin.get("email")}})
    from notify import notify_member
    if payload.status and payload.status != t.get("status"):
        texts = {"approved": ("You're approved to teach on Tony Yoga", "Welcome! Open your Teacher Hub to set up your profile, plan and first class."),
                 "paused": ("Your teacher profile is paused", "Your profile is hidden for now. Please contact Tony Yoga."),
                 "removed": ("Your teacher profile was removed", "Please contact Tony Yoga if you have questions."),
                 "declined": ("About your teacher application", "Thank you for applying. We can't approve your profile right now.")}
        title, body = texts.get(payload.status, ("Teacher profile updated", "Your teacher profile was updated."))
        await notify_member(t["user_id"], title, (payload.message or body), "/teach")
    await db.member_audit.insert_one({"id": gen_id(), "user_id": t["user_id"], "action": "teacher_updated",
                                      "details": ", ".join(f"{k}={v}" for k, v in payload.model_dump(exclude_none=True).items() if k != "message")[:500],
                                      "admin_email": admin.get("email"), "at": now.isoformat()})
    return await db.teachers.find_one({"id": teacher_id}, {"_id": 0})


def _csv_safe(v):
    """Stop spreadsheet apps from running text that starts like a formula."""
    sv = "" if v is None else str(v)
    return "'" + sv if sv[:1] in ("=", "+", "-", "@", "\t", "\r") and not re.match(r"^-?\d+(\.\d+)?$", sv) else sv


@api.get("/admin/teachers-dac7.csv")
async def admin_dac7(request: Request, year: Optional[int] = None):
    """Yearly report of what each teacher was paid through the platform (EU DAC7; due 31 January)."""
    await require_role(request, ["admin"])
    year = year or (now_utc().year - 1 if now_utc().month == 1 else now_utc().year)
    out = io.StringIO()
    w = csv.writer(out)
    w.writerow(["teacher_id", "display_name", "legal_name", "entity", "tax_id", "vat_number", "date_of_birth", "address", "country_of_residence",
                "email", "stripe_account", "year", "q1_paid", "q2_paid", "q3_paid", "q4_paid", "q1_sales", "q2_sales", "q3_sales", "q4_sales",
                "currency", "platform_fees", "monthly_fees_paid"])
    for t in await db.teachers.find({}, {"_id": 0}).to_list(5000):
        txns = await db.payment_transactions.find({"payee_teacher_id": t["id"], "payment_status": {"$in": ["paid", "partially_refunded"]},
                                                  "completed_at": {"$gte": f"{year}-01-01", "$lt": f"{year + 1}-01-01"}}, {"_id": 0}).to_list(50000)
        if not txns:
            continue
        fees = await db.teacher_fee_payments.find({"teacher_id": t["id"], "paid_at": {"$gte": f"{year}-01-01", "$lt": f"{year + 1}-01-01"}}, {"_id": 0, "amount": 1, "currency": 1}).to_list(100)
        tax = t.get("tax") or {}
        by_cur = {}
        for x in txns:
            by_cur.setdefault(str(x.get("currency") or "eur").upper(), []).append(x)
        for cur, rows in sorted(by_cur.items()):
            q_amt, q_n = [0.0] * 4, [0] * 4
            for x in rows:
                qi = (int(str(x["completed_at"])[5:7]) - 1) // 3
                q_amt[qi] += float(x.get("amount") or 0) - float(x.get("refunded_amount") or 0)
                q_n[qi] += 1
            fee_total = sum(float(f.get("amount") or 0) for f in fees if str(f.get("currency") or "eur").upper() == cur)
            w.writerow([_csv_safe(v) for v in [t["id"], t.get("display_name"), tax.get("legal_name", ""), tax.get("entity", ""), tax.get("tax_id", ""), tax.get("vat_number", ""),
                        tax.get("date_of_birth", ""), tax.get("address", ""), tax.get("country_of_residence", ""), t.get("email"), t.get("stripe_account_id", ""),
                        year, *[f"{a:.2f}" for a in q_amt], *q_n, cur,
                        f"{sum(float(x.get('application_fee') or 0) for x in rows):.2f}", f"{fee_total:.2f}"]])
    return Response(out.getvalue(), media_type="text/csv", headers={"Content-Disposition": f'attachment; filename="tony-yoga-dac7-{year}.csv"'})


# ---------------------------------------------------------------------------
# Hourly: reminders to students, certificate renewals

_last_run = {"at": 0.0}


async def teachers_tick():
    import time
    if time.time() - _last_run["at"] < 600:
        return
    _last_run["at"] = time.time()
    now = now_utc()
    # Monthly fee paid on Stripe but the teacher never came back to the page: confirm it here.
    for t in await db.teachers.find({"billing.checkout_session_id": {"$exists": True}, "billing.mode": {"$ne": "stripe"}}, {"_id": 0}).to_list(50):
        try:
            await _confirm_teacher_fee(t, t["billing"]["checkout_session_id"])
        except Exception as exc:
            logger.info("teacher fee check skipped (%s)", type(exc).__name__)
    from notify import notify_member
    soon = (now + timedelta(minutes=75)).isoformat()
    rows = await db.teacher_enrollments.find({"kind": "class", "status": "booked", "start_time": {"$gte": now.isoformat(), "$lte": soon},
                                              "reminded_at": {"$exists": False}}, {"_id": 0}).to_list(2000)
    for e in rows:
        await notify_member(e["user_id"], "Class soon", f"{e['offering_title']} starts at {str(e['start_time'])[11:16]} UTC. Your join link is in My Yoga.", "/my-yoga",
                            email=False, dedupe_key=f"tclass:{e['id']}")
        await db.teacher_enrollments.update_one({"id": e["id"]}, {"$set": {"reminded_at": now.isoformat()}})
    in30 = (now.date() + timedelta(days=30)).isoformat()
    for t in await db.teachers.find({"status": "approved", "certificate.renews_at": {"$lte": in30}, "certificate.reminded_for": {"$ne": in30[:7]}}, {"_id": 0}).to_list(500):
        await notify_member(t["user_id"], "Your certificate renews soon", f"Your {await get_setting('teacher_certified_label') or 'Tony-Certified'} certificate renews on "
                            f"{t['certificate']['renews_at']}. Log your continuing-education hours in the Teacher Hub.", "/teach?tab=certificate")
        await db.teachers.update_one({"id": t["id"]}, {"$set": {"certificate.reminded_for": in30[:7]}})


@api.get("/me/roles")
async def my_roles(user: dict = Depends(get_current_user)):
    """Extra areas this account can open (menus): Teacher Hub, hotel partner portal."""
    t = await db.teachers.find_one({"user_id": user["id"]}, {"_id": 0, "status": 1, "slug": 1})
    partner = await db.hotel_partners.find_one({"user_ids": user["id"], "status": {"$in": ["approved", "paused"]}}, {"_id": 0, "id": 1, "name": 1})
    applied = await db.hotel_partners.find_one({"user_ids": user["id"], "status": "applied"}, {"_id": 0, "id": 1})
    return {"teacher": t, "partner": partner, "partner_pending": bool(applied)}
