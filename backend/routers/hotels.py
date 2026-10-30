"""Hotel & Resort Partner Program.

A hotel applies on /hotels, Tony's team approves it, and the hotel's staff sign in to the partner
portal (/partner). There they request a 3- or 4-day "Yoga with Tony" programme for dates that are
free, receive a quote, sign the agreement online (typed name, time, IP), and pay the deposit and
the balance by card or PayPal. Each stay gets a co-branded guest page (/stay/<slug>) with a QR code
for rooms and reception; guests register there, accept the waiver and get free online access.
After the stay guests are asked for a rating and the hotel sees attendance, ratings and invoices.

The hotel sells its rooms; Tony Yoga sells only the yoga programme (keeps Tony out of package travel).
"""
import hashlib
import html as _h
import io
import re
import secrets
from datetime import date, datetime, timedelta, timezone
from typing import List, Optional

from fastapi import Depends, HTTPException, Request
from fastapi.responses import Response
from pydantic import BaseModel, EmailStr, Field

from core import api, db, gen_id, get_current_user, get_optional_user, logger, now_utc, require_role
from labels import plan_name
from routers.settings import get_setting

STAY_FLOW = ["requested", "quoted", "signed", "deposit_paid", "confirmed", "completed"]
DEFAULT_PACKAGES = [
    {"id": "weekend-reset", "name": "Weekend Reset", "days": 3, "min_guests": 6, "max_guests": 20, "programme_fee": 2400.0, "per_guest_fee": 120.0,
     "currency": "eur", "summary": "Three days to slow down and reset.",
     "daily": ["Morning hot-yoga flow (75 min)", "Evening yin and pranayama (60 min)"],
     "includes": ["Opening and closing circle", "One workshop", "Free month of Tony Yoga online for every guest"]},
    {"id": "deep-practice", "name": "Deep Practice", "days": 4, "min_guests": 6, "max_guests": 20, "programme_fee": 3200.0, "per_guest_fee": 150.0,
     "currency": "eur", "summary": "Four days for guests who want to go deeper.",
     "daily": ["Morning hot-yoga flow (75 min)", "Evening yin and pranayama (60 min)"],
     "includes": ["Everything in Weekend Reset", "Ghosh 84-asana workshop", "One meditation walk", "Free month of Tony Yoga online for every guest"]},
]
DEFAULT_ADDONS = [
    {"id": "private", "name": "Private session", "price": 120.0, "unit": "per session"},
    {"id": "breathwork", "name": "Breathwork workshop", "price": 350.0, "unit": "per workshop"},
    {"id": "welcome", "name": "Guest welcome class", "price": 250.0, "unit": "per class"},
    {"id": "staff", "name": "Staff yoga class", "price": 200.0, "unit": "per class"},
]


def _slugify(text: str) -> str:
    s = re.sub(r"[^a-z0-9]+", "-", (text or "").lower()).strip("-")
    return s[:40] or "hotel"


def _site(path: str) -> str:
    from notify import site_url
    return site_url(path)


async def ensure_hotel_catalogue():
    """First run: add the two proposal packages and add-ons as drafts (inactive) for Tony to edit."""
    for p in DEFAULT_PACKAGES:
        await db.hotel_packages.update_one({"_id": p["id"]}, {"$setOnInsert": {**p, "_id": p["id"], "active": False, "draft": True,
                                                                              "created_at": now_utc().isoformat()}}, upsert=True)
    for a in DEFAULT_ADDONS:
        await db.hotel_addons.update_one({"_id": a["id"]}, {"$setOnInsert": {**a, "_id": a["id"], "active": True}}, upsert=True)


async def _enabled_or_admin(request: Request):
    if await get_setting("hotels_enabled"):
        return
    user = await get_optional_user(request)
    if not user or user.get("role") != "admin":
        raise HTTPException(404, "The hotel programme isn't open yet.")


async def _admins_email():
    to = await get_setting("hotel_contact_email")
    if to:
        return [to]
    rows = await db.users.find({"role": "admin"}, {"_id": 0, "email": 1}).to_list(10)
    return [r["email"] for r in rows if r.get("email")]


async def _email(to_list, subject, title, body, cta=None, url=None):
    try:
        from email_service import send_email, _wrap
        for to in to_list:
            await send_email(to, subject, _wrap(title, body, cta, url), re.sub(r"<[^>]+>", " ", body))
    except Exception as exc:
        logger.warning("hotel email failed (%s)", type(exc).__name__)


# ---------------------------------------------------------------------------
# Public: programme page + application

@api.get("/hotels/info")
async def hotels_info(request: Request):
    await _enabled_or_admin(request)
    user = await get_optional_user(request)
    q = {} if (user or {}).get("role") == "admin" else {"active": True}
    packages = await db.hotel_packages.find(q, {"_id": 0}).sort("days", 1).to_list(20)
    addons = await db.hotel_addons.find({"active": True}, {"_id": 0}).to_list(30)
    return {"packages": packages, "addons": addons, "deposit_percent": int(await get_setting("hotel_deposit_percent") or 30),
            "balance_due_days": int(await get_setting("hotel_balance_due_days") or 30),
            "guest_free_days": int(await get_setting("hotel_guest_free_days") or 30),
            "cancellation_terms": await get_setting("hotel_cancellation_terms") or ""}


def web_link(value: Optional[str]) -> Optional[str]:
    """Accept example.com or https://example.com; refuse javascript:, data: and the like."""
    v = (value or "").strip()
    if not v:
        return None
    if v.startswith("//") or re.match(r"^[a-zA-Z][a-zA-Z0-9+.-]*:", v) and not re.match(r"^https?://", v, re.I):
        raise HTTPException(422, "Links must be normal web addresses (https://…).")
    return v if re.match(r"^https?://", v, re.I) else f"https://{v}"


class HotelApplication(BaseModel):
    hotel_name: str = Field(min_length=2, max_length=120)
    contact_name: str = Field(min_length=1, max_length=120)
    email: EmailStr
    phone: Optional[str] = Field(default=None, max_length=40)
    website: Optional[str] = Field(default=None, max_length=200)
    country: str = Field(min_length=2, max_length=60)
    city: str = Field(min_length=1, max_length=80)
    rooms: Optional[int] = Field(default=None, ge=1, le=5000)
    has_studio: Optional[bool] = None
    preferred_months: Optional[str] = Field(default=None, max_length=200)
    message: Optional[str] = Field(default=None, max_length=2000)
    website_hp: Optional[str] = None  # honeypot


@api.post("/hotels/apply")
async def hotels_apply(payload: HotelApplication, request: Request):
    await _enabled_or_admin(request)
    if payload.website_hp:
        return {"ok": True}
    email = payload.email.lower()
    recent = await db.hotel_partners.count_documents({"email": email, "created_at": {"$gte": (now_utc() - timedelta(days=1)).isoformat()}})
    if recent >= 3:
        raise HTTPException(429, "We already have your application. We'll reply soon.")
    base = _slugify(payload.hotel_name)
    slug, n = base, 2
    while await db.hotel_partners.find_one({"slug": slug}):
        slug, n = f"{base}-{n}", n + 1
    user = await get_optional_user(request)
    payload.website = web_link(payload.website)
    doc = {"id": gen_id(), "slug": slug, "name": payload.hotel_name.strip(), "contact_name": payload.contact_name.strip(), "email": email,
           "phone": payload.phone, "website": payload.website, "country": payload.country, "city": payload.city, "rooms": payload.rooms,
           "has_studio": payload.has_studio, "preferred_months": payload.preferred_months, "message": payload.message,
           "status": "applied", "user_ids": [user["id"]] if user and (user.get("email") or "").lower() == email else [],
           "created_at": now_utc().isoformat()}
    await db.hotel_partners.insert_one({**doc, "_id": doc["id"]})
    from routers.notifications import push_admins
    await push_admins("New hotel application", f"{doc['name']} ({doc['city']}, {doc['country']}) wants to host Yoga with Tony.", "/admin?tab=hotels")
    await _email(await _admins_email(), f"Hotel application: {doc['name']}", "New hotel application.",
                 f"<strong>{_h.escape(doc['name'])}</strong>, {_h.escape(doc['city'])}, {_h.escape(doc['country'])}<br/>"
                 f"Contact: {_h.escape(doc['contact_name'])} · {_h.escape(email)} · {_h.escape(doc.get('phone') or '')}<br/>"
                 f"Rooms: {doc.get('rooms') or '—'} · Preferred months: {_h.escape(doc.get('preferred_months') or '—')}<br/><br/>{_h.escape(doc.get('message') or '')}",
                 "Review in admin", _site("/admin?tab=hotels"))
    await _email([email], "We received your application — Tony Yoga", "Thank you.",
                 f"Hi {_h.escape(doc['contact_name'].split(' ')[0])},<br/><br/>We received the application for {_h.escape(doc['name'])}. "
                 "Tony's team will reply within a few days with next steps and your partner login.")
    return {"ok": True}


# ---------------------------------------------------------------------------
# Partner portal (hotel staff)

async def _my_partners(user: dict) -> List[dict]:
    return await db.hotel_partners.find({"user_ids": user["id"], "status": {"$in": ["approved", "paused"]}}, {"_id": 0}).to_list(20)


async def _my_partner(user: dict, partner_id: Optional[str] = None) -> dict:
    rows = await _my_partners(user)
    if partner_id:
        rows = [r for r in rows if r["id"] == partner_id]
    if not rows:
        raise HTTPException(403, "Your account isn't linked to an approved hotel partner.")
    return rows[0]


async def _my_stay(user: dict, stay_id: str) -> dict:
    stay = await db.hotel_stays.find_one({"id": stay_id}, {"_id": 0})
    if not stay:
        raise HTTPException(404, "Stay not found")
    if user.get("role") != "admin":
        await _my_partner(user, stay["partner_id"])
    return stay


_INTERNAL = ("agreement_ip", "agreement_user_agent", "admin_note", "teacher_user_id")


def _stay_public(stay: dict) -> dict:
    """What hotel staff may see of a stay (no internal studio notes)."""
    out = {k: v for k, v in stay.items() if k not in _INTERNAL}
    if out.get("quote"):
        out["quote"] = {k: v for k, v in out["quote"].items() if k not in ("issued_by",)}
    out["history"] = [{"status": h.get("status"), "at": h.get("at")} for h in out.get("history") or []]
    return out


def _partner_public(p: dict) -> dict:
    return {k: v for k, v in p.items() if k not in ("admin_note", "approved_by", "created_by", "user_ids")}


async def _guest_stats(stay_id: str) -> dict:
    guests = await db.hotel_guests.find({"stay_id": stay_id}, {"_id": 0}).to_list(2000)
    rated = [g["rating"] for g in guests if g.get("rating")]
    return {"guests": len(guests), "waivers": sum(1 for g in guests if g.get("waiver_accepted_at")),
            "ratings": len(rated), "rating_avg": round(sum(rated) / len(rated), 2) if rated else None,
            "attended": sum(1 for g in guests if g.get("attended"))}


@api.get("/partner/me")
async def partner_me(user: dict = Depends(get_current_user)):
    partners = await _my_partners(user)
    out = []
    for p in partners:
        stays = await db.hotel_stays.find({"partner_id": p["id"]}, {"_id": 0}).sort("start_date", -1).to_list(200)
        for s in stays:
            s.update(await _guest_stats(s["id"]))
        out.append({**_partner_public(p), "stays": [_stay_public(s) for s in stays]})
    pending = await db.hotel_partners.find_one({"user_ids": user["id"], "status": "applied"}, {"_id": 0, "name": 1})
    return {"partners": out, "pending_application": pending}


@api.get("/partner/availability")
async def partner_availability(start: Optional[str] = None, days: int = 180, user: dict = Depends(get_current_user)):
    """Dates that can't be booked: Tony's blocked dates and other confirmed stays (partners only)."""
    if user.get("role") != "admin":
        await _my_partner(user)
    first = (date.fromisoformat(start[:10]) if start else now_utc().date())
    last = first + timedelta(days=max(30, min(400, days)))
    blocked = []
    for b in await db.hotel_blackouts.find({"end_date": {"$gte": first.isoformat()}, "start_date": {"$lte": last.isoformat()}}, {"_id": 0}).to_list(500):
        blocked.append({"start_date": b["start_date"], "end_date": b["end_date"], "reason": "Not available"})
    for s in await db.hotel_stays.find({"status": {"$in": ["signed", "deposit_paid", "confirmed"]}, "end_date": {"$gte": first.isoformat()},
                                         "start_date": {"$lte": last.isoformat()}}, {"_id": 0, "start_date": 1, "end_date": 1}).to_list(500):
        blocked.append({"start_date": s["start_date"], "end_date": s["end_date"], "reason": "Booked"})
    lead = 21
    return {"from": first.isoformat(), "to": last.isoformat(), "blocked": blocked, "earliest": (now_utc().date() + timedelta(days=lead)).isoformat()}


async def _dates_free(start: date, end: date, ignore_stay: Optional[str] = None) -> bool:
    q = {"end_date": {"$gte": start.isoformat()}, "start_date": {"$lte": end.isoformat()}}
    if await db.hotel_blackouts.find_one(q):
        return False
    q2 = {**q, "status": {"$in": ["signed", "deposit_paid", "confirmed"]}}
    if ignore_stay:
        q2["id"] = {"$ne": ignore_stay}
    return not await db.hotel_stays.find_one(q2)


class StayRequest(BaseModel):
    partner_id: Optional[str] = None
    package_id: Optional[str] = Field(default=None, max_length=60)  # None = custom request
    start_date: date
    guests_expected: int = Field(ge=1, le=500)
    addons: List[dict] = Field(default_factory=list)
    languages: List[str] = Field(default_factory=list)
    notes: Optional[str] = Field(default=None, max_length=2000)


@api.post("/partner/stays")
async def partner_request_stay(payload: StayRequest, user: dict = Depends(get_current_user)):
    partner = await _my_partner(user, payload.partner_id)
    if partner["status"] != "approved":
        raise HTTPException(409, "Your partner account is paused. Please contact Tony Yoga.")
    if payload.start_date < now_utc().date() + timedelta(days=14):
        raise HTTPException(422, "Please choose dates at least two weeks from today.")
    pkg = None
    if payload.package_id:
        pkg = await db.hotel_packages.find_one({"id": payload.package_id}, {"_id": 0})
        if not pkg or (not pkg.get("active") and user.get("role") != "admin"):
            raise HTTPException(404, "Programme not found")
    days = int((pkg or {}).get("days") or 3)
    end = payload.start_date + timedelta(days=days - 1)
    if not await _dates_free(payload.start_date, end):
        raise HTTPException(409, "Those dates aren't available. Please pick other dates.")
    valid_addons = {a["id"]: a for a in await db.hotel_addons.find({"active": True}, {"_id": 0}).to_list(50)}
    addons = []
    for a in payload.addons[:10]:
        if a.get("id") in valid_addons:
            addons.append({"id": a["id"], "name": valid_addons[a["id"]]["name"], "qty": max(1, min(50, int(a.get("qty") or 1)))})
    stay = {"id": gen_id(), "partner_id": partner["id"], "partner_name": partner["name"], "package_id": (pkg or {}).get("id"),
            "package_name": (pkg or {}).get("name") or "Custom programme", "days": days, "start_date": payload.start_date.isoformat(),
            "end_date": end.isoformat(), "guests_expected": payload.guests_expected, "addons": addons,
            "languages": [x[:10] for x in payload.languages[:14]], "notes": payload.notes, "status": "requested",
            "requested_by": user["id"], "created_at": now_utc().isoformat(),
            "history": [{"status": "requested", "at": now_utc().isoformat(), "by": user.get("email")}]}
    await db.hotel_stays.insert_one({**stay, "_id": stay["id"]})
    from routers.notifications import push_admins
    await push_admins("Hotel programme request", f"{partner['name']}: {stay['package_name']} from {stay['start_date']} for ~{stay['guests_expected']} guests.",
                      "/admin?tab=hotels")
    return stay


class SignIn(BaseModel):
    signed_name: str = Field(min_length=3, max_length=120)
    accept: bool


@api.post("/partner/stays/{stay_id}/sign")
async def partner_sign(stay_id: str, payload: SignIn, request: Request, user: dict = Depends(get_current_user)):
    stay = await _my_stay(user, stay_id)
    if stay["status"] != "quoted":
        raise HTTPException(409, "There's no quote to sign for this stay.")
    if not payload.accept:
        raise HTTPException(422, "Please tick that you accept the agreement.")
    q = stay.get("quote") or {}
    if q.get("valid_until") and q["valid_until"] < now_utc().date().isoformat():
        raise HTTPException(409, "This quote has expired. Ask Tony Yoga for a new one.")
    if not await _dates_free(date.fromisoformat(stay["start_date"]), date.fromisoformat(stay["end_date"]), ignore_stay=stay_id):
        raise HTTPException(409, "Those dates were just taken. Please contact Tony Yoga.")
    ip = (request.headers.get("x-forwarded-for") or (request.client.host if request.client else "")).split(",")[0].strip()
    now = now_utc().isoformat()
    claimed = await db.hotel_stays.update_one({"id": stay_id, "status": "quoted"}, {"$set": {
        "status": "signed", "agreement": {"signed_name": payload.signed_name.strip(), "signed_at": now, "user_id": user["id"], "email": user.get("email"),
                                          "text_sha256": hashlib.sha256((stay.get("agreement_text") or "").encode()).hexdigest()},
        "agreement_ip": ip, "agreement_user_agent": (request.headers.get("user-agent") or "")[:300]},
        "$push": {"history": {"status": "signed", "at": now, "by": user.get("email")}}})
    if not claimed.modified_count:
        raise HTTPException(409, "This agreement was already signed.")
    from routers.notifications import push_admins
    await push_admins("Hotel agreement signed", f"{stay['partner_name']} signed {stay['package_name']} ({stay['start_date']}). Deposit is next.", "/admin?tab=hotels")
    return {"ok": True, "next": "deposit"}


class StayCancel(BaseModel):
    reason: str = Field(min_length=3, max_length=1000)


@api.post("/partner/stays/{stay_id}/cancel")
async def partner_cancel(stay_id: str, payload: StayCancel, user: dict = Depends(get_current_user)):
    stay = await _my_stay(user, stay_id)
    if stay["status"] in ("completed", "cancelled"):
        raise HTTPException(409, "This stay can't be cancelled.")
    now = now_utc().isoformat()
    await db.hotel_stays.update_one({"id": stay_id}, {"$set": {"status": "cancelled", "cancelled_at": now, "cancel_reason": payload.reason, "cancelled_by": user.get("email")},
                                                     "$push": {"history": {"status": "cancelled", "at": now, "by": user.get("email"), "note": payload.reason}}})
    from routers.notifications import push_admins
    paid = " A deposit was paid — check the refund under the cancellation terms." if stay.get("deposit_paid_at") else ""
    await push_admins("Hotel stay cancelled", f"{stay['partner_name']} cancelled {stay['package_name']} ({stay['start_date']}).{paid}", "/admin?tab=hotels")
    return {"ok": True}


@api.get("/partner/stays/{stay_id}")
async def partner_stay(stay_id: str, user: dict = Depends(get_current_user)):
    stay = await _my_stay(user, stay_id)
    guests = await db.hotel_guests.find({"stay_id": stay_id}, {"_id": 0, "feedback_token": 0, "ip": 0}).sort("created_at", 1).to_list(2000)
    payments = await db.payment_transactions.find({"item_type": {"$in": ["hotel_deposit", "hotel_balance"]}, "item_id": stay_id, "payment_status": {"$in": ["paid", "refunded", "partially_refunded"]}},
                                                 {"_id": 0, "id": 1, "item_type": 1, "amount": 1, "currency": 1, "completed_at": 1, "provider": 1, "payment_status": 1}).to_list(20)
    base = stay if user.get("role") == "admin" else _stay_public(stay)
    return {**base, **await _guest_stats(stay_id), "guest_list": guests, "payments": payments,
            "guest_page": _site(f"/stay/{stay.get('slug')}") if stay.get("slug") else None}


class PartnerProfile(BaseModel):
    description: Optional[str] = Field(default=None, max_length=2000)
    logo: Optional[str] = Field(default=None, max_length=500)
    cover_image: Optional[str] = Field(default=None, max_length=500)
    website: Optional[str] = Field(default=None, max_length=200)
    phone: Optional[str] = Field(default=None, max_length=40)
    address: Optional[str] = Field(default=None, max_length=300)
    billing_name: Optional[str] = Field(default=None, max_length=160)
    billing_address: Optional[str] = Field(default=None, max_length=400)
    vat_number: Optional[str] = Field(default=None, max_length=40)


@api.patch("/partner/profile/{partner_id}")
async def partner_profile(partner_id: str, payload: PartnerProfile, user: dict = Depends(get_current_user)):
    await _my_partner(user, partner_id)
    for url_field in ("logo", "cover_image", "website"):
        v = getattr(payload, url_field)
        if v and not (v.startswith("https://") or v.startswith("/")):
            raise HTTPException(422, f"{url_field.replace('_', ' ').capitalize()} must be a https:// link.")
    update = {k: v for k, v in payload.model_dump().items() if v is not None}
    await db.hotel_partners.update_one({"id": partner_id}, {"$set": {**update, "updated_at": now_utc().isoformat()}})
    return _partner_public(await db.hotel_partners.find_one({"id": partner_id}, {"_id": 0}))


@api.get("/partner/stays/{stay_id}/invoice/{kind}")
async def partner_invoice(stay_id: str, kind: str, user: dict = Depends(get_current_user)):
    """Data for a printable quote / deposit / balance invoice."""
    if kind not in ("quote", "deposit", "balance"):
        raise HTTPException(404, "Invoice not found")
    stay = await _my_stay(user, stay_id)
    partner = await db.hotel_partners.find_one({"id": stay["partner_id"]}, {"_id": 0}) or {}
    q = stay.get("quote") or {}
    if not q:
        raise HTTPException(409, "This stay has no quote yet.")
    paid = None
    if kind in ("deposit", "balance"):
        paid = await db.payment_transactions.find_one({"item_type": f"hotel_{kind}", "item_id": stay_id, "payment_status": {"$in": ["paid", "partially_refunded", "refunded"]}}, {"_id": 0})
        if not paid and stay.get(f"{kind}_paid_at"):
            # Paid by bank transfer and marked paid by Tony Yoga's team.
            paid = {"amount": q.get(kind), "completed_at": stay[f"{kind}_paid_at"], "provider": "bank transfer"}
        if not paid:
            raise HTTPException(409, f"The {kind} hasn't been paid yet.")
    lines = [{"label": f"{stay['package_name']} programme ({stay['days']} days, {stay['start_date']} – {stay['end_date']})", "amount": q.get("programme_fee", 0)}]
    if q.get("extra_guests"):
        lines.append({"label": f"{q['extra_guests']} guest(s) above the minimum × {q.get('per_guest_fee', 0):.2f}", "amount": q.get("guest_fee", 0)})
    for a in q.get("addons") or []:
        lines.append({"label": f"{a['name']} × {a['qty']}", "amount": a["total"]})
    for x in q.get("extras") or []:
        lines.append({"label": x["label"], "amount": x["amount"]})
    suffix = {"quote": "Q", "deposit": "D", "balance": "B"}[kind]
    number = f"TY-H-{stay['id'][:6].upper()}-{suffix}"
    return {"kind": kind, "number": number, "date": ((paid or {}).get("completed_at") or q.get("issued_at") or now_utc().isoformat())[:10],
            "seller": {"name": await get_setting("invoice_business_name") or "Tony Yoga", "address": await get_setting("invoice_business_address") or "",
                       "tax_id": await get_setting("invoice_tax_id") or "", "footer": await get_setting("invoice_footer") or ""},
            "buyer": {"name": partner.get("billing_name") or partner.get("name"), "address": partner.get("billing_address") or f"{partner.get('city', '')}, {partner.get('country', '')}",
                      "vat_number": partner.get("vat_number") or ""},
            "lines": lines, "total": q.get("total"), "currency": q.get("currency"), "deposit": q.get("deposit"), "balance": q.get("balance"),
            "balance_due": q.get("balance_due"), "paid_amount": (paid or {}).get("amount"), "paid_at": (paid or {}).get("completed_at"),
            "provider": (paid or {}).get("provider"), "terms": q.get("cancellation_terms"), "status": stay["status"]}


# ---------------------------------------------------------------------------
# Guest page + QR + registration + feedback

@api.get("/stay/{slug}")
async def stay_page(slug: str):
    stay = await db.hotel_stays.find_one({"slug": slug, "status": {"$in": ["deposit_paid", "confirmed", "completed"]}}, {"_id": 0})
    if not stay:
        raise HTTPException(404, "This page isn't available.")
    partner = await db.hotel_partners.find_one({"id": stay["partner_id"]}, {"_id": 0}) or {}
    pkg = await db.hotel_packages.find_one({"id": stay.get("package_id")}, {"_id": 0}) or {}
    open_until = (date.fromisoformat(stay["end_date"]) + timedelta(days=3)).isoformat()
    return {"slug": slug, "hotel": {k: partner.get(k) for k in ("name", "city", "country", "logo", "cover_image", "description", "website")},
            "programme": {"name": stay["package_name"], "days": stay["days"], "start_date": stay["start_date"], "end_date": stay["end_date"],
                          "daily": pkg.get("daily") or [], "includes": pkg.get("includes") or [], "summary": pkg.get("summary"),
                          "schedule": stay.get("schedule") or [], "teacher": stay.get("teacher_name") or "Tony Sanchez",
                          "languages": stay.get("languages") or []},
            "free_days": int(await get_setting("hotel_guest_free_days") or 30), "waiver": await get_setting("hotel_waiver_text") or "",
            "registration_open": now_utc().date().isoformat() <= open_until, "completed": stay["status"] == "completed"}


@api.get("/stay/{slug}/qr.svg")
async def stay_qr(slug: str):
    if not await db.hotel_stays.find_one({"slug": slug}):
        raise HTTPException(404, "Not found")
    import qrcode
    import qrcode.image.svg
    img = qrcode.make(_site(f"/stay/{slug}"), image_factory=qrcode.image.svg.SvgPathImage, box_size=12, border=2)
    buf = io.BytesIO()
    img.save(buf)
    return Response(buf.getvalue(), media_type="image/svg+xml", headers={"Cache-Control": "public, max-age=86400"})


class GuestIn(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    email: EmailStr
    language: Optional[str] = Field(default=None, max_length=10)
    waiver: bool
    marketing: bool = False


async def _guest_plan():
    pid = await get_setting("hotel_guest_plan_id")
    plan = await db.membership_plans.find_one({"id": pid, "is_active": {"$ne": False}}, {"_id": 0}) if pid else None
    if not plan:
        rows = await db.membership_plans.find({"is_active": {"$ne": False}}, {"_id": 0}).sort("price", 1).to_list(1)
        plan = rows[0] if rows else None
    return plan


@api.post("/stay/{slug}/register")
async def stay_register(slug: str, payload: GuestIn, request: Request):
    page = await stay_page(slug)
    if not page["registration_open"]:
        raise HTTPException(409, "Registration for this stay has closed.")
    if not payload.waiver:
        raise HTTPException(422, "Please accept the waiver to join the classes.")
    stay = await db.hotel_stays.find_one({"slug": slug, "status": {"$in": ["deposit_paid", "confirmed", "completed"]}}, {"_id": 0})
    if not stay:
        raise HTTPException(404, "This page isn't available.")
    email = payload.email.lower()
    if await db.hotel_guests.count_documents({"stay_id": stay["id"]}) >= max(40, int(stay.get("guests_expected") or 0) * 3):
        raise HTTPException(409, "This stay is full. Please ask the reception.")
    existing_guest = await db.hotel_guests.find_one({"stay_id": stay["id"], "email": email}, {"_id": 0})
    if existing_guest:
        return {"ok": True, "already": True, "free_access": existing_guest.get("free_access")}
    viewer = await get_optional_user(request)
    user = viewer if viewer and (viewer.get("email") or "").lower() == email else await db.users.find_one({"email": email}, {"_id": 0, "password_hash": 0})
    created = False
    from routers.members import create_member, _invite_link, _send_invite, give_membership
    if not user:
        user = await create_member(payload.name, email, source="hotel_guest", note=f"Guest at {stay['partner_name']}")
        created = True
    free = None
    days = int(await get_setting("hotel_guest_free_days") or 30)
    plan = await _guest_plan()
    if days > 0 and plan:
        from access_terms import active_memberships
        had = await db.subscriptions.find_one({"user_id": user["id"], "source": "hotel_guest", "created_at": {"$gte": (now_utc() - timedelta(days=365)).isoformat()}})
        if not had and not await active_memberships(user["id"]):
            start = now_utc()
            sub = await give_membership(user["id"], plan, start.isoformat(), (start + timedelta(days=days)).isoformat(), source="hotel_guest",
                                        note=f"Guest at {stay['partner_name']} ({stay['start_date']})")
            free = {"plan_name": plan_name(plan), "ends_at": sub["end_date"]}
    ip = (request.headers.get("x-forwarded-for") or (request.client.host if request.client else "")).split(",")[0].strip()
    guest = {"id": gen_id(), "stay_id": stay["id"], "partner_id": stay["partner_id"], "user_id": user["id"], "name": payload.name.strip(), "email": email,
             "language": payload.language, "waiver_accepted_at": now_utc().isoformat(), "waiver_sha256": hashlib.sha256((page["waiver"] or "").encode()).hexdigest(),
             "ip": ip, "marketing": payload.marketing, "free_access": free, "feedback_token": secrets.token_urlsafe(16), "created_at": now_utc().isoformat()}
    await db.hotel_guests.insert_one({**guest, "_id": guest["id"]})
    hotel = page["hotel"]["name"]
    if created:
        url = await _invite_link(user, hours=24 * 14)
        intro = (f"Welcome to Yoga with Tony at {hotel}." + (f" You also have {days} days of Tony Yoga online, free." if free else ""))
        await _send_invite(user, url, intro)
    else:
        from notify import notify_member
        await notify_member(user["id"], f"Welcome to Yoga with Tony at {hotel}",
                            (f"Your {days} free days of Tony Yoga online have started." if free else "You're on the guest list for the classes."), "/my-yoga")
    return {"ok": True, "account_created": created, "free_access": free, "signed_in": bool(viewer and viewer["id"] == user["id"])}


class FeedbackIn(BaseModel):
    token: str = Field(min_length=8, max_length=64)
    rating: int = Field(ge=1, le=5)
    comment: Optional[str] = Field(default=None, max_length=2000)


@api.post("/stay/{slug}/feedback")
async def stay_feedback(slug: str, payload: FeedbackIn):
    stay = await db.hotel_stays.find_one({"slug": slug}, {"_id": 0, "id": 1})
    if not stay:
        raise HTTPException(404, "Not found")
    r = await db.hotel_guests.update_one({"stay_id": stay["id"], "feedback_token": payload.token},
                                         {"$set": {"rating": payload.rating, "comment": payload.comment, "rated_at": now_utc().isoformat()}})
    if not r.matched_count:
        raise HTTPException(404, "This feedback link isn't valid.")
    return {"ok": True}


# ---------------------------------------------------------------------------
# Admin

@api.get("/admin/hotels")
async def admin_hotels(request: Request, status: Optional[str] = None):
    await require_role(request, ["admin"])
    await ensure_hotel_catalogue()
    q = {"status": status} if status else {}
    partners = await db.hotel_partners.find(q, {"_id": 0}).sort("created_at", -1).to_list(500)
    for p in partners:
        p["stays_count"] = await db.hotel_stays.count_documents({"partner_id": p["id"]})
        users = await db.users.find({"id": {"$in": p.get("user_ids") or []}}, {"_id": 0, "id": 1, "email": 1, "name": 1}).to_list(20)
        p["users"] = users
    stays = await db.hotel_stays.find({}, {"_id": 0, "agreement_ip": 0, "agreement_user_agent": 0}).sort("start_date", -1).to_list(500)
    for s in stays:
        s.update(await _guest_stats(s["id"]))
    paid = await db.payment_transactions.find({"item_type": {"$in": ["hotel_deposit", "hotel_balance"]}, "payment_status": "paid"}, {"_id": 0, "amount": 1, "currency": 1}).to_list(5000)
    totals = {}
    for t in paid:
        cur = str(t.get("currency") or "eur").upper()
        totals[cur] = round(totals.get(cur, 0) + float(t.get("amount") or 0), 2)
    return {"partners": partners, "stays": stays, "packages": await db.hotel_packages.find({}, {"_id": 0}).sort("days", 1).to_list(50),
            "addons": await db.hotel_addons.find({}, {"_id": 0}).to_list(50), "blackouts": await db.hotel_blackouts.find({}, {"_id": 0}).sort("start_date", 1).to_list(500),
            "revenue": totals, "enabled": bool(await get_setting("hotels_enabled"))}


class PartnerAdminIn(BaseModel):
    name: Optional[str] = Field(default=None, max_length=120)
    contact_name: Optional[str] = Field(default=None, max_length=120)
    email: Optional[EmailStr] = None
    phone: Optional[str] = Field(default=None, max_length=40)
    city: Optional[str] = Field(default=None, max_length=80)
    country: Optional[str] = Field(default=None, max_length=60)
    status: Optional[str] = Field(default=None, pattern="^(applied|approved|paused|declined)$")
    admin_note: Optional[str] = Field(default=None, max_length=2000)
    add_user_email: Optional[EmailStr] = None
    remove_user_id: Optional[str] = None
    message: Optional[str] = Field(default=None, max_length=1000)  # included in the approval / decline email


async def _link_partner_user(partner: dict, email: str, admin: dict) -> dict:
    from routers.members import create_member, _invite_link, _send_invite
    user = await db.users.find_one({"email": email.lower()}, {"_id": 0, "password_hash": 0})
    created = False
    if not user:
        user = await create_member(partner.get("contact_name") or email.split("@")[0], email, source="hotel_partner", note=f"Partner: {partner['name']}")
        created = True
    await db.hotel_partners.update_one({"id": partner["id"]}, {"$addToSet": {"user_ids": user["id"]}})
    url = await _invite_link(user, hours=24 * 7) if created else _site("/partner")
    if created:
        await _send_invite(user, url, f"Your partner login for {partner['name']} is ready. After setting your password, open Partner portal from the menu.")
    else:
        await _email([user["email"]], f"Partner portal for {partner['name']}", "Your partner portal is ready.",
                     f"Your Tony Yoga account now opens the partner portal for {_h.escape(partner['name'])}.", "Open the partner portal", url)
    return user


@api.post("/admin/hotels")
async def admin_create_partner(payload: PartnerAdminIn, request: Request):
    admin = await require_role(request, ["admin"])
    if not payload.name or not payload.email:
        raise HTTPException(422, "Hotel name and email are required.")
    base = _slugify(payload.name)
    slug, n = base, 2
    while await db.hotel_partners.find_one({"slug": slug}):
        slug, n = f"{base}-{n}", n + 1
    doc = {"id": gen_id(), "slug": slug, "name": payload.name, "contact_name": payload.contact_name or "", "email": payload.email.lower(),
           "phone": payload.phone, "city": payload.city or "", "country": payload.country or "", "status": payload.status or "approved",
           "user_ids": [], "admin_note": payload.admin_note, "created_at": now_utc().isoformat(), "created_by": admin.get("email")}
    if doc["status"] == "approved":
        doc.update(approved_at=now_utc().isoformat(), approved_by=admin.get("email"))
    await db.hotel_partners.insert_one({**doc, "_id": doc["id"]})
    if doc["status"] == "approved":
        await _link_partner_user(doc, doc["email"], admin)
    return await db.hotel_partners.find_one({"id": doc["id"]}, {"_id": 0})


@api.patch("/admin/hotels/{partner_id}")
async def admin_update_partner(partner_id: str, payload: PartnerAdminIn, request: Request):
    admin = await require_role(request, ["admin"])
    partner = await db.hotel_partners.find_one({"id": partner_id}, {"_id": 0})
    if not partner:
        raise HTTPException(404, "Partner not found")
    update = {k: v for k, v in payload.model_dump(exclude={"add_user_email", "remove_user_id", "message"}).items() if v is not None}
    if "email" in update:
        update["email"] = update["email"].lower()
    if update:
        await db.hotel_partners.update_one({"id": partner_id}, {"$set": {**update, "updated_at": now_utc().isoformat()}})
    partner = {**partner, **update}
    if payload.status == "approved" and partner.get("approved_at") is None:
        await db.hotel_partners.update_one({"id": partner_id}, {"$set": {"approved_at": now_utc().isoformat(), "approved_by": admin.get("email")}})
        await _link_partner_user(partner, partner["email"], admin)
    if payload.status == "declined":
        await _email([partner["email"]], "About your application — Tony Yoga", "Thank you for your interest.",
                     _h.escape(payload.message or "We can't offer a programme at your hotel right now. We'll keep your details for the future."))
    if payload.add_user_email:
        await _link_partner_user(partner, payload.add_user_email, admin)
    if payload.remove_user_id:
        await db.hotel_partners.update_one({"id": partner_id}, {"$pull": {"user_ids": payload.remove_user_id}})
    return await db.hotel_partners.find_one({"id": partner_id}, {"_id": 0})


class PackageIn(BaseModel):
    name: str = Field(min_length=2, max_length=80)
    days: int = Field(ge=1, le=14)
    summary: Optional[str] = Field(default="", max_length=400)
    daily: List[str] = Field(default_factory=list)
    includes: List[str] = Field(default_factory=list)
    min_guests: int = Field(default=6, ge=1, le=500)
    max_guests: int = Field(default=20, ge=1, le=1000)
    programme_fee: float = Field(ge=0, le=1_000_000)
    per_guest_fee: float = Field(default=0, ge=0, le=100_000)
    currency: str = Field(default="eur", pattern="^(eur|usd|gbp)$")
    image: Optional[str] = Field(default=None, max_length=500)
    active: bool = False


@api.post("/admin/hotel-packages")
async def admin_create_package(payload: PackageIn, request: Request):
    await require_role(request, ["admin"])
    pid = _slugify(payload.name)
    if await db.hotel_packages.find_one({"id": pid}):
        pid = f"{pid}-{secrets.token_hex(2)}"
    doc = {**payload.model_dump(), "id": pid, "daily": [d[:160] for d in payload.daily[:8]], "includes": [d[:160] for d in payload.includes[:10]],
           "created_at": now_utc().isoformat()}
    await db.hotel_packages.insert_one({**doc, "_id": pid})
    return doc


@api.put("/admin/hotel-packages/{package_id}")
async def admin_update_package(package_id: str, payload: PackageIn, request: Request):
    await require_role(request, ["admin"])
    if payload.max_guests < payload.min_guests:
        raise HTTPException(422, "Maximum guests must be at least the minimum.")
    data = {**payload.model_dump(), "daily": [d[:160] for d in payload.daily[:8]], "includes": [d[:160] for d in payload.includes[:10]],
            "draft": False, "updated_at": now_utc().isoformat()}
    r = await db.hotel_packages.update_one({"id": package_id}, {"$set": data})
    if not r.matched_count:
        raise HTTPException(404, "Programme not found")
    return await db.hotel_packages.find_one({"id": package_id}, {"_id": 0})


class AddonIn(BaseModel):
    id: Optional[str] = Field(default=None, max_length=40)
    name: str = Field(min_length=2, max_length=80)
    price: float = Field(ge=0, le=100_000)
    unit: str = Field(default="per item", max_length=30)
    active: bool = True


@api.put("/admin/hotel-addons")
async def admin_save_addons(payload: List[AddonIn], request: Request):
    await require_role(request, ["admin"])
    ids = []
    for a in payload[:20]:
        aid = a.id or _slugify(a.name)
        ids.append(aid)
        await db.hotel_addons.update_one({"_id": aid}, {"$set": {**a.model_dump(), "id": aid}}, upsert=True)
    await db.hotel_addons.delete_many({"id": {"$nin": ids}})
    return await db.hotel_addons.find({}, {"_id": 0}).to_list(50)


class QuoteIn(BaseModel):
    guests: int = Field(ge=1, le=1000)
    programme_fee: Optional[float] = Field(default=None, ge=0, le=1_000_000)
    per_guest_fee: Optional[float] = Field(default=None, ge=0, le=100_000)
    currency: Optional[str] = Field(default=None, pattern="^(eur|usd|gbp)$")
    addons: List[dict] = Field(default_factory=list)  # [{id, qty, price?}]
    extras: List[dict] = Field(default_factory=list)  # [{label, amount}]
    deposit_percent: Optional[int] = Field(default=None, ge=0, le=100)
    balance_due: Optional[date] = None
    valid_days: int = Field(default=14, ge=1, le=90)
    cancellation_terms: Optional[str] = Field(default=None, max_length=2000)
    teacher_name: Optional[str] = Field(default=None, max_length=120)
    teacher_user_id: Optional[str] = None
    schedule: List[dict] = Field(default_factory=list)  # [{day, time, title}]
    note: Optional[str] = Field(default=None, max_length=2000)
    start_date: Optional[date] = None  # move the dates while quoting


def compute_quote(pkg: dict, payload: QuoteIn, addons_catalog: dict) -> dict:
    currency = payload.currency or pkg.get("currency") or "eur"
    fee = float(payload.programme_fee if payload.programme_fee is not None else pkg.get("programme_fee") or 0)
    per_guest = float(payload.per_guest_fee if payload.per_guest_fee is not None else pkg.get("per_guest_fee") or 0)
    extra_guests = max(0, payload.guests - int(pkg.get("min_guests") or 0))
    guest_fee = round(per_guest * extra_guests, 2)
    addons = []
    for a in payload.addons[:15]:
        cat = addons_catalog.get(a.get("id"))
        if not cat:
            continue
        qty = max(1, min(100, int(a.get("qty") or 1)))
        price = float(a["price"]) if a.get("price") is not None else float(cat["price"])
        addons.append({"id": cat["id"], "name": cat["name"], "qty": qty, "price": price, "total": round(price * qty, 2)})
    extras = [{"label": str(x.get("label"))[:120], "amount": round(float(x.get("amount") or 0), 2)} for x in payload.extras[:10] if x.get("label")]
    total = round(fee + guest_fee + sum(a["total"] for a in addons) + sum(x["amount"] for x in extras), 2)
    return {"currency": currency, "programme_fee": fee, "per_guest_fee": per_guest, "extra_guests": extra_guests, "guest_fee": guest_fee,
            "addons": addons, "extras": extras, "total": total, "guests": payload.guests}


def agreement_text(stay: dict, partner: dict, q: dict, seller: str) -> str:
    cur = q["currency"].upper()
    lines = [f"Agreement between {seller} (\"Tony Yoga\") and {partner.get('billing_name') or partner['name']} (\"the Hotel\").",
             f"Programme: {stay['package_name']}, {stay['days']} days, {stay['start_date']} to {stay['end_date']}, for about {q['guests']} guests.",
             f"Teacher: {q.get('teacher_name') or 'Tony Sanchez'}.",
             f"Price: {q['total']:.2f} {cur} for the yoga programme only. Rooms, meals and transfers are sold by the Hotel to its guests.",
             f"Deposit: {q['deposit']:.2f} {cur} ({q['deposit_percent']}%) paid online to confirm the dates. Balance: {q['balance']:.2f} {cur} due by {q['balance_due']}.",
             "The Hotel provides a suitable practice space, mats or towels when agreed, and tells guests about the programme.",
             "Every registered guest accepts Tony Yoga's waiver and receives free online access as described on the guest page.",
             f"Cancellation: {q.get('cancellation_terms') or ''}"]
    return "\n".join(lines)


@api.post("/admin/hotel-stays/{stay_id}/quote")
async def admin_quote(stay_id: str, payload: QuoteIn, request: Request):
    admin = await require_role(request, ["admin"])
    stay = await db.hotel_stays.find_one({"id": stay_id}, {"_id": 0})
    if not stay:
        raise HTTPException(404, "Stay not found")
    if stay["status"] not in ("requested", "quoted"):
        raise HTTPException(409, "This stay is already signed; change it by cancelling and re-quoting.")
    partner = await db.hotel_partners.find_one({"id": stay["partner_id"]}, {"_id": 0}) or {}
    pkg = await db.hotel_packages.find_one({"id": stay.get("package_id")}, {"_id": 0}) or {"currency": payload.currency or "eur", "days": stay["days"]}
    if payload.start_date:
        start = payload.start_date
        end = start + timedelta(days=int(stay["days"]) - 1)
        if not await _dates_free(start, end, ignore_stay=stay_id):
            raise HTTPException(409, "Those dates aren't free.")
        stay.update(start_date=start.isoformat(), end_date=end.isoformat())
    catalog = {a["id"]: a for a in await db.hotel_addons.find({}, {"_id": 0}).to_list(50)}
    q = compute_quote(pkg, payload, catalog)
    if q["total"] <= 0:
        raise HTTPException(422, "The quote total must be more than 0.")
    pct = payload.deposit_percent if payload.deposit_percent is not None else int(await get_setting("hotel_deposit_percent") or 30)
    q["deposit_percent"] = pct
    q["deposit"] = round(q["total"] * pct / 100, 2)
    q["balance"] = round(q["total"] - q["deposit"], 2)
    due_days = int(await get_setting("hotel_balance_due_days") or 30)
    q["balance_due"] = (payload.balance_due or max(now_utc().date(), date.fromisoformat(stay["start_date"]) - timedelta(days=due_days))).isoformat()
    q["valid_until"] = (now_utc().date() + timedelta(days=payload.valid_days)).isoformat()
    q["cancellation_terms"] = payload.cancellation_terms or await get_setting("hotel_cancellation_terms") or ""
    q["teacher_name"] = payload.teacher_name or "Tony Sanchez"
    q["note"] = payload.note
    q["issued_at"] = now_utc().isoformat()
    q["issued_by"] = admin.get("email")
    text = agreement_text(stay, partner, q, await get_setting("invoice_business_name") or "Tony Yoga")
    slug = stay.get("slug") or f"{partner.get('slug', 'hotel')}-{stay['start_date']}-{secrets.token_hex(3)}"
    now = now_utc().isoformat()
    await db.hotel_stays.update_one({"id": stay_id}, {"$set": {"status": "quoted", "quote": q, "agreement_text": text, "slug": slug,
                                                              "start_date": stay["start_date"], "end_date": stay["end_date"],
                                                              "teacher_name": q["teacher_name"], "teacher_user_id": payload.teacher_user_id,
                                                              "schedule": [{"day": int(x.get("day") or 1), "time": str(x.get("time") or "")[:5], "title": str(x.get("title") or "")[:100]}
                                                                           for x in payload.schedule[:40]]},
                                                     "$push": {"history": {"status": "quoted", "at": now, "by": admin.get("email")}}})
    emails = [u["email"] for u in await db.users.find({"id": {"$in": partner.get("user_ids") or []}}, {"_id": 0, "email": 1}).to_list(10)] or [partner.get("email")]
    await _email([e for e in emails if e], f"Your quote: {stay['package_name']} — Tony Yoga", "Your quote is ready.",
                 f"{_h.escape(stay['package_name'])} at {_h.escape(partner.get('name', ''))}, {stay['start_date']} – {stay['end_date']}.<br/>"
                 f"Total {q['total']:.2f} {q['currency'].upper()} · deposit {q['deposit']:.2f} ({pct}%). Valid until {q['valid_until']}.<br/><br/>"
                 "Open the partner portal to read and sign the agreement and pay the deposit.", "Review and sign", _site(f"/partner?stay={stay_id}"))
    for uid in partner.get("user_ids") or []:
        from notify import notify_member
        await notify_member(uid, "Quote ready to sign", f"{stay['package_name']} · {stay['start_date']}", f"/partner?stay={stay_id}", email=False)
    return await db.hotel_stays.find_one({"id": stay_id}, {"_id": 0})


class StayAdminIn(BaseModel):
    status: Optional[str] = Field(default=None, pattern="^(requested|quoted|signed|deposit_paid|confirmed|completed|cancelled)$")
    teacher_name: Optional[str] = Field(default=None, max_length=120)
    admin_note: Optional[str] = Field(default=None, max_length=2000)
    mark_paid: Optional[str] = Field(default=None, pattern="^(deposit|balance)$")  # paid by bank transfer
    attended_guest_ids: Optional[List[str]] = None


@api.patch("/admin/hotel-stays/{stay_id}")
async def admin_update_stay(stay_id: str, payload: StayAdminIn, request: Request):
    admin = await require_role(request, ["admin"])
    stay = await db.hotel_stays.find_one({"id": stay_id}, {"_id": 0})
    if not stay:
        raise HTTPException(404, "Stay not found")
    now = now_utc().isoformat()
    update = {}
    if payload.teacher_name is not None:
        update["teacher_name"] = payload.teacher_name
    if payload.admin_note is not None:
        update["admin_note"] = payload.admin_note
    if payload.mark_paid:
        q = stay.get("quote") or {}
        if not q:
            raise HTTPException(409, "Quote first.")
        await _apply_stay_payment(stay, payload.mark_paid, None, by=admin.get("email"))
    if payload.status and payload.status != stay["status"]:
        update["status"] = payload.status
    if payload.attended_guest_ids is not None:
        await db.hotel_guests.update_many({"stay_id": stay_id}, {"$set": {"attended": False}})
        await db.hotel_guests.update_many({"stay_id": stay_id, "id": {"$in": payload.attended_guest_ids}}, {"$set": {"attended": True}})
    if update:
        push = {"history": {"status": update.get("status") or stay["status"], "at": now, "by": admin.get("email"), "note": payload.admin_note}}
        await db.hotel_stays.update_one({"id": stay_id}, {"$set": update, "$push": push})
    return await db.hotel_stays.find_one({"id": stay_id}, {"_id": 0})


class BlackoutIn(BaseModel):
    start_date: date
    end_date: date
    reason: Optional[str] = Field(default=None, max_length=200)


@api.post("/admin/hotel-blackouts")
async def admin_add_blackout(payload: BlackoutIn, request: Request):
    await require_role(request, ["admin"])
    if payload.end_date < payload.start_date:
        raise HTTPException(422, "End date is before the start date.")
    doc = {"id": gen_id(), "start_date": payload.start_date.isoformat(), "end_date": payload.end_date.isoformat(), "reason": payload.reason or ""}
    await db.hotel_blackouts.insert_one({**doc, "_id": doc["id"]})
    return doc


@api.delete("/admin/hotel-blackouts/{bid}")
async def admin_remove_blackout(bid: str, request: Request):
    await require_role(request, ["admin"])
    await db.hotel_blackouts.delete_one({"id": bid})
    return {"ok": True}


# ---------------------------------------------------------------------------
# Payments: deposit and balance through the normal checkout

async def _stay_for_payment(item_id: str, user_id: str, kind: str) -> dict:
    stay = await db.hotel_stays.find_one({"id": item_id}, {"_id": 0})
    if not stay:
        raise HTTPException(404, "Stay not found")
    partner = await db.hotel_partners.find_one({"id": stay["partner_id"], "user_ids": user_id}, {"_id": 0})
    user = await db.users.find_one({"id": user_id}, {"_id": 0, "role": 1})
    if not partner and (user or {}).get("role") != "admin":
        raise HTTPException(403, "Only the hotel's partner accounts can pay for this stay.")
    need = "signed" if kind == "deposit" else "deposit_paid"
    if stay["status"] != need:
        raise HTTPException(409, "Sign the agreement first." if kind == "deposit" else "The balance can be paid after the deposit.")
    return stay


async def _price_deposit(item_id, quantity, user_id, extra):
    stay = await _stay_for_payment(item_id, user_id, "deposit")
    q = stay["quote"]
    if q["deposit"] <= 0:
        raise HTTPException(409, "No deposit is due for this stay.")
    return q["deposit"], q["currency"], {"product_name": f"Deposit — {stay['package_name']} at {stay['partner_name']} ({stay['start_date']})"[:120], "stay_id": item_id}


async def _price_balance(item_id, quantity, user_id, extra):
    stay = await _stay_for_payment(item_id, user_id, "balance")
    q = stay["quote"]
    return q["balance"], q["currency"], {"product_name": f"Balance — {stay['package_name']} at {stay['partner_name']} ({stay['start_date']})"[:120], "stay_id": item_id}


async def _apply_stay_payment(stay: dict, kind: str, txn: Optional[dict], by: str = "payment"):
    now = now_utc().isoformat()
    if kind == "deposit":
        status = "confirmed" if float((stay.get("quote") or {}).get("balance") or 0) <= 0 else "deposit_paid"
        r = await db.hotel_stays.update_one({"id": stay["id"], "status": {"$in": ["signed", "quoted"]}},
                                            {"$set": {"status": status, "deposit_paid_at": now, "deposit_txn_id": (txn or {}).get("id")},
                                             "$push": {"history": {"status": status, "at": now, "by": by}}})
    else:
        r = await db.hotel_stays.update_one({"id": stay["id"], "status": "deposit_paid"},
                                            {"$set": {"status": "confirmed", "balance_paid_at": now, "balance_txn_id": (txn or {}).get("id")},
                                             "$push": {"history": {"status": "confirmed", "at": now, "by": by}}})
    from routers.notifications import push_admins
    if not r.modified_count:
        if txn:
            await db.payment_transactions.update_one({"id": txn["id"]}, {"$set": {"needs_review": f"Paid while the stay was '{stay.get('status')}'"}})
            await push_admins(f"Check a hotel {kind} payment", f"{stay['partner_name']} paid a {kind} for {stay['package_name']} ({stay['start_date']}) "
                              f"while the stay was {stay.get('status')}. Refund it or update the stay.", "/admin?tab=hotels", dedupe_key=f"hotel-pay-check:{txn['id']}")
        return
    await push_admins(f"Hotel {kind} paid", f"{stay['partner_name']} paid the {kind} for {stay['package_name']} ({stay['start_date']}).", "/admin?tab=hotels")
    partner = await db.hotel_partners.find_one({"id": stay["partner_id"]}, {"_id": 0}) or {}
    emails = [u["email"] for u in await db.users.find({"id": {"$in": partner.get("user_ids") or []}}, {"_id": 0, "email": 1}).to_list(10)]
    if kind == "deposit":
        await _email(emails, "Dates confirmed — Yoga with Tony", "Your dates are confirmed.",
                     f"Thank you. {_h.escape(stay['package_name'])} at {_h.escape(stay['partner_name'])} is confirmed for {stay['start_date']} – {stay['end_date']}.<br/><br/>"
                     "Your guest page and QR code are ready in the partner portal. Print the QR code for rooms and reception.",
                     "Open guest page tools", _site(f"/partner?stay={stay['id']}"))


async def _fulfil_deposit(txn):
    stay = await db.hotel_stays.find_one({"id": txn["item_id"]}, {"_id": 0})
    if stay:
        await _apply_stay_payment(stay, "deposit", txn)


async def _fulfil_balance(txn):
    stay = await db.hotel_stays.find_one({"id": txn["item_id"]}, {"_id": 0})
    if stay:
        await _apply_stay_payment(stay, "balance", txn)


async def _describe(txn):
    stay = await db.hotel_stays.find_one({"id": txn.get("item_id")}, {"_id": 0, "package_name": 1, "partner_name": 1, "start_date": 1}) or {}
    kind = "deposit" if txn.get("item_type") == "hotel_deposit" else "balance"
    return f"Hotel programme {kind} — {stay.get('package_name', '')} at {stay.get('partner_name', '')}"


async def _message(txn):
    kind = "Deposit" if txn.get("item_type") == "hotel_deposit" else "Balance"
    return f"{kind} received", "Thank you. Everything for your stay is in the partner portal."


async def _link(txn):
    return f"/partner?stay={txn.get('item_id')}"


from payment_items import register  # noqa: E402

register("hotel_deposit", price=_price_deposit, fulfill=_fulfil_deposit, describe=_describe, message=_message, link=_link, credit=False)
register("hotel_balance", price=_price_balance, fulfill=_fulfil_balance, describe=_describe, message=_message, link=_link, credit=False)


# ---------------------------------------------------------------------------
# Daily jobs: balance reminders, mark stays completed, ask guests for feedback

_last = {"day": None}


async def hotels_daily_tick(force: bool = False):
    """Hourly (every step is marked done, so repeating is safe)."""
    hour = now_utc().strftime("%Y-%m-%dT%H")
    if _last["day"] == hour and not force:
        return
    _last["day"] = hour
    today = now_utc().date().isoformat()
    soon = (now_utc().date() + timedelta(days=7)).isoformat()
    for s in await db.hotel_stays.find({"status": "deposit_paid", "quote.balance_due": {"$lte": soon}, "balance_reminded_at": {"$exists": False}}, {"_id": 0}).to_list(200):
        partner = await db.hotel_partners.find_one({"id": s["partner_id"]}, {"_id": 0}) or {}
        emails = [u["email"] for u in await db.users.find({"id": {"$in": partner.get("user_ids") or []}}, {"_id": 0, "email": 1}).to_list(10)]
        q = s["quote"]
        await _email(emails, "Balance due soon — Yoga with Tony", "Balance due soon.",
                     f"The balance of {q['balance']:.2f} {q['currency'].upper()} for {_h.escape(s['package_name'])} ({s['start_date']}) is due by {q['balance_due']}.",
                     "Pay the balance", _site(f"/partner?stay={s['id']}"))
        await db.hotel_stays.update_one({"id": s["id"]}, {"$set": {"balance_reminded_at": now_utc().isoformat()}})
    for s in await db.hotel_stays.find({"status": "confirmed", "end_date": {"$lt": today}}, {"_id": 0}).to_list(200):
        await db.hotel_stays.update_one({"id": s["id"]}, {"$set": {"status": "completed", "completed_at": now_utc().isoformat()},
                                                         "$push": {"history": {"status": "completed", "at": now_utc().isoformat(), "by": "automatic"}}})
        for g in await db.hotel_guests.find({"stay_id": s["id"], "feedback_asked_at": {"$exists": False}}, {"_id": 0}).to_list(2000):
            url = _site(f"/stay/{s['slug']}?feedback={g['feedback_token']}")
            await _email([g["email"]], f"How was Yoga with Tony at {s['partner_name']}?", "How was your practice?",
                         f"Hi {_h.escape(g['name'].split(' ')[0])}, thank you for practising with us at {_h.escape(s['partner_name'])}. "
                         "One tap tells us how it went.", "Rate the classes", url)
            await db.hotel_guests.update_one({"id": g["id"]}, {"$set": {"feedback_asked_at": now_utc().isoformat()}})
