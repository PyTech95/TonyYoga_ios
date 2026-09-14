"""Iteration 33 — Add Retreat (admin CRUD), per-retreat deposit, login lockout."""
import os
import time
import uuid
from datetime import datetime, timedelta, timezone

import pytest
import requests
from dotenv import dotenv_values

frontend_env = dotenv_values("/app/frontend/.env")
base_url = os.environ.get("REACT_APP_BACKEND_URL") or frontend_env.get("REACT_APP_BACKEND_URL")
if not base_url:
    raise RuntimeError("REACT_APP_BACKEND_URL missing")
BASE = base_url.rstrip("/") + "/api"

ADMIN = {"email": "tony@tonyyoga.com", "password": "TonyYoga2026!"}
STUDENT = {"email": "student@demo.com", "password": "Student2026!"}


@pytest.fixture(scope="session")
def admin_token():
    r = requests.post(f"{BASE}/auth/login", json=ADMIN, timeout=30)
    assert r.status_code == 200, f"admin login failed {r.status_code} {r.text[:300]}"
    return r.json()["token"]


@pytest.fixture(scope="session")
def admin_hdr(admin_token):
    return {"Authorization": f"Bearer {admin_token}"}


@pytest.fixture(scope="session")
def student_token():
    r = requests.post(f"{BASE}/auth/login", json=STUDENT, timeout=30)
    assert r.status_code == 200, f"student login failed {r.status_code} {r.text[:300]}"
    return r.json()["token"]


# ---------------- Admin retreat CRUD ----------------
class TestAdminRetreatCRUD:
    created = []

    def _payload(self, **over):
        start = datetime.now(timezone.utc) + timedelta(days=120)
        p = {
            "title": "TEST_Retreat QA33",
            "system": "Core 40",
            "description": "TEST retreat created by automated QA.",
            "location": "TEST Villa",
            "start_date": start.isoformat(),
            "end_date": (start + timedelta(days=6)).isoformat(),
            "price_eur": 1200.0,
            "deposit_eur": 400.0,
            "capacity": 10,
            "cover_image": "https://images.unsplash.com/photo-1",
        }
        p.update(over)
        return p

    def test_create_requires_admin(self, student_token):
        r = requests.post(f"{BASE}/admin/workshops", json=self._payload(),
                          headers={"Authorization": f"Bearer {student_token}"}, timeout=30)
        assert r.status_code in (401, 403), f"student could create retreat: {r.status_code}"

    def test_create_and_persist_deposit(self, admin_hdr):
        r = requests.post(f"{BASE}/admin/workshops", json=self._payload(), headers=admin_hdr, timeout=30)
        assert r.status_code in (200, 201), f"{r.status_code} {r.text[:400]}"
        doc = r.json()
        assert "_id" not in doc
        assert doc["deposit_eur"] == 400.0
        assert doc["price_eur"] == 1200.0
        assert doc["is_active"] is True
        wid = doc["id"]
        TestAdminRetreatCRUD.created.append(wid)

        # admin list contains it
        lst = requests.get(f"{BASE}/admin/workshops", headers=admin_hdr, timeout=30)
        assert lst.status_code == 200
        assert any(w["id"] == wid for w in lst.json())

        # public detail
        g = requests.get(f"{BASE}/workshops/{wid}", timeout=30)
        assert g.status_code == 200
        assert g.json()["deposit_eur"] == 400.0

    def test_toggle_hidden_and_public_visibility(self, admin_hdr):
        wid = TestAdminRetreatCRUD.created[0]
        pub = requests.get(f"{BASE}/workshops", timeout=30).json()
        assert any(w["id"] == wid for w in pub), "active upcoming retreat missing from public list"

        p = requests.patch(f"{BASE}/admin/workshops/{wid}", json={"is_active": False}, headers=admin_hdr, timeout=30)
        assert p.status_code == 200, f"{p.status_code} {p.text[:300]}"
        assert p.json()["is_active"] is False, "toggle to hidden did not persist (False filtered out?)"

        pub2 = requests.get(f"{BASE}/workshops", timeout=30).json()
        assert not any(w["id"] == wid for w in pub2), "hidden retreat still public"

        # admin list still shows hidden
        lst = requests.get(f"{BASE}/admin/workshops", headers=admin_hdr, timeout=30).json()
        assert any(w["id"] == wid for w in lst), "admin list should include hidden retreats"

        # toggle back
        p2 = requests.patch(f"{BASE}/admin/workshops/{wid}", json={"is_active": True}, headers=admin_hdr, timeout=30)
        assert p2.status_code == 200 and p2.json()["is_active"] is True

    def test_update_fields(self, admin_hdr):
        wid = TestAdminRetreatCRUD.created[0]
        p = requests.patch(f"{BASE}/admin/workshops/{wid}",
                           json={"deposit_eur": 350.0, "price_eur": 1500.0, "title": "TEST_Retreat QA33 upd"},
                           headers=admin_hdr, timeout=30)
        assert p.status_code == 200
        g = requests.get(f"{BASE}/workshops/{wid}", timeout=30).json()
        assert g["deposit_eur"] == 350.0 and g["price_eur"] == 1500.0
        assert g["title"] == "TEST_Retreat QA33 upd"
        # restore deposit for reserve test
        requests.patch(f"{BASE}/admin/workshops/{wid}", json={"deposit_eur": 400.0, "price_eur": 1200.0},
                       headers=admin_hdr, timeout=30)

    def test_patch_empty_and_404(self, admin_hdr):
        r = requests.patch(f"{BASE}/admin/workshops/{TestAdminRetreatCRUD.created[0]}", json={}, headers=admin_hdr, timeout=30)
        assert r.status_code == 400
        r2 = requests.patch(f"{BASE}/admin/workshops/nope-{uuid.uuid4().hex[:6]}", json={"title": "x"},
                            headers=admin_hdr, timeout=30)
        assert r2.status_code == 404

    def test_reserve_uses_retreat_deposit(self, admin_hdr, student_token):
        wid = TestAdminRetreatCRUD.created[0]
        r = requests.post(f"{BASE}/retreats/reserve", json={
            "workshop_id": wid, "name": "TEST QA Student", "email": "student@demo.com",
        }, headers={"Authorization": f"Bearer {student_token}"}, timeout=30)
        assert r.status_code in (200, 201), f"{r.status_code} {r.text[:400]}"
        d = r.json()
        assert d["deposit_eur"] == 400.0, f"deposit not from retreat: {d['deposit_eur']}"
        assert d["balance_eur"] == 800.0, f"balance should be 1200-400: {d['balance_eur']}"
        start = datetime.now(timezone.utc) + timedelta(days=120)
        due = datetime.fromisoformat(d["balance_due_date"])
        assert 85 <= (due - datetime.now(timezone.utc)).days <= 95, f"balance_due_date off: {d['balance_due_date']}"

    def test_delete_and_verify(self, admin_hdr):
        wid = TestAdminRetreatCRUD.created[0]
        d = requests.delete(f"{BASE}/admin/workshops/{wid}", headers=admin_hdr, timeout=30)
        assert d.status_code in (200, 204)
        g = requests.get(f"{BASE}/workshops/{wid}", timeout=30)
        assert g.status_code == 404
        d2 = requests.delete(f"{BASE}/admin/workshops/{wid}", headers=admin_hdr, timeout=30)
        assert d2.status_code == 404
        TestAdminRetreatCRUD.created.clear()

    def test_public_list_only_active_upcoming(self):
        rows = requests.get(f"{BASE}/workshops", timeout=30).json()
        now = datetime.now(timezone.utc).isoformat()
        for w in rows:
            assert w.get("is_active") is True
            assert str(w["end_date"]) >= now


# ---------------- Login lockout ----------------
class TestLoginLockout:
    def test_lockout_after_5_failures(self):
        email = f"locktest_{uuid.uuid4().hex[:8]}@demo.com"
        codes = []
        for _ in range(5):
            r = requests.post(f"{BASE}/auth/login", json={"email": email, "password": "wrong"}, timeout=30)
            codes.append(r.status_code)
            time.sleep(0.2)
        assert codes == [401] * 5, f"expected five 401s, got {codes}"
        r6 = requests.post(f"{BASE}/auth/login", json={"email": email, "password": "wrong"}, timeout=30)
        assert r6.status_code == 429, f"6th attempt should be 429, got {r6.status_code} {r6.text[:200]}"
        assert "too many failed attempts" in r6.text.lower()

    def test_other_account_not_locked(self):
        r = requests.post(f"{BASE}/auth/login", json=STUDENT, timeout=30)
        assert r.status_code == 200, f"valid login blocked after other-email lockout: {r.status_code}"

    def test_successful_login_clears_counter(self):
        # 3 failures on student, then a success, then 3 more failures must still be 401 (counter cleared)
        for _ in range(3):
            r = requests.post(f"{BASE}/auth/login", json={"email": STUDENT["email"], "password": "nope"}, timeout=30)
            assert r.status_code == 401
        ok = requests.post(f"{BASE}/auth/login", json=STUDENT, timeout=30)
        assert ok.status_code == 200
        for i in range(3):
            r = requests.post(f"{BASE}/auth/login", json={"email": STUDENT["email"], "password": "nope"}, timeout=30)
            assert r.status_code == 401, f"counter not cleared, attempt {i} -> {r.status_code}"
        # clear again so account stays usable
        ok2 = requests.post(f"{BASE}/auth/login", json=STUDENT, timeout=30)
        assert ok2.status_code == 200
