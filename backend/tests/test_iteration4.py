"""Iteration 4 tests: class passes, wishlist, streak freezes, balance reminders."""
import os
from datetime import datetime, timedelta, timezone

import pytest
import requests
from pymongo import MongoClient

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://web-app-hub-56.preview.emergentagent.com").rstrip("/")
API = f"{BASE_URL}/api"

ADMIN_EMAIL = "tony@tonyyoga.com"
ADMIN_PASS = "TonyYoga2026!"
STUDENT_EMAIL = "student@demo.com"
STUDENT_PASS = "Student2026!"


def _login(email, password):
    r = requests.post(f"{API}/auth/login", json={"email": email, "password": password}, timeout=15)
    assert r.status_code == 200, f"login failed: {r.status_code} {r.text}"
    j = r.json()
    return j.get("access_token") or j.get("token")


@pytest.fixture(scope="module")
def admin_token():
    return _login(ADMIN_EMAIL, ADMIN_PASS)


@pytest.fixture(scope="module")
def student_token():
    return _login(STUDENT_EMAIL, STUDENT_PASS)


@pytest.fixture(scope="module")
def student_id(student_token):
    r = requests.get(f"{API}/auth/me", headers={"Authorization": f"Bearer {student_token}"}, timeout=15)
    assert r.status_code == 200
    return r.json()["id"]


@pytest.fixture(scope="module")
def mongo_db():
    url = os.environ.get("MONGO_URL", "mongodb://localhost:27017")
    dbn = os.environ.get("DB_NAME", "tony_yoga")
    return MongoClient(url)[dbn]


# ============ PASSES ============
class TestPasses:
    def test_catalog_public(self):
        r = requests.get(f"{API}/passes/catalog", timeout=15)
        assert r.status_code == 200
        items = r.json()
        assert isinstance(items, list) and len(items) == 2
        ids = {i["id"]: i for i in items}
        assert "drop_in" in ids and "class_pack" in ids
        assert ids["drop_in"]["price"] == 22.0 and ids["drop_in"]["credits"] == 1
        assert ids["class_pack"]["price"] == 99.0 and ids["class_pack"]["credits"] == 5

    def test_mine_initial(self, student_token, mongo_db, student_id):
        # clean any existing packs for the student for a clean test
        mongo_db.class_passes.delete_many({"user_id": student_id})
        mongo_db.pass_usages.delete_many({"user_id": student_id})
        r = requests.get(f"{API}/passes/mine", headers={"Authorization": f"Bearer {student_token}"}, timeout=15)
        assert r.status_code == 200
        data = r.json()
        assert data["remaining"] == 0
        assert data["passes"] == []
        assert data["recent_usage"] == []

    def test_checkout_session_drop_in(self, student_token):
        r = requests.post(
            f"{API}/checkout/session",
            headers={"Authorization": f"Bearer {student_token}"},
            json={"item_type": "drop_in", "item_id": "drop_in", "origin_url": BASE_URL},
            timeout=30,
        )
        assert r.status_code == 200, r.text
        url = r.json().get("url", "")
        assert "checkout.stripe.com" in url, f"Expected stripe URL, got: {url}"

    def test_checkout_session_class_pack(self, student_token):
        r = requests.post(
            f"{API}/checkout/session",
            headers={"Authorization": f"Bearer {student_token}"},
            json={"item_type": "class_pack", "item_id": "class_pack", "origin_url": BASE_URL},
            timeout=30,
        )
        assert r.status_code == 200, r.text
        assert "checkout.stripe.com" in r.json().get("url", "")

    def test_use_pass_idempotent(self, student_token, mongo_db, student_id):
        # Seed a pack
        mongo_db.class_passes.delete_many({"user_id": student_id})
        mongo_db.pass_usages.delete_many({"user_id": student_id})
        mongo_db.class_passes.insert_one({
            "id": "test_pack_idem", "user_id": student_id, "active": True,
            "remaining": 3, "credits_total": 3, "pass_type": "class_pack",
            "created_at": datetime.now(timezone.utc).isoformat(),
        })
        ci = f"test_ci_{datetime.now().timestamp()}"
        h = {"Authorization": f"Bearer {student_token}"}
        r1 = requests.post(f"{API}/passes/use", headers=h, json={"class_instance_id": ci}, timeout=15)
        assert r1.status_code == 200, r1.text
        assert r1.json().get("ok") is True
        assert r1.json().get("remaining") == 2
        r2 = requests.post(f"{API}/passes/use", headers=h, json={"class_instance_id": ci}, timeout=15)
        assert r2.status_code == 200
        assert r2.json().get("already_used") is True
        # cleanup
        mongo_db.class_passes.delete_one({"id": "test_pack_idem"})
        mongo_db.pass_usages.delete_many({"user_id": student_id, "class_instance_id": ci})

    def test_checkin_auto_decrement(self, admin_token, student_token, mongo_db, student_id):
        # Seed a pack with remaining=5
        mongo_db.class_passes.delete_many({"user_id": student_id})
        mongo_db.pass_usages.delete_many({"user_id": student_id})
        pack_id = "test_checkin_pack"
        mongo_db.class_passes.insert_one({
            "id": pack_id, "user_id": student_id, "active": True,
            "remaining": 5, "credits_total": 5, "pass_type": "class_pack",
            "created_at": datetime.now(timezone.utc).isoformat(),
        })
        # Find a class_instance to book
        ci = mongo_db.class_instances.find_one({}, {"_id": 0, "id": 1})
        if not ci:
            pytest.skip("No class instance available to book")
        booking_id = f"test_booking_{datetime.now().timestamp()}"
        mongo_db.bookings.delete_many({"id": booking_id})
        # Ensure no subscription so pass gets used
        mongo_db.subscriptions.update_many(
            {"user_id": student_id, "status": {"$in": ["active", "trialing"]}},
            {"$set": {"status": "cancelled"}},
        )
        mongo_db.bookings.insert_one({
            "id": booking_id, "user_id": student_id,
            "class_instance_id": ci["id"], "status": "confirmed",
            "check_in_flag": False, "created_at": datetime.now(timezone.utc).isoformat(),
        })
        r = requests.post(
            f"{API}/admin/bookings/check-in",
            headers={"Authorization": f"Bearer {admin_token}"},
            json={"booking_id": booking_id},
            timeout=15,
        )
        assert r.status_code == 200, r.text
        # Verify pass decremented
        m = requests.get(f"{API}/passes/mine", headers={"Authorization": f"Bearer {student_token}"}, timeout=15).json()
        assert m["remaining"] == 4, f"Expected remaining=4, got {m['remaining']}"
        assert len(m["recent_usage"]) >= 1
        # cleanup
        mongo_db.class_passes.delete_one({"id": pack_id})
        mongo_db.bookings.delete_one({"id": booking_id})
        mongo_db.pass_usages.delete_many({"user_id": student_id, "class_instance_id": ci["id"]})


# ============ WISHLIST ============
class TestWishlist:
    def test_toggle_and_status(self, student_token, mongo_db):
        prog = mongo_db.programs.find_one({}, {"_id": 0, "id": 1})
        if not prog:
            pytest.skip("No program available")
        pid = prog["id"]
        h = {"Authorization": f"Bearer {student_token}"}
        # Clean
        r = requests.post(f"{API}/wishlist/toggle", headers=h,
                          json={"target_type": "program", "target_id": pid}, timeout=15)
        assert r.status_code == 200
        first = r.json()["favorited"]
        r2 = requests.post(f"{API}/wishlist/toggle", headers=h,
                           json={"target_type": "program", "target_id": pid}, timeout=15)
        assert r2.json()["favorited"] != first
        # Toggle to favorited=True for status check
        if not r2.json()["favorited"]:
            requests.post(f"{API}/wishlist/toggle", headers=h,
                          json={"target_type": "program", "target_id": pid}, timeout=15)
        s = requests.get(f"{API}/wishlist/status", headers=h,
                         params={"target_type": "program", "target_id": pid}, timeout=15)
        assert s.status_code == 200
        assert s.json()["favorited"] is True

    def test_invalid_target_type(self, student_token):
        r = requests.post(f"{API}/wishlist/toggle",
                          headers={"Authorization": f"Bearer {student_token}"},
                          json={"target_type": "bogus", "target_id": "x"}, timeout=15)
        assert r.status_code == 200
        assert r.json() == {"favorited": False, "error": "invalid target_type"}

    def test_mine_enriched(self, student_token, mongo_db):
        prog = mongo_db.programs.find_one({}, {"_id": 0, "id": 1})
        if not prog:
            pytest.skip()
        pid = prog["id"]
        h = {"Authorization": f"Bearer {student_token}"}
        # Ensure favorited
        st = requests.get(f"{API}/wishlist/status", headers=h,
                          params={"target_type": "program", "target_id": pid}, timeout=15).json()
        if not st["favorited"]:
            requests.post(f"{API}/wishlist/toggle", headers=h,
                          json={"target_type": "program", "target_id": pid}, timeout=15)
        r = requests.get(f"{API}/wishlist/mine", headers=h, timeout=15)
        assert r.status_code == 200
        items = r.json()
        assert isinstance(items, list) and len(items) >= 1
        found = next((x for x in items if x["item"]["id"] == pid), None)
        assert found is not None
        assert found["target_type"] == "program"
        assert "title" in found["item"]


# ============ STREAK FREEZES ============
class TestStreakFreeze:
    def test_streak_response_shape(self, student_token, mongo_db, student_id):
        # Reset for clean state
        mongo_db.practice_streaks.delete_many({"user_id": student_id})
        r = requests.get(f"{API}/practice/streak",
                         headers={"Authorization": f"Bearer {student_token}"}, timeout=15)
        assert r.status_code == 200
        data = r.json()
        assert data["freezes_per_month"] == 2
        assert isinstance(data["freezes_used_this_month"], int)
        assert isinstance(data["freezes_remaining_this_month"], int)

    def test_freeze_auto_consume_on_gap(self, student_token, mongo_db, student_id):
        # Seed a streak with last_practice_date = 2 days ago (so today is a 1-day gap)
        mongo_db.practice_streaks.delete_many({"user_id": student_id})
        two_days_ago = (datetime.now(timezone.utc).date() - timedelta(days=2)).isoformat()
        mongo_db.practice_streaks.insert_one({
            "user_id": student_id,
            "current_streak": 3,
            "longest_streak": 3,
            "last_practice_date": two_days_ago,
            "practices": {two_days_ago: {"sources": ["manual"], "count": 1}},
            "milestones_unlocked": [],
            "freezes_used_by_month": {},
            "updated_at": datetime.now(timezone.utc).isoformat(),
        })
        r = requests.post(f"{API}/practice/log",
                         headers={"Authorization": f"Bearer {student_token}"},
                         json={"source": "manual"}, timeout=15)
        assert r.status_code == 200, r.text
        d = r.json()
        assert d.get("freeze_used") is True, f"Expected freeze_used=True. Got: {d}"
        assert d.get("current_streak") == 4, f"Expected streak=4. Got: {d.get('current_streak')}"
        # freezes_used_by_month should now have 1 for this month
        doc = mongo_db.practice_streaks.find_one({"user_id": student_id})
        this_mk = datetime.now(timezone.utc).strftime("%Y-%m")
        assert doc.get("freezes_used_by_month", {}).get(this_mk, 0) == 1

    def test_freeze_exhausted_resets(self, student_token, mongo_db, student_id):
        # Seed a streak with 2 freezes already used and last_practice_date 2 days ago
        mongo_db.practice_streaks.delete_many({"user_id": student_id})
        two_days_ago = (datetime.now(timezone.utc).date() - timedelta(days=2)).isoformat()
        this_mk = datetime.now(timezone.utc).strftime("%Y-%m")
        mongo_db.practice_streaks.insert_one({
            "user_id": student_id,
            "current_streak": 5,
            "longest_streak": 5,
            "last_practice_date": two_days_ago,
            "practices": {two_days_ago: {"sources": ["manual"], "count": 1}},
            "milestones_unlocked": [],
            "freezes_used_by_month": {this_mk: 2},
            "updated_at": datetime.now(timezone.utc).isoformat(),
        })
        r = requests.post(f"{API}/practice/log",
                         headers={"Authorization": f"Bearer {student_token}"},
                         json={"source": "manual"}, timeout=15)
        assert r.status_code == 200
        d = r.json()
        assert d.get("freeze_used") is False
        assert d.get("current_streak") == 1


# ============ BALANCE REMINDER ============
class TestBalanceReminder:
    def test_function_exists_and_callable(self):
        import sys
        sys.path.insert(0, "/app/backend")
        from routers.retreats import send_balance_reminders_tick
        import asyncio
        # Should not crash even if no eligible retreats
        asyncio.get_event_loop().run_until_complete(send_balance_reminders_tick())
