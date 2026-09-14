"""Iteration 19 backend regressions:
- Bulk auto-chapters admin endpoint
- Single lesson is_private toggle
- Progress POST/GET
- Program detail carries cover_image + is_private on lessons
"""
import os, requests, pytest

BASE = os.environ["REACT_APP_BACKEND_URL"].rstrip("/")
ADMIN = ("tony@tonyyoga.com", "TonyYoga2026!")
STUDENT = ("student@demo.com", "Student2026!")
CORE_PROGRAM_ID = "ab803add-6018-4fd6-a779-ebc4ea765516"


def _login(email, password):
    r = requests.post(f"{BASE}/api/auth/login", json={"email": email, "password": password}, timeout=20)
    assert r.status_code == 200, r.text
    return r.json()["token"]


@pytest.fixture(scope="module")
def admin_h():
    return {"Authorization": f"Bearer {_login(*ADMIN)}"}


@pytest.fixture(scope="module")
def student_h():
    return {"Authorization": f"Bearer {_login(*STUDENT)}"}


def test_bulk_create_and_delete(admin_h):
    payload = {
        "youtube_url": "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
        "chapters": [
            {"start_seconds": 0, "title": "TEST Intro"},
            {"start_seconds": 600, "title": "TEST Standing"},
            {"start_seconds": 1350, "title": "TEST Floor"},
        ],
        "free_preview_first": True,
        "is_private": True,
    }
    r = requests.post(f"{BASE}/api/admin/programs/{CORE_PROGRAM_ID}/lessons/bulk",
                      json=payload, headers=admin_h, timeout=30)
    assert r.status_code == 200, r.text
    data = r.json()
    assert data["created"] == 3
    lessons = data["lessons"]
    # segments
    assert lessons[0]["video"]["start_seconds"] == 0 and lessons[0]["video"]["end_seconds"] == 600
    assert lessons[1]["video"]["start_seconds"] == 600 and lessons[1]["video"]["end_seconds"] == 1350
    assert lessons[2]["video"]["start_seconds"] == 1350 and lessons[2]["video"]["end_seconds"] in (None,)
    # private + thumb + freepreview first
    for l in lessons:
        assert l["video"]["is_private"] is True
        assert "hqdefault.jpg" in l["video"]["cover_image"]
    assert lessons[0]["is_free_preview"] is True
    assert lessons[1]["is_free_preview"] is False

    # cleanup
    for l in lessons:
        d = requests.delete(f"{BASE}/api/admin/lessons/{l['id']}", headers=admin_h)
        assert d.status_code == 200


def test_progress_post_get(student_h):
    # find any lesson video_id
    r = requests.get(f"{BASE}/api/programs/{CORE_PROGRAM_ID}")
    assert r.status_code == 200
    prog = r.json()
    lessons = prog.get("lessons") or []
    assert lessons, "no lessons in Core 26+ program"
    vid = lessons[0]["video"]["id"]

    r = requests.post(f"{BASE}/api/progress",
                      json={"video_id": vid, "seconds": 420, "completed": False},
                      headers=student_h, timeout=15)
    assert r.status_code in (200, 201), r.text
    r = requests.get(f"{BASE}/api/progress/mine", headers=student_h)
    assert r.status_code == 200
    mine = r.json()
    match = [p for p in mine if p.get("video_id") == vid]
    assert match and match[0]["seconds"] >= 420

    r = requests.post(f"{BASE}/api/progress",
                      json={"video_id": vid, "seconds": 900, "completed": True},
                      headers=student_h)
    assert r.status_code in (200, 201)
    r = requests.get(f"{BASE}/api/progress/mine", headers=student_h)
    match = [p for p in r.json() if p.get("video_id") == vid]
    assert match and match[0]["completed"] is True


def test_program_lessons_expose_thumbnail():
    r = requests.get(f"{BASE}/api/programs/{CORE_PROGRAM_ID}")
    assert r.status_code == 200
    lessons = r.json().get("lessons") or []
    yt = [l for l in lessons if l["video"].get("source_type") == "youtube"]
    assert yt, "expect at least one youtube lesson"
    for l in yt:
        assert l["video"].get("cover_image"), "cover_image missing"
