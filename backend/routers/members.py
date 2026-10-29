"""Admin → Students & access ("super admin" member management) and the student's own My Yoga.

Admins can see everything about a member in one place and change it: add a student, give or
remove courses, memberships, live-class series and class credits with any start/end date,
book them into classes, re-check or confirm payments, send a login link, message them, and
import whole member lists (e.g. subscribers from Tony's old Squarespace site) from CSV/Excel.
Every change is written to `member_audit` with the admin who made it.
"""
import csv
import io
import os
import re
import secrets
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, List, Optional

from fastapi import Depends, File, Form, HTTPException, Request, UploadFile
from fastapi.responses import Response
from pydantic import AwareDatetime, BaseModel, EmailStr, Field

from access_terms import (LIFETIME_END, active_memberships, legacy_program_record, parse_dt,
                          plan_course_ids, state_of)
from core import (api, db, gen_id, gen_referral_code, get_current_user, hash_password, logger,
                  now_utc, require_role, sha256_hex)
from labels import plain, plan_name

STAFF_ROLES = ("admin", "instructor", "support")
ROLES = ("student",) + STAFF_ROLES


# ---------------------------------------------------------------------------
# Helpers

async def _admin(request: Request) -> dict:
    return await require_role(request, ["admin"])


async def _member(user_id: str) -> dict:
    user = await db.users.find_one({"id": user_id}, {"_id": 0, "password_hash": 0})
    if not user:
        raise HTTPException(404, "Student not found")
    return user


async def _audit(admin: dict, user_id: str, action: str, details: str):
    await db.member_audit.insert_one({
        "id": gen_id(), "user_id": user_id, "action": action, "details": details[:500],
        "admin_id": admin.get("id"), "admin_email": admin.get("email"), "at": now_utc().isoformat()})


def _iso(dt: datetime) -> str:
    return dt.astimezone(timezone.utc).isoformat()


class Window(BaseModel):
    """How long something lasts: lifetime, a number of days, or an end date."""
    starts_at: Optional[AwareDatetime] = None
    ends_at: Optional[AwareDatetime] = None
    days: Optional[int] = Field(default=None, ge=1, le=3650)
    lifetime: bool = False

    def resolve(self):
        start = self.starts_at or now_utc()
        if self.lifetime:
            return _iso(start), LIFETIME_END
        if self.ends_at:
            end = self.ends_at
        elif self.days:
            end = start + timedelta(days=self.days)
        else:
            raise HTTPException(422, "Choose how long: lifetime, a number of days, or an end date.")
        if end <= start:
            raise HTTPException(422, "The end date must be after the start date.")
        return _iso(start), _iso(end)


def _fmt_date(value) -> str:
    if not value:
        return ""
    if str(value).startswith("2099"):
        return "lifetime"
    dt = parse_dt(value)
    return dt.strftime("%d %b %Y") if dt else str(value)[:10]


async def _notify(user_id, title, body, url, notify=True, email=True):
    if not notify:
        return
    try:
        from notify import notify_member
        await notify_member(user_id, title, body, url, email=email)
    except Exception as exc:
        logger.warning("member notification failed (%s)", type(exc).__name__)


def _sub_state(row) -> str:
    if row.get("status") not in ("active", "trialing"):
        return "cancelled" if row.get("status") == "cancelled" else (row.get("status") or "inactive")
    start, end = parse_dt(row.get("start_date")), parse_dt(row.get("end_date"))
    now = now_utc()
    if not start or not end or now >= end:
        return "expired"
    return "upcoming" if now < start else "active"


async def _invite_link(user: dict, hours: int = 72) -> str:
    """A one-time link that signs the member in on the set-password page."""
    token = secrets.token_urlsafe(32)
    await db.password_reset_tokens.insert_one({
        "id": gen_id(), "user_id": user["id"], "token_sha": sha256_hex(token),
        "expires_at": (now_utc() + timedelta(hours=hours)).isoformat(), "used": False, "kind": "invite"})
    base = (os.environ.get("FRONTEND_URL") or "").rstrip("/") or "https://tonyoga.com"
    return f"{base}/reset-password?token={token}&welcome=1"


async def _send_invite(user: dict, url: str, intro: Optional[str] = None):
    try:
        from email_service import send_email, _wrap
        first = (user.get("name") or "").split(" ")[0] or "there"
        body = (f"Hi {first},<br/><br/>" + (intro or "Your Tony Yoga account is ready.")
                + "<br/><br/>Tap the button to choose your password and sign in. The link works for 3 days.")
        await send_email(user["email"], "Your Tony Yoga account is ready", _wrap("Welcome to Tony Yoga.", body, "Set my password", url),
                         f"Your Tony Yoga account is ready. Set your password: {url}")
    except Exception as exc:
        logger.warning("invite email failed (%s)", type(exc).__name__)


# ---------------------------------------------------------------------------
# What a member has (shared by the admin detail view and the student's My Yoga page)

async def member_courses(user_id: str) -> List[dict]:
    programs = {p["id"]: p for p in await db.programs.find({}, {"_id": 0, "id": 1, "title": 1, "cover_image": 1, "price_model": 1, "main_video_url": 1}).to_list(1000)}
    grants = await db.access_grants.find({"user_id": user_id, "kind": "program"}, {"_id": 0}).sort("ends_at", -1).to_list(1000)
    out: Dict[str, dict] = {}

    def row(pid):
        p = programs.get(pid) or {}
        return out.setdefault(pid, {"program_id": pid, "title": p.get("title") or "Course (removed)", "cover_image": p.get("cover_image"),
                                    "state": "none", "has_access": False, "sources": [], "grants": [], "starts_at": None, "ends_at": None})

    rank = {"active": 4, "upcoming": 2, "expired": 1, "revoked": 0}
    for g in grants:
        r = row(g["target_id"])
        st = state_of(g)
        r["grants"].append({"id": g["id"], "state": st, "starts_at": g.get("starts_at"), "ends_at": g.get("ends_at"),
                            "source": g.get("source") or ("purchase" if g.get("transaction_id") else "admin"), "note": g.get("note")})
        if rank.get(st, 0) > rank.get(r["state"], 0):
            r.update(state=st, starts_at=g.get("starts_at"), ends_at=g.get("ends_at"))
        if st == "active":
            r["has_access"] = True
    # Lifetime purchases from before fixed-term access existed.
    legacy_ids = {e["program_id"] for e in await db.program_enrollments.find({"user_id": user_id, "access_version": {"$exists": False}, "revoked_at": {"$exists": False}}, {"_id": 0, "program_id": 1}).to_list(500)}
    legacy_ids |= {t["item_id"] for t in await db.payment_transactions.find({"user_id": user_id, "item_type": "program", "payment_status": "paid", "access_snapshot": {"$exists": False}, "access_revoked_at": {"$exists": False}}, {"_id": 0, "item_id": 1}).to_list(500)}
    for pid in legacy_ids:
        if pid in programs:
            r = row(pid)
            r["sources"].append("lifetime purchase")
            r.update(has_access=True, state="active", ends_at=LIFETIME_END)
    # Courses included in an active membership.
    for sub in await active_memberships(user_id):
        plan = await db.membership_plans.find_one({"id": sub.get("plan_id")}, {"_id": 0}) or {}
        ids = await plan_course_ids(plan, user_id)
        ids = set(programs) if ids is None else set(ids)
        ids |= {pid for pid, p in programs.items() if p.get("price_model") == "membership"}
        for pid in ids:
            if pid not in programs:
                continue
            r = row(pid)
            r["sources"].append(f"{plan_name(plan)} membership")
            if not r["has_access"]:
                r.update(has_access=True, state="active", starts_at=sub.get("start_date"), ends_at=sub.get("end_date"))
    for pid, p in programs.items():
        if p.get("price_model") == "free" and pid in out:
            out[pid]["has_access"] = True
    for r in out.values():
        if r["grants"]:
            r["sources"].extend(sorted({g["source"] for g in r["grants"] if g["state"] in ("active", "upcoming")}))
        r["sources"] = list(dict.fromkeys(r["sources"]))
        r["has_main_video"] = bool((programs.get(r["program_id"]) or {}).get("main_video_url"))
    rows = list(out.values())
    rows.sort(key=lambda r: (not r["has_access"], r["title"].lower()))
    return rows


async def member_memberships(user_id: str) -> List[dict]:
    rows = await db.subscriptions.find({"user_id": user_id}, {"_id": 0}).sort("end_date", -1).to_list(100)
    plans = {p["id"]: p for p in await db.membership_plans.find({}, {"_id": 0}).to_list(200)}
    out = []
    for r in rows:
        plan = plans.get(r.get("plan_id")) or {}
        picks = await db.membership_picks.find({"user_id": user_id, "plan_id": r.get("plan_id"), "removed_at": {"$exists": False}}, {"_id": 0}).to_list(20)
        out.append({**r, "plan_name": plan_name(plan) if plan else "Membership", "state": _sub_state(r),
                    "currency": plan.get("currency"), "price": plan.get("price"), "billing_cycle": plan.get("billing_cycle"),
                    "includes": plan_includes(plan), "choose_courses": int(plan.get("choose_courses") or 0), "picks": picks})
    return out


def plan_includes(plan: dict) -> List[str]:
    if not plan:
        return []
    items = []
    if plan.get("includes_all_courses"):
        items.append("All courses")
    elif plan.get("included_program_ids"):
        items.append(f"{len(plan['included_program_ids'])} course(s)")
    if int(plan.get("choose_courses") or 0) > 0:
        items.append(f"{int(plan['choose_courses'])} course(s) of your choice")
    if plan.get("includes_library", True):
        items.append("On-demand library")
    if plan.get("includes_live_classes", True):
        per_week = int(plan.get("live_classes_per_week") or 0)
        items.append(f"{per_week} live classes / week" if per_week else "Unlimited live classes")
    return items


async def _class_access(user_id: str) -> List[dict]:
    rows = await db.access_grants.find({"user_id": user_id, "kind": {"$in": ["class_template", "class_instance"]}}, {"_id": 0}).sort("ends_at", -1).to_list(200)
    return [{**r, "state": state_of(r)} for r in rows]


async def _bookings(user_id: str, limit: int = 30) -> List[dict]:
    rows = await db.bookings.find({"user_id": user_id}, {"_id": 0}).sort("created_at", -1).to_list(limit)
    ids = [r["class_instance_id"] for r in rows]
    classes = {c["id"]: c for c in await db.class_instances.find({"id": {"$in": ids}}, {"_id": 0, "id": 1, "title": 1, "start_time": 1, "end_time": 1, "location_type": 1}).to_list(limit)}
    out = []
    for r in rows:
        c = classes.get(r["class_instance_id"]) or {}
        out.append({"id": r["id"], "status": r.get("status"), "class_instance_id": r["class_instance_id"], "title": c.get("title") or "Class",
                    "start_time": c.get("start_time"), "location_type": c.get("location_type"), "access_source": r.get("access_source"),
                    "checked_in": bool(r.get("check_in_flag"))})
    out.sort(key=lambda b: str(b.get("start_time") or ""), reverse=True)
    return out


async def payment_rows(query: dict, limit: int = 200) -> List[dict]:
    from routers.payments import _receipt_description
    rows = await db.payment_transactions.find(query, {"_id": 0, "access_snapshot": 0}).sort("created_at", -1).to_list(limit)
    out = []
    for t in rows:
        desc = await _receipt_description(t)
        out.append({"id": t["id"], "user_id": t.get("user_id"), "user_email": t.get("user_email"), "description": desc,
                    "amount": t.get("amount"), "currency": str(t.get("currency") or "").upper(), "provider": t.get("provider") or "stripe",
                    "payment_status": t.get("payment_status"), "status": t.get("status"), "created_at": t.get("created_at"),
                    "completed_at": t.get("completed_at"), "item_type": t.get("item_type"), "item_id": t.get("item_id"),
                    "reference": t.get("session_id"), "last_check_result": t.get("last_check_result"),
                    "marked_paid_by": t.get("marked_paid_by"), "delivered": bool(t.get("after_payment_at") or t.get("fulfilled_at")),
                    "confirmed": t.get("payment_status") == "paid"})
    return out


# ---------------------------------------------------------------------------
# List + detail

@api.get("/admin/members")
async def list_members(request: Request, q: str = "", segment: str = "students", page: int = 1, limit: int = 50):
    await _admin(request)
    rows, counts = await _member_rows(q, segment)
    limit = max(10, min(200, int(limit)))
    start = (max(1, int(page)) - 1) * limit
    return {"rows": rows[start:start + limit], "total": len(rows), "page": page, "limit": limit, "counts": counts}


@api.get("/admin/members/export.csv")
async def admin_export_members(request: Request, segment: str = "all", q: str = ""):
    await _admin(request)
    rows, _ = await _member_rows(q, segment)
    buf = io.StringIO()
    w = csv.writer(buf)
    w.writerow(["name", "email", "phone", "role", "joined", "membership", "membership_ends", "courses", "class_credits", "blocked"])
    for r in rows:
        m = r.get("membership") or {}
        w.writerow([r.get("name") or "", r.get("email") or "", r.get("phone") or "", r.get("role"), str(r.get("created_at") or "")[:10],
                    m.get("plan_name") or "", str(m.get("ends_at") or "")[:10], r.get("courses"), r.get("credits"), "" if r.get("active") else "yes"])
    return Response(buf.getvalue(), media_type="text/csv", headers={"Content-Disposition": 'attachment; filename="tony-yoga-students.csv"'})


async def _member_rows(q: str, segment: str):
    query: Dict[str, Any] = {}
    if q.strip():
        rx = re.escape(q.strip())
        query["$or"] = [{"email": {"$regex": rx, "$options": "i"}}, {"name": {"$regex": rx, "$options": "i"}}, {"phone": {"$regex": rx, "$options": "i"}}]
    if segment == "staff":
        query["role"] = {"$in": list(STAFF_ROLES)}
    elif segment != "all":
        query["role"] = {"$nin": list(STAFF_ROLES)}
    users = await db.users.find(query, {"_id": 0, "password_hash": 0}).sort("created_at", -1).to_list(20000)
    now = now_utc()
    subs: Dict[str, dict] = {}
    plans = {p["id"]: p for p in await db.membership_plans.find({}, {"_id": 0}).to_list(200)}
    for s in await db.subscriptions.find({"status": {"$in": ["active", "trialing"]}}, {"_id": 0}).to_list(50000):
        start, end = parse_dt(s.get("start_date")), parse_dt(s.get("end_date"))
        if start and end and start <= now < end:
            cur = subs.get(s["user_id"])
            if not cur or str(s.get("end_date")) > str(cur.get("end_date")):
                subs[s["user_id"]] = s
    courses: Dict[str, set] = {}
    for g in await db.access_grants.find({"kind": "program", "revoked_at": {"$in": [None, ""]}}, {"_id": 0, "user_id": 1, "target_id": 1, "starts_at": 1, "ends_at": 1, "revoked_at": 1}).to_list(100000):
        if state_of(g) == "active":
            courses.setdefault(g["user_id"], set()).add(g["target_id"])
    for e in await db.program_enrollments.find({"access_version": {"$exists": False}, "revoked_at": {"$exists": False}}, {"_id": 0, "user_id": 1, "program_id": 1}).to_list(100000):
        courses.setdefault(e["user_id"], set()).add(e["program_id"])
    credits: Dict[str, int] = {}
    for p in await db.class_passes.find({"active": True, "remaining": {"$gt": 0}}, {"_id": 0, "user_id": 1, "remaining": 1}).to_list(100000):
        credits[p["user_id"]] = credits.get(p["user_id"], 0) + int(p.get("remaining") or 0)
    recent = (now - timedelta(days=3)).isoformat()
    unconfirmed = {t["user_id"] for t in await db.payment_transactions.find(
        {"payment_status": {"$ne": "paid"}, "status": {"$nin": ["expired", "cancelled", "failed"]}, "created_at": {"$gte": recent}},
        {"_id": 0, "user_id": 1}).to_list(5000)}
    rows = []
    for u in users:
        uid = u["id"]
        sub = subs.get(uid)
        r = {"id": uid, "name": u.get("name"), "email": u.get("email"), "phone": u.get("phone"), "role": u.get("role", "student"),
             "active": u.get("active", True) is not False, "created_at": u.get("created_at"), "source": u.get("source"),
             "membership": {"plan_name": plan_name(plans.get(sub.get("plan_id"))), "ends_at": sub.get("end_date"), "source": sub.get("source")} if sub else None,
             "courses": len(courses.get(uid, ())), "credits": credits.get(uid, 0), "unconfirmed_payment": uid in unconfirmed}
        rows.append(r)
    if segment == "members":
        rows = [r for r in rows if r["membership"]]
    elif segment == "courses":
        rows = [r for r in rows if r["courses"]]
    elif segment == "no_access":
        rows = [r for r in rows if not r["membership"] and not r["courses"] and not r["credits"]]
    elif segment == "imported":
        rows = [r for r in rows if (r.get("source") or "").startswith(("import", "legacy"))]
    elif segment == "issues":
        rows = [r for r in rows if r["unconfirmed_payment"]]
    return rows, {"members": len(subs), "unconfirmed_payments": len(unconfirmed)}


@api.get("/admin/members/{user_id}")
async def member_detail(user_id: str, request: Request):
    await _admin(request)
    user = await db.users.find_one({"id": user_id}, {"_id": 0})
    if not user:
        raise HTTPException(404, "Student not found")
    has_password = bool(user.pop("password_hash", None))
    payments = await payment_rows({"user_id": user_id}, 100)
    orders = await db.orders.find({"user_id": user_id}, {"_id": 0}).sort("created_at", -1).to_list(100)
    return {
        "user": {**user, "has_password": has_password},
        "memberships": await member_memberships(user_id),
        "courses": await member_courses(user_id),
        "class_access": await _class_access(user_id),
        "passes": await db.class_passes.find({"user_id": user_id}, {"_id": 0}).sort("created_at", -1).to_list(100),
        "bookings": await _bookings(user_id, 40),
        "trainings": await db.teacher_training_registrations.find({"user_id": user_id}, {"_id": 0}).sort("created_at", -1).to_list(50),
        "retreats": await db.workshop_registrations.find({"user_id": user_id}, {"_id": 0}).sort("created_at", -1).to_list(50),
        "private_sessions": await db.private_session_requests.find({"user_id": user_id}, {"_id": 0}).sort("created_at", -1).to_list(50),
        "payments": payments,
        "orders": orders,
        "notifications": await db.user_notifications.find({"user_id": user_id}, {"_id": 0}).sort("created_at", -1).to_list(20),
        "audit": await db.member_audit.find({"user_id": user_id}, {"_id": 0}).sort("at", -1).to_list(80),
        "devices": {"phones": await db.device_tokens.count_documents({"user_id": user_id, "active": True}),
                    "browsers": await db.push_subscriptions.count_documents({"user_id": user_id, "active": True})},
        "store_credit": round(float(user.get("store_credit") or 0), 2),
    }


# ---------------------------------------------------------------------------
# Create / edit a member

class MemberCreate(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    email: EmailStr
    phone: Optional[str] = Field(default=None, max_length=40)
    password: Optional[str] = Field(default=None, min_length=8, max_length=128)
    send_invite: bool = True
    note: Optional[str] = Field(default=None, max_length=500)


async def create_member(name: str, email: str, *, phone=None, password=None, source="admin", batch_id=None, note=None) -> dict:
    user = {
        "id": gen_id(), "email": email.lower().strip(), "name": name.strip() or email.split("@")[0],
        "role": "student", "timezone": "UTC", "level": "beginner", "goals": [], "source": source,
        "referral_code": gen_referral_code(name or email.split("@")[0]), "referred_by": None,
        "created_at": now_utc().isoformat(), "active": True,
    }
    if phone:
        user["phone"] = phone.strip()
    if password:
        user["password_hash"] = hash_password(password)
    if batch_id:
        user["import_batch_id"] = batch_id
    if note:
        user["admin_note"] = note
    await db.users.insert_one(user)
    user.pop("_id", None)
    user.pop("password_hash", None)
    return user


@api.post("/admin/members")
async def admin_create_member(payload: MemberCreate, request: Request):
    admin = await _admin(request)
    email = payload.email.lower()
    existing = await db.users.find_one({"email": email}, {"_id": 0, "id": 1})
    if existing:
        raise HTTPException(409, f"A student with {email} already exists.")
    user = await create_member(payload.name, email, phone=payload.phone, password=payload.password, note=payload.note)
    invite_url = None
    if not payload.password:
        invite_url = await _invite_link(user)
        if payload.send_invite:
            await _send_invite(user, invite_url)
    await _audit(admin, user["id"], "created", f"Account created by admin{' (invite emailed)' if payload.send_invite and invite_url else ''}")
    return {"user": user, "invite_url": invite_url}


class MemberPatch(BaseModel):
    name: Optional[str] = Field(default=None, min_length=1, max_length=120)
    email: Optional[EmailStr] = None
    phone: Optional[str] = Field(default=None, max_length=40)
    role: Optional[str] = None
    active: Optional[bool] = None
    admin_note: Optional[str] = Field(default=None, max_length=2000)
    store_credit: Optional[float] = Field(default=None, ge=0, le=100000)


@api.patch("/admin/members/{user_id}")
async def admin_update_member(user_id: str, payload: MemberPatch, request: Request):
    admin = await _admin(request)
    user = await _member(user_id)
    update, changes = {}, []
    data = payload.model_dump(exclude_unset=True)
    if "email" in data and data["email"]:
        email = data["email"].lower()
        if email != user["email"]:
            if await db.users.find_one({"email": email, "id": {"$ne": user_id}}):
                raise HTTPException(409, "Another account already uses that email.")
            update["email"] = email
            changes.append(f"email {user['email']} → {email}")
    if data.get("role") is not None:
        if data["role"] not in ROLES:
            raise HTTPException(422, "Role must be student, instructor, support or admin.")
        if user_id == admin["id"] and data["role"] != "admin":
            raise HTTPException(409, "You can't remove your own admin role.")
        if data["role"] != user.get("role"):
            update["role"] = data["role"]
            changes.append(f"role → {data['role']}")
    if data.get("active") is not None:
        if user_id == admin["id"] and not data["active"]:
            raise HTTPException(409, "You can't block your own account.")
        update["active"] = bool(data["active"])
        changes.append("unblocked" if data["active"] else "blocked from signing in")
    for key in ("name", "phone", "admin_note"):
        if key in data and data[key] is not None and data[key] != user.get(key):
            update[key] = data[key].strip() if isinstance(data[key], str) else data[key]
            changes.append(f"{key.replace('_', ' ')} updated")
    if data.get("store_credit") is not None:
        update["store_credit"] = round(float(data["store_credit"]), 2)
        changes.append(f"store credit set to {update['store_credit']:.2f}")
    if update:
        await db.users.update_one({"id": user_id}, {"$set": update})
        await _audit(admin, user_id, "profile", "; ".join(changes))
    return await _member(user_id)


@api.post("/admin/members/{user_id}/login-link")
async def admin_login_link(user_id: str, request: Request, send_email: bool = True):
    """A set-password / sign-in link the admin can email or copy into WhatsApp."""
    admin = await _admin(request)
    user = await _member(user_id)
    url = await _invite_link(user)
    if send_email:
        await _send_invite(user, url, "Here is your link to sign in to Tony Yoga.")
    await _audit(admin, user_id, "login_link", "Sign-in link created" + (" and emailed" if send_email else ""))
    return {"url": url, "emailed": send_email}


# ---------------------------------------------------------------------------
# Courses

class CourseGrantIn(Window):
    program_id: str
    note: Optional[str] = Field(default=None, max_length=300)
    notify: bool = True


async def give_course(user_id: str, program_id: str, start: str, end: str, *, source="admin", admin=None, note=None, batch_id=None) -> dict:
    program = await db.programs.find_one({"id": program_id}, {"_id": 0, "id": 1, "title": 1})
    if not program:
        raise HTTPException(404, "Course not found")
    gid = gen_id()
    grant = {"_id": gid, "id": gid, "user_id": user_id, "kind": "program", "target_id": program_id, "title": program["title"],
             "starts_at": start, "ends_at": end, "source": source, "return_path": f"/programs/{program_id}",
             "granted_by": (admin or {}).get("email"), "note": note, "created_at": now_utc().isoformat()}
    if batch_id:
        grant["import_batch_id"] = batch_id
    await db.access_grants.insert_one(grant)
    grant.pop("_id", None)
    return grant


@api.post("/admin/members/{user_id}/courses")
async def admin_give_course(user_id: str, payload: CourseGrantIn, request: Request):
    admin = await _admin(request)
    await _member(user_id)
    start, end = payload.resolve()
    grant = await give_course(user_id, payload.program_id, start, end, admin=admin, note=payload.note)
    await _audit(admin, user_id, "course_added", f"{grant['title']} · {_fmt_date(start)} → {_fmt_date(end)}")
    until = "" if end == LIFETIME_END else f" until {_fmt_date(end)}"
    await _notify(user_id, "A course was added to your account", f"{grant['title']} is ready for you{until}. Enjoy your practice!",
                  f"/programs/{payload.program_id}", payload.notify)
    return grant


class GrantUpdate(BaseModel):
    starts_at: Optional[AwareDatetime] = None
    ends_at: Optional[AwareDatetime] = None
    extend_days: Optional[int] = Field(default=None, ge=1, le=3650)
    lifetime: bool = False
    restore: bool = False


@api.patch("/admin/access-grants/{grant_id}")
async def admin_update_grant(grant_id: str, payload: GrantUpdate, request: Request):
    admin = await _admin(request)
    grant = await db.access_grants.find_one({"id": grant_id}, {"_id": 0})
    if not grant:
        raise HTTPException(404, "Access not found")
    update: Dict[str, Any] = {}
    unset: Dict[str, Any] = {}
    if payload.starts_at:
        update["starts_at"] = _iso(payload.starts_at)
    if payload.lifetime:
        update["ends_at"] = LIFETIME_END
    elif payload.ends_at:
        update["ends_at"] = _iso(payload.ends_at)
    elif payload.extend_days:
        base = max(parse_dt(grant.get("ends_at")) or now_utc(), now_utc())
        update["ends_at"] = _iso(base + timedelta(days=payload.extend_days))
    if payload.restore:
        unset = {"revoked_at": "", "revoked_by": ""}
    start = parse_dt(update.get("starts_at") or grant.get("starts_at"))
    end = parse_dt(update.get("ends_at") or grant.get("ends_at"))
    if start and end and end <= start:
        raise HTTPException(422, "The end date must be after the start date.")
    ops = {}
    if update:
        ops["$set"] = update
    if unset:
        ops["$unset"] = unset
    if ops:
        await db.access_grants.update_one({"id": grant_id}, ops)
        await _audit(admin, grant["user_id"], "access_changed",
                     f"{grant.get('title')}: {_fmt_date(update.get('starts_at') or grant.get('starts_at'))} → {_fmt_date(update.get('ends_at') or grant.get('ends_at'))}{' (restored)' if payload.restore else ''}")
    return {**grant, **update, **({"revoked_at": None} if payload.restore else {})}


@api.delete("/admin/access-grants/{grant_id}")
async def admin_revoke_grant(grant_id: str, request: Request):
    admin = await _admin(request)
    grant = await db.access_grants.find_one({"id": grant_id}, {"_id": 0})
    if not grant:
        raise HTTPException(404, "Access not found")
    await db.access_grants.update_one({"id": grant_id}, {"$set": {"revoked_at": now_utc().isoformat(), "revoked_by": admin.get("email")}})
    await _audit(admin, grant["user_id"], "access_removed", f"{grant.get('title')} removed")
    return {"ok": True}


@api.post("/admin/members/{user_id}/courses/{program_id}/remove")
async def admin_remove_course(user_id: str, program_id: str, request: Request):
    """Remove every way this member gets the course (except a membership that includes all courses)."""
    admin = await _admin(request)
    await _member(user_id)
    now = now_utc().isoformat()
    g = await db.access_grants.update_many({"user_id": user_id, "kind": "program", "target_id": program_id, "revoked_at": {"$in": [None, ""]}},
                                           {"$set": {"revoked_at": now, "revoked_by": admin.get("email")}})
    e = await db.program_enrollments.update_many({"user_id": user_id, "program_id": program_id, "revoked_at": {"$exists": False}},
                                                 {"$set": {"revoked_at": now, "revoked_by": admin.get("email")}})
    t = await db.payment_transactions.update_many({"user_id": user_id, "item_type": "program", "item_id": program_id, "access_snapshot": {"$exists": False}, "access_revoked_at": {"$exists": False}},
                                                  {"$set": {"access_revoked_at": now}})
    p = await db.membership_picks.update_many({"user_id": user_id, "program_id": program_id, "removed_at": {"$exists": False}}, {"$set": {"removed_at": now}})
    program = await db.programs.find_one({"id": program_id}, {"_id": 0, "title": 1}) or {}
    await _audit(admin, user_id, "course_removed", f"{program.get('title') or program_id} removed")
    from access_terms import program_access
    still = await program_access(user_id, program_id)
    return {"removed": g.modified_count + e.modified_count + t.modified_count + p.modified_count,
            "still_has_access": bool(still.get("has_access")),
            "reason": "Their membership includes every course — change the membership to remove it." if still.get("has_access") else None}


# ---------------------------------------------------------------------------
# Live-class series (online class templates)

class SeriesGrantIn(Window):
    template_id: str
    note: Optional[str] = Field(default=None, max_length=300)
    notify: bool = True


@api.post("/admin/members/{user_id}/class-series")
async def admin_give_series(user_id: str, payload: SeriesGrantIn, request: Request):
    admin = await _admin(request)
    await _member(user_id)
    template = await db.class_templates.find_one({"id": payload.template_id}, {"_id": 0, "id": 1, "title": 1})
    if not template:
        raise HTTPException(404, "Class series not found")
    start, end = payload.resolve()
    gid = gen_id()
    grant = {"_id": gid, "id": gid, "user_id": user_id, "kind": "class_template", "target_id": template["id"], "title": template["title"],
             "starts_at": start, "ends_at": end, "source": "admin", "return_path": "/schedule", "granted_by": admin.get("email"),
             "note": payload.note, "created_at": now_utc().isoformat()}
    await db.access_grants.insert_one(grant)
    grant.pop("_id", None)
    await _audit(admin, user_id, "classes_added", f"{template['title']} · {_fmt_date(start)} → {_fmt_date(end)}")
    await _notify(user_id, "Live classes added", f"You can now book {template['title']} classes until {_fmt_date(end)}.", "/schedule", payload.notify)
    return grant


# ---------------------------------------------------------------------------
# Memberships

class MembershipIn(Window):
    plan_id: str
    note: Optional[str] = Field(default=None, max_length=300)
    notify: bool = True


async def give_membership(user_id: str, plan: dict, start: str, end: str, *, source="admin", admin=None, note=None, batch_id=None) -> dict:
    sid = gen_id()
    row = {"_id": sid, "id": sid, "user_id": user_id, "plan_id": plan["id"], "status": "active", "start_date": start, "end_date": end,
           "next_billing_date": end, "source": source, "granted_by": (admin or {}).get("email"), "note": note,
           "created_at": now_utc().isoformat()}
    if batch_id:
        row["import_batch_id"] = batch_id
    await db.subscriptions.insert_one(row)
    row.pop("_id", None)
    return row


@api.post("/admin/members/{user_id}/memberships")
async def admin_give_membership(user_id: str, payload: MembershipIn, request: Request):
    admin = await _admin(request)
    await _member(user_id)
    plan = await db.membership_plans.find_one({"id": payload.plan_id}, {"_id": 0})
    if not plan:
        raise HTTPException(404, "Membership plan not found")
    start, end = payload.resolve()
    row = await give_membership(user_id, plan, start, end, admin=admin, note=payload.note)
    await _audit(admin, user_id, "membership_added", f"{plan_name(plan)} · {_fmt_date(start)} → {_fmt_date(end)}")
    extra = " Choose your included course in My Yoga." if int(plan.get("choose_courses") or 0) else ""
    until = "" if end == LIFETIME_END else f" until {_fmt_date(end)}"
    await _notify(user_id, f"{plan_name(plan)} membership activated", f"Your {plan_name(plan)} membership is active{until}.{extra}", "/my-yoga", payload.notify)
    return row


class SubUpdate(BaseModel):
    start_date: Optional[AwareDatetime] = None
    end_date: Optional[AwareDatetime] = None
    extend_days: Optional[int] = Field(default=None, ge=1, le=3650)
    lifetime: bool = False
    status: Optional[str] = Field(default=None, pattern="^(active|cancelled)$")
    notify: bool = False


@api.patch("/admin/subscriptions/{sub_id}")
async def admin_update_subscription(sub_id: str, payload: SubUpdate, request: Request):
    admin = await _admin(request)
    sub = await db.subscriptions.find_one({"id": sub_id}, {"_id": 0})
    if not sub:
        raise HTTPException(404, "Membership not found")
    update: Dict[str, Any] = {}
    if payload.start_date:
        update["start_date"] = _iso(payload.start_date)
    if payload.lifetime:
        update["end_date"] = LIFETIME_END
    elif payload.end_date:
        update["end_date"] = _iso(payload.end_date)
    elif payload.extend_days:
        base = max(parse_dt(sub.get("end_date")) or now_utc(), now_utc())
        update["end_date"] = _iso(base + timedelta(days=payload.extend_days))
    if "end_date" in update:
        update["next_billing_date"] = update["end_date"]
    if payload.status:
        update["status"] = payload.status
        if payload.status == "cancelled":
            update["cancelled_at"] = now_utc().isoformat()
            update["cancelled_by"] = admin.get("email")
    start = parse_dt(update.get("start_date") or sub.get("start_date"))
    end = parse_dt(update.get("end_date") or sub.get("end_date"))
    if start and end and end <= start:
        raise HTTPException(422, "The end date must be after the start date.")
    if update:
        await db.subscriptions.update_one({"id": sub_id}, {"$set": update})
        plan = await db.membership_plans.find_one({"id": sub.get("plan_id")}, {"_id": 0}) or {}
        await _audit(admin, sub["user_id"], "membership_changed",
                     f"{plan_name(plan)}: {payload.status or 'dates'} · {_fmt_date(update.get('start_date') or sub.get('start_date'))} → {_fmt_date(update.get('end_date') or sub.get('end_date'))}")
        if payload.notify and "end_date" in update and (payload.status or "active") == "active":
            await _notify(sub["user_id"], "Your membership was updated", f"Your {plan_name(plan)} membership now runs until {_fmt_date(update['end_date'])}.", "/my-yoga")
    warning = None
    if payload.status == "cancelled" and sub.get("stripe_subscription_id"):
        warning = "This member pays automatically through Stripe. Also cancel the subscription in your Stripe dashboard so they aren't charged again."
    return {**sub, **update, "warning": warning}


class PickIn(BaseModel):
    plan_id: str
    program_id: str


async def _add_pick(user_id: str, plan: dict, program_id: str, by: str) -> dict:
    allowed = int(plan.get("choose_courses") or 0)
    if allowed <= 0:
        raise HTTPException(409, "This membership doesn't include a course of your choice.")
    choices = plan.get("choosable_program_ids") or []
    if choices and program_id not in choices:
        raise HTTPException(409, "That course can't be chosen with this membership.")
    if not await db.programs.find_one({"id": program_id}, {"_id": 0, "id": 1}):
        raise HTTPException(404, "Course not found")
    current = await db.membership_picks.find({"user_id": user_id, "plan_id": plan["id"], "removed_at": {"$exists": False}}, {"_id": 0}).to_list(50)
    if any(p["program_id"] == program_id for p in current):
        return next(p for p in current if p["program_id"] == program_id)
    if len(current) >= allowed:
        raise HTTPException(409, f"You've already chosen {allowed} course(s) with this membership. Contact us to swap.")
    pid = gen_id()
    pick = {"_id": pid, "id": pid, "user_id": user_id, "plan_id": plan["id"], "program_id": program_id, "picked_by": by, "picked_at": now_utc().isoformat()}
    await db.membership_picks.insert_one(pick)
    pick.pop("_id", None)
    return pick


@api.post("/admin/members/{user_id}/plan-picks")
async def admin_add_pick(user_id: str, payload: PickIn, request: Request):
    admin = await _admin(request)
    await _member(user_id)
    plan = await db.membership_plans.find_one({"id": payload.plan_id}, {"_id": 0})
    if not plan:
        raise HTTPException(404, "Membership plan not found")
    pick = await _add_pick(user_id, plan, payload.program_id, admin.get("email"))
    program = await db.programs.find_one({"id": payload.program_id}, {"_id": 0, "title": 1}) or {}
    await _audit(admin, user_id, "course_chosen", f"{program.get('title')} chosen for {plan_name(plan)}")
    return pick


@api.delete("/admin/plan-picks/{pick_id}")
async def admin_remove_pick(pick_id: str, request: Request):
    admin = await _admin(request)
    pick = await db.membership_picks.find_one({"id": pick_id}, {"_id": 0})
    if not pick:
        raise HTTPException(404, "Choice not found")
    await db.membership_picks.update_one({"id": pick_id}, {"$set": {"removed_at": now_utc().isoformat()}})
    program = await db.programs.find_one({"id": pick["program_id"]}, {"_id": 0, "title": 1}) or {}
    await _audit(admin, pick["user_id"], "course_choice_removed", f"{program.get('title')} choice removed (member can choose again)")
    return {"ok": True}


# ---------------------------------------------------------------------------
# Class credits and bookings

class CreditsIn(BaseModel):
    credits: int = Field(ge=1, le=500)
    note: Optional[str] = Field(default=None, max_length=300)
    notify: bool = True


@api.post("/admin/members/{user_id}/credits")
async def admin_give_credits(user_id: str, payload: CreditsIn, request: Request):
    admin = await _admin(request)
    await _member(user_id)
    pid = gen_id()
    row = {"_id": pid, "id": pid, "user_id": user_id, "active": True, "remaining": payload.credits, "source": "admin",
           "granted_by": admin.get("email"), "note": payload.note, "created_at": now_utc().isoformat()}
    await db.class_passes.insert_one(row)
    row.pop("_id", None)
    await _audit(admin, user_id, "credits_added", f"{payload.credits} class credit(s)")
    await _notify(user_id, "Class credits added", f"{payload.credits} class credit(s) were added to your account. Book any class you like.", "/schedule", payload.notify)
    return row


class PassUpdate(BaseModel):
    remaining: Optional[int] = Field(default=None, ge=0, le=1000)
    active: Optional[bool] = None


@api.patch("/admin/class-passes/{pass_id}")
async def admin_update_pass(pass_id: str, payload: PassUpdate, request: Request):
    admin = await _admin(request)
    row = await db.class_passes.find_one({"id": pass_id}, {"_id": 0})
    if not row:
        raise HTTPException(404, "Credits not found")
    update = payload.model_dump(exclude_unset=True, exclude_none=True)
    if update:
        await db.class_passes.update_one({"id": pass_id}, {"$set": update})
        await _audit(admin, row["user_id"], "credits_changed", f"credits {row.get('remaining')} → {update.get('remaining', row.get('remaining'))}{'' if update.get('active', True) else ' (switched off)'}")
    return {**row, **update}


class BookingIn(BaseModel):
    class_instance_id: str
    notify: bool = True


@api.post("/admin/members/{user_id}/bookings")
async def admin_book_class(user_id: str, payload: BookingIn, request: Request):
    """Book a member into a class without payment (seat is held even if the class is full)."""
    admin = await _admin(request)
    user = await _member(user_id)
    from operation_lock import operation_lock
    async with operation_lock(f"class-booking:{payload.class_instance_id}"):
        instance = await db.class_instances.find_one({"id": payload.class_instance_id}, {"_id": 0})
        if not instance or instance.get("status") == "cancelled":
            raise HTTPException(404, "Class not found or cancelled")
        if await db.bookings.find_one({"user_id": user_id, "class_instance_id": payload.class_instance_id, "status": {"$in": ["confirmed", "waitlist"]}}):
            raise HTTPException(409, "Already booked into this class.")
        await db.class_instances.update_one({"id": payload.class_instance_id}, {"$inc": {"bookings_count": 1}})
        booking = {"id": gen_id(), "user_id": user_id, "class_instance_id": payload.class_instance_id, "status": "confirmed",
                   "check_in_flag": False, "created_at": now_utc().isoformat(), "access_source": "admin", "booked_by": admin.get("email")}
        await db.bookings.insert_one(booking)
        booking.pop("_id", None)
    when = _fmt_date(instance.get("start_time"))
    start = parse_dt(instance.get("start_time"))
    if start:
        when = start.strftime("%A %d %b, %H:%M UTC")
    await _audit(admin, user_id, "booked", f"{instance.get('title')} · {when}")
    await _notify(user_id, "You're booked", f"{instance.get('title')} · {when}", f"/schedule/{payload.class_instance_id}", payload.notify)
    return booking


@api.delete("/admin/bookings/{booking_id}")
async def admin_cancel_booking(booking_id: str, request: Request):
    admin = await _admin(request)
    booking = await db.bookings.find_one({"id": booking_id}, {"_id": 0})
    if not booking:
        raise HTTPException(404, "Booking not found")
    from routers.scheduling import _cancel_booking
    from operation_lock import operation_lock
    async with operation_lock(f"class-booking:{booking['class_instance_id']}"):
        await _cancel_booking(booking_id, {"id": booking["user_id"]})
    instance = await db.class_instances.find_one({"id": booking["class_instance_id"]}, {"_id": 0, "title": 1}) or {}
    await _audit(admin, booking["user_id"], "booking_cancelled", f"{instance.get('title') or 'Class'} booking cancelled")
    return {"ok": True}


# ---------------------------------------------------------------------------
# Messages

class MessageIn(BaseModel):
    title: str = Field(min_length=1, max_length=120)
    body: str = Field(min_length=1, max_length=2000)
    url: str = Field(default="/my-yoga", max_length=300)
    email: bool = True


@api.post("/admin/members/{user_id}/notify")
async def admin_message_member(user_id: str, payload: MessageIn, request: Request):
    admin = await _admin(request)
    await _member(user_id)
    url = payload.url if payload.url.startswith("/") else "/my-yoga"
    from notify import notify_member
    await notify_member(user_id, payload.title, payload.body, url, email=payload.email)
    await _audit(admin, user_id, "message", payload.title)
    return {"ok": True}


# ---------------------------------------------------------------------------
# Payments: see every payment, re-check with Stripe/PayPal, confirm offline payments

@api.get("/admin/payments")
async def admin_payments(request: Request, status: str = "all", q: str = "", days: int = 90):
    await _admin(request)
    query: Dict[str, Any] = {"created_at": {"$gte": (now_utc() - timedelta(days=max(1, min(3650, days)))).isoformat()}}
    if status == "unconfirmed":
        query.update({"payment_status": {"$ne": "paid"}, "status": {"$nin": ["expired", "cancelled", "failed"]}})
    elif status == "paid":
        query["payment_status"] = "paid"
    elif status == "abandoned":
        query.update({"payment_status": {"$ne": "paid"}, "status": {"$in": ["expired", "cancelled", "failed"]}})
    if q.strip():
        rx = re.escape(q.strip())
        query["$or"] = [{"user_email": {"$regex": rx, "$options": "i"}}, {"session_id": {"$regex": rx, "$options": "i"}}]
    rows = await payment_rows(query, 500)
    return {"rows": rows}


@api.post("/admin/payments/{txn_id}/recheck")
async def admin_recheck_payment(txn_id: str, request: Request):
    admin = await _admin(request)
    txn = await db.payment_transactions.find_one({"id": txn_id}, {"_id": 0})
    if not txn:
        raise HTTPException(404, "Payment not found")
    from routers.payments import reconcile_transaction
    result = await reconcile_transaction(txn)
    await db.payment_transactions.update_one({"id": txn_id}, {"$set": {"last_checked_at": now_utc().isoformat(), "last_check_result": result.get("detail")}})
    await _audit(admin, txn.get("user_id"), "payment_rechecked", result.get("detail") or "")
    return result


class MarkPaidIn(BaseModel):
    note: str = Field(min_length=3, max_length=300)


@api.post("/admin/payments/{txn_id}/mark-paid")
async def admin_mark_paid(txn_id: str, payload: MarkPaidIn, request: Request):
    """For money received another way (bank transfer, cash, confirmed in the PayPal/Stripe dashboard)."""
    admin = await _admin(request)
    txn = await db.payment_transactions.find_one({"id": txn_id}, {"_id": 0})
    if not txn:
        raise HTTPException(404, "Payment not found")
    if txn.get("payment_status") == "paid":
        raise HTTPException(409, "This payment is already confirmed.")
    await db.payment_transactions.update_one({"id": txn_id}, {"$set": {
        "payment_status": "paid", "status": "complete", "completed_at": now_utc().isoformat(),
        "marked_paid_by": admin.get("email"), "marked_paid_note": payload.note}})
    from routers.payments import _fulfill_payment
    await _fulfill_payment(await db.payment_transactions.find_one({"id": txn_id}, {"_id": 0}))
    if txn.get("provider") == "paypal":
        await db.payment_transactions.update_one({"id": txn_id}, {"$set": {"fulfilled_at": now_utc().isoformat()}})
    await _audit(admin, txn.get("user_id"), "payment_confirmed_manually", payload.note)
    return {"ok": True}


@api.post("/admin/payments/{txn_id}/redeliver")
async def admin_redeliver(txn_id: str, request: Request):
    """Run delivery again for a confirmed payment (safe: nothing is given twice)."""
    admin = await _admin(request)
    txn = await db.payment_transactions.find_one({"id": txn_id}, {"_id": 0})
    if not txn or txn.get("payment_status") != "paid":
        raise HTTPException(409, "Only confirmed payments can be delivered again.")
    from routers.payments import _fulfill_payment
    await _fulfill_payment(txn)
    await _audit(admin, txn.get("user_id"), "payment_redelivered", "Delivery repeated")
    return {"ok": True}


# ---------------------------------------------------------------------------
# Bulk actions

class BulkIn(BaseModel):
    user_ids: List[str] = Field(min_length=1, max_length=2000)
    action: str = Field(pattern="^(membership|course|credits|message|extend)$")
    plan_id: Optional[str] = None
    program_id: Optional[str] = None
    credits: Optional[int] = Field(default=None, ge=1, le=500)
    starts_at: Optional[AwareDatetime] = None
    ends_at: Optional[AwareDatetime] = None
    days: Optional[int] = Field(default=None, ge=1, le=3650)
    lifetime: bool = False
    title: Optional[str] = Field(default=None, max_length=120)
    body: Optional[str] = Field(default=None, max_length=2000)
    notify: bool = True


@api.post("/admin/members/bulk")
async def admin_bulk(payload: BulkIn, request: Request):
    admin = await _admin(request)
    window = Window(starts_at=payload.starts_at, ends_at=payload.ends_at, days=payload.days, lifetime=payload.lifetime)
    users = await db.users.find({"id": {"$in": payload.user_ids}}, {"_id": 0, "id": 1}).to_list(len(payload.user_ids))
    done = 0
    plan = program = None
    if payload.action == "membership":
        plan = await db.membership_plans.find_one({"id": payload.plan_id}, {"_id": 0})
        if not plan:
            raise HTTPException(404, "Choose a membership plan.")
    if payload.action == "course":
        program = await db.programs.find_one({"id": payload.program_id}, {"_id": 0})
        if not program:
            raise HTTPException(404, "Choose a course.")
    if payload.action == "message" and not (payload.title and payload.body):
        raise HTTPException(422, "Write a title and a message.")
    if payload.action == "credits" and not payload.credits:
        raise HTTPException(422, "How many credits?")
    if payload.action == "extend" and not payload.days:
        raise HTTPException(422, "How many days to add?")
    from notify import notify_member
    for u in users:
        uid = u["id"]
        if payload.action == "membership":
            start, end = window.resolve()
            await give_membership(uid, plan, start, end, admin=admin)
            await _audit(admin, uid, "membership_added", f"{plan_name(plan)} · {_fmt_date(start)} → {_fmt_date(end)} (bulk)")
            if payload.notify:
                await notify_member(uid, f"{plan_name(plan)} membership activated", f"Your {plan_name(plan)} membership is active until {_fmt_date(end)}.", "/my-yoga")
        elif payload.action == "course":
            start, end = window.resolve()
            await give_course(uid, program["id"], start, end, admin=admin)
            await _audit(admin, uid, "course_added", f"{program['title']} · {_fmt_date(start)} → {_fmt_date(end)} (bulk)")
            if payload.notify:
                await notify_member(uid, "A course was added to your account", f"{program['title']} is ready for you.", f"/programs/{program['id']}")
        elif payload.action == "credits":
            pid = gen_id()
            await db.class_passes.insert_one({"_id": pid, "id": pid, "user_id": uid, "active": True, "remaining": payload.credits,
                                              "source": "admin", "granted_by": admin.get("email"), "created_at": now_utc().isoformat()})
            await _audit(admin, uid, "credits_added", f"{payload.credits} class credit(s) (bulk)")
            if payload.notify:
                await notify_member(uid, "Class credits added", f"{payload.credits} class credit(s) were added to your account.", "/schedule")
        elif payload.action == "extend":
            for sub in await active_memberships(uid):
                base = max(parse_dt(sub.get("end_date")) or now_utc(), now_utc())
                end = _iso(base + timedelta(days=payload.days))
                await db.subscriptions.update_one({"id": sub["id"]}, {"$set": {"end_date": end, "next_billing_date": end}})
                await _audit(admin, uid, "membership_changed", f"extended by {payload.days} days → {_fmt_date(end)} (bulk)")
        elif payload.action == "message":
            await notify_member(uid, payload.title, payload.body, "/my-yoga")
            await _audit(admin, uid, "message", f"{payload.title} (bulk)")
        done += 1
    return {"done": done}


# ---------------------------------------------------------------------------
# Import members (CSV or Excel), e.g. subscribers from Tony's old website

_ALIASES = {
    "email": ["email", "emailaddress", "e-mail", "mail", "customeremail", "memberemail", "useremail", "billingemail"],
    "name": ["name", "fullname", "customername", "membername", "username", "displayname", "billingname"],
    "first": ["firstname", "first", "givenname", "billingfirstname"],
    "last": ["lastname", "last", "surname", "familyname", "billinglastname"],
    "phone": ["phone", "phonenumber", "mobile", "telephone", "tel", "whatsapp", "billingphone"],
    "plan": ["plan", "membership", "membershipplan", "subscription", "subscriptionplan", "pricingplan", "tier", "memberarea",
             "memberareas", "accesstier", "product", "productname", "lineitem"],
    "courses": ["course", "courses", "program", "programs", "programme"],
    "start": ["start", "startdate", "startedon", "starts", "membersince", "joined", "joinedon", "datejoined", "createdon",
              "created", "subscribedon", "signupdate", "orderdate", "purchasedate"],
    "end": ["end", "enddate", "ends", "expires", "expiry", "expirydate", "expirationdate", "expireson", "expiration", "renews",
            "renewaldate", "renewson", "nextbillingdate", "nextpaymentdate", "validuntil", "accessuntil", "paiduntil", "until"],
    "days": ["days", "durationdays", "duration"],
    "credits": ["credits", "classcredits", "classes"],
    "status": ["status", "subscriptionstatus", "memberstatus", "state"],
    "note": ["note", "notes", "comment", "comments"],
}


def _norm(h: str) -> str:
    return re.sub(r"[^a-z0-9]", "", str(h or "").lower())


def _map_headers(headers: List[str]) -> Dict[str, str]:
    found = {}
    normed = {h: _norm(h) for h in headers}
    for field, names in _ALIASES.items():
        for h, n in normed.items():
            if n in names and field not in found and h not in found.values():
                found[field] = h
    return found


_DATE_FORMATS = ["%Y-%m-%d", "%Y-%m-%d %H:%M:%S", "%Y-%m-%dT%H:%M:%S", "%Y/%m/%d", "%d/%m/%Y", "%d-%m-%Y", "%d.%m.%Y",
                 "%d/%m/%Y %H:%M", "%d/%m/%Y %H:%M:%S", "%m/%d/%Y", "%b %d, %Y", "%B %d, %Y", "%d %b %Y", "%d %B %Y",
                 "%b %d %Y", "%a, %d %b %Y", "%Y-%m-%d %H:%M"]


def _parse_date(value) -> Optional[datetime]:
    if value in (None, ""):
        return None
    if isinstance(value, datetime):
        return value if value.tzinfo else value.replace(tzinfo=timezone.utc)
    text = str(value).strip()
    if not text:
        return None
    dt = parse_dt(text)
    if dt:
        return dt
    text = re.sub(r"\s*(UTC|GMT|[+-]\d{2}:?\d{2})$", "", text)
    m = re.match(r"^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})", text)
    if m and int(m.group(2)) > 12:  # e.g. 03/25/2025 is month-first
        try:
            return datetime(int(m.group(3)), int(m.group(1)), int(m.group(2)), tzinfo=timezone.utc)
        except ValueError:
            return None
    for fmt in _DATE_FORMATS:
        try:
            return datetime.strptime(text, fmt).replace(tzinfo=timezone.utc)
        except ValueError:
            continue
    return None


def _read_table(raw: bytes, filename: str) -> List[Dict[str, Any]]:
    if filename.lower().endswith((".xlsx", ".xlsm")):
        try:
            import openpyxl
        except ImportError:
            raise HTTPException(422, "Excel files need the openpyxl package on the server. Save the sheet as CSV and upload that instead.")
        wb = openpyxl.load_workbook(io.BytesIO(raw), read_only=True, data_only=True)
        ws = wb.worksheets[0]
        rows = list(ws.iter_rows(values_only=True))
        if not rows:
            return []
        headers = [str(h or "").strip() for h in rows[0]]
        return [{headers[i]: v for i, v in enumerate(r) if i < len(headers) and headers[i]} for r in rows[1:] if any(c not in (None, "") for c in r)]
    text = raw.decode("utf-8-sig", errors="ignore")
    sample = text[:4096]
    try:
        dialect = csv.Sniffer().sniff(sample, delimiters=",;\t")
    except csv.Error:
        dialect = csv.excel
    return [r for r in csv.DictReader(io.StringIO(text), dialect=dialect) if any((v or "").strip() for v in r.values() if isinstance(v, str))]


def _match_plan(value, plans: List[dict]) -> Optional[dict]:
    v = str(value or "").strip().lower()
    if not v:
        return None
    for p in plans:
        if v in (str(p.get("id")).lower(), plan_name(p).lower(), str(p.get("tier") or "").lower()):
            return p
    for p in plans:
        if plan_name(p).lower() in v or v in plan_name(p).lower():
            return p
    return None


def _match_courses(value, programs: List[dict]) -> List[dict]:
    out = []
    for part in re.split(r"[;|\n]", str(value or "")):
        part = part.strip().lower()
        if not part:
            continue
        hit = next((p for p in programs if part in (p["id"].lower(), p["title"].lower())), None) or \
            next((p for p in programs if part in p["title"].lower() or p["title"].lower() in part), None)
        if hit and hit not in out:
            out.append(hit)
    return out


@api.post("/admin/members/import")
async def admin_import_members(request: Request, file: UploadFile = File(...), dry_run: bool = Form(True),
                               default_plan_id: str = Form(""), default_program_ids: str = Form(""),
                               default_days: int = Form(0), default_ends_at: str = Form(""), lifetime: bool = Form(False),
                               send_invites: bool = Form(False), batch_name: str = Form("Import")):
    admin = await _admin(request)
    raw = await file.read()
    if len(raw) > 5 * 1024 * 1024:
        raise HTTPException(413, "Please upload a file smaller than 5 MB.")
    table = _read_table(raw, file.filename or "upload.csv")
    if not table:
        raise HTTPException(422, "The file has no rows.")
    if len(table) > 5000:
        raise HTTPException(422, "Import up to 5,000 rows at a time.")
    cols = _map_headers(list(table[0].keys()))
    if "email" not in cols:
        raise HTTPException(422, "Couldn't find an email column. Add a column called 'Email'.")
    plans = await db.membership_plans.find({}, {"_id": 0}).to_list(200)
    programs = await db.programs.find({}, {"_id": 0, "id": 1, "title": 1}).to_list(1000)
    default_plan = next((p for p in plans if p["id"] == default_plan_id), None) if default_plan_id else None
    default_courses = [p for p in programs if p["id"] in {x.strip() for x in default_program_ids.split(",") if x.strip()}]
    default_end = _parse_date(default_ends_at) if default_ends_at else None
    batch_id = gen_id()
    now = now_utc()
    results, seen = [], set()
    summary = {"rows": len(table), "new_accounts": 0, "existing_accounts": 0, "memberships": 0, "courses": 0, "credits": 0,
               "skipped": 0, "invites": 0}
    for i, r in enumerate(table, start=2):
        get = lambda f: r.get(cols[f]) if f in cols else None  # noqa: E731
        email = str(get("email") or "").strip().lower()
        res = {"row": i, "email": email, "actions": [], "warnings": []}
        if not re.match(r"^[^@\s]+@[^@\s]+\.[^@\s]+$", email):
            res.update(status="error", error="Missing or invalid email")
            summary["skipped"] += 1
            results.append(res)
            continue
        if email in seen:
            res.update(status="error", error="Same email appears twice in the file")
            summary["skipped"] += 1
            results.append(res)
            continue
        seen.add(email)
        name = str(get("name") or "").strip() or " ".join(str(get(k) or "").strip() for k in ("first", "last")).strip() or email.split("@")[0]
        res["name"] = name
        status_text = str(get("status") or "").strip().lower()
        inactive = status_text in ("cancelled", "canceled", "expired", "inactive", "ended", "lapsed", "refunded")
        start = _parse_date(get("start")) or now
        if start > now + timedelta(days=366):
            start = now
        days = 0
        try:
            days = int(float(get("days") or 0))
        except (TypeError, ValueError):
            days = 0
        end = _parse_date(get("end")) or default_end
        if lifetime and not end and not days:
            end_iso = LIFETIME_END
        elif end:
            end_iso = _iso(end if end.tzinfo else end.replace(tzinfo=timezone.utc))
        elif days or default_days:
            end_iso = _iso(max(start, now) + timedelta(days=days or default_days))
        else:
            end_iso = None
        plan = _match_plan(get("plan"), plans) if get("plan") else default_plan
        if get("plan") and not plan:
            res["warnings"].append(f"No membership plan matches '{get('plan')}'")
        courses = _match_courses(get("courses"), programs) if get("courses") else list(default_courses)
        if get("courses") and not courses:
            res["warnings"].append(f"No course matches '{get('courses')}'")
        try:
            credits = int(float(get("credits") or 0))
        except (TypeError, ValueError):
            credits = 0
        existing = await db.users.find_one({"email": email}, {"_id": 0, "id": 1, "name": 1, "email": 1, "password_hash": 1})
        res["status"] = "existing" if existing else "new"
        if (plan or courses) and not end_iso:
            res["warnings"].append("No end date — add an End date/Expires column or choose a default duration")
        if end_iso and end_iso != LIFETIME_END and parse_dt(end_iso) <= now:
            res["warnings"].append(f"Already ended on {_fmt_date(end_iso)} — account only")
        give_access = bool(end_iso) and not inactive and (end_iso == LIFETIME_END or parse_dt(end_iso) > now)
        if inactive:
            res["warnings"].append(f"Status '{status_text}' — account only, no access given")
        if plan and give_access:
            res["actions"].append(f"{plan_name(plan)} until {_fmt_date(end_iso)}")
        for c in courses if give_access else []:
            res["actions"].append(f"Course {c['title']} until {_fmt_date(end_iso)}")
        if credits > 0:
            res["actions"].append(f"{credits} class credit(s)")
        if dry_run:
            summary["existing_accounts" if existing else "new_accounts"] += 1
            if plan and give_access:
                summary["memberships"] += 1
            if give_access:
                summary["courses"] += len(courses)
            summary["credits"] += 1 if credits > 0 else 0
            results.append(res)
            continue
        # --- write
        try:
            if existing:
                user = existing
                summary["existing_accounts"] += 1
            else:
                phone = str(get("phone") or "").strip() or None
                user = await create_member(name, email, phone=phone, source="import", batch_id=batch_id, note=str(get("note") or "").strip() or None)
                summary["new_accounts"] += 1
            uid = user["id"]
            start_iso = _iso(min(start, now) if start <= now else start)
            if plan and give_access:
                current = [s for s in await active_memberships(uid) if s.get("plan_id") == plan["id"]]
                if current and max(str(s.get("end_date")) for s in current) >= end_iso:
                    res["actions"].append("membership already active — unchanged")
                elif current:
                    await db.subscriptions.update_one({"id": current[0]["id"]}, {"$set": {"end_date": end_iso, "next_billing_date": end_iso}})
                    summary["memberships"] += 1
                else:
                    await give_membership(uid, plan, start_iso, end_iso, source="import", admin=admin, batch_id=batch_id)
                    summary["memberships"] += 1
            for c in courses if give_access else []:
                from access_terms import program_access
                acc = await program_access(uid, c["id"])
                if acc.get("has_access") and str(acc.get("ends_at") or LIFETIME_END) >= end_iso:
                    continue
                await give_course(uid, c["id"], start_iso, end_iso, source="import", admin=admin, batch_id=batch_id)
                summary["courses"] += 1
            if credits > 0:
                pid = gen_id()
                await db.class_passes.insert_one({"_id": pid, "id": pid, "user_id": uid, "active": True, "remaining": credits, "source": "import",
                                                  "import_batch_id": batch_id, "created_at": now_utc().isoformat()})
                summary["credits"] += 1
            await _audit(admin, uid, "imported", f"{batch_name}: " + (", ".join(res["actions"]) or "account"))
            if send_invites and (not existing or not existing.get("password_hash")):
                url = await _invite_link(user, hours=24 * 14)
                from notify import _spawn
                _spawn(_send_invite(user, url, "Welcome to Tony's new website and app. Your membership has been moved over — nothing to pay."))
                summary["invites"] += 1
        except HTTPException as exc:
            res.update(status="error", error=str(exc.detail))
        except Exception as exc:  # keep importing the other rows
            logger.warning("import row %s failed: %s", i, exc)
            res.update(status="error", error="Could not import this row")
        results.append(res)
    if not dry_run:
        await db.import_batches.insert_one({"id": batch_id, "name": batch_name, "created_by_admin_id": admin["id"], "created_at": now.isoformat(),
                                            "total_records": len(table), "valid_records": len(table) - summary["skipped"], "summary": summary,
                                            "source": "members_import"})
    return {"dry_run": dry_run, "columns": cols, "summary": summary, "results": results[:1000], "batch_id": None if dry_run else batch_id}


# ---------------------------------------------------------------------------
# The student's own view: My Yoga

@api.get("/me/library")
async def my_library(user: dict = Depends(get_current_user)):
    uid = user["id"]
    courses = [c for c in await member_courses(uid) if c["has_access"] or c["state"] in ("upcoming", "expired")]
    # progress per course
    for c in courses:
        lessons = await db.program_lessons.find({"program_id": c["program_id"]}, {"_id": 0, "video_id": 1}).to_list(500)
        vids = [l["video_id"] for l in lessons]
        done = await db.watch_progress.count_documents({"user_id": uid, "video_id": {"$in": vids}, "completed": True}) if vids else 0
        c.update(total_lessons=len(vids), completed_lessons=done, percent=round(done * 100 / len(vids)) if vids else 0)
        c.pop("grants", None)
    memberships = [m for m in await member_memberships(uid) if m["state"] in ("active", "upcoming") or
                   (parse_dt(m.get("end_date")) and parse_dt(m.get("end_date")) > now_utc() - timedelta(days=60))]
    choose = []
    for m in memberships:
        if m["state"] == "active" and m["choose_courses"] > len(m["picks"]):
            plan = await db.membership_plans.find_one({"id": m["plan_id"]}, {"_id": 0}) or {}
            allowed = plan.get("choosable_program_ids") or []
            options = await db.programs.find({"id": {"$in": allowed}} if allowed else {"price_model": {"$ne": "free"}},
                                             {"_id": 0, "id": 1, "title": 1, "cover_image": 1, "level": 1, "description": 1}).to_list(100)
            picked = {p["program_id"] for p in m["picks"]}
            choose.append({"plan_id": m["plan_id"], "plan_name": m["plan_name"], "remaining": m["choose_courses"] - len(m["picks"]),
                           "options": [o for o in options if o["id"] not in picked]})
    passes = await db.class_passes.find({"user_id": uid, "active": True}, {"_id": 0}).to_list(50)
    now_iso = now_utc().isoformat()
    upcoming = [b for b in await _bookings(uid, 60) if b["status"] in ("confirmed", "waitlist") and str(b.get("start_time") or "") >= now_iso]
    upcoming.sort(key=lambda b: str(b.get("start_time")))
    orders = await db.orders.find({"user_id": uid, "status": {"$ne": "pending"}}, {"_id": 0}).sort("created_at", -1).to_list(30)
    pending = await db.payment_transactions.find({"user_id": uid, "payment_status": {"$ne": "paid"}, "status": {"$nin": ["expired", "cancelled", "failed"]},
                                                 "created_at": {"$gte": (now_utc() - timedelta(days=3)).isoformat()}},
                                                {"_id": 0, "id": 1, "created_at": 1, "item_type": 1, "amount": 1, "currency": 1}).to_list(10)
    return {
        "memberships": memberships,
        "choose_courses": choose,
        "courses": courses,
        "class_access": [g for g in await _class_access(uid) if g["state"] in ("active", "upcoming")],
        "credits": sum(int(p.get("remaining") or 0) for p in passes),
        "upcoming_bookings": upcoming[:10],
        "trainings": await db.teacher_training_registrations.find({"user_id": uid}, {"_id": 0}).sort("created_at", -1).to_list(20),
        "retreats": await db.workshop_registrations.find({"user_id": uid, "status": {"$ne": "cancelled"}}, {"_id": 0}).sort("created_at", -1).to_list(20),
        "orders": orders,
        "pending_payments": pending,
    }


class MyPickIn(BaseModel):
    plan_id: str
    program_id: str


@api.post("/me/plan-picks")
async def my_pick(payload: MyPickIn, user: dict = Depends(get_current_user)):
    subs = [s for s in await active_memberships(user["id"]) if s.get("plan_id") == payload.plan_id]
    if not subs:
        raise HTTPException(409, "This membership isn't active on your account.")
    plan = await db.membership_plans.find_one({"id": payload.plan_id}, {"_id": 0})
    if not plan:
        raise HTTPException(404, "Membership plan not found")
    pick = await _add_pick(user["id"], plan, payload.program_id, "member")
    program = await db.programs.find_one({"id": payload.program_id}, {"_id": 0, "title": 1}) or {}
    await db.member_audit.insert_one({"id": gen_id(), "user_id": user["id"], "action": "course_chosen",
                                      "details": f"{program.get('title')} chosen by the member ({plan_name(plan)})", "admin_email": None, "at": now_utc().isoformat()})
    return pick


@api.patch("/me/notification-settings")
async def my_notification_settings(payload: Dict[str, Any], user: dict = Depends(get_current_user)):
    update = {k: bool(payload[k]) for k in ("notify_email", "notify_push") if k in payload}
    if update:
        await db.users.update_one({"id": user["id"]}, {"$set": update})
    return {"notify_email": update.get("notify_email", user.get("notify_email", True) is not False),
            "notify_push": update.get("notify_push", user.get("notify_push", True) is not False)}


# ---------------------------------------------------------------------------
# Background jobs

_last_member_tick = {"at": 0.0}


async def membership_reminders_tick():
    """Once an hour: remind members whose access ends soon (in-app + push + email)."""
    import time
    if time.time() - _last_member_tick["at"] < 3600:
        return
    _last_member_tick["at"] = time.time()
    from routers.settings import get_setting
    days = int(await get_setting("membership_reminder_days") or 0)
    if days <= 0:
        return
    now = now_utc()
    soon = (now + timedelta(days=days)).isoformat()
    rows = await db.subscriptions.find({"status": {"$in": ["active", "trialing"]}, "end_date": {"$gt": now.isoformat(), "$lte": soon},
                                        "stripe_subscription_id": {"$in": [None, ""]}}, {"_id": 0}).to_list(2000)
    from notify import notify_member
    for s in rows:
        if s.get("source") == "apple_iap":
            continue
        plan = await db.membership_plans.find_one({"id": s.get("plan_id")}, {"_id": 0}) or {}
        await notify_member(s["user_id"], "Your membership ends soon",
                            f"Your {plan_name(plan)} membership ends on {_fmt_date(s.get('end_date'))}. Renew to keep your classes and courses.",
                            "/memberships", dedupe_key=f"sub-ending:{s['id']}:{str(s.get('end_date'))[:10]}")


async def migrate_plan_access():
    """Once: give existing plans the access their descriptions promise (based on their feature list)."""
    for plan in await db.membership_plans.find({"access_configured": {"$ne": True}}, {"_id": 0}).to_list(200):
        feats = " ".join(str(f) for f in plan.get("features") or []).lower() + " " + str(plan.get("description") or "").lower()
        update = {"access_configured": True, "includes_library": True, "includes_live_classes": True}
        if "programs_all" in feats or "all programs" in feats or "all courses" in feats or plan.get("tier") in ("vip", "online_inperson"):
            update["includes_all_courses"] = True
        elif "programs_one" in feats or "one program" in feats or "1 program" in feats:
            update.update(includes_all_courses=False, choose_courses=1)
        if "live_2pw" in feats or "two live" in feats or "2 live" in feats:
            update["live_classes_per_week"] = 2
        await db.membership_plans.update_one({"id": plan["id"]}, {"$set": update})
