"""Fixed-term access. Provider-independent; historical lifetime purchases are preserved."""
from datetime import datetime, timedelta, timezone
from typing import Literal, Optional
from pydantic import BaseModel, Field, AwareDatetime, model_validator
from fastapi import HTTPException
from core import db, now_utc

# "Lifetime" access is stored as a window that ends far in the future.
LIFETIME_END = "2099-12-31T23:59:59+00:00"


class AccessTerm(BaseModel):
    mode: Literal["rolling", "fixed"] = "rolling"
    duration_days: int = Field(default=30, ge=1, le=3650)
    starts_at: Optional[AwareDatetime] = None
    ends_at: Optional[AwareDatetime] = None

    @model_validator(mode="after")
    def valid_window(self):
        if self.mode == "fixed" and (not self.starts_at or not self.ends_at or self.starts_at >= self.ends_at):
            raise ValueError("Subscription end must be after its start.")
        return self


class ClassPricing(BaseModel):
    mode: Literal["one_time", "subscription", "both", "free"] = "both"
    one_time_price: float = Field(default=22, gt=0, le=100000, allow_inf_nan=False)
    subscription_price: float = Field(default=79, gt=0, le=100000, allow_inf_nan=False)
    currency: Literal["usd", "eur", "gbp"] = "usd"
    term: AccessTerm = Field(default_factory=AccessTerm)


def parse_dt(value):
    if not value:
        return None
    try:
        dt = value if isinstance(value, datetime) else datetime.fromisoformat(str(value).replace("Z", "+00:00"))
        return dt.replace(tzinfo=timezone.utc) if not dt.tzinfo else dt.astimezone(timezone.utc)
    except (ValueError, TypeError):
        return None


def term_window(raw=None, at=None):
    term = AccessTerm.model_validate(raw or {})
    start = term.starts_at if term.mode == "fixed" else (at or now_utc())
    end = term.ends_at if term.mode == "fixed" else start + timedelta(days=term.duration_days)
    return start.astimezone(timezone.utc), end.astimezone(timezone.utc)


def state_of(grant, at=None):
    now = at or now_utc()
    start, end = parse_dt(grant.get("starts_at")), parse_dt(grant.get("ends_at"))
    if grant.get("revoked_at"):
        return "revoked"
    if not start or not end or now >= end:
        return "expired"
    return "upcoming" if now < start else "active"


async def grants_for(user_id, kind, target_id):
    return await db.access_grants.find({"user_id": user_id, "kind": kind, "target_id": target_id}, {"_id": 0}).sort("ends_at", -1).to_list(200)


async def legacy_program_record(user_id, program_id):
    """Lifetime access bought before fixed-term access existed (unless an admin revoked it)."""
    legacy = await db.program_enrollments.find_one({"user_id": user_id, "program_id": program_id, "access_version": {"$exists": False}, "revoked_at": {"$exists": False}}, {"_id": 0})
    if not legacy:
        legacy = await db.payment_transactions.find_one({"user_id": user_id, "item_type": "program", "item_id": program_id, "payment_status": "paid", "access_snapshot": {"$exists": False}, "access_revoked_at": {"$exists": False}}, {"_id": 0})
    return legacy


async def program_access(user_id, program_id):
    grants = await grants_for(user_id, "program", program_id)
    active = next((g for g in grants if state_of(g) == "active"), None)
    if active:
        return {**active, "status": "active", "has_access": True}
    # Only legacy records, never new fixed-term payment/enrollment records.
    legacy = await legacy_program_record(user_id, program_id)
    if legacy:
        return {"status": "lifetime", "has_access": True, "starts_at": legacy.get("created_at")}
    # Courses included in the member's plan (all, chosen by the admin, or picked by the member).
    sub = await membership_course_access(user_id, program_id)
    if sub:
        return {"status": "membership", "has_access": True, "via": "membership", "plan_id": sub.get("plan_id"),
                "subscription_id": sub.get("id"), "starts_at": sub.get("start_date"), "ends_at": sub.get("end_date")}
    g = next((g for g in grants if state_of(g) == "upcoming"), grants[0] if grants else None)
    return {**(g or {}), "status": state_of(g) if g else "none", "has_access": False}


def _membership_live(row, now, through=None):
    start, end = parse_dt(row.get("start_date")), parse_dt(row.get("end_date"))
    return bool(start and end and start <= now < end and (through is None or through <= end))


async def active_memberships(user_id, through=None):
    rows = await db.subscriptions.find({"user_id": user_id, "status": {"$in": ["active", "trialing"]}}, {"_id": 0}).to_list(100)
    now = now_utc()
    live = [r for r in rows if _membership_live(r, now, through)]
    live.sort(key=lambda r: str(r.get("end_date") or ""), reverse=True)
    return live


async def active_membership(user_id, through=None):
    rows = await active_memberships(user_id, through)
    return rows[0] if rows else None


async def membership_with(user_id, feature, through=None):
    """An active membership whose plan includes `feature` (includes_live_classes / includes_library).
    Plans that never set the flag include it (that is how memberships always worked)."""
    for sub in await active_memberships(user_id, through):
        plan = await db.membership_plans.find_one({"id": sub.get("plan_id")}, {"_id": 0}) or {}
        if plan.get(feature) is not False:
            return {**sub, "_plan": plan}
    return None


async def plan_course_ids(plan, user_id):
    """Courses a membership plan opens for this member. None means every course."""
    if not plan:
        return set()
    if plan.get("includes_all_courses"):
        return None
    ids = set(plan.get("included_program_ids") or [])
    if int(plan.get("choose_courses") or 0) > 0:
        picks = await db.membership_picks.find({"user_id": user_id, "plan_id": plan["id"], "removed_at": {"$exists": False}}, {"_id": 0, "program_id": 1}).to_list(50)
        ids.update(p["program_id"] for p in picks)
    return ids


async def membership_course_access(user_id, program_id):
    """The active membership that opens this course, or None."""
    subs = await active_memberships(user_id)
    if not subs:
        return None
    program = await db.programs.find_one({"id": program_id}, {"_id": 0, "price_model": 1}) or {}
    for sub in subs:
        if program.get("price_model") == "membership":
            return sub
        plan = await db.membership_plans.find_one({"id": sub.get("plan_id")}, {"_id": 0})
        ids = await plan_course_ids(plan, user_id)
        if ids is None or program_id in ids:
            return sub
    return None


async def class_pricing(instance):
    template = await db.class_templates.find_one({"id": instance.get("template_id")}, {"_id": 0}) or {}
    if instance.get("location_type") != "online":
        return ClassPricing(mode="free").model_dump(mode="json")
    return ClassPricing.model_validate(template.get("purchase_options") or {}).model_dump(mode="json")


async def class_access(user_id, instance, for_join=False):
    start, end = parse_dt(instance.get("start_time")), parse_dt(instance.get("end_time"))
    if not start or not end or instance.get("status") == "cancelled":
        return None
    for kind, target in (("class_instance", instance["id"]), ("class_template", instance.get("template_id"))):
        for grant in await grants_for(user_id, kind, target):
            gs, ge = parse_dt(grant.get("starts_at")), parse_dt(grant.get("ends_at"))
            if grant.get("revoked_at") or not gs or not ge:
                continue
            if gs <= start and end <= ge and now_utc() < ge and (not for_join or gs <= now_utc()):
                return {"source": "subscription" if kind == "class_template" else "one_time", "grant_id": grant["id"], "starts_at": grant["starts_at"], "ends_at": grant["ends_at"]}
    member = await membership_with(user_id, "includes_live_classes", through=end)
    if member:
        return {"source": "membership", "ends_at": member["end_date"], "plan_id": member.get("plan_id"),
                "live_classes_per_week": int(member.get("_plan", {}).get("live_classes_per_week") or 0)}
    return None


async def make_grant(kind, target_id, title, term, user_id):
    start, end = term_window(term)
    if end <= now_utc():
        raise HTTPException(409, "This subscription window has ended.")
    existing = await grants_for(user_id, kind, target_id)
    if any(not g.get("revoked_at") and parse_dt(g.get("ends_at")) > max(now_utc(), start) and parse_dt(g.get("starts_at")) < end for g in existing):
        raise HTTPException(409, "You already have a subscription for this period.")
    return {"kind": kind, "target_id": target_id, "title": title, "starts_at": start.isoformat(), "ends_at": end.isoformat()}


async def fulfill_access(txn):
    """Deterministic Mongo _id makes replay/concurrent webhook grants idempotent."""
    for index, grant in enumerate(txn["access_snapshot"]["grants"]):
        gid = f"{txn['id']}:{index}"
        await db.access_grants.update_one({"_id": gid}, {"$setOnInsert": {
            "id": gid, "user_id": txn["user_id"], "transaction_id": txn["id"],
            "created_at": txn.get("completed_at") or now_utc().isoformat(),
            **grant,
        }}, upsert=True)
    await db.payment_transactions.update_one({"id": txn["id"]}, {"$set": {"fulfilled_at": now_utc().isoformat()}})
