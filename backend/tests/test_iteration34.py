"""Iteration 34 — Retreat gallery + waitlist / auto-promotion.

Covers:
- POST /api/admin/workshops with gallery -> persisted + returned by GET /api/workshops/{id}
- GET /api/retreats/{id}/availability shape
- POST /api/retreats/waitlist (400 when seats available, position when full, idempotent)
- POST /api/retreats/{reservation_id}/cancel -> frees seat + promotes earliest waitlisted -> seat_offered
- POST /api/retreats/reserve bypasses capacity for a seat_offered user
"""
import os
from datetime import datetime, timedelta, timezone

import pytest
import requests
from dotenv import dotenv_values

fe = dotenv_values("/app/frontend/.env")
BASE = (os.environ.get("REACT_APP_BACKEND_URL") or fe.get("REACT_APP_BACKEND_URL")).rstrip("/")
API = f"{BASE}/api"

ADMIN = {"email": "tony@tonyyoga.com", "password": "TonyYoga2026!"}
STUDENT = {"email": "student@demo.com", "password": "Student2026!"}

GALLERY = [
    "https://images.unsplash.com/photo-1544367567-0f2fcb009e0b?w=800",
    "https://images.unsplash.com/photo-1506126613408-eca07ce68773?w=800",
]


def _login(creds):
    r = requests.post(f"{API}/auth/login", json=creds, timeout=30)
    if r.status_code != 200:
        pytest.fail(f"login failed for {creds['email']}: {r.status_code} {r.text[:300]}")
    return r.json()


@pytest.fixture(scope="module")
def admin():
    d = _login(ADMIN)
    s = requests.Session()
    s.headers.update({"Authorization": f"Bearer {d['token']}"})
    return s, d["user"]


@pytest.fixture(scope="module")
def student():
    d = _login(STUDENT)
    s = requests.Session()
    s.headers.update({"Authorization": f"Bearer {d['token']}"})
    return s, d["user"]


@pytest.fixture(scope="module")
def retreat(admin):
    s, _ = admin
    start = datetime.now(timezone.utc) + timedelta(days=120)
    payload = {
        "title": "TEST_Waitlist Retreat",
        "subtitle": "TEST fixture",
        "system": "Core 40",
        "description": "TEST retreat for waitlist/gallery automated verification.",
        "start_date": start.isoformat(),
        "end_date": (start + timedelta(days=6)).isoformat(),
        "capacity": 1,
        "price_eur": 1600.0,
        "deposit_eur": 500.0,
        "gallery": GALLERY,
    }
    r = s.post(f"{API}/admin/workshops", json=payload, timeout=30)
    assert r.status_code in (200, 201), f"create retreat failed: {r.status_code} {r.text[:300]}"
    w = r.json()
    wid = w.get("id")
    assert wid
    yield wid
    # cleanup: registrations + workshop
    s.delete(f"{API}/admin/workshops/{wid}", timeout=30)


def _regs_cleanup(wid):
    import asyncio
    from motor.motor_asyncio import AsyncIOMotorClient
    from dotenv import dotenv_values as dv
    be = dv("/app/backend/.env")

    async def go():
        cli = AsyncIOMotorClient(be["MONGO_URL"])
        await cli[be["DB_NAME"]].workshop_registrations.delete_many({"workshop_id": wid})
        cli.close()

    asyncio.get_event_loop().run_until_complete(go())


# ---------- gallery ----------
class TestGallery:
    def test_gallery_persisted(self, retreat):
        r = requests.get(f"{API}/workshops/{retreat}", timeout=30)
        assert r.status_code == 200
        data = r.json()
        assert "_id" not in data
        assert data["gallery"] == GALLERY
        assert data["capacity"] == 1

    def test_gallery_update(self, admin, retreat):
        s, _ = admin
        new = GALLERY + ["https://images.unsplash.com/photo-1518611012118-696072aa579a?w=800"]
        r = s.patch(f"{API}/admin/workshops/{retreat}", json={"gallery": new}, timeout=30)
        assert r.status_code == 200, r.text[:300]
        got = requests.get(f"{API}/workshops/{retreat}", timeout=30).json()
        assert got["gallery"] == new
        # restore 2-image gallery for the UI test
        s.patch(f"{API}/admin/workshops/{retreat}", json={"gallery": GALLERY}, timeout=30)


# ---------- availability / waitlist / promotion ----------
class TestWaitlistFlow:
    def test_availability_empty(self, retreat):
        r = requests.get(f"{API}/retreats/{retreat}/availability", timeout=30)
        assert r.status_code == 200
        d = r.json()
        assert d == {"capacity": 1, "taken": 0, "seats_left": 1, "is_full": False, "waitlist_count": 0}

    def test_availability_404(self):
        r = requests.get(f"{API}/retreats/nope-does-not-exist/availability", timeout=30)
        assert r.status_code == 404

    def test_waitlist_rejected_when_seats_available(self, student, retreat):
        s, _ = student
        r = s.post(f"{API}/retreats/waitlist", json={"workshop_id": retreat}, timeout=30)
        assert r.status_code == 400, r.text[:300]
        assert "reserve" in r.json().get("detail", "").lower()

    def test_waitlist_requires_auth(self, retreat):
        r = requests.post(f"{API}/retreats/waitlist", json={"workshop_id": retreat}, timeout=30)
        assert r.status_code in (401, 403)

    def test_full_then_join_waitlist_then_promotion(self, admin, student, retreat):
        adm, adm_user = admin
        stu, stu_user = student

        # admin takes the single seat
        r = adm.post(f"{API}/retreats/reserve", json={
            "workshop_id": retreat, "name": "TEST Admin", "email": ADMIN["email"],
        }, timeout=30)
        assert r.status_code == 200, r.text[:300]
        res_id = r.json()["id"]
        assert r.json()["status"] == "pending_deposit"

        av = requests.get(f"{API}/retreats/{retreat}/availability", timeout=30).json()
        assert av["is_full"] is True and av["seats_left"] == 0

        # a second reservation attempt must be rejected
        r2 = stu.post(f"{API}/retreats/reserve", json={
            "workshop_id": retreat, "name": "TEST Student", "email": STUDENT["email"],
        }, timeout=30)
        assert r2.status_code == 400
        assert "full" in r2.json()["detail"].lower()

        # student joins waitlist
        w = stu.post(f"{API}/retreats/waitlist", json={"workshop_id": retreat}, timeout=30)
        assert w.status_code == 200, w.text[:300]
        wd = w.json()
        assert wd["status"] == "waitlisted"
        assert wd["waitlist_position"] == 1
        assert wd["email"] == STUDENT["email"]

        av = requests.get(f"{API}/retreats/{retreat}/availability", timeout=30).json()
        assert av["waitlist_count"] == 1

        # idempotent: joining again returns existing row, no dupes
        w2 = stu.post(f"{API}/retreats/waitlist", json={"workshop_id": retreat}, timeout=30)
        assert w2.status_code == 200
        assert w2.json()["id"] == wd["id"]
        av = requests.get(f"{API}/retreats/{retreat}/availability", timeout=30).json()
        assert av["waitlist_count"] == 1

        # visible via /retreats/mine
        mine = stu.get(f"{API}/retreats/mine", timeout=30).json()
        row = next((x for x in mine if x["workshop_id"] == retreat), None)
        assert row and row["status"] == "waitlisted"

        # admin cancels -> auto promote
        c = adm.post(f"{API}/retreats/{res_id}/cancel", timeout=30)
        assert c.status_code == 200 and c.json().get("ok") is True

        mine = stu.get(f"{API}/retreats/mine", timeout=30).json()
        row = next((x for x in mine if x["workshop_id"] == retreat), None)
        assert row and row["status"] == "seat_offered", f"expected seat_offered, got {row}"

        # seat_offered occupies a seat -> retreat still full for everyone else
        av = requests.get(f"{API}/retreats/{retreat}/availability", timeout=30).json()
        assert av["taken"] == 1 and av["is_full"] is True and av["waitlist_count"] == 0

        # student can now reserve despite capacity cap
        rr = stu.post(f"{API}/retreats/reserve", json={
            "workshop_id": retreat, "name": "TEST Student", "email": STUDENT["email"],
        }, timeout=30)
        assert rr.status_code == 200, rr.text[:300]
        assert rr.json()["status"] == "pending_deposit"

        # offer/waitlist rows cleared
        mine = stu.get(f"{API}/retreats/mine", timeout=30).json()
        rows = [x for x in mine if x["workshop_id"] == retreat and x["status"] != "cancelled"]
        assert len(rows) == 1 and rows[0]["status"] == "pending_deposit"

        # cleanup student reservation
        stu.post(f"{API}/retreats/{rows[0]['id']}/cancel", timeout=30)
        _regs_cleanup(retreat)
