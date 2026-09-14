"""Iteration 11 backend tests:
- YouTube time-range fields on video (source_url/start/end via PATCH /api/admin/videos/{id})
- Per-lesson assignment fields (assignment_prompt/requires_submission/pass_threshold via PATCH /api/admin/program-lessons/{id})
- Assignment submissions: create / mine / best / report / get (auth) / admin list / admin manual score
- Progressive unlock in GET /api/programs/{id}: lesson 1 always unlocked for owner; lesson 2 locked until lesson 1 passes
"""
import os
import time
import uuid
import pytest
import requests
import pymongo

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://yoga-live-classes.preview.emergentagent.com").rstrip("/")
API = f"{BASE_URL}/api"

ADMIN_EMAIL = "tony@tonyyoga.com"
ADMIN_PASSWORD = "TonyYoga2026!"
STUDENT_EMAIL = "student@demo.com"
STUDENT_PASSWORD = "Student2026!"
YT_URL = "https://www.youtube.com/watch?v=dQw4w9WgXcQ"


def _login(email, password):
    r = requests.post(f"{API}/auth/login", json={"email": email, "password": password}, timeout=30)
    assert r.status_code == 200, f"login failed {r.status_code} {r.text}"
    data = r.json()
    return data["token"], data["user"]


@pytest.fixture(scope="module")
def admin():
    tok, user = _login(ADMIN_EMAIL, ADMIN_PASSWORD)
    return {"token": tok, "user": user, "headers": {"Authorization": f"Bearer {tok}"}}


@pytest.fixture(scope="module")
def student():
    tok, user = _login(STUDENT_EMAIL, STUDENT_PASSWORD)
    return {"token": tok, "user": user, "headers": {"Authorization": f"Bearer {tok}"}}


@pytest.fixture(scope="module")
def core26():
    r = requests.get(f"{API}/programs", timeout=30)
    assert r.status_code == 200
    progs = r.json()
    p = next((x for x in progs if "Core 26" in x.get("title", "")), progs[0])
    full = requests.get(f"{API}/programs/{p['id']}", timeout=30).json()
    return full


@pytest.fixture(scope="module")
def mongo():
    c = pymongo.MongoClient("mongodb://localhost:27017")
    return c[os.environ.get("DB_NAME", "tony_yoga_db")]


@pytest.fixture(scope="module")
def enrolled_student(student, core26, mongo):
    """Ensure the student has access to Core 26 via direct enrollment."""
    pid = core26["id"]
    uid = student["user"]["id"]
    mongo.program_enrollments.update_one(
        {"user_id": uid, "program_id": pid},
        {"$set": {"user_id": uid, "program_id": pid, "id": str(uuid.uuid4()), "source": "test"}},
        upsert=True,
    )
    yield student
    # cleanup test data only
    mongo.assignment_submissions.delete_many({"user_id": uid, "note": {"$regex": "^TEST_"}})


# ---------- Admin PATCH endpoints ----------
class TestAdminPatch:
    def test_patch_video_source_url(self, admin, core26):
        l1 = core26["lessons"][0]
        vid = l1["video"]["id"]
        payload = {"source_url": YT_URL, "start_seconds": 5, "end_seconds": 30}
        r = requests.patch(f"{API}/admin/videos/{vid}", json=payload, headers=admin["headers"], timeout=30)
        assert r.status_code == 200, r.text
        data = r.json()
        assert data.get("source_url") == YT_URL
        assert data.get("start_seconds") == 5
        assert data.get("end_seconds") == 30
        # Persistence
        g = requests.get(f"{API}/videos/{vid}", headers=admin["headers"], timeout=30)
        assert g.status_code == 200
        assert g.json().get("source_url") == YT_URL

    def test_patch_program_lesson_assignment_fields(self, admin, core26):
        l1 = core26["lessons"][0]
        payload = {
            "assignment_prompt": "Demonstrate Tadasana with steady breath.",
            "requires_submission": True,
            "pass_threshold": 60,
        }
        r = requests.patch(f"{API}/admin/program-lessons/{l1['id']}", json=payload, headers=admin["headers"], timeout=30)
        assert r.status_code == 200, r.text
        data = r.json()
        assert data.get("assignment_prompt") == payload["assignment_prompt"]
        assert data.get("requires_submission") is True
        assert data.get("pass_threshold") == 60


# ---------- Submission CRUD ----------
class TestSubmissions:
    def test_create_submission_queued_then_scored(self, enrolled_student, core26, mongo):
        l1 = core26["lessons"][0]
        payload = {"lesson_id": l1["id"], "video_url": YT_URL, "note": "TEST_create"}
        r = requests.post(f"{API}/submissions/create", json=payload, headers=enrolled_student["headers"], timeout=30)
        assert r.status_code == 200, r.text
        sub = r.json()
        assert sub["status"] in ("queued", "scored", "pending_review")
        assert sub["lesson_id"] == l1["id"]
        assert sub["user_id"] == enrolled_student["user"]["id"]
        sub_id = sub["id"]
        # Poll up to ~25s for Gemini scoring or pending_review
        final = None
        for _ in range(25):
            g = requests.get(f"{API}/submissions/{sub_id}", headers=enrolled_student["headers"], timeout=30)
            assert g.status_code == 200
            final = g.json()
            if final["status"] in ("scored", "pending_review"):
                break
            time.sleep(1)
        assert final is not None
        assert final["status"] in ("scored", "pending_review"), f"Unexpected status: {final['status']}"
        if final["status"] == "scored":
            assert isinstance(final["score"], int)
            assert 0 <= final["score"] <= 100
            assert isinstance(final.get("corrections", []), list)
            assert isinstance(final.get("feedback", ""), str)
        # Save for later tests via mongo so we know an entry exists
        TestSubmissions.last_sub_id = sub_id
        TestSubmissions.last_lesson_id = l1["id"]

    def test_get_submission_self(self, enrolled_student):
        sid = getattr(TestSubmissions, "last_sub_id", None)
        assert sid
        r = requests.get(f"{API}/submissions/{sid}", headers=enrolled_student["headers"], timeout=30)
        assert r.status_code == 200
        assert r.json()["id"] == sid

    def test_get_submission_other_user_forbidden(self, admin, enrolled_student, mongo):
        """A different student must receive 403; admin must succeed."""
        sid = getattr(TestSubmissions, "last_sub_id", None)
        # Create a throwaway secondary student account
        secondary_email = f"TEST_other_{uuid.uuid4().hex[:8]}@demo.com"
        reg = requests.post(f"{API}/auth/register", json={
            "email": secondary_email, "password": "OtherPass123!", "name": "Other Student"
        }, timeout=30)
        assert reg.status_code in (200, 201), reg.text
        tok = reg.json()["token"]
        r = requests.get(f"{API}/submissions/{sid}", headers={"Authorization": f"Bearer {tok}"}, timeout=30)
        assert r.status_code == 403
        # Admin succeeds
        ar = requests.get(f"{API}/submissions/{sid}", headers=admin["headers"], timeout=30)
        assert ar.status_code == 200
        # cleanup
        mongo.users.delete_one({"email": secondary_email})

    def test_mine_returns_user_submissions(self, enrolled_student):
        r = requests.get(f"{API}/submissions/mine", headers=enrolled_student["headers"], timeout=30)
        assert r.status_code == 200
        arr = r.json()
        assert isinstance(arr, list)
        sids = [s["id"] for s in arr]
        assert getattr(TestSubmissions, "last_sub_id", None) in sids

    def test_best_for_lesson(self, enrolled_student, mongo):
        lid = getattr(TestSubmissions, "last_lesson_id", None)
        # Force at least one scored submission so the "best" endpoint can return something
        mongo.assignment_submissions.update_one(
            {"id": TestSubmissions.last_sub_id},
            {"$set": {"status": "scored", "score": 75, "feedback": "Solid form", "corrections": ["lift chest"]}},
        )
        r = requests.get(f"{API}/submissions/best/{lid}", headers=enrolled_student["headers"], timeout=30)
        assert r.status_code == 200
        body = r.json()
        assert body is not None
        assert body["lesson_id"] == lid
        assert body["score"] >= 75

    def test_program_report(self, enrolled_student, core26):
        r = requests.get(f"{API}/submissions/report/{core26['id']}", headers=enrolled_student["headers"], timeout=30)
        assert r.status_code == 200
        data = r.json()
        assert data["program_id"] == core26["id"]
        assert data["total_lessons"] == len(core26["lessons"])
        assert isinstance(data["rows"], list)
        assert data["completed_lessons"] >= 1
        assert data["average_score"] >= 75


# ---------- Admin scoring endpoints ----------
class TestAdminScoring:
    def test_admin_list_submissions(self, admin):
        r = requests.get(f"{API}/admin/submissions", headers=admin["headers"], timeout=30)
        assert r.status_code == 200
        assert isinstance(r.json(), list)

    def test_admin_list_forbidden_for_student(self, enrolled_student):
        r = requests.get(f"{API}/admin/submissions", headers=enrolled_student["headers"], timeout=30)
        assert r.status_code == 403

    def test_admin_manual_score(self, admin):
        sid = getattr(TestSubmissions, "last_sub_id", None)
        r = requests.post(f"{API}/admin/submissions/score", json={
            "submission_id": sid, "score": 88, "feedback": "Great alignment."
        }, headers=admin["headers"], timeout=30)
        assert r.status_code == 200
        assert r.json()["score"] == 88

    def test_admin_score_forbidden_for_student(self, enrolled_student):
        sid = getattr(TestSubmissions, "last_sub_id", None)
        r = requests.post(f"{API}/admin/submissions/score", json={
            "submission_id": sid, "score": 50
        }, headers=enrolled_student["headers"], timeout=30)
        assert r.status_code == 403


# ---------- Progressive unlock in /api/programs/{id} ----------
class TestProgressiveUnlock:
    def test_unlock_lesson1_for_owner(self, enrolled_student, core26):
        r = requests.get(f"{API}/programs/{core26['id']}", headers=enrolled_student["headers"], timeout=30)
        assert r.status_code == 200
        lessons = r.json()["lessons"]
        assert lessons[0]["is_unlocked"] is True
        # my_submission should be present after our scored submission
        assert lessons[0].get("my_submission") is not None
        assert lessons[0]["my_submission"].get("score", 0) >= 60

    def test_lesson2_unlocks_when_lesson1_passes(self, enrolled_student, core26):
        r = requests.get(f"{API}/programs/{core26['id']}", headers=enrolled_student["headers"], timeout=30)
        lessons = r.json()["lessons"]
        # lesson 1 has a passing best score (88) → lesson 2 should now be unlocked
        assert lessons[1]["is_unlocked"] is True, "Lesson 2 should unlock after lesson 1 passes"

    def test_lesson2_locked_without_passing_submission(self, enrolled_student, core26, mongo):
        """Wipe the scored submission → lesson 2 should re-lock."""
        uid = enrolled_student["user"]["id"]
        l1_id = core26["lessons"][0]["id"]
        mongo.assignment_submissions.delete_many({"user_id": uid, "lesson_id": l1_id})
        r = requests.get(f"{API}/programs/{core26['id']}", headers=enrolled_student["headers"], timeout=30)
        lessons = r.json()["lessons"]
        assert lessons[0]["is_unlocked"] is True  # first lesson always reachable for owner
        assert lessons[1]["is_unlocked"] is False, "Lesson 2 must re-lock when lesson 1 has no passing submission"

    def test_admin_bypasses_unlock(self, admin, core26):
        r = requests.get(f"{API}/programs/{core26['id']}", headers=admin["headers"], timeout=30)
        lessons = r.json()["lessons"]
        # Admin should see all unlocked
        assert all(l["is_unlocked"] for l in lessons[:3])

    def test_my_submission_field_present(self, enrolled_student, core26):
        r = requests.get(f"{API}/programs/{core26['id']}", headers=enrolled_student["headers"], timeout=30)
        lessons = r.json()["lessons"]
        # Every lesson has the field (may be None)
        for l in lessons:
            assert "my_submission" in l
            assert "pass_threshold" in l
            assert "requires_submission" in l
