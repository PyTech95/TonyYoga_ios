"""Iteration 48 — retest of iteration_47 fixes.
Covers: gift-card credit reserve/release on cancel (FIX #1), idempotency,
TTL sweeper import (FIX #1b), credit-only regression.
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
BASE_URL = base_url.rstrip("/") + "/api"

ADMIN = {"email": "tony@tonyyoga.com", "password": "TonyYoga2026!"}


def _sess(token=None):
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    if token:
        s.headers.update({"Authorization": f"Bearer {token}"})
    return s


@pytest.fixture(scope="module")
def admin_token():
    r = requests.post(f"{BASE_URL}/auth/login", json=ADMIN, timeout=30)
    if r.status_code != 200:
        pytest.fail(f"admin login failed {r.status_code}: {r.text[:300]}")
    return r.json()["access_token"] if "access_token" in r.json() else r.json()["token"]


@pytest.fixture(scope="module")
def fresh_user():
    email = f"TEST_it48_{uuid.uuid4().hex[:8]}@qatest48.com"
    r = requests.post(f"{BASE_URL}/auth/register", json={
        "email": email, "password": "TestPass2026!", "name": "TEST It48 User"
    }, timeout=30)
    assert r.status_code in (200, 201), f"register failed {r.status_code}: {r.text[:300]}"
    body = r.json()
    token = body.get("access_token") or body.get("token")
    assert token
    return {"email": email, "token": token}


def _issue_credit(admin_token, user_token, amount):
    a = _sess(admin_token)
    r = a.post(f"{BASE_URL}/admin/gift-cards", json={"amount": amount, "currency": "usd"}, timeout=30)
    assert r.status_code in (200, 201), f"gift-card create failed {r.status_code}: {r.text[:300]}"
    code = r.json().get("code")
    assert code, r.text[:300]
    u = _sess(user_token)
    rr = u.post(f"{BASE_URL}/gift-cards/redeem", json={"code": code}, timeout=30)
    assert rr.status_code == 200, f"redeem failed {rr.status_code}: {rr.text[:300]}"
    return code


def _balance(user_token):
    r = _sess(user_token).get(f"{BASE_URL}/me/store-credit", timeout=30)
    assert r.status_code == 200, f"{r.status_code}: {r.text[:200]}"
    return round(float(r.json().get("store_credit") or 0), 2)


def _core26_program(user_token):
    r = _sess(user_token).get(f"{BASE_URL}/programs", timeout=30)
    assert r.status_code == 200, r.text[:200]
    progs = [p for p in r.json() if float(p.get("price") or 0) > 0]
    assert progs, "no priced programs"
    core = [p for p in progs if "core" in (p.get("slug", "") + p.get("title", "")).lower()]
    pool = core or progs
    return max(pool, key=lambda p: float(p["price"]))


# ---------------- FIX #1: partial credit reserve + release on cancel ----------------
class TestStrandedCreditRelease:
    def test_partial_credit_reserve_and_release(self, admin_token, fresh_user):
        tok = fresh_user["token"]
        _issue_credit(admin_token, tok, 100.0)
        bal0 = _balance(tok)
        assert bal0 == 100.0, f"expected 100 credit, got {bal0}"

        prog = _core26_program(tok)
        price = float(prog.get("price") or 0)
        assert price > bal0, f"program price {price} not greater than credit {bal0}"

        r = _sess(tok).post(f"{BASE_URL}/checkout/session", json={
            "item_type": "program", "item_id": prog["id"],
            "apply_credit": True, "origin_url": "https://x.com",
        }, timeout=60)
        assert r.status_code == 200, f"checkout failed {r.status_code}: {r.text[:400]}"
        data = r.json()
        assert data.get("url"), f"no stripe url: {data}"
        assert "stripe" in data["url"], data["url"]
        session_id = data["session_id"]

        bal1 = _balance(tok)
        assert bal1 == 0.0, f"credit not reserved, balance={bal1}"

        # release
        rel = _sess(tok).post(f"{BASE_URL}/checkout/credit-release", json={"session_id": session_id}, timeout=30)
        assert rel.status_code == 200, f"{rel.status_code}: {rel.text[:300]}"
        rd = rel.json()
        assert rd["released"] == 100.0, rd
        assert rd.get("store_credit") == 100.0, rd
        assert _balance(tok) == 100.0

        # idempotent
        rel2 = _sess(tok).post(f"{BASE_URL}/checkout/credit-release", json={"session_id": session_id}, timeout=30)
        assert rel2.status_code == 200, rel2.text[:200]
        assert rel2.json()["released"] == 0, rel2.json()
        assert _balance(tok) == 100.0, "double release inflated balance"

    def test_credit_release_validation(self, fresh_user):
        s = _sess(fresh_user["token"])
        assert s.post(f"{BASE_URL}/checkout/credit-release", json={}, timeout=30).status_code == 400
        assert s.post(f"{BASE_URL}/checkout/credit-release", json={"session_id": "nope_xyz"}, timeout=30).status_code == 404

    def test_credit_release_requires_auth(self):
        r = requests.post(f"{BASE_URL}/checkout/credit-release", json={"session_id": "x"}, timeout=30)
        assert r.status_code in (401, 403), r.status_code

    def test_credit_release_cross_user_isolation(self, admin_token, fresh_user):
        """A different user cannot release another user's reserved credit."""
        tok = fresh_user["token"]
        prog = _core26_program(tok)
        r = _sess(tok).post(f"{BASE_URL}/checkout/session", json={
            "item_type": "program", "item_id": prog["id"],
            "apply_credit": True, "origin_url": "https://x.com",
        }, timeout=60)
        assert r.status_code == 200, r.text[:300]
        sid = r.json()["session_id"]
        # other user
        email = f"TEST_it48b_{uuid.uuid4().hex[:8]}@qatest48.com"
        rr = requests.post(f"{BASE_URL}/auth/register", json={
            "email": email, "password": "TestPass2026!", "name": "TEST Other"}, timeout=30)
        other = rr.json().get("access_token") or rr.json().get("token")
        bad = _sess(other).post(f"{BASE_URL}/checkout/credit-release", json={"session_id": sid}, timeout=30)
        assert bad.status_code == 404, f"cross-user release allowed! {bad.status_code} {bad.text[:200]}"
        # cleanup: owner releases
        _sess(tok).post(f"{BASE_URL}/checkout/credit-release", json={"session_id": sid}, timeout=30)


# ---------------- REGRESSION: credit-only checkout ----------------
class TestCreditOnly:
    def test_credit_fully_covers_price(self, admin_token):
        email = f"TEST_it48c_{uuid.uuid4().hex[:8]}@qatest48.com"
        rr = requests.post(f"{BASE_URL}/auth/register", json={
            "email": email, "password": "TestPass2026!", "name": "TEST Credit Only"}, timeout=30)
        assert rr.status_code in (200, 201), rr.text[:300]
        tok = rr.json().get("access_token") or rr.json().get("token")
        prog = _core26_program(tok)
        price = float(prog["price"])
        _issue_credit(admin_token, tok, round(price + 50, 2))
        bal0 = _balance(tok)
        r = _sess(tok).post(f"{BASE_URL}/checkout/session", json={
            "item_type": "program", "item_id": prog["id"],
            "apply_credit": True, "origin_url": "https://x.com",
        }, timeout=60)
        assert r.status_code == 200, r.text[:400]
        d = r.json()
        assert d.get("credit_only") is True, d
        assert "url" not in d, d
        assert abs(float(d["credit_applied"]) - price) < 0.02, d
        bal1 = _balance(tok)
        assert abs(bal1 - (bal0 - price)) < 0.02, f"{bal0} -> {bal1}, price {price}"
