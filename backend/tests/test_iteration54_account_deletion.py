"""Iteration 54 — GDPR account deletion (30-day grace) + public legal surfaces."""
import os
import time
import uuid

import pytest
import requests
from dotenv import dotenv_values

fe = dotenv_values("/app/frontend/.env")
BASE = (os.environ.get("REACT_APP_BACKEND_URL") or fe.get("REACT_APP_BACKEND_URL")).rstrip("/")
API = f"{BASE}/api"

PW = "QaDelete2026!"


@pytest.fixture(scope="module")
def s():
    ses = requests.Session()
    ses.headers.update({"Content-Type": "application/json"})
    return ses


@pytest.fixture(scope="module")
def fresh_user(s):
    email = f"TEST_del_{uuid.uuid4().hex[:8]}@qatest.com"
    r = s.post(f"{API}/auth/register", json={"email": email, "password": PW, "name": "QA Delete"})
    assert r.status_code in (200, 201), r.text
    data = r.json()
    token = data.get("token") or data.get("access_token")
    assert token, data
    return {"email": email, "password": PW, "token": token}


def auth(tok):
    return {"Authorization": f"Bearer {tok}", "Content-Type": "application/json"}


# --- public legal pages / SPA routes ---
@pytest.mark.parametrize("path", ["/privacy", "/terms", "/account-deletion", "/support"])
def test_public_legal_routes_served(s, path):
    r = s.get(f"{BASE}{path}", timeout=30)
    assert r.status_code == 200
    assert "<div id=\"root\"" in r.text or "root" in r.text


# --- public deletion request endpoint ---
def test_public_deletion_request(s):
    email = f"TEST_pub_{uuid.uuid4().hex[:6]}@qatest.com"
    r = s.post(f"{API}/account/deletion-request", json={"email": email, "reason": "TEST_qa"})
    assert r.status_code == 200, r.text
    body = r.json()
    assert body.get("ok") is True
    assert "30 days" in body.get("message", "")


def test_public_deletion_request_invalid_email(s):
    r = s.post(f"{API}/account/deletion-request", json={"email": "not-an-email"})
    assert r.status_code == 422


def test_public_deletion_request_requires_no_auth(s):
    # already covered above (no auth header used); ensure endpoint isn't 401
    r = s.post(f"{API}/account/deletion-request", json={"email": f"TEST_na_{uuid.uuid4().hex[:6]}@qatest.com"})
    assert r.status_code != 401


# --- authenticated status / delete / cancel flow ---
def test_status_requires_auth(s):
    r = s.get(f"{API}/me/account/status")
    assert r.status_code in (401, 403)


def test_full_grace_period_flow(s, fresh_user):
    tok = fresh_user["token"]
    # 1. initial status
    r = s.get(f"{API}/me/account/status", headers=auth(tok))
    assert r.status_code == 200, r.text
    d = r.json()
    assert d["deletion_scheduled"] is False
    assert d["deletion_scheduled_at"] is None
    assert d["grace_days"] == 30

    # 2. wrong password -> 401
    r = s.request("DELETE", f"{API}/me/account", headers=auth(tok), json={"password": "WrongPass1!"})
    assert r.status_code == 401, r.text

    # 3. correct password -> scheduled
    r = s.request("DELETE", f"{API}/me/account", headers=auth(tok),
                  json={"password": PW, "reason": "TEST_qa flow"})
    assert r.status_code == 200, r.text
    d = r.json()
    assert d["ok"] is True and d["grace_days"] == 30
    assert isinstance(d["deletion_scheduled_at"], str)

    # 4. status reflects schedule
    r = s.get(f"{API}/me/account/status", headers=auth(tok))
    assert r.status_code == 200
    assert r.json()["deletion_scheduled"] is True

    # 5. login still allowed during grace (not 403)
    r = s.post(f"{API}/auth/login", json={"email": fresh_user["email"], "password": PW})
    assert r.status_code == 200, f"grace login blocked: {r.status_code} {r.text[:300]}"
    tok2 = r.json().get("token") or r.json().get("access_token")
    assert tok2

    # 6. cancel deletion
    r = s.post(f"{API}/me/account/cancel-deletion", headers=auth(tok2))
    assert r.status_code == 200, r.text
    assert r.json()["ok"] is True

    # 7. status back to false
    r = s.get(f"{API}/me/account/status", headers=auth(tok2))
    assert r.json()["deletion_scheduled"] is False

    # 8. cancel again -> 400
    r = s.post(f"{API}/me/account/cancel-deletion", headers=auth(tok2))
    assert r.status_code == 400, r.text

    # 9. login works normally after cancel
    time.sleep(0.5)
    r = s.post(f"{API}/auth/login", json={"email": fresh_user["email"], "password": PW})
    assert r.status_code == 200


def test_demo_accounts_not_scheduled(s):
    for email, pw in [("student@demo.com", "Student2026!"), ("tony@tonyyoga.com", "TonyYoga2026!")]:
        r = s.post(f"{API}/auth/login", json={"email": email, "password": pw})
        assert r.status_code == 200, f"{email}: {r.status_code} {r.text[:200]}"
        tok = r.json().get("token") or r.json().get("access_token")
        st = s.get(f"{API}/me/account/status", headers=auth(tok))
        assert st.status_code == 200
        assert st.json()["deletion_scheduled"] is False, f"{email} is scheduled for deletion!"
