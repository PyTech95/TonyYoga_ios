"""Iteration 17 — staff booking block (POST /api/bookings) + student booking regression."""
import os
import pytest
import requests
from dotenv import dotenv_values

frontend_env = dotenv_values("/app/frontend/.env")
base_url = os.environ.get("REACT_APP_BACKEND_URL") or frontend_env.get("REACT_APP_BACKEND_URL")
if not base_url:
    raise RuntimeError("REACT_APP_BACKEND_URL missing")
BASE_URL = base_url.rstrip("/")
API = f"{BASE_URL}/api"

CREDS = {
    "admin": ("tony@tonyyoga.com", "TonyYoga2026!"),
    "instructor": ("instructor@demo.com", "Instructor2026!"),
    "student": ("student@demo.com", "Student2026!"),
}


def login(role):
    email, password = CREDS[role]
    r = requests.post(f"{API}/auth/login", json={"email": email, "password": password}, timeout=30)
    assert r.status_code == 200, f"{role} login failed: {r.status_code} {r.text[:300]}"
    data = r.json()
    assert "token" in data and "user" in data
    assert data["user"]["email"] == email
    return data["token"], data["user"]


@pytest.fixture(scope="module")
def instance_id():
    r = requests.get(f"{API}/class-instances", timeout=30)
    assert r.status_code == 200
    rows = r.json()
    assert isinstance(rows, list) and len(rows) > 0, "no upcoming class instances seeded"
    return rows[0]["id"]


# --- class detail endpoint renders required fields ---
def test_class_instance_detail_fields(instance_id):
    r = requests.get(f"{API}/class-instances/{instance_id}", timeout=30)
    assert r.status_code == 200
    d = r.json()
    assert "_id" not in d
    for k in ("start_time", "capacity", "bookings_count", "duration_minutes", "location_type", "title"):
        assert k in d, f"missing {k}"
    assert d.get("instructor") and d["instructor"].get("name")
    assert "password_hash" not in d["instructor"]


# --- staff booking must be blocked ---
@pytest.mark.parametrize("role", ["admin", "instructor"])
def test_staff_cannot_book(role, instance_id):
    token, _ = login(role)
    r = requests.post(f"{API}/bookings", json={"class_instance_id": instance_id},
                      headers={"Authorization": f"Bearer {token}"}, timeout=30)
    assert r.status_code == 403, f"expected 403 for {role}, got {r.status_code}: {r.text[:300]}"
    detail = (r.json().get("detail") or "").lower()
    assert "staff" in detail, f"unexpected message: {detail}"


def test_staff_has_no_bookings(instance_id):
    for role in ("admin", "instructor"):
        token, _ = login(role)
        r = requests.get(f"{API}/bookings/mine", headers={"Authorization": f"Bearer {token}"}, timeout=30)
        assert r.status_code == 200
        active = [b for b in r.json() if b["status"] != "cancelled"]
        assert active == [], f"{role} has active bookings: {active}"


# --- student regression: book then cancel, verify count restored ---
def test_student_can_book_and_cancel():
    token, _ = login("student")
    h = {"Authorization": f"Bearer {token}"}

    rows = requests.get(f"{API}/class-instances", timeout=30).json()
    mine_existing = requests.get(f"{API}/bookings/mine", headers=h, timeout=30).json()
    booked_ids = {b["class_instance_id"] for b in mine_existing if b["status"] != "cancelled"}
    free = [r for r in rows if r["id"] not in booked_ids]
    assert free, "student already booked into every upcoming class"
    instance_id = free[0]["id"]

    before = requests.get(f"{API}/class-instances/{instance_id}", timeout=30).json()
    count_before = before["bookings_count"]

    r = requests.post(f"{API}/bookings", json={"class_instance_id": instance_id}, headers=h, timeout=30)
    assert r.status_code == 200, f"student booking failed: {r.status_code} {r.text[:300]}"
    booking = r.json()
    assert booking["status"] in ("confirmed", "waitlist")
    assert "_id" not in booking
    booking_id = booking["id"]

    mine = requests.get(f"{API}/bookings/mine", headers=h, timeout=30).json()
    assert any(b["id"] == booking_id and b["status"] != "cancelled" for b in mine)

    if booking["status"] == "confirmed":
        mid = requests.get(f"{API}/class-instances/{instance_id}", timeout=30).json()
        assert mid["bookings_count"] == count_before + 1

    # cleanup
    d = requests.delete(f"{API}/bookings/{booking_id}", headers=h, timeout=30)
    assert d.status_code == 200
    after = requests.get(f"{API}/class-instances/{instance_id}", timeout=30).json()
    assert after["bookings_count"] == count_before, "bookings_count not restored after cancel"

    mine2 = requests.get(f"{API}/bookings/mine", headers=h, timeout=30).json()
    assert all(b["id"] != booking_id or b["status"] == "cancelled" for b in mine2)


def test_unauthenticated_booking_rejected(instance_id):
    r = requests.post(f"{API}/bookings", json={"class_instance_id": instance_id}, timeout=30)
    assert r.status_code in (401, 403), f"got {r.status_code}"
