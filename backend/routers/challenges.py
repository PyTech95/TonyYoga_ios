"""One free, evergreen challenge with per-student, calendar-day progression."""
from datetime import date, datetime, timedelta
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError
from typing import Optional
from fastapi import Depends, HTTPException, Request
from pydantic import BaseModel, Field, field_validator
from core import api, db, now_utc, get_current_user, get_optional_user, require_role
from challenge_defaults import default_challenge
from routers.settings import get_setting


class PracticeDay(BaseModel):
    day: int = Field(ge=1, le=30)
    title: str = Field(min_length=1, max_length=100)
    duration_minutes: int = Field(ge=5, le=120)
    instructions: str = Field(min_length=1, max_length=3000)

    @field_validator("title", "instructions")
    @classmethod
    def nonblank(cls, value):
        if not value.strip():
            raise ValueError("Must not be blank")
        return value.strip()


class ChallengeDefinition(BaseModel):
    id: str = "30-day-practice"
    title: str = Field(min_length=1, max_length=120)
    description: str = Field(min_length=1, max_length=600)
    days: list[PracticeDay] = Field(min_length=30, max_length=30)

    @field_validator("days")
    @classmethod
    def ordered_days(cls, value):
        if [d.day for d in value] != list(range(1, 31)):
            raise ValueError("Exactly 30 ordered days are required")
        return value


class ChallengeProgress(BaseModel):
    timezone: str
    start_date: str
    completed_days: list[int]
    completed_count: int
    unlocked_day: int
    next_unlock_date: Optional[str] = None
    finished: bool


class ChallengeView(BaseModel):
    enabled: bool
    challenge: Optional[ChallengeDefinition] = None
    progress: Optional[ChallengeProgress] = None


async def definition():
    doc = await db.challenge_definitions.find_one({"_id": "30-day-practice"}, {"_id": 0})
    return ChallengeDefinition(**(doc or default_challenge()))


def progress_view(doc):
    if not doc:
        return None
    today = now_utc().astimezone(ZoneInfo(doc["timezone"])).date()
    start = date.fromisoformat(doc["start_date"])
    unlocked = min(30, max(1, (today - start).days + 1))
    days = sorted(set(doc.get("completed_days", [])))
    return ChallengeProgress(timezone=doc["timezone"], start_date=doc["start_date"], completed_days=days,
        completed_count=len(days), unlocked_day=unlocked, finished=len(days) == 30,
        next_unlock_date=(start + timedelta(days=unlocked)).isoformat() if unlocked < 30 else None)


async def require_enabled():
    if not await get_setting("challenges_enabled"):
        raise HTTPException(403, "The practice challenge is currently paused. Your progress is saved.")


@api.get("/challenges/current", response_model=ChallengeView)
async def current_challenge(request: Request):
    enabled = bool(await get_setting("challenges_enabled"))
    user = await get_optional_user(request)
    doc = await db.challenge_enrollments.find_one({"_id": user["id"]}, {"_id": 0}) if user else None
    return ChallengeView(enabled=enabled, challenge=await definition() if enabled else None, progress=progress_view(doc))


class EnrollmentInput(BaseModel):
    timezone: str = Field(min_length=1, max_length=80)

    @field_validator("timezone")
    @classmethod
    def valid_timezone(cls, value):
        try:
            ZoneInfo(value)
        except (ZoneInfoNotFoundError, ValueError):
            raise ValueError("Choose a valid IANA timezone")
        return value


@api.post("/challenges/enroll", response_model=ChallengeProgress)
async def enroll(payload: EnrollmentInput, user=Depends(get_current_user)):
    await require_enabled()
    now = now_utc()
    await db.challenge_enrollments.update_one({"_id": user["id"]}, {"$setOnInsert": {
        "user_id": user["id"], "challenge_id": "30-day-practice", "timezone": payload.timezone,
        "start_date": now.astimezone(ZoneInfo(payload.timezone)).date().isoformat(),
        "joined_at": now.isoformat(), "completed_days": []}}, upsert=True)
    return progress_view(await db.challenge_enrollments.find_one({"_id": user["id"]}, {"_id": 0}))


class CompletionInput(BaseModel):
    completed: bool


@api.put("/challenges/days/{day}", response_model=ChallengeProgress)
async def complete_day(day: int, payload: CompletionInput, user=Depends(get_current_user)):
    await require_enabled()
    doc = await db.challenge_enrollments.find_one({"_id": user["id"]}, {"_id": 0})
    if not doc:
        raise HTTPException(409, "Join the challenge first.")
    if not 1 <= day <= progress_view(doc).unlocked_day:
        raise HTTPException(422, "This practice day has not unlocked yet.")
    operation = "$addToSet" if payload.completed else "$pull"
    await db.challenge_enrollments.update_one({"_id": user["id"]}, {operation: {"completed_days": day}})
    return progress_view(await db.challenge_enrollments.find_one({"_id": user["id"]}, {"_id": 0}))


@api.get("/admin/challenges")
async def admin_challenge(request: Request):
    await require_role(request, ["admin"])
    return {"challenge": (await definition()).model_dump(), "enabled": bool(await get_setting("challenges_enabled")),
        "enrolled": await db.challenge_enrollments.count_documents({}),
        "finished": await db.challenge_enrollments.count_documents({"completed_days": {"$size": 30}})}


@api.put("/admin/challenges", response_model=ChallengeDefinition)
async def save_challenge(payload: ChallengeDefinition, request: Request):
    await require_role(request, ["admin"])
    doc = payload.model_dump()
    doc["id"] = "30-day-practice"
    await db.challenge_definitions.update_one({"_id": doc["id"]}, {"$set": doc}, upsert=True)
    return ChallengeDefinition(**doc)