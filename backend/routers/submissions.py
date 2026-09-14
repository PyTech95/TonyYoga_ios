"""Assignment submissions for program lessons.

Flow:
  1. Student watches a lesson (with optional YouTube time-range clip)
  2. Student records themselves doing the posture and pastes a public/unlisted YouTube/Vimeo URL
  3. Backend stores submission, dispatches an async Gemini scoring task
  4. Once scored, the next lesson unlocks (if score >= lesson.pass_threshold)
  5. /api/submissions/mine returns all submissions for the user + completion %
"""
import asyncio
import json
import logging
import re
from typing import Optional

from fastapi import Depends, HTTPException
from pydantic import BaseModel

from core import api, db, now_utc, gen_id, get_current_user, require_role
from models import AssignmentSubmissionCreate

logger = logging.getLogger(__name__)

# Auto-scoring is optional — if no OpenAI key is set (Admin → Settings) or the call fails, we persist
# the submission with status="pending_review" so a human can score it from /admin.
OPENAI_MODEL = "gpt-4o-mini"


async def _openai_key() -> Optional[str]:
    from routers.settings import get_setting
    k = await get_setting("openai_api_key")
    return (k or "").strip() or None


SCORING_PROMPT = """You are a senior yoga instructor evaluating a student's posture submission.

Posture: {posture}
Instructor's rubric for this lesson:
{rubric}

Evaluate alignment, breath, stability, and form. Be encouraging but specific.

Return your response as a single JSON object with EXACTLY these fields:
{{
  "score": <integer 0-100>,
  "feedback": "<one paragraph, max 60 words, constructive>",
  "corrections": ["<short tip 1>", "<short tip 2>", "<short tip 3>"]
}}

Do not include any text outside the JSON object. No markdown fences.
"""


def _extract_json(text: str) -> Optional[dict]:
    if not text:
        return None
    # Strip common markdown fences
    text = re.sub(r"^```(?:json)?\s*|\s*```$", "", text.strip(), flags=re.MULTILINE)
    try:
        return json.loads(text)
    except Exception:
        # Try to find the first { ... } block
        m = re.search(r"\{.*\}", text, re.DOTALL)
        if m:
            try:
                return json.loads(m.group(0))
            except Exception:
                return None
        return None


async def score_with_gemini(youtube_url: str, posture: str, rubric: str = "") -> Optional[dict]:
    """Auto-score a posture submission via OpenAI. Returns None on any failure (→ manual review).

    V1: student videos aren't downloaded to disk, so we send the URL as text context and ask the
    model to grade against the rubric. Swap to direct video bytes when a Vimeo/Mux pipeline exists.
    """
    key = await _openai_key()
    if not key:
        return None
    try:
        from openai import AsyncOpenAI
        client = AsyncOpenAI(api_key=key, timeout=60.0, max_retries=1)
        prompt = SCORING_PROMPT.format(posture=posture, rubric=rubric or f"Standard alignment for {posture}.")
        prompt += f"\n\nStudent submission video URL: {youtube_url}"
        comp = await client.chat.completions.create(
            model=OPENAI_MODEL,
            messages=[
                {"role": "system", "content": "You are a precise yoga posture grader. Output JSON only."},
                {"role": "user", "content": prompt},
            ],
            temperature=0.2, max_tokens=400,
        )
        await client.close()
        data = _extract_json(comp.choices[0].message.content or "")
        if not data:
            return None
        score = int(data.get("score", 0))
        score = max(0, min(100, score))
        feedback = str(data.get("feedback", ""))[:400]
        corrections = [str(c)[:160] for c in (data.get("corrections") or [])[:5]]
        return {"score": score, "feedback": feedback, "corrections": corrections}
    except Exception as e:
        logger.warning(f"OpenAI scoring failed: {e}")
        return None


async def _score_in_background(submission_id: str, video_url: str, posture: str, rubric: str = ""):
    result = await score_with_gemini(video_url, posture, rubric)
    if result is None:
        await db.assignment_submissions.update_one(
            {"id": submission_id},
            {"$set": {"status": "pending_review", "scored_at": now_utc().isoformat()}},
        )
        return
    await db.assignment_submissions.update_one(
        {"id": submission_id},
        {"$set": {
            "status": "scored",
            "score": result["score"],
            "feedback": result["feedback"],
            "corrections": result["corrections"],
            "scored_at": now_utc().isoformat(),
        }},
    )


@api.post("/submissions/create")
async def create_submission(payload: AssignmentSubmissionCreate, user: dict = Depends(get_current_user)):
    lesson = await db.program_lessons.find_one({"id": payload.lesson_id})
    if not lesson:
        raise HTTPException(404, "Lesson not found")
    # Enforce configurable retry limit (0 = unlimited). Passing attempts don't count against you.
    max_attempts = int(lesson.get("max_attempts") or 0)
    if max_attempts > 0:
        threshold = int(lesson.get("pass_threshold") or 60)
        prior = await db.assignment_submissions.find(
            {"user_id": user["id"], "lesson_id": payload.lesson_id}, {"_id": 0, "score": 1},
        ).to_list(1000)
        already_passed = any((s.get("score") or 0) >= threshold for s in prior)
        if not already_passed and len(prior) >= max_attempts:
            raise HTTPException(400, f"You've used all {max_attempts} attempts for this lesson. Please contact your instructor.")
    video = await db.videos.find_one({"id": lesson["video_id"]}, {"_id": 0})
    posture_name = (video or {}).get("title", "the assigned posture")
    rubric = (lesson.get("assignment_prompt") or "").strip()
    sub = {
        "id": gen_id(),
        "user_id": user["id"],
        "lesson_id": payload.lesson_id,
        "program_id": lesson.get("program_id"),
        "video_url": payload.video_url,
        "note": payload.note,
        "status": "queued",
        "score": None,
        "feedback": None,
        "corrections": [],
        "created_at": now_utc().isoformat(),
        "scored_at": None,
    }
    await db.assignment_submissions.insert_one(sub)
    # Fire-and-forget scoring; we don't block the response.
    asyncio.create_task(_score_in_background(sub["id"], payload.video_url, posture_name, rubric))
    sub.pop("_id", None)
    return sub


@api.get("/submissions/mine")
async def my_submissions(user: dict = Depends(get_current_user), program_id: Optional[str] = None):
    q = {"user_id": user["id"]}
    if program_id:
        q["program_id"] = program_id
    subs = await db.assignment_submissions.find(q, {"_id": 0}).sort("created_at", -1).to_list(500)
    return subs


@api.get("/submissions/{submission_id}")
async def get_submission(submission_id: str, user: dict = Depends(get_current_user)):
    sub = await db.assignment_submissions.find_one({"id": submission_id}, {"_id": 0})
    if not sub:
        raise HTTPException(404, "Not found")
    if sub["user_id"] != user["id"] and user.get("role") not in ("admin", "instructor"):
        raise HTTPException(403, "Forbidden")
    return sub


@api.get("/submissions/best/{lesson_id}")
async def best_for_lesson(lesson_id: str, user: dict = Depends(get_current_user)):
    """Return the highest-scoring submission for this lesson by the current user (or None)."""
    subs = await db.assignment_submissions.find(
        {"user_id": user["id"], "lesson_id": lesson_id, "score": {"$ne": None}},
        {"_id": 0},
    ).sort("score", -1).limit(1).to_list(1)
    return subs[0] if subs else None


@api.get("/submissions/attempts/{lesson_id}")
async def attempts_for_lesson(lesson_id: str, user: dict = Depends(get_current_user)):
    """How many attempts the user has used vs. the lesson's configurable limit."""
    lesson = await db.program_lessons.find_one({"id": lesson_id}, {"_id": 0})
    if not lesson:
        raise HTTPException(404, "Lesson not found")
    max_attempts = int(lesson.get("max_attempts") or 0)
    threshold = int(lesson.get("pass_threshold") or 60)
    prior = await db.assignment_submissions.find(
        {"user_id": user["id"], "lesson_id": lesson_id}, {"_id": 0, "score": 1},
    ).to_list(1000)
    used = len(prior)
    passed = any((s.get("score") or 0) >= threshold for s in prior)
    remaining = None if max_attempts == 0 else max(0, max_attempts - used)
    return {
        "lesson_id": lesson_id, "max_attempts": max_attempts, "used": used,
        "remaining": remaining, "passed": passed,
        "locked_out": bool(max_attempts and not passed and used >= max_attempts),
    }


class ProgramReport(BaseModel):
    program_id: str


@api.get("/submissions/report/{program_id}")
async def program_report(program_id: str, user: dict = Depends(get_current_user)):
    """Per-program completion + score report for the current user."""
    lessons = await db.program_lessons.find({"program_id": program_id}, {"_id": 0}).sort("order_index", 1).to_list(500)
    subs = await db.assignment_submissions.find(
        {"user_id": user["id"], "program_id": program_id},
        {"_id": 0},
    ).to_list(1000)
    by_lesson_best = {}
    for s in subs:
        if s.get("score") is None:
            continue
        cur = by_lesson_best.get(s["lesson_id"])
        if cur is None or s["score"] > cur["score"]:
            by_lesson_best[s["lesson_id"]] = s
    rows = []
    total = 0
    completed = 0
    for lesson in lessons:
        best = by_lesson_best.get(lesson["id"])
        if best:
            completed += 1
            total += best["score"]
        rows.append({
            "lesson_id": lesson["id"],
            "order_index": lesson["order_index"],
            "best_score": best["score"] if best else None,
            "feedback": best["feedback"] if best else None,
            "submission_id": best["id"] if best else None,
        })
    average = round(total / completed, 1) if completed else 0
    return {
        "program_id": program_id,
        "total_lessons": len(lessons),
        "completed_lessons": completed,
        "average_score": average,
        "rows": rows,
    }


# ---------- Admin: list all + manual scoring override ----------
class ManualScore(BaseModel):
    submission_id: str
    score: int
    feedback: Optional[str] = None


@api.get("/admin/submissions")
async def admin_list_submissions(user: dict = Depends(get_current_user)):
    await require_role_via_user(user, ["admin", "instructor"])
    return await db.assignment_submissions.find({}, {"_id": 0}).sort("created_at", -1).limit(500).to_list(500)


@api.post("/admin/submissions/score")
async def admin_score_submission(payload: ManualScore, user: dict = Depends(get_current_user)):
    await require_role_via_user(user, ["admin", "instructor"])
    score = max(0, min(100, int(payload.score)))
    res = await db.assignment_submissions.update_one(
        {"id": payload.submission_id},
        {"$set": {
            "score": score, "feedback": payload.feedback or "",
            "status": "scored", "scored_at": now_utc().isoformat(),
            "scored_by": user["id"],
        }},
    )
    if res.matched_count == 0:
        raise HTTPException(404, "Submission not found")
    return {"ok": True, "score": score}


async def require_role_via_user(user: dict, roles):
    if user.get("role") not in roles:
        raise HTTPException(403, "Forbidden")
