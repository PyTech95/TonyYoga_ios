"""Learning (LMS) on top of Tony's courses.

Courses (programs) already have ordered lessons, drip release, posture assignments with feedback and
certificates. This adds what a full learning system needs:
- Sections (modules) to group lessons, downloadable resources (PDF / links) per lesson.
- Knowledge-check quizzes per lesson with a pass mark; passing completes the lesson.
- "Mark as done" for lessons without video, personal lesson notes, and lesson Q&A with replies from
  Tony / the team.
- Automatic certificate when every lesson of a course is done.
- My learning (per student) and admin reports: enrolled / started / completed, per-lesson drop-off,
  quiz results, unanswered questions, and each student's progress.
"""
import re
from datetime import timedelta
from typing import Dict, List, Optional

from fastapi import Depends, HTTPException, Request
from pydantic import BaseModel, Field

from access_terms import program_access
from core import api, db, gen_id, get_current_user, logger, now_utc, require_role


async def _lesson(lesson_id: str) -> dict:
    lesson = await db.program_lessons.find_one({"id": lesson_id}, {"_id": 0})
    if not lesson:
        raise HTTPException(404, "Lesson not found")
    return lesson


async def has_course_access(user: dict, program_id: str) -> bool:
    if user.get("role") in ("admin", "instructor"):
        return True
    program = await db.programs.find_one({"id": program_id}, {"_id": 0, "price_model": 1})
    if not program:
        return False
    if program.get("price_model") == "free":
        return True
    return bool((await program_access(user["id"], program_id)).get("has_access"))


async def lesson_lock(user: dict, lesson: dict, lessons: Optional[List[dict]] = None, program: Optional[dict] = None) -> Optional[str]:
    """Why this lesson is closed for the user (None = open). Same rules as the course page:
    free previews are open; otherwise the course is needed, drip release must have reached the
    lesson, and a previous lesson that needs a posture video must be passed first."""
    if user.get("role") in ("admin", "instructor") or lesson.get("is_free_preview"):
        return None
    if not await has_course_access(user, lesson["program_id"]):
        return "This lesson is part of a course you don't have yet."
    program = program or await db.programs.find_one({"id": lesson["program_id"]}, {"_id": 0}) or {}
    lessons = lessons if lessons is not None else await db.program_lessons.find({"program_id": lesson["program_id"]}, {"_id": 0}).sort("order_index", 1).to_list(1000)
    idx = next((i for i, l in enumerate(lessons) if l["id"] == lesson["id"]), 0)
    if program.get("drip_enabled"):
        from routers.content import _drip_status, _program_access_since
        locked, available_on = _drip_status(program, idx, await _program_access_since(user, lesson["program_id"]))
        if locked:
            return f"This lesson opens on {str(available_on)[:10]}."
    if idx > 0 and lessons[idx - 1].get("requires_submission"):
        prev = lessons[idx - 1]
        best = await db.assignment_submissions.find_one({"user_id": user["id"], "lesson_id": prev["id"], "score": {"$ne": None}}, {"_id": 0, "score": 1},
                                                        sort=[("score", -1)])
        if not best or int(best.get("score") or 0) < int(prev.get("pass_threshold") or 60):
            return "Pass the posture video of the previous lesson to open this one."
    return None


async def _require_access(user: dict, lesson: dict):
    why = await lesson_lock(user, lesson)
    if why:
        raise HTTPException(403, why)


def public_quiz(quiz: Optional[dict]) -> Optional[dict]:
    """Questions without the answers."""
    if not quiz or not quiz.get("questions"):
        return None
    return {"pass_percent": int(quiz.get("pass_percent") or 70),
            "questions": [{"index": i, "q": q["q"], "options": q["options"], "multi": False} for i, q in enumerate(quiz["questions"])]}


async def done_lessons(user_id: str, program_id: str, lessons: Optional[List[dict]] = None) -> set:
    """Lesson ids the student has finished (video watched, marked done, or quiz passed)."""
    lessons = lessons if lessons is not None else await db.program_lessons.find({"program_id": program_id}, {"_id": 0, "id": 1, "video_id": 1}).to_list(1000)
    vids = {l["video_id"]: l["id"] for l in lessons if l.get("video_id")}
    out = set()
    for w in await db.watch_progress.find({"user_id": user_id, "video_id": {"$in": list(vids)}, "completed": True}, {"_id": 0, "video_id": 1}).to_list(5000):
        out.add(vids[w["video_id"]])
    for c in await db.lesson_completions.find({"user_id": user_id, "program_id": program_id}, {"_id": 0, "lesson_id": 1}).to_list(5000):
        out.add(c["lesson_id"])
    return out


async def _complete(user: dict, lesson: dict, source: str):
    await db.lesson_completions.update_one({"user_id": user["id"], "lesson_id": lesson["id"]}, {"$setOnInsert": {
        "id": gen_id(), "user_id": user["id"], "lesson_id": lesson["id"], "program_id": lesson["program_id"], "source": source,
        "completed_at": now_utc().isoformat()}}, upsert=True)
    if lesson.get("video_id"):
        # Keep the video's progress in step so "continue watching" and certificates agree.
        await db.watch_progress.update_one({"user_id": user["id"], "video_id": lesson["video_id"]},
                                           {"$set": {"user_id": user["id"], "video_id": lesson["video_id"], "completed": True, "updated_at": now_utc().isoformat()}},
                                           upsert=True)
    try:
        from routers.streaks import record_practice
        await record_practice(user["id"], source="lesson", ref_id=lesson["id"])
    except Exception:
        pass
    return await maybe_certificate(user, lesson["program_id"])


async def maybe_certificate(user: dict, program_id: str) -> Optional[dict]:
    """Issue the course certificate once every lesson is done (and tell the student)."""
    lessons = await db.program_lessons.find({"program_id": program_id}, {"_id": 0, "id": 1, "video_id": 1}).to_list(1000)
    if not lessons:
        return None
    done = await done_lessons(user["id"], program_id, lessons)
    if not all(l["id"] in done for l in lessons):
        return None
    existing = await db.certificates.find_one({"user_id": user["id"], "program_id": program_id}, {"_id": 0})
    if existing:
        return existing
    full_lessons = await db.program_lessons.find({"program_id": program_id, "requires_submission": True}, {"_id": 0, "id": 1, "pass_threshold": 1}).to_list(1000)
    for l in full_lessons:
        best = await db.assignment_submissions.find_one({"user_id": user["id"], "lesson_id": l["id"], "score": {"$ne": None}}, {"_id": 0, "score": 1}, sort=[("score", -1)])
        if not best or int(best.get("score") or 0) < int(l.get("pass_threshold") or 60):
            return None
    if existing:
        return existing
    program = await db.programs.find_one({"id": program_id}, {"_id": 0, "title": 1}) or {}
    full = await db.users.find_one({"id": user["id"]}, {"_id": 0, "name": 1}) or {}
    cert = {"id": gen_id(), "code": gen_id()[:8].upper(), "user_id": user["id"], "user_name": full.get("name") or user.get("name") or "Student",
            "program_id": program_id, "program_title": program.get("title") or "Course", "lessons_count": len(lessons), "issued_at": now_utc().isoformat()}
    await db.certificates.insert_one({**cert})
    try:
        from notify import notify_member
        await notify_member(user["id"], "Course completed — your certificate is ready", f"Congratulations on finishing {cert['program_title']}!",
                            f"/certificate/{cert['code']}", dedupe_key=f"cert:{program_id}:{user['id']}")
    except Exception as exc:
        logger.warning("certificate notification failed (%s)", type(exc).__name__)
    return cert


# ---------------------------------------------------------------------------
# Student

@api.get("/lms/programs/{program_id}/me")
async def my_course_progress(program_id: str, user: dict = Depends(get_current_user)):
    program = await db.programs.find_one({"id": program_id}, {"_id": 0, "id": 1, "title": 1, "cover_image": 1})
    if not program:
        raise HTTPException(404, "Course not found")
    access = await has_course_access(user, program_id)
    lessons = await db.program_lessons.find({"program_id": program_id}, {"_id": 0}).sort("order_index", 1).to_list(1000)
    vids = {v["id"]: v for v in await db.videos.find({"id": {"$in": [l.get("video_id") for l in lessons]}}, {"_id": 0, "id": 1, "title": 1, "duration_minutes": 1}).to_list(1000)}
    done = await done_lessons(user["id"], program_id, lessons)
    attempts = {}
    for a in await db.quiz_attempts.find({"user_id": user["id"], "program_id": program_id}, {"_id": 0}).to_list(5000):
        best = attempts.get(a["lesson_id"])
        if not best or a["score"] > best["score"]:
            attempts[a["lesson_id"]] = a
    notes = {n["lesson_id"] for n in await db.lesson_notes.find({"user_id": user["id"], "program_id": program_id}, {"_id": 0, "lesson_id": 1}).to_list(1000)}
    sections: List[dict] = []
    nxt = None
    program_doc = await db.programs.find_one({"id": program_id}, {"_id": 0}) or {}
    for idx, l in enumerate(lessons):
        v = vids.get(l.get("video_id")) or {}
        why = await lesson_lock(user, l, lessons, program_doc) if access else (None if l.get("is_free_preview") else "no access")
        unlocked = why is None
        item = {"id": l["id"], "index": idx, "title": l.get("title") or v.get("title") or f"Lesson {idx + 1}", "video_id": l.get("video_id"),
                "minutes": v.get("duration_minutes"), "done": l["id"] in done, "has_quiz": bool((l.get("quiz") or {}).get("questions")),
                "quiz_score": (attempts.get(l["id"]) or {}).get("score"), "quiz_passed": (attempts.get(l["id"]) or {}).get("passed"),
                "resources": (l.get("resources") or []) if unlocked else [], "resource_count": len(l.get("resources") or []),
                "has_note": l["id"] in notes, "free_preview": bool(l.get("is_free_preview")), "requires_submission": bool(l.get("requires_submission")),
                "locked": not unlocked, "locked_reason": why if access else None}
        name = (l.get("section") or "").strip() or "Lessons"
        if not sections or sections[-1]["title"] != name:
            sections.append({"title": name, "lessons": []})
        sections[-1]["lessons"].append(item)
        if nxt is None and not item["done"] and unlocked:
            nxt = item
    total = len(lessons)
    cert = await db.certificates.find_one({"user_id": user["id"], "program_id": program_id}, {"_id": 0})
    return {"program": program, "has_access": access, "sections": sections, "total": total, "done": len(done & {l["id"] for l in lessons}),
            "percent": round(len(done & {l["id"] for l in lessons}) * 100 / total) if total else 0, "next": nxt, "certificate": cert}


class DoneIn(BaseModel):
    done: bool = True


@api.post("/lms/lessons/{lesson_id}/complete")
async def mark_lesson(lesson_id: str, payload: DoneIn, user: dict = Depends(get_current_user)):
    lesson = await _lesson(lesson_id)
    await _require_access(user, lesson)
    if payload.done and lesson.get("requires_submission") and user.get("role") not in ("admin", "instructor"):
        best = await db.assignment_submissions.find_one({"user_id": user["id"], "lesson_id": lesson_id, "score": {"$ne": None}}, {"_id": 0, "score": 1}, sort=[("score", -1)])
        if not best or int(best.get("score") or 0) < int(lesson.get("pass_threshold") or 60):
            raise HTTPException(409, "Send your posture video and pass it to complete this lesson.")
    if (lesson.get("quiz") or {}).get("questions") and payload.done:
        passed = await db.quiz_attempts.find_one({"user_id": user["id"], "lesson_id": lesson_id, "passed": True})
        if not passed:
            raise HTTPException(409, "Pass the lesson quiz to complete this lesson.")
    if payload.done:
        cert = await _complete(user, lesson, "manual")
        return {"ok": True, "done": True, "certificate": cert}
    await db.lesson_completions.delete_one({"user_id": user["id"], "lesson_id": lesson_id})
    if lesson.get("video_id"):
        await db.watch_progress.update_one({"user_id": user["id"], "video_id": lesson["video_id"]}, {"$set": {"completed": False}})
    return {"ok": True, "done": False}


@api.get("/lms/lessons/{lesson_id}")
async def lesson_extras(lesson_id: str, user: dict = Depends(get_current_user)):
    """Resources, quiz (no answers), my note and my best quiz result for one lesson."""
    lesson = await _lesson(lesson_id)
    await _require_access(user, lesson)
    note = await db.lesson_notes.find_one({"user_id": user["id"], "lesson_id": lesson_id}, {"_id": 0, "text": 1, "updated_at": 1})
    best = await db.quiz_attempts.find_one({"user_id": user["id"], "lesson_id": lesson_id}, {"_id": 0}, sort=[("score", -1)])
    done = lesson_id in await done_lessons(user["id"], lesson["program_id"], [lesson])
    return {"lesson_id": lesson_id, "program_id": lesson["program_id"], "section": lesson.get("section"), "resources": lesson.get("resources") or [],
            "quiz": public_quiz(lesson.get("quiz")), "best_attempt": best, "note": note, "done": done}


class QuizAnswer(BaseModel):
    answers: List[int] = Field(min_length=1, max_length=50)


@api.post("/lms/lessons/{lesson_id}/quiz")
async def take_quiz(lesson_id: str, payload: QuizAnswer, user: dict = Depends(get_current_user)):
    lesson = await _lesson(lesson_id)
    await _require_access(user, lesson)
    quiz = lesson.get("quiz") or {}
    qs = quiz.get("questions") or []
    if not qs:
        raise HTTPException(404, "This lesson has no quiz.")
    if len(payload.answers) != len(qs):
        raise HTTPException(422, "Answer every question.")
    today = now_utc().replace(hour=0, minute=0, second=0, microsecond=0).isoformat()
    if await db.quiz_attempts.count_documents({"user_id": user["id"], "lesson_id": lesson_id, "at": {"$gte": today}}) >= 10:
        raise HTTPException(429, "You've tried this quiz 10 times today. Try again tomorrow.")
    results = []
    correct = 0
    for i, q in enumerate(qs):
        ok = payload.answers[i] == int(q["answer"])
        correct += ok
        results.append({"index": i, "correct": ok, "answer": int(q["answer"]), "explain": q.get("explain") or ""})
    score = round(correct * 100 / len(qs))
    passed = score >= int(quiz.get("pass_percent") or 70)
    if not passed:
        # Say which answers were wrong, not what the right ones are.
        results = [{"index": r["index"], "correct": r["correct"], "explain": r["explain"] if r["correct"] else ""} for r in results]
    attempt = {"id": gen_id(), "user_id": user["id"], "lesson_id": lesson_id, "program_id": lesson["program_id"], "score": score, "passed": passed,
               "answers": payload.answers, "at": now_utc().isoformat()}
    await db.quiz_attempts.insert_one({**attempt})
    cert = await _complete(user, lesson, "quiz") if passed else None
    return {"score": score, "passed": passed, "pass_percent": int(quiz.get("pass_percent") or 70), "results": results, "certificate": cert}


class NoteIn(BaseModel):
    text: str = Field(max_length=10000)


@api.put("/lms/lessons/{lesson_id}/note")
async def save_note(lesson_id: str, payload: NoteIn, user: dict = Depends(get_current_user)):
    lesson = await _lesson(lesson_id)
    await _require_access(user, lesson)
    if not payload.text.strip():
        await db.lesson_notes.delete_one({"user_id": user["id"], "lesson_id": lesson_id})
        return {"ok": True, "deleted": True}
    await db.lesson_notes.update_one({"user_id": user["id"], "lesson_id": lesson_id},
                                     {"$set": {"text": payload.text, "updated_at": now_utc().isoformat(), "program_id": lesson["program_id"]},
                                      "$setOnInsert": {"id": gen_id(), "user_id": user["id"], "lesson_id": lesson_id}}, upsert=True)
    return {"ok": True}


@api.get("/lms/notes")
async def my_notes(user: dict = Depends(get_current_user), program_id: Optional[str] = None):
    q = {"user_id": user["id"]}
    if program_id:
        q["program_id"] = program_id
    notes = await db.lesson_notes.find(q, {"_id": 0}).sort("updated_at", -1).to_list(1000)
    lessons = {l["id"]: l for l in await db.program_lessons.find({"id": {"$in": [n["lesson_id"] for n in notes]}}, {"_id": 0, "id": 1, "title": 1, "video_id": 1}).to_list(1000)}
    for n in notes:
        n["lesson_title"] = (lessons.get(n["lesson_id"]) or {}).get("title")
        n["video_id"] = (lessons.get(n["lesson_id"]) or {}).get("video_id")
    return notes


# ---------- Questions & answers ----------

def _first(name: Optional[str]) -> str:
    return ((name or "Student").split(" ")[0])[:30]


async def _thread(q: dict, viewer: dict) -> dict:
    staff = viewer.get("role") in ("admin", "instructor")
    out = {"id": q["id"], "lesson_id": q["lesson_id"], "text": q["text"], "created_at": q["created_at"], "mine": q["user_id"] == viewer["id"],
           "author": q.get("user_name") if staff else _first(q.get("user_name")), "status": q.get("status", "open"),
           "replies": [{"text": r["text"], "at": r["at"], "staff": r.get("staff", False), "author": r.get("author") if (staff or r.get("staff")) else _first(r.get("author"))}
                       for r in q.get("replies") or []]}
    if staff:
        out["user_email"] = q.get("user_email")
    return out


@api.get("/lms/lessons/{lesson_id}/questions")
async def lesson_questions(lesson_id: str, user: dict = Depends(get_current_user)):
    lesson = await _lesson(lesson_id)
    await _require_access(user, lesson)
    rows = await db.lesson_questions.find({"lesson_id": lesson_id, "hidden": {"$ne": True}}, {"_id": 0}).sort("created_at", -1).to_list(500)
    return [await _thread(q, user) for q in rows]


class QuestionIn(BaseModel):
    text: str = Field(min_length=3, max_length=3000)


@api.post("/lms/lessons/{lesson_id}/questions")
async def ask_question(lesson_id: str, payload: QuestionIn, user: dict = Depends(get_current_user)):
    lesson = await _lesson(lesson_id)
    await _require_access(user, lesson)
    since = (now_utc() - timedelta(hours=1)).isoformat()
    if await db.lesson_questions.count_documents({"user_id": user["id"], "created_at": {"$gte": since}}) >= 10:
        raise HTTPException(429, "Please wait a little before asking more questions.")
    full = await db.users.find_one({"id": user["id"]}, {"_id": 0, "name": 1, "email": 1}) or {}
    q = {"id": gen_id(), "lesson_id": lesson_id, "program_id": lesson["program_id"], "user_id": user["id"], "user_name": full.get("name"),
         "user_email": full.get("email"), "text": payload.text.strip(), "status": "open", "replies": [], "created_at": now_utc().isoformat()}
    await db.lesson_questions.insert_one({**q})
    try:
        from routers.notifications import push_admins
        program = await db.programs.find_one({"id": lesson["program_id"]}, {"_id": 0, "title": 1}) or {}
        await push_admins("New course question", f"{program.get('title', 'Course')}: {payload.text[:120]}", "/admin?tab=learning")
    except Exception:
        pass
    return await _thread(q, user)


@api.post("/lms/questions/{question_id}/reply")
async def reply_question(question_id: str, payload: QuestionIn, user: dict = Depends(get_current_user)):
    q = await db.lesson_questions.find_one({"id": question_id}, {"_id": 0})
    if not q:
        raise HTTPException(404, "Question not found")
    staff = user.get("role") in ("admin", "instructor")
    if not staff and q["user_id"] != user["id"]:
        raise HTTPException(403, "Only the person who asked and the teachers can reply.")
    full = await db.users.find_one({"id": user["id"]}, {"_id": 0, "name": 1}) or {}
    reply = {"text": payload.text.strip(), "at": now_utc().isoformat(), "staff": staff, "author": full.get("name") or ("Tony Yoga" if staff else "Student"), "user_id": user["id"]}
    await db.lesson_questions.update_one({"id": question_id}, {"$push": {"replies": reply}, "$set": {"status": "answered" if staff else "open", "updated_at": reply["at"]}})
    if staff and q["user_id"] != user["id"]:
        from notify import notify_member
        lesson = await db.program_lessons.find_one({"id": q["lesson_id"]}, {"_id": 0, "video_id": 1}) or {}
        await notify_member(q["user_id"], "Your question was answered", payload.text[:200], f"/library/{lesson.get('video_id')}" if lesson.get("video_id") else "/my-learning")
    return await _thread(await db.lesson_questions.find_one({"id": question_id}, {"_id": 0}), user)


@api.delete("/lms/questions/{question_id}")
async def delete_question(question_id: str, user: dict = Depends(get_current_user)):
    q = await db.lesson_questions.find_one({"id": question_id}, {"_id": 0, "user_id": 1})
    if not q:
        raise HTTPException(404, "Question not found")
    if q["user_id"] != user["id"] and user.get("role") != "admin":
        raise HTTPException(403, "You can only remove your own question.")
    await db.lesson_questions.update_one({"id": question_id}, {"$set": {"hidden": True, "hidden_by": user.get("email")}})
    return {"ok": True}


@api.get("/me/learning")
async def my_learning(user: dict = Depends(get_current_user)):
    from routers.members import member_courses
    courses = [c for c in await member_courses(user["id"]) if c.get("has_access")]
    free = await db.programs.find({"price_model": "free"}, {"_id": 0, "id": 1, "title": 1, "cover_image": 1}).to_list(200)
    seen = {c["program_id"] for c in courses}
    started_free = {w["program_id"] for w in await db.lesson_completions.find({"user_id": user["id"]}, {"_id": 0, "program_id": 1}).to_list(5000)}
    for f in free:
        if f["id"] not in seen and f["id"] in started_free:
            courses.append({"program_id": f["id"], "title": f["title"], "cover_image": f.get("cover_image"), "has_access": True, "ends_at": None})
    out = []
    for c in courses:
        try:
            p = await my_course_progress(c["program_id"], user)
        except HTTPException:
            continue
        out.append({"program_id": c["program_id"], "title": c["title"], "cover_image": c.get("cover_image"), "ends_at": c.get("ends_at"),
                    "percent": p["percent"], "done": p["done"], "total": p["total"], "next": p["next"], "certificate": p["certificate"],
                    "quizzes": [{"lesson": l["title"], "score": l["quiz_score"], "passed": l["quiz_passed"]} for s in p["sections"] for l in s["lessons"] if l["quiz_score"] is not None]})
    out.sort(key=lambda c: (c["percent"] >= 100, -c["percent"]))
    certs = await db.certificates.find({"user_id": user["id"]}, {"_id": 0}).sort("issued_at", -1).to_list(100)
    subs = await db.assignment_submissions.find({"user_id": user["id"]}, {"_id": 0, "id": 1, "lesson_id": 1, "program_id": 1, "score": 1, "status": 1,
                                                                         "feedback": 1, "created_at": 1}).sort("created_at", -1).to_list(20)
    answered = await db.lesson_questions.find({"user_id": user["id"], "status": "answered", "hidden": {"$ne": True}}, {"_id": 0}).sort("updated_at", -1).to_list(10)
    return {"courses": out, "certificates": certs, "assignments": subs, "answered_questions": [await _thread(q, user) for q in answered],
            "notes": await db.lesson_notes.count_documents({"user_id": user["id"]})}


# ---------------------------------------------------------------------------
# Admin: course builder extras + reports

class Resource(BaseModel):
    title: str = Field(min_length=1, max_length=120)
    url: str = Field(min_length=8, max_length=600)


class QuizQuestion(BaseModel):
    q: str = Field(min_length=3, max_length=500)
    options: List[str] = Field(min_length=2, max_length=6)
    answer: int = Field(ge=0, le=5)
    explain: Optional[str] = Field(default=None, max_length=500)


class Quiz(BaseModel):
    pass_percent: int = Field(default=70, ge=0, le=100)
    questions: List[QuizQuestion] = Field(default_factory=list, max_length=30)


class LessonExtras(BaseModel):
    section: Optional[str] = Field(default=None, max_length=80)
    resources: Optional[List[Resource]] = Field(default=None, max_length=20)
    quiz: Optional[Quiz] = None
    title: Optional[str] = Field(default=None, max_length=160)


@api.get("/admin/lms/lessons/{lesson_id}")
async def admin_lesson_extras(lesson_id: str, request: Request):
    await require_role(request, ["admin", "instructor"])
    lesson = await _lesson(lesson_id)
    return {k: lesson.get(k) for k in ("id", "program_id", "title", "section", "resources", "quiz", "order_index", "video_id")}


@api.patch("/admin/lms/lessons/{lesson_id}")
async def admin_update_lesson_extras(lesson_id: str, payload: LessonExtras, request: Request):
    await require_role(request, ["admin", "instructor"])
    await _lesson(lesson_id)
    update = {}
    if payload.section is not None:
        update["section"] = payload.section.strip()
    if payload.title is not None:
        update["title"] = payload.title.strip()
    if payload.resources is not None:
        for r in payload.resources:
            if not (r.url.startswith("https://") or r.url.startswith("/")):
                raise HTTPException(422, "Resource links must start with https://")
        update["resources"] = [r.model_dump() for r in payload.resources]
    if payload.quiz is not None:
        for i, q in enumerate(payload.quiz.questions):
            if q.answer >= len(q.options):
                raise HTTPException(422, f"Question {i + 1}: the right answer must be one of its options.")
        update["quiz"] = payload.quiz.model_dump() if payload.quiz.questions else None
    if update:
        await db.program_lessons.update_one({"id": lesson_id}, {"$set": update})
    return await admin_lesson_extras(lesson_id, request)


class SectionsIn(BaseModel):
    lessons: Dict[str, str] = Field(default_factory=dict)  # lesson_id -> section name


@api.put("/admin/lms/programs/{program_id}/sections")
async def admin_set_sections(program_id: str, payload: SectionsIn, request: Request):
    """Set every lesson's section in one save (the course outline editor)."""
    await require_role(request, ["admin", "instructor"])
    n = 0
    for lid, name in list(payload.lessons.items())[:1000]:
        r = await db.program_lessons.update_one({"id": lid, "program_id": program_id}, {"$set": {"section": (name or "").strip()[:80]}})
        n += r.modified_count
    return {"updated": n}


async def _course_stats(program: dict) -> dict:
    pid = program["id"]
    lessons = await db.program_lessons.find({"program_id": pid}, {"_id": 0}).sort("order_index", 1).to_list(1000)
    grants = await db.access_grants.find({"kind": "program", "target_id": pid, "revoked_at": {"$in": [None, ""]}}, {"_id": 0, "user_id": 1, "ends_at": 1}).to_list(100000)
    now_iso = now_utc().isoformat()
    enrolled = {g["user_id"] for g in grants if str(g.get("ends_at")) > now_iso}
    enrolled |= {e["user_id"] for e in await db.program_enrollments.find({"program_id": pid, "revoked_at": {"$exists": False}}, {"_id": 0, "user_id": 1}).to_list(100000)}
    enrolled |= {p["user_id"] for p in await db.membership_picks.find({"program_id": pid, "removed_at": {"$exists": False}}, {"_id": 0, "user_id": 1}).to_list(100000)}
    vids = {l.get("video_id"): l["id"] for l in lessons if l.get("video_id")}
    per_user: Dict[str, set] = {}
    for w in await db.watch_progress.find({"video_id": {"$in": list(vids)}, "completed": True}, {"_id": 0, "user_id": 1, "video_id": 1}).to_list(500000):
        per_user.setdefault(w["user_id"], set()).add(vids[w["video_id"]])
    for c in await db.lesson_completions.find({"program_id": pid}, {"_id": 0, "user_id": 1, "lesson_id": 1}).to_list(500000):
        per_user.setdefault(c["user_id"], set()).add(c["lesson_id"])
    learners = enrolled | set(per_user)
    total = len(lessons)
    started = [u for u in learners if per_user.get(u)]
    completed = [u for u in learners if total and len(per_user.get(u, set()) & {l["id"] for l in lessons}) >= total]
    attempts = await db.quiz_attempts.find({"program_id": pid}, {"_id": 0, "score": 1, "lesson_id": 1, "passed": 1}).to_list(200000)
    return {"lessons": lessons, "learners": learners, "per_user": per_user, "enrolled": len(enrolled), "started": len(started), "completed": len(completed),
            "completion_rate": round(len(completed) * 100 / len(learners)) if learners else 0,
            "avg_progress": round(sum(len(per_user.get(u, set())) for u in learners) * 100 / (len(learners) * total)) if learners and total else 0,
            "quiz_avg": round(sum(a["score"] for a in attempts) / len(attempts)) if attempts else None, "attempts": attempts,
            "open_questions": await db.lesson_questions.count_documents({"program_id": pid, "status": "open", "hidden": {"$ne": True}}),
            "pending_reviews": await db.assignment_submissions.count_documents({"program_id": pid, "status": "pending_review"}),
            "certificates": await db.certificates.count_documents({"program_id": pid})}


@api.get("/admin/lms/overview")
async def lms_overview(request: Request):
    await require_role(request, ["admin", "instructor"])
    out = []
    for p in await db.programs.find({}, {"_id": 0, "id": 1, "title": 1, "cover_image": 1, "price_model": 1}).to_list(500):
        s = await _course_stats(p)
        out.append({**p, **{k: s[k] for k in ("enrolled", "started", "completed", "completion_rate", "avg_progress", "quiz_avg", "open_questions",
                                                "pending_reviews", "certificates")}, "lessons": len(s["lessons"]),
                    "quizzes": sum(1 for l in s["lessons"] if (l.get("quiz") or {}).get("questions")),
                    "resources": sum(len(l.get("resources") or []) for l in s["lessons"]),
                    "sections": len({(l.get("section") or "").strip() for l in s["lessons"] if (l.get("section") or "").strip()})})
    return {"courses": out, "open_questions": await db.lesson_questions.count_documents({"status": "open", "hidden": {"$ne": True}}),
            "pending_reviews": await db.assignment_submissions.count_documents({"status": "pending_review"})}


@api.get("/admin/lms/programs/{program_id}")
async def lms_course_report(program_id: str, request: Request):
    await require_role(request, ["admin", "instructor"])
    program = await db.programs.find_one({"id": program_id}, {"_id": 0, "id": 1, "title": 1})
    if not program:
        raise HTTPException(404, "Course not found")
    s = await _course_stats(program)
    vids = {v["id"]: v for v in await db.videos.find({"id": {"$in": [l.get("video_id") for l in s["lessons"]]}}, {"_id": 0, "id": 1, "title": 1}).to_list(1000)}
    lesson_rows = []
    for l in s["lessons"]:
        done_n = sum(1 for u in s["learners"] if l["id"] in s["per_user"].get(u, set()))
        at = [a for a in s["attempts"] if a["lesson_id"] == l["id"]]
        lesson_rows.append({"id": l["id"], "title": l.get("title") or (vids.get(l.get("video_id")) or {}).get("title"), "section": l.get("section"),
                            "completed": done_n, "completed_pct": round(done_n * 100 / len(s["learners"])) if s["learners"] else 0,
                            "quiz": bool((l.get("quiz") or {}).get("questions")), "quiz_attempts": len(at),
                            "quiz_pass_rate": round(sum(1 for a in at if a["passed"]) * 100 / len(at)) if at else None,
                            "resources": len(l.get("resources") or []),
                            "questions": await db.lesson_questions.count_documents({"lesson_id": l["id"], "hidden": {"$ne": True}})})
    users = {u["id"]: u for u in await db.users.find({"id": {"$in": list(s["learners"])}}, {"_id": 0, "id": 1, "name": 1, "email": 1}).to_list(100000)}
    ids = {l["id"] for l in s["lessons"]}
    total = len(ids)
    students = []
    for uid in s["learners"]:
        last = await db.lesson_completions.find_one({"user_id": uid, "program_id": program_id}, {"_id": 0, "completed_at": 1}, sort=[("completed_at", -1)])
        mine = s["per_user"].get(uid, set()) & ids
        students.append({"user_id": uid, "name": (users.get(uid) or {}).get("name"), "email": (users.get(uid) or {}).get("email"),
                         "done": len(mine), "percent": round(len(mine) * 100 / total) if total else 0, "last_activity": (last or {}).get("completed_at"),
                         "certificate": bool(await db.certificates.find_one({"user_id": uid, "program_id": program_id}, {"_id": 1}))})
    students.sort(key=lambda r: -r["percent"])
    return {"program": program, **{k: s[k] for k in ("enrolled", "started", "completed", "completion_rate", "avg_progress", "quiz_avg", "open_questions",
                                                      "pending_reviews", "certificates")}, "lessons": lesson_rows, "students": students}


@api.get("/admin/lms/questions")
async def lms_questions(request: Request, status: str = "open"):
    user = await require_role(request, ["admin", "instructor"])
    q = {"hidden": {"$ne": True}}
    if status in ("open", "answered"):
        q["status"] = status
    rows = await db.lesson_questions.find(q, {"_id": 0}).sort("created_at", -1).to_list(500)
    lessons = {l["id"]: l for l in await db.program_lessons.find({"id": {"$in": [r["lesson_id"] for r in rows]}}, {"_id": 0, "id": 1, "title": 1, "video_id": 1}).to_list(1000)}
    programs = {p["id"]: p for p in await db.programs.find({"id": {"$in": [r["program_id"] for r in rows]}}, {"_id": 0, "id": 1, "title": 1}).to_list(500)}
    out = []
    for r in rows:
        t = await _thread(r, user)
        t.update(program_title=(programs.get(r["program_id"]) or {}).get("title"), lesson_title=(lessons.get(r["lesson_id"]) or {}).get("title"))
        out.append(t)
    return out


@api.get("/admin/members/{user_id}/learning")
async def admin_member_learning(user_id: str, request: Request):
    """One student's progress in every course (for the student drawer)."""
    await require_role(request, ["admin", "instructor", "support"])
    user = await db.users.find_one({"id": user_id}, {"_id": 0, "id": 1, "name": 1, "role": 1})
    if not user:
        raise HTTPException(404, "Student not found")
    data = await my_learning(user)
    att = await db.bookings.count_documents({"user_id": user_id, "check_in_flag": True})
    noshow = await db.bookings.count_documents({"user_id": user_id, "attendance": "no_show"})
    last = await db.bookings.find_one({"user_id": user_id, "check_in_flag": True}, {"_id": 0, "checked_in_at": 1}, sort=[("checked_in_at", -1)])
    return {**data, "classes_attended": att, "no_shows": noshow, "last_class": (last or {}).get("checked_in_at")}
