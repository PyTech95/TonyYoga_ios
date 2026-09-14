"""Iteration 9: Programs scrape + lock/strip + admin editor endpoints."""
import os
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "").rstrip("/")
if not BASE_URL:
    # Fallback to local
    with open("/app/frontend/.env") as f:
        for line in f:
            if line.startswith("REACT_APP_BACKEND_URL="):
                BASE_URL = line.split("=", 1)[1].strip().rstrip("/")

API = f"{BASE_URL}/api"

ADMIN_EMAIL = "tony@tonyyoga.com"
ADMIN_PASS = "TonyYoga2026!"
STUDENT_EMAIL = "student@demo.com"
STUDENT_PASS = "Student2026!"


@pytest.fixture(scope="session")
def admin_token():
    r = requests.post(f"{API}/auth/login", json={"email": ADMIN_EMAIL, "password": ADMIN_PASS}, timeout=15)
    assert r.status_code == 200, r.text
    return r.json()["token"]


@pytest.fixture(scope="session")
def student_token():
    r = requests.post(f"{API}/auth/login", json={"email": STUDENT_EMAIL, "password": STUDENT_PASS}, timeout=15)
    assert r.status_code == 200, r.text
    return r.json()["token"]


@pytest.fixture(scope="session")
def programs():
    r = requests.get(f"{API}/programs", timeout=15)
    assert r.status_code == 200
    return r.json()


# ---------- Programs catalog ----------
def test_programs_catalog_has_three_eur(programs):
    titles = [p["title"] for p in programs]
    assert "Core 26+ Series" in titles, titles
    assert "Core 40 Fitness" in titles, titles
    assert "Core 84 Asana Mastery" in titles, titles
    by_title = {p["title"]: p for p in programs}
    assert by_title["Core 26+ Series"]["price"] == 199
    assert by_title["Core 40 Fitness"]["price"] == 299
    assert by_title["Core 84 Asana Mastery"]["price"] == 599
    for t in ("Core 26+ Series", "Core 40 Fitness", "Core 84 Asana Mastery"):
        assert by_title[t]["currency"].lower() == "eur", by_title[t]


# ---------- Program detail: anonymous ----------
@pytest.mark.parametrize("title,lesson_count", [
    ("Core 26+ Series", 26),
    ("Core 40 Fitness", 24),
    ("Core 84 Asana Mastery", 18),
])
def test_program_detail_lock_strip_anonymous(programs, title, lesson_count):
    p = next(x for x in programs if x["title"] == title)
    r = requests.get(f"{API}/programs/{p['id']}", timeout=15)
    assert r.status_code == 200
    data = r.json()
    lessons = data["lessons"]
    assert len(lessons) == lesson_count, f"{title} expected {lesson_count}, got {len(lessons)}"
    # viewer payload
    viewer = data.get("viewer")
    assert viewer is not None
    for k in ("owns_program", "has_active_membership", "is_authenticated", "is_staff"):
        assert k in viewer
    assert viewer["is_authenticated"] is False
    # First lesson free preview, unlocked, video_url present
    l0 = lessons[0]
    assert l0.get("is_free_preview") is True, l0
    assert l0.get("is_unlocked") is True
    assert l0["video"].get("video_url"), "free preview should have video_url"
    # Rest locked, video_url stripped
    locked_count = 0
    for l in lessons[1:]:
        assert l.get("is_unlocked") is False, l
        assert "video_url" not in l.get("video", {}) or l["video"].get("video_url") is None
        locked_count += 1
    assert locked_count == lesson_count - 1


# ---------- Video endpoint lock/strip ----------
def test_video_locked_anonymous(programs):
    p = next(x for x in programs if x["title"] == "Core 26+ Series")
    detail = requests.get(f"{API}/programs/{p['id']}", timeout=15).json()
    locked_vid_id = detail["lessons"][1]["video"]["id"]
    free_vid_id = detail["lessons"][0]["video"]["id"]
    # locked
    r = requests.get(f"{API}/videos/{locked_vid_id}", timeout=15)
    assert r.status_code == 200
    d = r.json()
    assert d["is_unlocked"] is False
    assert "video_url" not in d or not d.get("video_url")
    # free preview
    r2 = requests.get(f"{API}/videos/{free_vid_id}", timeout=15)
    assert r2.status_code == 200
    d2 = r2.json()
    assert d2["is_unlocked"] is True
    assert d2.get("video_url"), "free preview must expose video_url"


def test_video_admin_sees_unlocked(programs, admin_token):
    p = next(x for x in programs if x["title"] == "Core 40 Fitness")
    detail = requests.get(f"{API}/programs/{p['id']}", timeout=15).json()
    locked_vid_id = detail["lessons"][2]["video"]["id"]
    r = requests.get(f"{API}/videos/{locked_vid_id}", headers={"Authorization": f"Bearer {admin_token}"}, timeout=15)
    assert r.status_code == 200
    d = r.json()
    assert d["is_unlocked"] is True
    assert d.get("video_url"), "admin must see video_url"


# ---------- Admin PATCH endpoints ----------
def test_patch_program_admin_and_student(programs, admin_token, student_token):
    p = next(x for x in programs if x["title"] == "Core 26+ Series")
    original = p.get("description", "")
    new_desc = original + " [TEST_PATCH]"
    r = requests.patch(f"{API}/admin/programs/{p['id']}",
                       json={"description": new_desc},
                       headers={"Authorization": f"Bearer {admin_token}"}, timeout=15)
    assert r.status_code == 200, r.text
    assert r.json()["description"] == new_desc
    # student forbidden
    rs = requests.patch(f"{API}/admin/programs/{p['id']}",
                        json={"description": "hack"},
                        headers={"Authorization": f"Bearer {student_token}"}, timeout=15)
    assert rs.status_code == 403
    # restore
    requests.patch(f"{API}/admin/programs/{p['id']}",
                   json={"description": original},
                   headers={"Authorization": f"Bearer {admin_token}"}, timeout=15)


def test_patch_program_lesson_toggle_free_preview(programs, admin_token, student_token):
    p = next(x for x in programs if x["title"] == "Core 40 Fitness")
    detail = requests.get(f"{API}/programs/{p['id']}", timeout=15).json()
    lesson = detail["lessons"][1]  # currently locked
    lid = lesson["id"]
    # student forbidden
    rs = requests.patch(f"{API}/admin/program-lessons/{lid}",
                        json={"is_free_preview": True},
                        headers={"Authorization": f"Bearer {student_token}"}, timeout=15)
    assert rs.status_code == 403
    # admin toggle true
    r1 = requests.patch(f"{API}/admin/program-lessons/{lid}",
                        json={"is_free_preview": True},
                        headers={"Authorization": f"Bearer {admin_token}"}, timeout=15)
    assert r1.status_code == 200, r1.text
    assert r1.json()["is_free_preview"] is True
    # verify via GET
    d2 = requests.get(f"{API}/programs/{p['id']}", timeout=15).json()
    matched = next(x for x in d2["lessons"] if x["id"] == lid)
    assert matched["is_free_preview"] is True
    assert matched["is_unlocked"] is True
    # toggle back false
    r2 = requests.patch(f"{API}/admin/program-lessons/{lid}",
                        json={"is_free_preview": False},
                        headers={"Authorization": f"Bearer {admin_token}"}, timeout=15)
    assert r2.status_code == 200
    assert r2.json()["is_free_preview"] is False
    # toggle true again
    r3 = requests.patch(f"{API}/admin/program-lessons/{lid}",
                        json={"is_free_preview": True},
                        headers={"Authorization": f"Bearer {admin_token}"}, timeout=15)
    assert r3.status_code == 200
    assert r3.json()["is_free_preview"] is True
    # restore to false
    requests.patch(f"{API}/admin/program-lessons/{lid}",
                   json={"is_free_preview": False},
                   headers={"Authorization": f"Bearer {admin_token}"}, timeout=15)


def test_patch_video_admin_and_student(programs, admin_token, student_token):
    p = next(x for x in programs if x["title"] == "Core 84 Asana Mastery")
    detail = requests.get(f"{API}/programs/{p['id']}", timeout=15).json()
    vid = detail["lessons"][0]["video"]
    vid_id = vid["id"]
    original_title = vid["title"]
    # student forbidden
    rs = requests.patch(f"{API}/admin/videos/{vid_id}",
                        json={"title": "hack"},
                        headers={"Authorization": f"Bearer {student_token}"}, timeout=15)
    assert rs.status_code == 403
    # admin update
    new_title = original_title + " [TEST_PATCH]"
    r = requests.patch(f"{API}/admin/videos/{vid_id}",
                       json={"title": new_title, "description": "TEST_DESC"},
                       headers={"Authorization": f"Bearer {admin_token}"}, timeout=15)
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["title"] == new_title
    assert body["description"] == "TEST_DESC"
    # restore
    requests.patch(f"{API}/admin/videos/{vid_id}",
                   json={"title": original_title, "description": vid.get("description", "")},
                   headers={"Authorization": f"Bearer {admin_token}"}, timeout=15)
