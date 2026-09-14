"""Iteration 14 — Admin revenue trend endpoint + regression (stats, auth, bookings, settings)."""
import os
import pytest
import requests
from dotenv import dotenv_values

frontend_env = dotenv_values("/app/frontend/.env")
BASE_URL = (os.environ.get("REACT_APP_BACKEND_URL") or frontend_env.get("REACT_APP_BACKEND_URL")).rstrip("/")
API = f"{BASE_URL}/api"

ADMIN = {"email": "tony@tonyyoga.com", "password": "TonyYoga2026!"}
STUDENT = {"email": "student@demo.com", "password": "Student2026!"}


def login(creds):
    r = requests.post(f"{API}/auth/login", json=creds, timeout=30)
    if r.status_code != 200:
        pytest.fail(f"login failed {r.status_code}: {r.text[:300]}")
    data = r.json()
    assert "token" in data and "user" in data
    return data["token"], data["user"]


@pytest.fixture(scope="module")
def admin_hdr():
    t, _ = login(ADMIN)
    return {"Authorization": f"Bearer {t}"}


@pytest.fixture(scope="module")
def student_hdr():
    t, _ = login(STUDENT)
    return {"Authorization": f"Bearer {t}"}


# ---------- New: /admin/stats/trend ----------
class TestAdminStatsTrend:
    def test_trend_shape(self, admin_hdr):
        r = requests.get(f"{API}/admin/stats/trend", headers=admin_hdr, timeout=30)
        assert r.status_code == 200, r.text[:300]
        data = r.json()
        assert "trend" in data
        trend = data["trend"]
        assert len(trend) == 6, f"expected 6 months got {len(trend)}"
        for row in trend:
            assert set(["month", "revenue", "members"]).issubset(row.keys())
            assert isinstance(row["month"], str) and len(row["month"]) == 3
            assert isinstance(row["revenue"], (int, float))
            assert isinstance(row["members"], int)
        print("trend:", trend)

    def test_trend_current_month_last(self, admin_hdr):
        from datetime import datetime, timezone
        r = requests.get(f"{API}/admin/stats/trend", headers=admin_hdr, timeout=30)
        assert r.status_code == 200
        trend = r.json()["trend"]
        assert trend[-1]["month"] == datetime.now(timezone.utc).strftime("%b")

    def test_trend_requires_admin(self, student_hdr):
        r = requests.get(f"{API}/admin/stats/trend", headers=student_hdr, timeout=30)
        assert r.status_code in (401, 403), f"student got {r.status_code}"

    def test_trend_requires_auth(self):
        r = requests.get(f"{API}/admin/stats/trend", timeout=30)
        assert r.status_code in (401, 403)


# ---------- Regression: /admin/stats ----------
class TestAdminStats:
    def test_stats(self, admin_hdr):
        r = requests.get(f"{API}/admin/stats", headers=admin_hdr, timeout=30)
        assert r.status_code == 200, r.text[:300]
        d = r.json()
        for k in ["users", "students", "instructors", "bookings", "active_subscriptions", "revenue", "transactions"]:
            assert k in d, f"missing {k}"
        assert isinstance(d["users"], int) and d["users"] >= 2


# ---------- Regression: public pages data ----------
class TestPublicEndpoints:
    def test_classes(self):
        r = requests.get(f"{API}/class-instances", timeout=30)
        assert r.status_code == 200, r.text[:200]
        rows = r.json()
        assert isinstance(rows, list) and len(rows) > 0, "no upcoming classes"

    def test_programs(self):
        r = requests.get(f"{API}/programs", timeout=30)
        assert r.status_code == 200
        assert isinstance(r.json(), list)

    def test_library(self):
        r = requests.get(f"{API}/videos", timeout=30)
        assert r.status_code == 200

    def test_products(self):
        r = requests.get(f"{API}/products", timeout=30)
        assert r.status_code == 200


# ---------- Regression: student booking ----------
class TestBooking:
    created = []

    def test_book_and_cancel(self, student_hdr):
        classes = requests.get(f"{API}/class-instances", timeout=30).json()
        assert classes, "no classes seeded"
        target = None
        for c in classes:
            r = requests.post(f"{API}/bookings", headers=student_hdr,
                              json={"class_instance_id": c["id"]}, timeout=30)
            if r.status_code in (200, 201):
                target = r.json()
                assert target["status"] in ("confirmed", "waitlist")
                break
            if r.status_code == 400:
                continue
            pytest.fail(f"booking failed {r.status_code}: {r.text[:300]}")
        assert target is not None, "could not create booking on any class"
        bid = target.get("id")
        assert bid, f"no booking id in {target}"
        # verify persistence
        mine = requests.get(f"{API}/bookings/mine", headers=student_hdr, timeout=30)
        assert mine.status_code == 200, mine.text[:200]
        ids = [b.get("id") for b in mine.json()]
        assert bid in ids, "booking not returned by /bookings/me"
        # cleanup
        d = requests.delete(f"{API}/bookings/{bid}", headers=student_hdr, timeout=30)
        assert d.status_code in (200, 204), d.text[:200]


# ---------- Regression: settings ----------
class TestSettings:
    def test_get_settings_masked(self, admin_hdr):
        r = requests.get(f"{API}/admin/settings", headers=admin_hdr, timeout=30)
        assert r.status_code == 200, r.text[:300]
        body = r.text
        assert "sk_test_emergent" not in body or "•" in body or "*" in body

    def test_settings_forbidden_for_student(self, student_hdr):
        r = requests.get(f"{API}/admin/settings", headers=student_hdr, timeout=30)
        assert r.status_code in (401, 403)
