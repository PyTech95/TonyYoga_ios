"""Retest iteration 4 fixes: /api/practice/log same-day double-call no longer 500s."""
import os
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://web-app-hub-56.preview.emergentagent.com").rstrip("/")


def _login():
    r = requests.post(f"{BASE_URL}/api/auth/login", json={"email": "student@demo.com", "password": "Student2026!"})
    assert r.status_code == 200, r.text
    return r.json()["token"]


def test_practice_log_double_same_day_no_500():
    token = _login()
    h = {"Authorization": f"Bearer {token}"}
    # First call
    r1 = requests.post(f"{BASE_URL}/api/practice/log", json={"source": "manual"}, headers=h)
    assert r1.status_code == 200, r1.text
    d1 = r1.json()
    assert "milestone_unlocked" in d1
    assert "freeze_used" in d1

    # Second call SAME day - previously 500
    r2 = requests.post(f"{BASE_URL}/api/practice/log", json={"source": "manual"}, headers=h)
    assert r2.status_code == 200, r2.text
    d2 = r2.json()
    assert d2["milestone_unlocked"] is None
    assert d2["freeze_used"] is False
    # current_streak should not decrease
    assert d2.get("current_streak") == d1.get("current_streak")
