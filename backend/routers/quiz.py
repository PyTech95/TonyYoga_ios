"""Find Your Path — onboarding quiz that recommends a program + membership.

A short 5-question quiz whose answers are scored against the live catalogue
(programs + membership plans), so the recommendation stays correct as content
changes. Anonymous-friendly; if the caller is logged in we persist their goals
and level to the profile.
"""
from typing import List, Optional
import os
from fastapi import Request, HTTPException
from pydantic import BaseModel

from core import api, db, gen_id, now_utc, get_optional_user, require_role

LEVEL_RANK = {"beginner": 0, "intermediate": 1, "advanced": 2}


class QuizAnswers(BaseModel):
    goal: Optional[str] = None            # foundations | fitness | mastery | flexibility | calm
    level: Optional[str] = None           # beginner | intermediate | advanced
    days_per_week: Optional[int] = None   # 1..7
    focus: Optional[str] = None           # a focus-area tag
    minutes: Optional[int] = None         # per session


def _slim_program(p: dict) -> dict:
    return {
        "id": p.get("id"), "title": p.get("title"),
        "level": p.get("level"), "style": p.get("style"),
        "price": p.get("price"), "currency": p.get("currency", "eur"),
        "cover_image": p.get("cover_image"), "description": p.get("description"),
        "duration_weeks": p.get("duration_weeks"),
        "focus_areas": p.get("focus_areas") or [],
    }


def _slim_plan(p: dict) -> dict:
    return {
        "id": p.get("id"), "name": p.get("name"), "tier": p.get("tier"),
        "price": p.get("price"), "currency": p.get("currency", "usd"),
        "billing_cycle": p.get("billing_cycle"), "features": p.get("features") or [],
    }


async def _compute_recommendation(payload: "QuizAnswers"):
    """Score live programs + membership plans against the answers. Returns (program, plan, reasons)."""
    programs = await db.programs.find(
        {"style": {"$regex": "^Core", "$options": "i"}}, {"_id": 0}
    ).to_list(50)
    if not programs:
        programs = await db.programs.find({}, {"_id": 0}).to_list(50)

    want_level = (payload.level or "beginner").lower()
    want_rank = LEVEL_RANK.get(want_level, 0)
    goal = (payload.goal or "").lower()
    focus = (payload.focus or "").lower()
    goal_style = {
        "foundations": "core 26", "calm": "core 26",
        "fitness": "core 40", "flexibility": "core 40",
        "mastery": "core 84",
    }.get(goal)

    def score(p: dict) -> float:
        s = 0.0
        prank = LEVEL_RANK.get((p.get("level") or "beginner").lower(), 0)
        s += 3.0 - abs(prank - want_rank)
        style = (p.get("style") or p.get("title") or "").lower()
        if goal_style and goal_style in style:
            s += 4.0
        if focus and focus in [f.lower() for f in (p.get("focus_areas") or [])]:
            s += 2.0
        if (payload.days_per_week or 0) >= 5 and prank >= 2:
            s += 1.0
        if (payload.minutes or 0) >= 60 and prank >= 1:
            s += 0.5
        return s

    best = max(programs, key=score) if programs else None

    plans = await db.membership_plans.find({}, {"_id": 0}).to_list(50)
    dpw = payload.days_per_week or 2
    if dpw >= 5:
        tier_order = ["vip", "online_inperson", "online_only"]
    elif dpw >= 3:
        tier_order = ["online_inperson", "online_only", "vip"]
    else:
        tier_order = ["online_only", "online_inperson", "vip"]
    plan = None
    for tier in tier_order:
        plan = next((pl for pl in plans if (pl.get("tier") or "") == tier), None)
        if plan:
            break
    plan = plan or (plans[0] if plans else None)

    reasons: List[str] = []
    if best:
        reasons.append(f"{best['title']} matches your {want_level} level" + (f" and {goal} goal" if goal else ""))
    if plan:
        if dpw >= 5:
            reasons.append("You practise most days, so an unlimited plan gives the best value")
        elif dpw >= 3:
            reasons.append("A few sessions a week fits an all-access online + in-person plan")
        else:
            reasons.append("A lighter schedule fits our flexible online membership")
    if focus:
        reasons.append(f"Focused on {focus} — we'll surface matching classes")
    return best, plan, reasons


@api.post("/quiz/recommend")
async def quiz_recommend(payload: QuizAnswers, request: Request):
    user = await get_optional_user(request)
    program, plan, reasons = await _compute_recommendation(payload)
    if user:
        upd = {}
        if payload.level:
            upd["level"] = payload.level
        goal = (payload.goal or "").lower()
        if goal:
            upd["goals"] = [goal] + ([payload.focus] if payload.focus else [])
        upd["quiz_result"] = {
            "program_id": program.get("id") if program else None,
            "plan_id": plan.get("id") if plan else None,
            "answers": payload.model_dump(),
            "at": now_utc().isoformat(),
        }
        await db.users.update_one({"id": user["id"]}, {"$set": upd})
    return {
        "program": _slim_program(program) if program else None,
        "membership": _slim_plan(plan) if plan else None,
        "reasons": reasons,
    }


class QuizLead(BaseModel):
    email: str
    name: Optional[str] = None
    answers: QuizAnswers
    origin_url: Optional[str] = None


@api.post("/quiz/lead")
async def quiz_lead(payload: QuizLead, request: Request):
    """Capture a first-time visitor's email + email them their Find Your Path result."""
    email = (payload.email or "").strip().lower()
    if "@" not in email or "." not in email.split("@")[-1]:
        raise HTTPException(400, "Please enter a valid email.")
    program, plan, reasons = await _compute_recommendation(payload.answers)
    origin = (payload.origin_url or os.environ.get("FRONTEND_URL", "")).rstrip("/")
    program_url = f"{origin}/programs/{program['id']}" if (origin and program) else None
    signup_url = f"{origin}/register?email={email}" if origin else None

    existing_user = await db.users.find_one({"email": email}, {"_id": 0, "id": 1})
    lead = {
        "id": gen_id(),
        "email": email,
        "name": payload.name,
        "answers": payload.answers.model_dump(),
        "program_id": program.get("id") if program else None,
        "plan_id": plan.get("id") if plan else None,
        "is_member": bool(existing_user),
        "created_at": now_utc().isoformat(),
    }
    await db.quiz_leads.insert_one(lead)

    sent = False
    try:
        from email_service import send_quiz_result
        sent = await send_quiz_result(
            email,
            _slim_program(program) if program else None,
            _slim_plan(plan) if plan else None,
            reasons, program_url, signup_url,
        )
    except Exception:
        sent = False
    await db.quiz_leads.update_one({"id": lead["id"]}, {"$set": {"emailed": sent}})
    return {"ok": True, "emailed": sent, "already_member": bool(existing_user)}


@api.get("/admin/quiz-leads")
async def admin_quiz_leads(request: Request):
    """Captured Find Your Path leads for the admin, enriched with the recommended
    program/plan and whether the email has since created an account."""
    await require_role(request, ["admin"])
    leads = await db.quiz_leads.find({}, {"_id": 0}).sort("created_at", -1).to_list(1000)
    prog_ids = list({l.get("program_id") for l in leads if l.get("program_id")})
    plan_ids = list({l.get("plan_id") for l in leads if l.get("plan_id")})
    progs = {p["id"]: p.get("title") for p in await db.programs.find(
        {"id": {"$in": prog_ids}}, {"_id": 0, "id": 1, "title": 1}).to_list(500)}
    plans = {p["id"]: p for p in await db.membership_plans.find(
        {"id": {"$in": plan_ids}}, {"_id": 0}).to_list(500)}
    emails = list({l["email"] for l in leads if l.get("email")})
    members = set()
    async for u in db.users.find({"email": {"$in": emails}}, {"_id": 0, "email": 1}):
        members.add(u["email"])
    out = []
    for l in leads:
        pl = plans.get(l.get("plan_id")) or {}
        out.append({
            **l,
            "program_title": progs.get(l.get("program_id")),
            "plan_name": pl.get("name"),
            "plan_tier": pl.get("tier"),
            "signed_up": l.get("email") in members,
        })
    total = len(out)
    converted = sum(1 for x in out if x["signed_up"])
    return {"leads": out, "total": total, "converted": converted, "pending": total - converted}
