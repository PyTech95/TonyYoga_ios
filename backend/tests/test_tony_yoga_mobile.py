"""Tony Yoga mobile MVP — student-facing backend endpoint tests (iteration 1)."""
import os
import uuid
import pytest
import requests

BASE_URL = os.environ.get("EXPO_PUBLIC_BACKEND_URL", "https://app-deploy-184.preview.emergentagent.com").rstrip("/")
API = f"{BASE_URL}/api"

STUDENT_EMAIL = "student@demo.com"
STUDENT_PASSWORD = "Student2026!"


@pytest.fixture(scope="module")
def session():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    return s


@pytest.fixture(scope="module")
def student_token(session):
    r = session.post(f"{API}/auth/login", json={"email": STUDENT_EMAIL, "password": STUDENT_PASSWORD})
    assert r.status_code == 200, f"login failed: {r.status_code} {r.text}"
    return r.json()["token"]


@pytest.fixture(scope="module")
def auth_session(student_token):
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json", "Authorization": f"Bearer {student_token}"})
    return s


# --- Health & seed content ---
class TestHealth:
    def test_health(self, session):
        r = session.get(f"{API}/health")
        assert r.status_code == 200
        data = r.json()
        assert data["ok"] is True
        assert data["db_connected"] is True
        assert data["count_users"] >= 2
        assert data["count_programs"] == 3
        assert data["count_membership_plans"] == 3
        assert data["count_class_instances"] >= 28
        assert data["count_products"] == 4
        assert data["count_workshops"] == 4


# --- Programs ---
class TestPrograms:
    def test_list_programs(self, session):
        r = session.get(f"{API}/programs")
        assert r.status_code == 200
        rows = r.json()
        assert len(rows) == 3
        titles = {p["title"] for p in rows}
        assert any("Core 26" in t for t in titles)
        assert any("Core 40" in t for t in titles)
        assert any("Core 84" in t for t in titles)

    def test_program_detail_anon_lesson_locks(self, session):
        rows = session.get(f"{API}/programs").json()
        pid = rows[0]["id"]
        r = session.get(f"{API}/programs/{pid}")
        assert r.status_code == 200
        p = r.json()
        assert "lessons" in p and isinstance(p["lessons"], list)
        # Every lesson must have is_unlocked
        for l in p["lessons"]:
            assert "is_unlocked" in l
        # First lesson (free preview) unlocked; at least one locked
        assert p["lessons"][0]["is_unlocked"] is True
        assert any(not l["is_unlocked"] for l in p["lessons"]), "Expected at least one locked lesson for anon"


# --- Class instances ---
class TestClassInstances:
    def test_list_class_instances(self, session):
        r = session.get(f"{API}/class-instances")
        assert r.status_code == 200
        rows = r.json()
        assert len(rows) >= 1
        assert rows[0].get("instructor_name")

    def test_get_class_instance_detail(self, session):
        rows = session.get(f"{API}/class-instances").json()
        cid = rows[0]["id"]
        r = session.get(f"{API}/class-instances/{cid}")
        assert r.status_code == 200
        c = r.json()
        assert c["id"] == cid
        assert c.get("instructor") and c["instructor"].get("id")


# --- Membership plans / products / videos ---
class TestCatalog:
    def test_membership_plans(self, session):
        r = session.get(f"{API}/membership-plans")
        assert r.status_code == 200
        plans = r.json()
        assert len(plans) == 3

    def test_products_list_and_detail(self, session):
        r = session.get(f"{API}/products")
        assert r.status_code == 200
        products = r.json()
        assert len(products) >= 4
        pid = products[0]["id"]
        r2 = session.get(f"{API}/products/{pid}")
        assert r2.status_code == 200
        assert r2.json()["id"] == pid

    def test_videos(self, session):
        r = session.get(f"{API}/videos")
        assert r.status_code == 200
        videos = r.json()
        assert len(videos) >= 1
        free = [v for v in videos if v.get("visibility") == "free"]
        assert len(free) >= 1, "Expected at least one free video (free meditation)"


# --- Auth ---
class TestAuth:
    def test_login_student(self, session):
        r = session.post(f"{API}/auth/login", json={"email": STUDENT_EMAIL, "password": STUDENT_PASSWORD})
        assert r.status_code == 200
        data = r.json()
        assert data["token"]
        assert data["user"]["role"] == "student"

    def test_register_new_user(self, session):
        email = f"TEST_newuser+{uuid.uuid4().hex[:8]}@test.com"
        r = session.post(f"{API}/auth/register", json={"email": email, "name": "Test User", "password": "TestPass2026!"})
        assert r.status_code == 200, f"register failed: {r.status_code} {r.text}"
        d = r.json()
        assert d["token"]
        assert d["user"]["email"] == email.lower()

    def test_me_endpoint(self, auth_session):
        r = auth_session.get(f"{API}/auth/me")
        assert r.status_code == 200
        u = r.json()
        assert u["email"] == STUDENT_EMAIL
        assert u["role"] == "student"


# --- Bookings ---
class TestBookings:
    def test_full_booking_flow(self, session, auth_session):
        instances = session.get(f"{API}/class-instances").json()
        assert len(instances) >= 1
        # try until we find one we haven't already booked
        booking_id = None
        for inst in instances:
            r = auth_session.post(f"{API}/bookings", json={"class_instance_id": inst["id"]})
            if r.status_code == 200:
                booking_id = r.json()["id"]
                assert r.json()["status"] in ("confirmed", "waitlist")
                break
            elif r.status_code == 400 and "Already booked" in r.text:
                continue
            else:
                pytest.fail(f"Unexpected booking failure: {r.status_code} {r.text}")
        assert booking_id, "Could not create a booking on any available class"

        # GET /bookings/mine — must include our booking, with `class` embedded
        r = auth_session.get(f"{API}/bookings/mine")
        assert r.status_code == 200
        mine = r.json()
        found = [b for b in mine if b["id"] == booking_id]
        assert found, "Booking not persisted / not returned"
        assert found[0].get("class") and found[0]["class"].get("id")

        # Cancel
        r = auth_session.delete(f"{API}/bookings/{booking_id}")
        assert r.status_code == 200
        # Verify cancelled
        mine2 = auth_session.get(f"{API}/bookings/mine").json()
        cancelled = [b for b in mine2 if b["id"] == booking_id]
        assert cancelled and cancelled[0]["status"] == "cancelled"
