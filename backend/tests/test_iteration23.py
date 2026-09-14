"""Iteration 23 — Full LMS flow: admin authors course/lessons, student learns free course,
one-time purchase creates a Stripe checkout session, staff gating on purchase page.

Preserves side-effects intentionally: leaves one 'TEST23 Free Yoga' course (free) so
downstream UI tests / demos can navigate. Cleans up the one_time test course.
"""
import os
import time
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL").rstrip("/")
ADMIN = {"email": "tony@tonyyoga.com", "password": "TonyYoga2026!"}
STUDENT = {"email": "student@demo.com", "password": "Student2026!"}
YT_URL_1 = "https://www.youtube.com/watch?v=v7AYKMP6rOE"  # Yoga w/ Adriene 30 min
YT_URL_2 = "https://www.youtube.com/watch?v=4pKly2JojMw"


def _login(creds):
    r = requests.post(f"{BASE_URL}/api/auth/login", json=creds, timeout=15)
    assert r.status_code == 200, r.text
    return r.json()["token"]


def _h(tok):
    return {"Authorization": f"Bearer {tok}"}


@pytest.fixture(scope="module")
def admin_token():
    return _login(ADMIN)


@pytest.fixture(scope="module")
def student_token():
    return _login(STUDENT)


# ------- Admin authoring: create one_time course + lessons -------
@pytest.fixture(scope="module")
def admin_id(admin_token):
    r = requests.get(f"{BASE_URL}/api/auth/me", headers=_h(admin_token), timeout=10)
    assert r.status_code == 200
    return r.json()["id"]


@pytest.fixture(scope="module")
def one_time_program(admin_token, admin_id):
    payload = {
        "instructor_id": admin_id,
        "title": "TEST23 One-Time Course",
        "description": "Iteration 23 one-time test course",
        "level": "all", "style": "Yoga",
        "duration_weeks": 1,
        "price": 49, "currency": "EUR",
        "price_model": "one_time",
        "cover_image": "https://img.youtube.com/vi/v7AYKMP6rOE/hqdefault.jpg",
    }
    r = requests.post(f"{BASE_URL}/api/admin/programs", json=payload, headers=_h(admin_token), timeout=15)
    assert r.status_code == 200, r.text
    prog = r.json()
    assert prog["price_model"] == "one_time"
    yield prog
    # cleanup: patch to hide? no delete endpoint — leave, but rename
    requests.patch(f"{BASE_URL}/api/admin/programs/{prog['id']}",
                   json={"title": "TEST23 One-Time Course (archived)"},
                   headers=_h(admin_token), timeout=10)


@pytest.fixture(scope="module")
def free_program(admin_token, admin_id):
    payload = {
        "instructor_id": admin_id,
        "title": "TEST23 Free Yoga",
        "description": "Iteration 23 free LMS test course",
        "level": "beginner", "style": "Vinyasa",
        "duration_weeks": 1,
        "price": 0, "currency": "EUR",
        "price_model": "free",
        "cover_image": "https://img.youtube.com/vi/v7AYKMP6rOE/hqdefault.jpg",
    }
    r = requests.post(f"{BASE_URL}/api/admin/programs", json=payload, headers=_h(admin_token), timeout=15)
    assert r.status_code == 200, r.text
    return r.json()


def test_program_created_and_listed(one_time_program):
    r = requests.get(f"{BASE_URL}/api/programs", timeout=10)
    assert r.status_code == 200
    ids = {p["id"] for p in r.json()}
    assert one_time_program["id"] in ids


def test_admin_add_lessons_free_program(admin_token, free_program):
    # Add 2 lessons via the lessons editor endpoint
    for i, url in enumerate([YT_URL_1, YT_URL_2]):
        payload = {"title": f"TEST23 Free Lesson {i+1}", "youtube_url": url,
                   "duration_minutes": 5, "is_free_preview": False}
        r = requests.post(f"{BASE_URL}/api/admin/programs/{free_program['id']}/lessons",
                          json=payload, headers=_h(admin_token), timeout=15)
        assert r.status_code == 200, r.text
        data = r.json()
        assert data["program_id"] == free_program["id"]
        assert data["video"]["youtube_id"]
    # Verify listing
    r = requests.get(f"{BASE_URL}/api/admin/programs/{free_program['id']}/lessons",
                     headers=_h(admin_token), timeout=10)
    assert r.status_code == 200
    lessons = r.json()
    assert len(lessons) >= 2


def test_admin_add_lesson_one_time_program(admin_token, one_time_program):
    payload = {"title": "TEST23 Paid Lesson 1", "youtube_url": YT_URL_1, "duration_minutes": 5}
    r = requests.post(f"{BASE_URL}/api/admin/programs/{one_time_program['id']}/lessons",
                      json=payload, headers=_h(admin_token), timeout=15)
    assert r.status_code == 200, r.text


# ------- Student view: FREE course unlocked + progress + certificate -------
def test_student_free_program_lessons_unlocked(student_token, free_program):
    r = requests.get(f"{BASE_URL}/api/programs/{free_program['id']}", headers=_h(student_token), timeout=10)
    assert r.status_code == 200, r.text
    prog = r.json()
    assert prog["price_model"] == "free"
    viewer = prog.get("viewer", {})
    assert viewer.get("is_authenticated") is True
    assert viewer.get("is_staff") is False
    assert len(prog["lessons"]) >= 2
    for l in prog["lessons"]:
        assert l["is_unlocked"] is True, f"free lesson should be unlocked: {l}"
        assert l["video"] is not None
        # video_url should be present since content is unlocked
        assert l["video"].get("youtube_id"), l["video"]


def test_student_can_play_video_from_free_course(student_token, free_program):
    r = requests.get(f"{BASE_URL}/api/programs/{free_program['id']}", headers=_h(student_token), timeout=10)
    prog = r.json()
    video_id = prog["lessons"][0]["video"]["id"]
    r2 = requests.get(f"{BASE_URL}/api/videos/{video_id}", headers=_h(student_token), timeout=10)
    assert r2.status_code == 200, r2.text
    v = r2.json()
    assert v.get("is_unlocked") is True
    assert v.get("youtube_id"), v


def test_progress_and_certificate_flow(student_token, free_program):
    # Fetch lesson video ids
    r = requests.get(f"{BASE_URL}/api/programs/{free_program['id']}", headers=_h(student_token), timeout=10)
    prog = r.json()
    video_ids = [l["video"]["id"] for l in prog["lessons"]]
    assert len(video_ids) >= 2
    # Mark each as completed
    for vid in video_ids:
        rp = requests.post(f"{BASE_URL}/api/progress",
                           json={"video_id": vid, "seconds": 600, "completed": True},
                           headers=_h(student_token), timeout=10)
        assert rp.status_code == 200, rp.text
    # Claim certificate
    rc = requests.post(f"{BASE_URL}/api/programs/{free_program['id']}/certificate/claim",
                       headers=_h(student_token), timeout=10)
    assert rc.status_code == 200, rc.text
    body = rc.json()
    assert body.get("eligible") is True, body
    assert body.get("certificate", {}).get("code")


# ------- Student view: ONE_TIME course requires purchase, checkout session works -------
def test_student_one_time_program_locked(student_token, one_time_program):
    r = requests.get(f"{BASE_URL}/api/programs/{one_time_program['id']}", headers=_h(student_token), timeout=10)
    assert r.status_code == 200
    prog = r.json()
    viewer = prog["viewer"]
    assert viewer["owns_program"] is False
    assert viewer["is_staff"] is False
    # Lessons should be locked (no youtube_id served)
    for l in prog["lessons"]:
        if l.get("video"):
            assert l["is_unlocked"] is False, "one-time lesson should be locked for non-owner student"


def test_student_checkout_session_for_program(student_token, one_time_program):
    body = {"item_type": "program", "item_id": one_time_program["id"], "quantity": 1,
            "origin_url": f"{BASE_URL}"}
    r = requests.post(f"{BASE_URL}/api/checkout/session", json=body,
                      headers=_h(student_token), timeout=20)
    # Should NOT be 500; expect 200 with url, or a graceful 400 if stripe key missing.
    assert r.status_code in (200, 400), f"unexpected: {r.status_code} {r.text}"
    if r.status_code == 200:
        data = r.json()
        assert data.get("url", "").startswith("http"), data
        assert "session_id" in data or "url" in data


# ------- Seeded 'Core 26+ Series' one-time course exists and has program-purchase shape -------
def test_seeded_core_program_is_one_time():
    r = requests.get(f"{BASE_URL}/api/programs", timeout=10)
    assert r.status_code == 200
    core = [p for p in r.json() if "Core 26" in (p.get("title") or "")]
    if core:
        p = core[0]
        assert p.get("price_model") == "one_time"
        assert (p.get("price") or 0) > 0


# ------- Staff gating on program purchase -------
def test_admin_sees_staff_flag_on_one_time(admin_token, one_time_program):
    r = requests.get(f"{BASE_URL}/api/programs/{one_time_program['id']}",
                     headers=_h(admin_token), timeout=10)
    assert r.status_code == 200
    prog = r.json()
    assert prog["viewer"]["is_staff"] is True


# ------- Class scheduling (admin) -------
def test_admin_can_create_class_instance(admin_token):
    tpls = requests.get(f"{BASE_URL}/api/class-templates", timeout=10)
    assert tpls.status_code == 200
    if not tpls.json():
        pytest.skip("No class templates seeded; skipping schedule test.")
    tpl_id = tpls.json()[0]["id"]
    payload = {
        "template_id": tpl_id,
        "start_time": "2027-06-01T10:00:00Z",
        "capacity": 12,
        "is_recorded": False,
    }
    r = requests.post(f"{BASE_URL}/api/admin/class-instances", json=payload,
                      headers=_h(admin_token), timeout=10)
    assert r.status_code == 200, r.text
    inst = r.json()
    assert inst.get("id")
    lst = requests.get(f"{BASE_URL}/api/class-instances", timeout=10)
    assert lst.status_code == 200
    assert any(c["id"] == inst["id"] for c in lst.json())
