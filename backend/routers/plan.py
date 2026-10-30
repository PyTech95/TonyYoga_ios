"""Personal practice plan (from the goal quiz), the "Today" screen and small community signals.

POST /me/plan builds a 4-week plan from the member's answers: practice days spread over the week,
each day a lesson from their recommended course (when they have it) or a library class that fits
their level and time, breathwork on short or calm days, and one live class suggestion a week.
GET /me/today gathers what the home screen shows first: today's plan step, the next live class,
continue watching, the streak and Tony's monthly theme.
"""
from datetime import date, datetime, timedelta, timezone
from typing import List, Optional

from fastapi import Depends, HTTPException, Request
from pydantic import BaseModel, Field

from access_terms import class_access, membership_with, parse_dt, program_access
from core import api, db, gen_id, get_current_user, get_optional_user, now_utc

WEEKDAYS = {1: [2], 2: [1, 4], 3: [0, 2, 4], 4: [0, 1, 3, 5], 5: [0, 1, 2, 4, 5], 6: [0, 1, 2, 3, 4, 5], 7: [0, 1, 2, 3, 4, 5, 6]}
LEVELS = {"beginner": 0, "intermediate": 1, "advanced": 2, "all": 0}


class PlanIn(BaseModel):
    goal: Optional[str] = Field(default=None, max_length=40)
    level: Optional[str] = Field(default="beginner", max_length=20)
    days_per_week: int = Field(default=3, ge=1, le=7)
    minutes: int = Field(default=30, ge=5, le=120)
    focus: Optional[str] = Field(default=None, max_length=40)
    weeks: int = Field(default=4, ge=1, le=8)
    today: Optional[str] = Field(default=None, max_length=10)  # the member's local date (YYYY-MM-DD)


def _local_today(value: Optional[str]) -> date:
    """The member's own date (the app sends it); falls back to the server's date."""
    server = now_utc().date()
    try:
        d = date.fromisoformat(str(value)[:10]) if value else server
    except ValueError:
        d = server
    return d if abs((d - server).days) <= 1 else server


async def _accessible_videos(user: dict, level: str, minutes: int, focus: Optional[str]) -> List[dict]:
    """Library classes this member can play now, best match first."""
    has_library = bool(await membership_with(user["id"], "includes_library"))
    vis = ["free", "members"] if has_library else ["free"]
    rows = await db.videos.find({"visibility": {"$in": vis}, "program_id": {"$in": [None, ""]}}, {"_id": 0}).to_list(2000)
    want = LEVELS.get((level or "beginner").lower(), 0)
    f = (focus or "").lower()

    def score(v):
        m = v.get("duration_minutes") or 30
        s = -abs(m - minutes) / 10
        s -= abs(LEVELS.get((v.get("level") or "all").lower(), want) - want) * 1.5
        if f and f in [x.lower() for x in v.get("focus_areas") or []]:
            s += 2
        return s
    rows.sort(key=score, reverse=True)
    return rows


async def build_plan(user: dict, answers: PlanIn) -> dict:
    from routers.quiz import QuizAnswers, _compute_recommendation
    program, plan_rec, _ = await _compute_recommendation(QuizAnswers(goal=answers.goal, level=answers.level, days_per_week=answers.days_per_week,
                                                                     focus=answers.focus, minutes=answers.minutes))
    start = _local_today(answers.today)
    lessons: List[dict] = []
    owns = False
    if program:
        owns = bool((await program_access(user["id"], program["id"])).get("has_access"))
        if owns:
            rows = await db.program_lessons.find({"program_id": program["id"]}, {"_id": 0}).sort("order_index", 1).to_list(500)
            done = {w["video_id"] for w in await db.watch_progress.find({"user_id": user["id"], "completed": True}, {"_id": 0, "video_id": 1}).to_list(5000)}
            vids = {v["id"]: v for v in await db.videos.find({"id": {"$in": [r["video_id"] for r in rows]}}, {"_id": 0}).to_list(500)}
            lessons = [vids[r["video_id"]] for r in rows if r["video_id"] in vids and r["video_id"] not in done]
    library = await _accessible_videos(user, answers.level or "beginner", answers.minutes, answers.focus)
    breath = await db.meditations.find({}, {"_id": 0}).to_list(200)
    breath.sort(key=lambda m: abs((m.get("duration_minutes") or 10) - min(15, answers.minutes)))
    calm = (answers.goal or "").lower() == "calm"

    days, li, vi, bi = [], 0, 0, 0
    pattern = WEEKDAYS.get(answers.days_per_week, WEEKDAYS[3])
    total_days = answers.weeks * 7
    week_live = {}
    upcoming = await db.class_instances.find({"status": {"$ne": "cancelled"}, "location_type": "online",
                                              "start_time": {"$gte": now_utc().isoformat()}}, {"_id": 0}).sort("start_time", 1).to_list(400)
    for offset in range(total_days):
        d = start + timedelta(days=offset)
        if d.weekday() not in pattern:
            continue
        week = offset // 7 + 1
        items = []
        main = None
        if calm and len(days) % 2 == 1 and breath:
            m = breath[bi % len(breath)]; bi += 1
            main = {"kind": "meditation", "ref_id": m.get("id"), "title": m.get("title"), "minutes": m.get("duration_minutes") or 10, "url": "/meditations"}
        elif li < len(lessons):
            v = lessons[li]; li += 1
            main = {"kind": "lesson", "ref_id": v["id"], "title": v.get("title"), "minutes": v.get("duration_minutes") or answers.minutes,
                    "url": f"/library/{v['id']}", "program_title": program.get("title") if program else None}
        elif library:
            v = library[vi % len(library)]; vi += 1
            main = {"kind": "video", "ref_id": v["id"], "title": v.get("title"), "minutes": v.get("duration_minutes") or answers.minutes, "url": f"/library/{v['id']}"}
        elif breath:
            m = breath[bi % len(breath)]; bi += 1
            main = {"kind": "meditation", "ref_id": m.get("id"), "title": m.get("title"), "minutes": m.get("duration_minutes") or 10, "url": "/meditations"}
        if main:
            items.append(main)
        if answers.minutes >= 30 and breath and main and main["kind"] != "meditation" and len(days) % 3 == 2:
            m = breath[bi % len(breath)]; bi += 1
            items.append({"kind": "meditation", "ref_id": m.get("id"), "title": m.get("title"), "minutes": m.get("duration_minutes") or 8, "url": "/meditations"})
        # One live class a week: the first online class on a practice day of that week.
        if week not in week_live:
            live = next((c for c in upcoming if (parse_dt(c["start_time"]) or now_utc()).date() == d), None)
            if live:
                week_live[week] = live["id"]
                items.append({"kind": "live", "ref_id": live["id"], "title": live.get("title"), "minutes": live.get("duration_minutes") or 60,
                              "url": f"/schedule/{live['id']}", "start_time": live.get("start_time")})
        if items:
            days.append({"index": len(days), "date": d.isoformat(), "week": week, "items": items, "done_at": None})
    if not days:
        raise HTTPException(409, "We couldn't find classes for your plan yet. Please try again soon.")
    return {
        "id": gen_id(), "user_id": user["id"], "status": "active", "created_at": now_utc().isoformat(),
        "start_date": start.isoformat(), "end_date": (start + timedelta(days=total_days - 1)).isoformat(),
        "answers": answers.model_dump(exclude={"today"}), "weeks": answers.weeks,
        "program": {"id": program["id"], "title": program.get("title"), "owned": owns} if program else None,
        "membership_suggestion": {"id": plan_rec["id"], "name": plan_rec.get("name")} if plan_rec else None,
        "days": days,
    }


def _summary(plan: dict, today: date) -> dict:
    days = plan.get("days") or []
    done = sum(1 for d in days if d.get("done_at"))
    today_iso = today.isoformat()
    step = next((d for d in days if d["date"] == today_iso), None)
    nxt = next((d for d in days if d["date"] >= today_iso and not d.get("done_at")), None)
    missed = sum(1 for d in days if d["date"] < today_iso and not d.get("done_at"))
    return {"total": len(days), "done": done, "percent": round(done * 100 / len(days)) if days else 0,
            "today": step, "next": nxt, "missed": missed, "finished": bool(days) and days[-1]["date"] < today_iso}


@api.post("/me/plan")
async def create_plan(payload: PlanIn, user: dict = Depends(get_current_user)):
    plan = await build_plan(user, payload)
    await db.practice_plans.update_many({"user_id": user["id"], "status": "active"}, {"$set": {"status": "replaced"}})
    await db.practice_plans.insert_one({**plan, "_id": plan["id"]})
    await db.users.update_one({"id": user["id"]}, {"$set": {"level": payload.level or "beginner", "goals": [g for g in [payload.goal, payload.focus] if g]}})
    return {**plan, "summary": _summary(plan, _local_today(payload.today))}


@api.get("/me/plan")
async def get_plan(today: Optional[str] = None, user: dict = Depends(get_current_user)):
    plan = await db.practice_plans.find_one({"user_id": user["id"], "status": "active"}, {"_id": 0}, sort=[("created_at", -1)])
    if not plan:
        return None
    return {**plan, "summary": _summary(plan, _local_today(today))}


class DayDone(BaseModel):
    done: bool = True


@api.post("/me/plan/days/{index}")
async def mark_day(index: int, payload: DayDone, user: dict = Depends(get_current_user)):
    plan = await db.practice_plans.find_one({"user_id": user["id"], "status": "active"}, {"_id": 0}, sort=[("created_at", -1)])
    if not plan or index < 0 or index >= len(plan.get("days") or []):
        raise HTTPException(404, "Plan day not found")
    value = now_utc().isoformat() if payload.done else None
    await db.practice_plans.update_one({"id": plan["id"]}, {"$set": {f"days.{index}.done_at": value}})
    if payload.done:
        try:
            from routers.streaks import record_practice
            await record_practice(user["id"], source="plan", ref_id=plan["id"])
        except Exception:
            pass
    plan["days"][index]["done_at"] = value
    return {"ok": True, "summary": _summary(plan, now_utc().date())}


@api.delete("/me/plan")
async def end_plan(user: dict = Depends(get_current_user)):
    await db.practice_plans.update_many({"user_id": user["id"], "status": "active"}, {"$set": {"status": "ended"}})
    return {"ok": True}


async def monthly_theme() -> Optional[dict]:
    from routers.settings import get_setting
    theme = await get_setting("monthly_theme") or {}
    if not isinstance(theme, dict) or not theme.get("title"):
        return None
    month = str(theme.get("month") or "")
    if month and month != now_utc().strftime("%Y-%m"):
        return None
    return {k: theme.get(k) for k in ("title", "text", "image", "link_label", "link_url", "month")}


@api.get("/community/theme")
async def community_theme():
    return await monthly_theme()


@api.get("/me/today")
async def my_today(today: Optional[str] = None, user: dict = Depends(get_current_user)):
    """Everything the home screen shows first, in one call."""
    local = _local_today(today)
    plan = await db.practice_plans.find_one({"user_id": user["id"], "status": "active"}, {"_id": 0, "days": 1, "id": 1, "program": 1, "weeks": 1}, sort=[("created_at", -1)])
    summary = _summary(plan, local) if plan else None
    now_iso = now_utc().isoformat()
    booked = await db.bookings.find({"user_id": user["id"], "status": {"$in": ["confirmed", "waitlist"]}}, {"_id": 0}).to_list(300)
    next_booked = None
    if booked:
        rows = await db.class_instances.find({"id": {"$in": [b["class_instance_id"] for b in booked]}, "start_time": {"$gte": now_iso}, "status": {"$ne": "cancelled"}},
                                             {"_id": 0, "zoom_start_url": 0, "zoom_join_url": 0, "recording_url": 0}).sort("start_time", 1).to_list(1)
        if rows:
            b = next(x for x in booked if x["class_instance_id"] == rows[0]["id"])
            next_booked = {**rows[0], "booking_id": b["id"], "booking_status": b["status"]}
    suggestion = None
    if not next_booked:
        for c in await db.class_instances.find({"start_time": {"$gte": now_iso}, "status": {"$ne": "cancelled"}},
                                                {"_id": 0, "zoom_start_url": 0, "zoom_join_url": 0, "recording_url": 0}).sort("start_time", 1).to_list(20):
            acc = await class_access(user["id"], c)
            suggestion = {**c, "included": bool(acc), "spots_left": max(0, int(c.get("capacity") or 0) - int(c.get("bookings_count") or 0))}
            break
    streak = await db.practice_streaks.find_one({"user_id": user["id"]}, {"_id": 0, "current_streak": 1, "longest_streak": 1, "last_practice_date": 1})
    return {"date": local.isoformat(), "plan": {"id": plan["id"], "program": plan.get("program"), "summary": summary} if plan else None,
            "next_booked": next_booked, "suggested_class": suggestion, "streak": streak, "theme": await monthly_theme()}


@api.get("/videos/{video_id}/today")
async def practised_today(video_id: str):
    """How many people practised this class today (a small community signal, no names)."""
    start = now_utc().replace(hour=0, minute=0, second=0, microsecond=0).isoformat()
    n = await db.watch_progress.count_documents({"video_id": video_id, "updated_at": {"$gte": start}})
    return {"count": n}
