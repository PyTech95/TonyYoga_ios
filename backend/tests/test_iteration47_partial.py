"""Iteration 47b — partial gift-card credit with a fresh throwaway student.

Guarantees credit < program price so the Stripe-remainder path is exercised.
"""
import os
import re
import time
from pathlib import Path

import pytest
import requests
from dotenv import dotenv_values

frontend_env = dotenv_values("/app/frontend/.env")
BASE_URL = (os.environ.get("REACT_APP_BACKEND_URL") or frontend_env["REACT_APP_BACKEND_URL"]).rstrip("/")
API = f"{BASE_URL}/api"


def _admin_session():
    content = Path("/app/memory/test_credentials.md").read_text(encoding="utf-8")
    block = content.split("## Admin")[1]
    email = re.search(r"Email:\s*(\S+)", block).group(1)
    pw = re.search(r"Password:\s*(\S+)", block).group(1)
    r = requests.post(f"{API}/auth/login", json={"email": email, "password": pw}, timeout=30)
    assert r.status_code == 200, r.text[:300]
    s = requests.Session()
    s.headers.update({"Authorization": f"Bearer {r.json()['token']}"})
    return s


@pytest.fixture(scope="module")
def admin():
    return _admin_session()


@pytest.fixture(scope="module")
def fresh_student():
    email = f"TEST_credit_{int(time.time())}@example.com"
    r = requests.post(f"{API}/auth/register", json={
        "email": email, "name": "TEST Credit User", "password": "TestPass2026!",
    }, timeout=30)
    assert r.status_code in (200, 201), r.text[:300]
    token = r.json().get("token")
    s = requests.Session()
    s.headers.update({"Authorization": f"Bearer {token}"})
    s.email = email
    return s


def _credit(s):
    r = s.get(f"{API}/me/store-credit", timeout=30)
    assert r.status_code == 200, r.text[:200]
    return round(float(r.json().get("store_credit") or 0), 2)


def test_partial_credit_reserve_and_release(admin, fresh_student):
    assert _credit(fresh_student) == 0.0
    gc = admin.post(f"{API}/admin/gift-cards", json={"amount": 100, "currency": "usd"}, timeout=30)
    assert gc.status_code in (200, 201), gc.text[:300]
    code = gc.json().get("code")
    rr = fresh_student.post(f"{API}/gift-cards/redeem", json={"code": code}, timeout=30)
    assert rr.status_code == 200, rr.text[:300]
    assert _credit(fresh_student) == 100.0

    progs = requests.get(f"{API}/programs", timeout=30).json()
    progs = progs if isinstance(progs, list) else progs.get("programs", [])
    prog = next((p for p in progs if float(p.get("price") or 0) >= 150), None)
    assert prog, f"no program >= 150: {[(p.get('title'), p.get('price')) for p in progs]}"

    r = fresh_student.post(f"{API}/checkout/session", json={
        "item_type": "program", "item_id": prog["id"], "quantity": 1,
        "origin_url": BASE_URL, "apply_credit": True,
    }, timeout=60)
    assert r.status_code == 200, f"{r.status_code} {r.text[:400]}"
    d = r.json()
    assert d.get("credit_only") is not True, d
    assert d["url"].startswith("http"), d
    sid = d["session_id"]
    assert _credit(fresh_student) == 0.0, "full 100 should have been reserved"

    # status endpoint should expose the transaction with credit_applied
    st = fresh_student.get(f"{API}/checkout/status/{sid}", timeout=30)
    assert st.status_code == 200, st.text[:200]
    body = st.json()
    assert "_id" not in body
    assert round(float(body.get("amount_total") or 0) / 100.0, 2) == round(float(prog["price"]) - 100.0, 2), body

    rel = fresh_student.post(f"{API}/checkout/credit-release", json={"session_id": sid}, timeout=30)
    assert rel.status_code == 200, rel.text[:300]
    assert float(rel.json()["released"]) == 100.0, rel.json()
    assert _credit(fresh_student) == 100.0

    rel2 = fresh_student.post(f"{API}/checkout/credit-release", json={"session_id": sid}, timeout=30)
    assert float(rel2.json()["released"]) == 0.0


def test_other_user_cannot_release_my_credit(admin, fresh_student):
    r = fresh_student.post(f"{API}/checkout/session", json={
        "item_type": "program", "item_id": (requests.get(f"{API}/programs", timeout=30).json() or [{}])[0].get("id"),
        "quantity": 1, "origin_url": BASE_URL, "apply_credit": True,
    }, timeout=60)
    if r.status_code != 200 or not r.json().get("session_id"):
        pytest.skip(f"could not create session: {r.status_code} {r.text[:200]}")
    sid = r.json()["session_id"]
    other = admin.post(f"{API}/checkout/credit-release", json={"session_id": sid}, timeout=30)
    assert other.status_code == 404, f"cross-user release allowed! {other.status_code} {other.text[:200]}"
    fresh_student.post(f"{API}/checkout/credit-release", json={"session_id": sid}, timeout=30)
