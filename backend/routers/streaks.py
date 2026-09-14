"""Practice streaks — track daily practice, celebrate milestones."""
import os
import json
import logging
from datetime import date, datetime, timedelta, timezone
from typing import Optional
from fastapi import Depends
from pydantic import BaseModel

from core import api, db, now_utc, gen_id, get_current_user

logger = logging.getLogger("tony-yoga.streaks")
MILESTONES = [7, 30, 100, 365]
FREEZES_PER_MONTH = 2


class LogPractice(BaseModel):
    source: Optional[str] = "manual"  # manual | class | video
    ref_id: Optional[str] = None      # class_instance_id / video_id
    duration_minutes: Optional[int] = None


def _today() -> date:
    return now_utc().date()


def _month_key(d: date) -> str:
    return f"{d.year:04d}-{d.month:02d}"


def _parse_date(s: str) -> Optional[date]:
    try:
        return datetime.fromisoformat(s).date()
    except Exception:
        try:
            return date.fromisoformat(s[:10])
        except Exception:
            return None


async def _get_or_create(user_id: str) -> dict:
    doc = await db.practice_streaks.find_one({"user_id": user_id}, {"_id": 0})
    if doc:
        return doc
    doc = {
        "user_id": user_id,
        "current_streak": 0,
        "longest_streak": 0,
        "last_practice_date": None,
        "practices": {},   # {"YYYY-MM-DD": {sources: ["class",...], count: 2}}
        "milestones_unlocked": [],
        "updated_at": now_utc().isoformat(),
    }
    await db.practice_streaks.insert_one(doc)
    return doc


async def _send_milestone_push(user_id: str, milestone: int):
    """Best-effort push notification for a streak milestone. No-op if user has no push subs."""
    try:
        from routers.push import _send_one
        subs = await db.push_subscriptions.find({"user_id": user_id, "active": True}, {"_id": 0}).to_list(10)
        if not subs:
            return
        titles = {7: "One week of practice 🌱", 30: "One month on the mat 🌿", 100: "100 days · unbroken 🪷", 365: "One full year of practice 🕉"}
        payload = {
            "title": titles.get(milestone, f"{milestone}-day streak"),
            "body": f"{milestone} days in a row. Slow down. Breathe in. Begin again.",
            "url": "/streak",
        }
        for s in subs:
            _send_one(s, payload)
    except Exception as e:
        logger.warning(f"milestone push failed: {e}")


async def record_practice(user_id: str, source: str = "manual", ref_id: Optional[str] = None):
    """Idempotent per-day practice log. Returns updated streak dict + newly unlocked milestone (int|None)."""
    doc = await _get_or_create(user_id)
    today = _today()
    today_key = today.isoformat()

    practices = doc.get("practices") or {}
    already_today = today_key in practices

    last = _parse_date(doc.get("last_practice_date")) if doc.get("last_practice_date") else None

    if already_today:
        # Just add source to today's entry
        entry = practices[today_key]
        srcs = set(entry.get("sources") or [])
        srcs.add(source)
        entry["sources"] = sorted(srcs)
        entry["count"] = entry.get("count", 1) + 1
        practices[today_key] = entry
        await db.practice_streaks.update_one(
            {"user_id": user_id},
            {"$set": {"practices": practices, "updated_at": now_utc().isoformat()}},
        )
        return await _get_or_create(user_id), None, False

    # New day for the user
    freeze_used = False
    if last is None:
        new_streak = 1
    elif last == today - timedelta(days=1):
        new_streak = doc.get("current_streak", 0) + 1
    elif last == today:
        new_streak = doc.get("current_streak", 0)  # shouldn't reach here
    else:
        # There is a gap. Try to use freezes for each missed day (up to 2 per calendar month).
        gap = (today - last).days - 1  # number of missed days between last and today
        freezes = dict(doc.get("freezes_used_by_month") or {})
        missed_days = [last + timedelta(days=1 + i) for i in range(gap)]
        needed = {}
        for md in missed_days:
            mk = _month_key(md)
            needed[mk] = needed.get(mk, 0) + 1
        can_cover = True
        for mk, cnt in needed.items():
            used = int(freezes.get(mk, 0))
            if used + cnt > FREEZES_PER_MONTH:
                can_cover = False
                break
        if can_cover:
            for mk, cnt in needed.items():
                freezes[mk] = int(freezes.get(mk, 0)) + cnt
            new_streak = doc.get("current_streak", 0) + 1
            freeze_used = True
            doc["freezes_used_by_month"] = freezes
        else:
            new_streak = 1  # too many missed - reset

    longest = max(doc.get("longest_streak", 0), new_streak)
    practices[today_key] = {"sources": [source], "count": 1}
    if ref_id:
        practices[today_key]["ref_id"] = ref_id

    unlocked = doc.get("milestones_unlocked") or []
    just_unlocked = None
    for m in MILESTONES:
        if new_streak >= m and m not in unlocked:
            unlocked.append(m)
            just_unlocked = m  # last one wins if multiple in same day (won't happen for our thresholds)

    await db.practice_streaks.update_one(
        {"user_id": user_id},
        {"$set": {
            "current_streak": new_streak,
            "longest_streak": longest,
            "last_practice_date": today_key,
            "practices": practices,
            "milestones_unlocked": unlocked,
            "freezes_used_by_month": doc.get("freezes_used_by_month") or {},
            "updated_at": now_utc().isoformat(),
        }},
    )
    if just_unlocked:
        await _send_milestone_push(user_id, just_unlocked)
    fresh = await _get_or_create(user_id)
    return fresh, just_unlocked, freeze_used


@api.post("/practice/log")
async def log_practice(payload: LogPractice, user: dict = Depends(get_current_user)):
    doc, unlocked, freeze_used = await record_practice(user["id"], payload.source or "manual", payload.ref_id)
    return {**doc, "milestone_unlocked": unlocked, "freeze_used": freeze_used}


@api.get("/practice/streak")
async def get_streak(user: dict = Depends(get_current_user)):
    doc = await _get_or_create(user["id"])
    last = _parse_date(doc.get("last_practice_date")) if doc.get("last_practice_date") else None
    today = _today()
    active_streak = doc.get("current_streak", 0)
    if last is None or last < today - timedelta(days=1):
        active_streak = 0
    next_ms = next((m for m in MILESTONES if m > (active_streak or 0)), None)
    calendar = []
    practices = doc.get("practices") or {}
    freezes = doc.get("freezes_used_by_month") or {}
    for i in range(29, -1, -1):
        d = today - timedelta(days=i)
        k = d.isoformat()
        calendar.append({"date": k, "practiced": k in practices})
    this_month_key = _month_key(today)
    freezes_used_this_month = int(freezes.get(this_month_key, 0))
    return {
        "current_streak": active_streak,
        "longest_streak": doc.get("longest_streak", 0),
        "last_practice_date": doc.get("last_practice_date"),
        "practiced_today": today.isoformat() in practices,
        "next_milestone": next_ms,
        "milestones_unlocked": doc.get("milestones_unlocked") or [],
        "calendar": calendar,
        "freezes_per_month": FREEZES_PER_MONTH,
        "freezes_used_this_month": freezes_used_this_month,
        "freezes_remaining_this_month": max(0, FREEZES_PER_MONTH - freezes_used_this_month),
    }
