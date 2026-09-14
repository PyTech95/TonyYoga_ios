"""Iteration 12 — Admin Settings surface (Stripe / SMTP / VAPID push) + regressions."""
import os
import re
from pathlib import Path

import pytest
import requests
from dotenv import dotenv_values

frontend_env = dotenv_values("/app/frontend/.env")
base_url = os.environ.get("REACT_APP_BACKEND_URL") or frontend_env.get("REACT_APP_BACKEND_URL")
if not base_url:
    raise RuntimeError("REACT_APP_BACKEND_URL missing")
BASE_URL = base_url.rstrip("/")
API = f"{BASE_URL}/api"


def _creds():
    content = Path("/app/memory/test_credentials.md").read_text(encoding="utf-8")
    emails = re.findall(r"Email:\s*`([^`]+)`", content)
    pwds = re.findall(r"Password:\s*`([^`]+)`", content)
    return emails, pwds


@pytest.fixture(scope="session")
def admin_token():
    emails, pwds = _creds()
    r = requests.post(f"{API}/auth/login", json={"email": emails[0], "password": pwds[0]}, timeout=30)
    if r.status_code != 200:
        pytest.fail(f"admin login failed {r.status_code}: {r.text[:300]}")
    return r.json()["token"]


@pytest.fixture(scope="session")
def student_token():
    emails, pwds = _creds()
    r = requests.post(f"{API}/auth/login", json={"email": emails[1], "password": pwds[1]}, timeout=30)
    if r.status_code != 200:
        pytest.fail(f"student login failed {r.status_code}: {r.text[:300]}")
    return r.json()["token"]


@pytest.fixture(scope="session")
def admin_client(admin_token):
    s = requests.Session()
    s.headers.update({"Authorization": f"Bearer {admin_token}", "Content-Type": "application/json"})
    return s


@pytest.fixture(scope="session")
def student_client(student_token):
    s = requests.Session()
    s.headers.update({"Authorization": f"Bearer {student_token}", "Content-Type": "application/json"})
    return s


# ---------------- Health ----------------
class TestHealth:
    def test_public_settings(self):
        r = requests.get(f"{API}/settings/public", timeout=30)
        assert r.status_code == 200
        data = r.json()
        for secret in ("stripe_secret_key", "stripe_webhook_secret", "smtp_password", "vapid_private_key"):
            assert secret not in data, f"{secret} leaked in /settings/public"


# ---------------- Admin settings: auth + masking ----------------
class TestAdminSettingsAuth:
    def test_get_requires_auth(self):
        r = requests.get(f"{API}/admin/settings", timeout=30)
        assert r.status_code in (401, 403), r.status_code

    def test_student_forbidden(self, student_client):
        r = student_client.get(f"{API}/admin/settings")
        assert r.status_code == 403, f"{r.status_code} {r.text[:200]}"

    def test_student_cannot_patch(self, student_client):
        r = student_client.patch(f"{API}/admin/settings", json={"stripe_enabled": False})
        assert r.status_code == 403

    def test_student_cannot_generate_vapid(self, student_client):
        r = student_client.post(f"{API}/admin/push/generate-vapid", json={})
        assert r.status_code == 403


class TestAdminSettingsCRUD:
    def test_get_settings_shape(self, admin_client):
        r = admin_client.get(f"{API}/admin/settings")
        assert r.status_code == 200, r.text[:300]
        d = r.json()
        for k in ("stripe_enabled", "stripe_mode", "email_enabled", "smtp_host",
                  "smtp_port", "push_enabled", "vapid_claim_email"):
            assert k in d, f"missing {k}"
        # secrets must be masked, never plaintext
        for k in ("stripe_secret_key", "stripe_webhook_secret", "smtp_password", "vapid_private_key"):
            assert k in d
            v = d[k]
            assert v == "" or v.startswith("•"), f"{k} not masked: {v!r}"
            assert f"{k}_set" in d

    def test_patch_stripe_and_persist_masked(self, admin_client):
        payload = {
            "stripe_enabled": True,
            "stripe_mode": "live",
            "stripe_publishable_key": "pk_test_TESTKEY123456",
            "stripe_secret_key": "sk_test_TESTSECRET7890",
            "stripe_webhook_secret": "whsec_TESTWH1234",
        }
        r = admin_client.patch(f"{API}/admin/settings", json=payload)
        assert r.status_code == 200, r.text[:300]
        assert r.json()["updated"] == 5

        g = admin_client.get(f"{API}/admin/settings").json()
        assert g["stripe_mode"] == "live"
        assert g["stripe_enabled"] is True
        assert g["stripe_publishable_key"] == "pk_test_TESTKEY123456"
        assert g["stripe_secret_key"] != "sk_test_TESTSECRET7890"
        assert g["stripe_secret_key"].startswith("•") and g["stripe_secret_key"].endswith("7890")
        assert g["stripe_secret_key_set"] is True
        assert g["stripe_webhook_secret"].endswith("1234")

    def test_masked_resubmit_does_not_wipe_secret(self, admin_client):
        g = admin_client.get(f"{API}/admin/settings").json()
        masked = g["stripe_secret_key"]
        r = admin_client.patch(f"{API}/admin/settings", json={"stripe_secret_key": masked})
        assert r.status_code == 200
        g2 = admin_client.get(f"{API}/admin/settings").json()
        assert g2["stripe_secret_key"] == masked
        assert g2["stripe_secret_key_set"] is True

    def test_empty_secret_preserved(self, admin_client):
        r = admin_client.patch(f"{API}/admin/settings", json={"stripe_secret_key": ""})
        assert r.status_code == 200
        g = admin_client.get(f"{API}/admin/settings").json()
        assert g["stripe_secret_key_set"] is True

    def test_patch_email_settings_persist(self, admin_client):
        payload = {
            "email_enabled": True,
            "smtp_host": "smtp.test-tonyyoga.invalid",
            "smtp_port": "2525",
            "smtp_user": "TEST_smtp@example.com",
            "smtp_password": "TESTapppassword1",
            "sender_email": "TEST_sender@example.com",
            "sender_name": "TEST Tony",
        }
        r = admin_client.patch(f"{API}/admin/settings", json=payload)
        assert r.status_code == 200, r.text[:300]
        g = admin_client.get(f"{API}/admin/settings").json()
        assert g["email_enabled"] is True
        assert g["smtp_host"] == "smtp.test-tonyyoga.invalid"
        assert g["smtp_port"] == 2525 and isinstance(g["smtp_port"], int)
        assert g["smtp_user"] == "TEST_smtp@example.com"
        assert g["sender_name"] == "TEST Tony"
        assert g["smtp_password"].startswith("•")
        assert "TESTapppassword1" not in str(g)

    def test_unknown_keys_ignored(self, admin_client):
        r = admin_client.patch(f"{API}/admin/settings", json={"totally_bogus_key": "x"})
        assert r.status_code == 200
        assert r.json()["updated"] == 0

    def test_invalid_port_type_ignored(self, admin_client):
        r = admin_client.patch(f"{API}/admin/settings", json={"smtp_port": "not-a-number"})
        assert r.status_code == 200
        g = admin_client.get(f"{API}/admin/settings").json()
        assert isinstance(g["smtp_port"], int)


# ---------------- Test-email endpoint (graceful degradation) ----------------
class TestEmailTest:
    def test_send_test_email_graceful(self, admin_client):
        r = admin_client.post(f"{API}/admin/email/test", json={"to": "TEST_qa@example.com"})
        assert r.status_code == 200, f"crashed: {r.status_code} {r.text[:300]}"
        d = r.json()
        assert d["ok"] is False, "expected graceful failure with fake SMTP creds"
        assert d["to"] == "TEST_qa@example.com"
        assert d["error"]

    def test_send_test_email_defaults_to_admin(self, admin_client):
        r = admin_client.post(f"{API}/admin/email/test", json={})
        assert r.status_code == 200
        d = r.json()
        assert d.get("to"), "should default to admin email"

    def test_send_test_email_forbidden_for_student(self, student_client):
        r = student_client.post(f"{API}/admin/email/test", json={"to": "x@example.com"})
        assert r.status_code == 403


# ---------------- VAPID generation ----------------
class TestVapid:
    def test_generate_and_public_key(self, admin_client):
        r = admin_client.post(f"{API}/admin/push/generate-vapid", json={})
        assert r.status_code == 200, r.text[:300]
        d = r.json()
        assert d["ok"] is True
        pub = d["public_key"]
        assert isinstance(pub, str) and len(pub) > 40, pub
        assert "=" not in pub  # base64url unpadded

        # public endpoint returns same key
        pr = requests.get(f"{API}/push/public-key", timeout=30)
        assert pr.status_code == 200
        assert pr.json()["public_key"] == pub

        # admin settings reflects public key + enabled, private masked
        g = admin_client.get(f"{API}/admin/settings").json()
        assert g["vapid_public_key"] == pub
        assert g["push_enabled"] is True
        assert g["vapid_private_key"].startswith("•")
        assert g["vapid_private_key_set"] is True

    def test_regenerate_produces_new_key(self, admin_client):
        first = admin_client.post(f"{API}/admin/push/generate-vapid", json={}).json()["public_key"]
        second = admin_client.post(f"{API}/admin/push/generate-vapid", json={}).json()["public_key"]
        assert first != second


# ---------------- Regression: booking works with email enabled but SMTP bad ----------------
class TestBookingRegression:
    def test_student_can_book_class(self, student_client, admin_client):
        # ensure email is enabled with bogus SMTP so we prove send is best-effort
        admin_client.patch(f"{API}/admin/settings", json={
            "email_enabled": True, "smtp_host": "smtp.test-tonyyoga.invalid", "smtp_port": 2525})

        r = student_client.get(f"{API}/class-instances")
        assert r.status_code == 200, r.text[:300]
        instances = r.json()
        assert isinstance(instances, list) and instances, "no class instances to book"

        booked = None
        for inst in instances:
            resp = student_client.post(f"{API}/bookings", json={"class_instance_id": inst["id"]})
            if resp.status_code == 200:
                booked = resp.json()
                break
            if resp.status_code == 400 and "already" in resp.text.lower():
                booked = {"already": True, "class_instance_id": inst["id"]}
                break
        assert booked is not None, "could not book any class instance"

        mine = student_client.get(f"{API}/bookings/mine")
        assert mine.status_code == 200
        assert len(mine.json()) > 0

        if booked.get("id"):
            student_client.delete(f"{API}/bookings/{booked['id']}")


# ---------------- Cleanup: restore safe defaults ----------------
def test_zz_restore_defaults(admin_client):
    r = admin_client.patch(f"{API}/admin/settings", json={
        "stripe_mode": "test",
        "stripe_enabled": True,
        "stripe_publishable_key": "",
        "email_enabled": False,
        "smtp_host": "smtp.gmail.com",
        "smtp_port": 587,
        "smtp_user": "",
        "sender_email": "",
        "sender_name": "Tony Yoga",
    })
    assert r.status_code == 200
    g = admin_client.get(f"{API}/admin/settings").json()
    assert g["stripe_mode"] == "test"
    assert g["email_enabled"] is False
