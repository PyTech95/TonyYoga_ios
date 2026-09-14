"""Iteration 6 backend tests: providers, marketing reels, free-class signup, paypal disabled."""
import os
import time
import pytest
import requests
from dotenv import load_dotenv
load_dotenv("/app/backend/.env")

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://web-app-hub-56.preview.emergentagent.com").rstrip("/")
API = f"{BASE_URL}/api"

STUDENT_EMAIL = "student@demo.com"
STUDENT_PASSWORD = "Student2026!"


@pytest.fixture(scope="module")
def student_token():
    r = requests.post(f"{API}/auth/login", json={"email": STUDENT_EMAIL, "password": STUDENT_PASSWORD}, timeout=15)
    if r.status_code != 200:
        pytest.skip(f"Cannot login as student: {r.status_code} {r.text}")
    return r.json().get("access_token") or r.json().get("token")


# ---------- /checkout/providers ----------
def test_providers_shape():
    r = requests.get(f"{API}/checkout/providers", timeout=15)
    assert r.status_code == 200, r.text
    data = r.json()
    assert data.get("stripe") is True
    assert data.get("paypal") is False
    assert data.get("paypal_mode") == "sandbox"


# ---------- /marketing/reels ----------
def test_marketing_reels():
    r = requests.get(f"{API}/marketing/reels", timeout=15)
    assert r.status_code == 200
    data = r.json()
    assert isinstance(data, list)
    assert len(data) == 4
    for reel in data:
        assert "shortcode" in reel and isinstance(reel["shortcode"], str) and reel["shortcode"]
        assert "caption" in reel


# ---------- /marketing/free-class-signup ----------
def test_free_class_signup_idempotent():
    email = f"testing-free-{int(time.time()*1000)}@example.com"
    r1 = requests.post(f"{API}/marketing/free-class-signup", json={"email": email, "name": "Test"}, timeout=20)
    assert r1.status_code == 200, r1.text
    d1 = r1.json()
    assert d1.get("ok") is True
    assert d1.get("already_granted") is False

    # Second call — idempotent
    r2 = requests.post(f"{API}/marketing/free-class-signup", json={"email": email, "name": "Test"}, timeout=20)
    assert r2.status_code == 200, r2.text
    d2 = r2.json()
    assert d2.get("ok") is True
    assert d2.get("already_granted") is True


def test_free_class_signup_db_side_effects():
    """Verify user, class_pass, and free_class_grant were created."""
    import asyncio
    from motor.motor_asyncio import AsyncIOMotorClient

    email = f"testing-free-db-{int(time.time()*1000)}@example.com"
    r = requests.post(f"{API}/marketing/free-class-signup", json={"email": email, "name": "DB Test"}, timeout=20)
    assert r.status_code == 200

    mongo_url = os.environ.get("MONGO_URL", "mongodb://localhost:27017")
    db_name = os.environ.get("DB_NAME", "test_database")

    async def check():
        client = AsyncIOMotorClient(mongo_url)
        db = client[db_name]
        user = await db.users.find_one({"email": email})
        grant = await db.free_class_grants.find_one({"email": email})
        pass_doc = None
        if user:
            pass_doc = await db.class_passes.find_one({"user_id": user["id"], "type": "free_intro"})
        client.close()
        return user, grant, pass_doc

    user, grant, pass_doc = asyncio.get_event_loop().run_until_complete(check())
    assert user is not None, "user not created"
    assert user.get("role") == "student"
    assert user.get("source") == "marketing_ribbon"
    assert grant is not None, "free_class_grant not created"
    assert pass_doc is not None, "class_pass not created"
    assert pass_doc.get("remaining") == 1
    assert pass_doc.get("active") is True
    assert pass_doc.get("type") == "free_intro"


# ---------- /paypal/create-order should 400 when unconfigured ----------
def test_paypal_disabled(student_token):
    headers = {"Authorization": f"Bearer {student_token}"}
    r = requests.post(
        f"{API}/paypal/create-order",
        json={"item_type": "drop_in", "item_id": "drop_in", "origin_url": BASE_URL},
        headers=headers,
        timeout=15,
    )
    assert r.status_code == 400, f"Expected 400, got {r.status_code}: {r.text}"
    body = r.text.lower()
    assert "paypal" in body and ("credential" in body or "configur" in body or "not" in body)


# ---------- PWA/manifest still valid ----------
def test_sw_js():
    r = requests.get(f"{BASE_URL}/sw.js", timeout=15)
    assert r.status_code == 200


def test_manifest():
    r = requests.get(f"{BASE_URL}/manifest.webmanifest", timeout=15)
    if r.status_code == 404:
        r = requests.get(f"{BASE_URL}/manifest.json", timeout=15)
    assert r.status_code == 200
