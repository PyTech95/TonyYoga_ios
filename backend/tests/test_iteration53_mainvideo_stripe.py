"""Iteration 53 — Main full-course video gating + Stripe graceful 503.

Modules covered:
  - content.py: GET /api/programs/{id} main_video / main_video_locked gating,
                PATCH /api/admin/programs/{id} main_video_url persistence
  - payments.py: POST /api/checkout/session graceful 503 with placeholder Stripe key
"""
import os
import time
import uuid

import pytest
import requests
from dotenv import dotenv_values

frontend_env = dotenv_values("/app/frontend/.env")
base_url = os.environ.get("REACT_APP_BACKEND_URL") or frontend_env.get("REACT_APP_BACKEND_URL")
if not base_url:
    raise RuntimeError("REACT_APP_BACKEND_URL missing")
BASE = base_url.rstrip("/") + "/api"

PROGRAM_ID = "7585a2ef-01a1-4854-84f5-1eba68cfea66"
YT = "dQw4w9WgXcQ"
ADMIN = {"email": "tony@tonyyoga.com", "password": "TonyYoga2026!"}
STUDENT = {"email": "student@demo.com", "password": "Student2026!"}


def _login(creds):
    r = requests.post(f"{BASE}/auth/login", json=creds, timeout=30)
    if r.status_code != 200:
        pytest.fail(f"login failed for {creds['email']}: {r.status_code} {r.text[:300]}")
    tok = r.json().get("access_token") or r.json().get("token")
    assert tok, f"no token in login response: {r.text[:300]}"
    return tok


def _h(tok):
    return {"Authorization": f"Bearer {tok}"}


@pytest.fixture(scope="module")
def admin_token():
    return _login(ADMIN)


@pytest.fixture(scope="module")
def student_token():
    return _login(STUDENT)


@pytest.fixture(scope="module")
def fresh_token():
    """A brand new user with no purchases and no membership."""
    email = f"TEST_it53_{uuid.uuid4().hex[:8]}@qatest.com"
    r = requests.post(f"{BASE}/auth/register", json={
        "email": email, "password": "QaTest2026!", "name": "TEST Iter53"
    }, timeout=30)
    if r.status_code not in (200, 201):
        pytest.fail(f"register failed: {r.status_code} {r.text[:300]}")
    tok = r.json().get("access_token") or r.json().get("token")
    if not tok:
        tok = _login({"email": email, "password": "QaTest2026!"})
    return tok


@pytest.fixture(scope="module", autouse=True)
def set_main_video(admin_token):
    """Set the full-course video on the test program, clear it at teardown."""
    r = requests.patch(f"{BASE}/admin/programs/{PROGRAM_ID}",
                       json={"main_video_url": f"https://www.youtube.com/watch?v={YT}"},
                       headers=_h(admin_token), timeout=30)
    assert r.status_code == 200, f"PATCH set failed: {r.status_code} {r.text[:300]}"
    assert r.json().get("main_video_url", "").endswith(YT)
    yield
    r2 = requests.patch(f"{BASE}/admin/programs/{PROGRAM_ID}", json={"main_video_url": ""},
                        headers=_h(admin_token), timeout=30)
    assert r2.status_code == 200
    assert (r2.json().get("main_video_url") or "") == ""


# ---------- Admin persistence ----------
class TestAdminPersistence:
    def test_patch_persists_and_get_reflects(self, admin_token):
        # admin has staff access -> main_video exposed
        g = requests.get(f"{BASE}/programs/{PROGRAM_ID}", headers=_h(admin_token), timeout=30)
        assert g.status_code == 200
        d = g.json()
        assert d.get("main_video") and d["main_video"]["youtube_id"] == YT
        assert d.get("main_video_locked") is False
        assert "main_video_url" not in d  # raw url stripped even for admin viewer

    def test_clear_then_reset(self, admin_token):
        c = requests.patch(f"{BASE}/admin/programs/{PROGRAM_ID}", json={"main_video_url": ""},
                           headers=_h(admin_token), timeout=30)
        assert c.status_code == 200
        assert (c.json().get("main_video_url") or "") == ""
        g = requests.get(f"{BASE}/programs/{PROGRAM_ID}", headers=_h(admin_token), timeout=30)
        assert g.json().get("main_video") is None
        assert g.json().get("main_video_locked") is False
        # restore for the remaining tests
        requests.patch(f"{BASE}/admin/programs/{PROGRAM_ID}",
                       json={"main_video_url": f"https://www.youtube.com/watch?v={YT}"},
                       headers=_h(admin_token), timeout=30)


# ---------- Gating ----------
class TestMainVideoGating:
    def test_anon_hidden_and_no_leak(self):
        r = requests.get(f"{BASE}/programs/{PROGRAM_ID}", timeout=30)
        assert r.status_code == 200
        d = r.json()
        assert d.get("main_video") is None
        assert d.get("main_video_locked") is False
        assert "main_video_url" not in d
        assert YT not in r.text, "youtube id leaked in anon program payload"

    def test_no_access_user_locked(self, fresh_token):
        r = requests.get(f"{BASE}/programs/{PROGRAM_ID}", headers=_h(fresh_token), timeout=30)
        assert r.status_code == 200
        d = r.json()
        assert d.get("main_video") is None
        assert d.get("main_video_locked") is True
        assert YT not in r.text

    def test_entitled_student_can_play(self, student_token):
        r = requests.get(f"{BASE}/programs/{PROGRAM_ID}", headers=_h(student_token), timeout=30)
        assert r.status_code == 200
        d = r.json()
        v = d.get("viewer") or {}
        assert v.get("owns_program") or v.get("has_active_membership") or v.get("is_staff"), \
            f"student lacks access, viewer={v}"
        assert d.get("main_video") and d["main_video"]["youtube_id"] == YT
        assert d.get("main_video_locked") is False

    def test_program_list_does_not_leak_main_video_url(self):
        r = requests.get(f"{BASE}/programs", timeout=30)
        assert r.status_code == 200
        assert "main_video_url" not in r.text, \
            "GET /api/programs list leaks raw main_video_url to anonymous callers"


# ---------- Stripe graceful failure ----------
class TestStripeGraceful:
    def _credit(self, tok):
        r = requests.get(f"{BASE}/auth/me", headers=_h(tok), timeout=30)
        assert r.status_code == 200
        return round(float(r.json().get("store_credit") or 0), 2)

    def test_onetime_program_returns_503(self, fresh_token):
        r = requests.post(f"{BASE}/checkout/session", headers=_h(fresh_token), json={
            "item_type": "program", "item_id": PROGRAM_ID,
            "origin_url": base_url.rstrip("/"), "quantity": 1, "apply_credit": False,
        }, timeout=60)
        assert r.status_code == 503, f"expected 503, got {r.status_code}: {r.text[:400]}"
        detail = (r.json() or {}).get("detail", "")
        assert "not configured" in detail.lower() or "payments" in detail.lower(), detail

    def test_dropin_returns_503(self, student_token):
        r = requests.post(f"{BASE}/checkout/session", headers=_h(student_token), json={
            "item_type": "drop_in", "item_id": "drop_in",
            "origin_url": base_url.rstrip("/"), "quantity": 1, "apply_credit": False,
        }, timeout=60)
        assert r.status_code == 503, f"expected 503, got {r.status_code}: {r.text[:400]}"

    def test_503_does_not_strand_partial_store_credit(self, admin_token, fresh_token):
        """Fresh user with a small gift card buys a 199 program with apply_credit=True.
        Credit is only partial, so Stripe is needed -> 503, and the reserved credit
        must be released back (no stranded credit)."""
        gc = requests.post(f"{BASE}/admin/gift-cards", headers=_h(admin_token),
                           json={"amount": 10, "currency": "usd"}, timeout=30)
        assert gc.status_code in (200, 201), f"gift-card create failed: {gc.status_code} {gc.text[:300]}"
        code = gc.json().get("code")
        assert code
        rd = requests.post(f"{BASE}/gift-cards/redeem", headers=_h(fresh_token),
                           json={"code": code}, timeout=30)
        assert rd.status_code == 200, f"redeem failed: {rd.status_code} {rd.text[:300]}"
        before = self._credit(fresh_token)
        assert before >= 10, f"expected >=10 credit, got {before}"

        r = requests.post(f"{BASE}/checkout/session", headers=_h(fresh_token), json={
            "item_type": "program", "item_id": PROGRAM_ID,
            "origin_url": base_url.rstrip("/"), "quantity": 1, "apply_credit": True,
        }, timeout=60)
        assert r.status_code == 503, f"expected 503, got {r.status_code}: {r.text[:400]}"
        time.sleep(1)
        after = self._credit(fresh_token)
        assert after == before, f"store credit stranded after 503: {before} -> {after}"
