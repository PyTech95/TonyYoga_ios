"""Backend tests for the PRIVATE SESSIONS feature (Tony Yoga).

Covers: student booking request creation, admin listing (excludes pending_payment),
sessions_total adjustments, admin scheduling (mock Zoom), student /mine visibility,
and notifications feed containing scheduled + confirmed items.
"""
import os
import time
import pytest
import requests
from pymongo import MongoClient

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "").rstrip("/")
API = f"{BASE_URL}/api"
MONGO_URL = "mongodb://localhost:27017"
DB_NAME = "test_database"

ADMIN_EMAIL = "tony@tonyyoga.com"
ADMIN_PASSWORD = "TonyYoga2026!"
STUDENT_EMAIL = "student@demo.com"
STUDENT_PASSWORD = "Student2026!"


@pytest.fixture(scope="module")
def mongo():
    c = MongoClient(MONGO_URL)
    yield c[DB_NAME]
    c.close()


def _login(email, password):
    r = requests.post(f"{API}/auth/login", json={"email": email, "password": password}, timeout=15)
    assert r.status_code == 200, f"login failed for {email}: {r.status_code} {r.text}"
    return r.json()["token"]


@pytest.fixture(scope="module")
def admin_headers():
    return {"Authorization": f"Bearer {_login(ADMIN_EMAIL, ADMIN_PASSWORD)}"}


@pytest.fixture(scope="module")
def student_headers():
    return {"Authorization": f"Bearer {_login(STUDENT_EMAIL, STUDENT_PASSWORD)}"}


# ---------- Request creation ----------
def test_request_private_session_creates_pending(student_headers):
    r = requests.post(f"{API}/private-sessions/request",
                      headers=student_headers,
                      json={"sessions": 2, "focus_area": "TEST_backbends",
                            "preferred_time": "weekday mornings",
                            "notes": "TEST notes"},
                      timeout=15)
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["sessions"] == 2
    assert body["amount_eur"] == 240.0
    assert body["price_each_eur"] == 120.0
    assert body.get("id")


def test_request_auth_required():
    r = requests.post(f"{API}/private-sessions/request", json={"sessions": 1}, timeout=15)
    assert r.status_code in (401, 403)


def test_request_caps_between_1_and_3(student_headers):
    # 0 should be clamped to 1
    r = requests.post(f"{API}/private-sessions/request",
                      headers=student_headers, json={"sessions": 99}, timeout=15)
    assert r.status_code == 200
    assert r.json()["sessions"] == 3


# ---------- Admin list ----------
def test_admin_list_excludes_pending_payment(admin_headers, student_headers, mongo):
    # Create a fresh pending request
    resp = requests.post(f"{API}/private-sessions/request",
                         headers=student_headers,
                         json={"sessions": 1, "focus_area": "TEST_exclude_pending"},
                         timeout=15)
    pending_id = resp.json()["id"]

    r = requests.get(f"{API}/admin/private-sessions", headers=admin_headers, timeout=15)
    assert r.status_code == 200
    rows = r.json()
    ids = [x["id"] for x in rows]
    assert pending_id not in ids, "pending_payment requests must NOT appear in admin list"


def test_admin_list_requires_admin(student_headers):
    r = requests.get(f"{API}/admin/private-sessions", headers=student_headers, timeout=15)
    assert r.status_code == 403


# ---------- Admin adjust + schedule (need a paid request) ----------
@pytest.fixture()
def paid_request(mongo, student_headers):
    """Create a paid request directly in Mongo (simulate fulfillment since Stripe is placeholder)."""
    resp = requests.post(f"{API}/private-sessions/request",
                         headers=student_headers,
                         json={"sessions": 2, "focus_area": "TEST_paid_for_admin",
                               "notes": "TEST", "preferred_time": "evenings"},
                         timeout=15)
    rid = resp.json()["id"]
    mongo.private_session_requests.update_one(
        {"id": rid},
        {"$set": {"status": "paid", "sessions_paid": 2, "paid_at": "2026-01-01T00:00:00+00:00"}},
    )
    yield rid
    mongo.private_session_requests.delete_one({"id": rid})


def test_admin_can_adjust_sessions_total(admin_headers, paid_request):
    r = requests.patch(f"{API}/admin/private-sessions/{paid_request}",
                       headers=admin_headers,
                       json={"sessions_total": 3}, timeout=15)
    assert r.status_code == 200, r.text
    assert r.json()["sessions_total"] == 3


def test_admin_schedule_creates_mock_zoom_and_notifies(admin_headers, student_headers, paid_request, mongo):
    start = "2026-06-15T10:00:00+00:00"
    r = requests.post(f"{API}/admin/private-sessions/{paid_request}/schedule",
                      headers=admin_headers,
                      json={"start_time": start, "duration_minutes": 60}, timeout=20)
    assert r.status_code == 200, r.text
    doc = r.json()
    assert doc["status"] == "scheduled"
    assert doc["sessions_scheduled"] >= 1
    sessions = doc.get("sessions", [])
    assert sessions, "sessions list should contain new entry"
    sess = sessions[-1]
    assert sess.get("join_url"), "must include a Zoom (mock) join_url"

    # Student /mine visibility
    time.sleep(0.5)
    m = requests.get(f"{API}/private-sessions/mine", headers=student_headers, timeout=15)
    assert m.status_code == 200
    my = m.json()
    mine_ids = [x["id"] for x in my]
    assert paid_request in mine_ids
    my_row = next(x for x in my if x["id"] == paid_request)
    assert any(s.get("join_url") for s in my_row.get("sessions", []))

    # Notifications feed for the student contains 'scheduled' item
    n = requests.get(f"{API}/notifications", headers=student_headers, timeout=15)
    assert n.status_code == 200
    titles = " | ".join([str(i.get("title", "")) for i in n.json().get("items", [])])
    assert "Your private session is scheduled" in titles


def test_notifications_include_private_confirmed_after_fulfillment(mongo, student_headers):
    """Simulate the payment-fulfillment path pushing 'Private session confirmed' notification."""
    # Insert a personal notification like _fulfill_payment does.
    from datetime import datetime, timezone
    doc = {
        "id": "TEST_notif_" + str(int(time.time())),
        "user_id": None,  # fill below
        "type": "personal",
        "title": "Private session confirmed",
        "body": "You booked 2 private sessions with Tony.",
        "url": "/private-sessions",
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    # find the student's id
    me = requests.get(f"{API}/auth/me", headers=student_headers, timeout=10).json()
    doc["user_id"] = me["id"]
    mongo.user_notifications.insert_one(doc)
    try:
        n = requests.get(f"{API}/notifications", headers=student_headers, timeout=15)
        assert n.status_code == 200
        titles = [i.get("title") for i in n.json().get("items", [])]
        assert "Private session confirmed" in titles
    finally:
        mongo.user_notifications.delete_one({"id": doc["id"]})


# ---------- Cleanup TEST_ prefixed data ----------
def test_zzz_cleanup(mongo):
    mongo.private_session_requests.delete_many({"focus_area": {"$regex": "^TEST_"}})
