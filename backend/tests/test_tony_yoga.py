"""Tony Yoga - Backend API tests (pytest)
Covers: auth, magic link, password reset, classes/bookings, programs,
videos, shop, memberships, private sessions, instructor applications,
admin endpoints, Stripe checkout, announcements, legacy import.
"""
import os
import uuid
import requests
import pytest

BASE = os.environ["REACT_APP_BACKEND_URL"].rstrip("/")  # frontend env mirror not present here

# fall back to backend public URL
if "REACT_APP_BACKEND_URL" not in os.environ:
    BASE = "https://yoga-live-classes.preview.emergentagent.com"

ADMIN = {"email": "tony@tonyyoga.com", "password": "TonyYoga2026!"}
STUDENT = {"email": "student@demo.com", "password": "Student2026!"}


# ---------- fixtures ----------
@pytest.fixture(scope="session")
def api():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    return s


def _login(email, password):
    r = requests.post(f"{BASE}/api/auth/login", json={"email": email, "password": password}, timeout=20)
    assert r.status_code == 200, f"login failed: {r.status_code} {r.text}"
    return r.json()["token"]


@pytest.fixture(scope="session")
def admin_token():
    return _login(ADMIN["email"], ADMIN["password"])


@pytest.fixture(scope="session")
def student_token():
    return _login(STUDENT["email"], STUDENT["password"])


@pytest.fixture()
def admin_headers(admin_token):
    return {"Authorization": f"Bearer {admin_token}"}


@pytest.fixture()
def student_headers(student_token):
    return {"Authorization": f"Bearer {student_token}"}


# ---------- Health ----------
def test_health():
    r = requests.get(f"{BASE}/api/", timeout=15)
    assert r.status_code == 200
    assert r.json()["service"] == "tony-yoga"


# ---------- Auth ----------
def test_login_admin():
    r = requests.post(f"{BASE}/api/auth/login", json=ADMIN, timeout=20)
    assert r.status_code == 200
    data = r.json()
    assert data["user"]["role"] == "admin"
    assert isinstance(data["token"], str) and len(data["token"]) > 0


def test_login_student():
    r = requests.post(f"{BASE}/api/auth/login", json=STUDENT, timeout=20)
    assert r.status_code == 200
    assert r.json()["user"]["role"] == "student"


def test_login_invalid():
    r = requests.post(f"{BASE}/api/auth/login", json={"email": "x@x.com", "password": "wrong"}, timeout=15)
    assert r.status_code == 401


def test_register_and_me():
    email = f"test_{uuid.uuid4().hex[:8]}@demo.com"
    r = requests.post(f"{BASE}/api/auth/register", json={"email": email, "password": "Pass2026!", "name": "Test User"}, timeout=20)
    assert r.status_code == 200
    token = r.json()["token"]
    me = requests.get(f"{BASE}/api/auth/me", headers={"Authorization": f"Bearer {token}"}, timeout=15)
    assert me.status_code == 200
    assert me.json()["email"] == email.lower()
    # password not exposed
    assert "password_hash" not in me.json()


def test_me_requires_auth():
    r = requests.get(f"{BASE}/api/auth/me", timeout=15)
    assert r.status_code == 401


# ---------- Magic Link ----------
def test_magic_link_request_and_consume():
    email = f"test_magic_{uuid.uuid4().hex[:6]}@demo.com"
    r = requests.post(f"{BASE}/api/auth/magic-link/request", json={"email": email, "type": "login"}, timeout=30)
    assert r.status_code == 200
    body = r.json()
    # Contract: {ok, email_sent, magic_url}. magic_url may be None if email was sent successfully.
    assert body.get("ok") is True
    assert "email_sent" in body
    assert "magic_url" in body
    magic_url = body.get("magic_url")
    if not magic_url:
        # Email was sent — we cannot consume w/o the token, so just assert email_sent True
        assert body.get("email_sent") is True
        return
    # Dev/test fallback path: token returned because email failed (or no creds)
    assert "token=" in magic_url
    token = magic_url.split("token=")[-1]
    r2 = requests.post(f"{BASE}/api/auth/magic-link/consume", json={"token": token}, timeout=20)
    assert r2.status_code == 200
    body2 = r2.json()
    assert body2["user"]["email"] == email.lower()
    assert body2["token"]


def test_magic_link_invalid_token():
    r = requests.post(f"{BASE}/api/auth/magic-link/consume", json={"token": "invalid-xyz"}, timeout=15)
    assert r.status_code == 400


# ---------- Forgot/Reset ----------
def test_forgot_password_silently_ok_for_unknown():
    r = requests.post(f"{BASE}/api/auth/forgot-password", json={"email": "nobody@nowhere.com"}, timeout=15)
    assert r.status_code == 200


# ---------- Classes & Bookings ----------
def test_list_class_instances():
    r = requests.get(f"{BASE}/api/class-instances", timeout=15)
    assert r.status_code == 200
    data = r.json()
    assert isinstance(data, list)
    assert len(data) > 0
    sample = data[0]
    for k in ("id", "title", "start_time", "capacity", "instructor_name"):
        assert k in sample


def test_booking_flow(student_headers):
    instances = requests.get(f"{BASE}/api/class-instances", timeout=15).json()
    # Find one we haven't booked yet
    chosen = instances[0]["id"]
    book = requests.post(f"{BASE}/api/bookings", json={"class_instance_id": chosen}, headers=student_headers, timeout=15)
    # could be 200 (booked) or 400 (already booked from earlier run)
    assert book.status_code in (200, 400)
    # list mine
    mine = requests.get(f"{BASE}/api/bookings/mine", headers=student_headers, timeout=15)
    assert mine.status_code == 200
    assert isinstance(mine.json(), list)
    # cancel any active booking for the class
    booking_id = None
    for b in mine.json():
        if b["class_instance_id"] == chosen and b["status"] in ("confirmed", "waitlist"):
            booking_id = b["id"]; break
    if booking_id:
        cancel = requests.delete(f"{BASE}/api/bookings/{booking_id}", headers=student_headers, timeout=15)
        assert cancel.status_code == 200


# ---------- Programs ----------
def test_list_programs_and_detail():
    r = requests.get(f"{BASE}/api/programs", timeout=15)
    assert r.status_code == 200
    progs = r.json()
    assert len(progs) > 0
    pid = progs[0]["id"]
    detail = requests.get(f"{BASE}/api/programs/{pid}", timeout=15)
    assert detail.status_code == 200
    assert "lessons" in detail.json()


# ---------- Videos ----------
def test_list_videos():
    r = requests.get(f"{BASE}/api/videos", timeout=15)
    assert r.status_code == 200
    assert isinstance(r.json(), list)


def test_video_progress_and_favorite(student_headers):
    videos = requests.get(f"{BASE}/api/videos", timeout=15).json()
    assert len(videos) > 0
    vid = videos[0]["id"]
    p = requests.post(f"{BASE}/api/progress", json={"video_id": vid, "seconds": 30, "completed": False},
                     headers=student_headers, timeout=15)
    assert p.status_code == 200
    g = requests.get(f"{BASE}/api/progress/mine", headers=student_headers, timeout=15)
    assert g.status_code == 200
    assert any(x["video_id"] == vid for x in g.json())
    f = requests.post(f"{BASE}/api/favorites/toggle", json={"target_type": "video", "target_id": vid},
                     headers=student_headers, timeout=15)
    assert f.status_code == 200
    assert "favorited" in f.json()


# ---------- Shop ----------
def test_products():
    r = requests.get(f"{BASE}/api/products", timeout=15)
    assert r.status_code == 200
    items = r.json()
    assert len(items) > 0
    pid = items[0]["id"]
    d = requests.get(f"{BASE}/api/products/{pid}", timeout=15)
    assert d.status_code == 200
    assert d.json()["id"] == pid


# ---------- Memberships ----------
def test_membership_plans():
    r = requests.get(f"{BASE}/api/membership-plans", timeout=15)
    assert r.status_code == 200
    plans = r.json()
    assert len(plans) >= 1
    assert "price" in plans[0]


# ---------- Stripe checkout (sessions) ----------
def test_checkout_session_membership(student_headers):
    plans = requests.get(f"{BASE}/api/membership-plans", timeout=15).json()
    pid = plans[0]["id"]
    r = requests.post(
        f"{BASE}/api/checkout/session",
        json={"item_type": "membership", "item_id": pid, "origin_url": BASE, "quantity": 1},
        headers=student_headers,
        timeout=30,
    )
    assert r.status_code == 200, r.text
    body = r.json()
    assert body.get("url", "").startswith("https://")
    assert body.get("session_id")


def test_checkout_session_drop_in(student_headers):
    r = requests.post(
        f"{BASE}/api/checkout/session",
        json={"item_type": "drop_in", "item_id": "drop_in", "origin_url": BASE},
        headers=student_headers,
        timeout=30,
    )
    assert r.status_code == 200, r.text
    assert r.json()["url"].startswith("https://")


def test_checkout_requires_auth():
    r = requests.post(f"{BASE}/api/checkout/session",
                     json={"item_type": "drop_in", "item_id": "drop_in", "origin_url": BASE}, timeout=15)
    assert r.status_code == 401


# ---------- Private session request ----------
def test_private_session_request(student_headers):
    instructors = requests.get(f"{BASE}/api/instructors", timeout=15).json()
    # may be empty if no instructor role exists; fall back to admin
    if instructors:
        iid = instructors[0]["id"]
    else:
        # use admin user id from /api/auth/me as admin
        admin_me = requests.get(f"{BASE}/api/auth/me", headers={"Authorization": f"Bearer {_login(ADMIN['email'], ADMIN['password'])}"}, timeout=15).json()
        iid = admin_me["id"]
    payload = {
        "instructor_id": iid, "session_type": "online", "duration_minutes": 60,
        "focus_area": "back care", "notes": "test",
        "preferred_time": "2026-02-20T10:00:00+00:00",
    }
    r = requests.post(f"{BASE}/api/private-sessions/request", json=payload, headers=student_headers, timeout=15)
    assert r.status_code == 200
    assert r.json()["status"] == "pending"


# ---------- Instructor applications ----------
def test_instructor_application_and_admin_approval(admin_headers):
    payload = {
        "name": "TEST Applicant", "email": f"TEST_app_{uuid.uuid4().hex[:6]}@demo.com",
        "years_experience": 5, "certifications": "RYT-200",
        "styles": ["Vinyasa"], "bio": "Bio here.",
    }
    r = requests.post(f"{BASE}/api/instructor-applications", json=payload, timeout=15)
    assert r.status_code == 200
    app_id = r.json()["id"]
    lst = requests.get(f"{BASE}/api/admin/instructor-applications", headers=admin_headers, timeout=15)
    assert lst.status_code == 200
    assert any(a["id"] == app_id for a in lst.json())
    decide = requests.post(
        f"{BASE}/api/admin/instructor-applications/decision",
        json={"application_id": app_id, "action": "approve", "notes": "ok"},
        headers=admin_headers, timeout=15,
    )
    assert decide.status_code == 200
    assert "magic_url" in decide.json()


# ---------- Admin stats/users/legacy/announcements ----------
def test_admin_stats(admin_headers):
    r = requests.get(f"{BASE}/api/admin/stats", headers=admin_headers, timeout=15)
    assert r.status_code == 200
    body = r.json()
    for k in ("users", "students", "instructors", "bookings", "revenue"):
        assert k in body


def test_admin_users(admin_headers):
    r = requests.get(f"{BASE}/api/admin/users", headers=admin_headers, timeout=15)
    assert r.status_code == 200
    assert any(u["email"] == ADMIN["email"] for u in r.json())


def test_admin_stats_forbidden_for_student(student_headers):
    r = requests.get(f"{BASE}/api/admin/stats", headers=student_headers, timeout=15)
    assert r.status_code == 403


def test_admin_legacy_import(admin_headers):
    payload = {
        "batch_name": f"TEST_batch_{uuid.uuid4().hex[:6]}",
        "rows": [{"email": f"TEST_leg1_{uuid.uuid4().hex[:6]}@demo.com", "name": "Leg One"},
                 {"email": f"TEST_leg2_{uuid.uuid4().hex[:6]}@demo.com", "name": "Leg Two"}],
        "offer_config": {"trial_days": 14},
    }
    r = requests.post(f"{BASE}/api/admin/legacy/import", json=payload, headers=admin_headers, timeout=20)
    assert r.status_code == 200
    body = r.json()
    assert body["batch"]["valid_records"] == 2
    assert len(body["invites"]) == 2


def test_admin_announcements(admin_headers):
    r = requests.post(f"{BASE}/api/admin/announcements",
                     json={"title": "TEST Hi", "body": "TEST body", "audience": "all"},
                     headers=admin_headers, timeout=15)
    assert r.status_code == 200
    lst = requests.get(f"{BASE}/api/announcements", timeout=15)
    assert lst.status_code == 200


# ---------- PWA assets ----------
def test_manifest_served():
    r = requests.get(f"{BASE}/manifest.json", timeout=15)
    assert r.status_code == 200


def test_sw_served():
    r = requests.get(f"{BASE}/sw.js", timeout=15)
    assert r.status_code == 200


# ---------- Referrals (iteration 2) ----------
def test_referral_invite_authenticated(student_headers):
    """POST /api/referrals/invite — sends invite via Gmail SMTP, logs to db, returns sent/failed/share_url."""
    payload = {"emails": ["tonyoga.online@gmail.com"], "personal_note": "TEST invite from pytest"}
    r = requests.post(f"{BASE}/api/referrals/invite", json=payload, headers=student_headers, timeout=45)
    assert r.status_code == 200, r.text
    body = r.json()
    assert "sent" in body and isinstance(body["sent"], list)
    assert "failed" in body and isinstance(body["failed"], list)
    assert "share_url" in body and "/register?ref=" in body["share_url"]
    # The email should be in either sent or failed (not lost)
    union = set(body["sent"]) | set(body["failed"])
    assert "tonyoga.online@gmail.com" in union


def test_referral_invite_requires_auth():
    r = requests.post(f"{BASE}/api/referrals/invite",
                     json={"emails": ["tonyoga.online@gmail.com"]}, timeout=15)
    assert r.status_code == 401


def test_referral_invite_invalid_email(student_headers):
    """Pydantic EmailStr should reject malformed addresses with 422."""
    r = requests.post(f"{BASE}/api/referrals/invite",
                     json={"emails": ["not-an-email"]}, headers=student_headers, timeout=15)
    assert r.status_code == 422


def test_referrals_mine(student_headers):
    r = requests.get(f"{BASE}/api/referrals/mine", headers=student_headers, timeout=15)
    assert r.status_code == 200
    body = r.json()
    for k in ("referral_code", "share_url", "total_signups", "total_converted", "referrals"):
        assert k in body
    assert isinstance(body["referrals"], list)


def test_admin_referral_analytics(admin_headers):
    r = requests.get(f"{BASE}/api/admin/referrals/analytics", headers=admin_headers, timeout=15)
    assert r.status_code == 200, r.text
    body = r.json()
    for k in ("total_invites_sent", "total_signups", "total_converted",
              "conversion_rate", "signup_rate", "top_referrers"):
        assert k in body, f"missing {k}"
    assert isinstance(body["top_referrers"], list)
    # Numeric fields
    assert isinstance(body["total_invites_sent"], int)
    assert isinstance(body["total_signups"], int)
    # If any referrers present, validate shape
    if body["top_referrers"]:
        tr = body["top_referrers"][0]
        for k in ("user_id", "name", "email", "referral_code", "signups", "converted"):
            assert k in tr


def test_admin_referral_analytics_forbidden_for_student(student_headers):
    r = requests.get(f"{BASE}/api/admin/referrals/analytics", headers=student_headers, timeout=15)
    assert r.status_code == 403


def test_admin_referral_analytics_requires_auth():
    r = requests.get(f"{BASE}/api/admin/referrals/analytics", timeout=15)
    assert r.status_code in (401, 403)


# ---------- Iteration 3: SHA-256 magic-link, referral rate-limit + dedupe + skip-registered ----------
import re
import time
import subprocess


def _grep_latest_magic_token(email: str, lookback_lines: int = 400) -> str | None:
    """Read tail of backend logs and return the token for the most recent [MAGIC LINK to {email}] entry."""
    try:
        out = subprocess.run(
            ["tail", "-n", str(lookback_lines), "/var/log/supervisor/backend.err.log",
             "/var/log/supervisor/backend.out.log"],
            capture_output=True, text=True, timeout=5,
        ).stdout
    except Exception:
        return None
    # Newest matches are last
    pattern = re.compile(rf"\[MAGIC LINK to {re.escape(email)}\][^\n]*token=([A-Za-z0-9_\-]+)")
    matches = pattern.findall(out)
    return matches[-1] if matches else None


def test_magic_link_sha256_consume_via_log():
    """Iteration 3: magic-link consume via SHA-256 path (token captured from backend log)."""
    email = f"test_magic_sha_{uuid.uuid4().hex[:6]}@demo.com"
    r = requests.post(f"{BASE}/api/auth/magic-link/request", json={"email": email, "type": "login"}, timeout=30)
    assert r.status_code == 200
    body = r.json()
    assert body.get("ok") is True
    # Prefer magic_url from body, otherwise fallback to log
    token = None
    if body.get("magic_url"):
        token = body["magic_url"].split("token=")[-1]
    else:
        # Give logging a moment to flush
        time.sleep(0.5)
        token = _grep_latest_magic_token(email)
    if not token:
        pytest.skip("Magic-link token could not be captured (email sent and log not accessible)")
    r2 = requests.post(f"{BASE}/api/auth/magic-link/consume", json={"token": token}, timeout=20)
    assert r2.status_code == 200, r2.text
    data = r2.json()
    assert data["user"]["email"] == email.lower()
    assert isinstance(data.get("token"), str) and len(data["token"]) > 0


def test_referral_invite_email_cap_returns_400(student_headers):
    """21+ unique emails per request must return 400 (Maximum 20)."""
    emails = [f"capemail{i}_{uuid.uuid4().hex[:4]}@demo.com" for i in range(21)]
    r = requests.post(f"{BASE}/api/referrals/invite",
                     json={"emails": emails}, headers=student_headers, timeout=20)
    assert r.status_code == 400, r.text
    body = r.json()
    msg = (body.get("detail") or body.get("message") or "").lower()
    assert "20" in msg or "maximum" in msg


def test_referral_invite_dedupe_and_skip_registered(student_headers):
    """Dedupe (case-insensitive, repeats) AND skip already-registered users.

    student@demo.com is registered → should appear once in `skipped` with reason 'already_registered',
    and `sent`/`failed` should be empty.
    """
    payload = {
        "emails": ["student@demo.com", "STUDENT@demo.com", "Student@Demo.com"],
        "personal_note": "TEST dedupe/skip",
    }
    r = requests.post(f"{BASE}/api/referrals/invite",
                     json=payload, headers=student_headers, timeout=20)
    assert r.status_code == 200, r.text
    body = r.json()
    assert body.get("sent") == [], f"sent should be empty, got {body.get('sent')}"
    assert body.get("failed") == [], f"failed should be empty, got {body.get('failed')}"
    skipped = body.get("skipped") or []
    assert len(skipped) == 1, f"expected exactly 1 skipped, got {skipped}"
    assert skipped[0]["email"] == "student@demo.com"
    assert skipped[0]["reason"] == "already_registered"
    assert "share_url" in body


def test_admin_referral_analytics_signup_rate_clamped(admin_headers):
    """Iteration 3: signup_rate must be clamped to <=100."""
    r = requests.get(f"{BASE}/api/admin/referrals/analytics", headers=admin_headers, timeout=15)
    assert r.status_code == 200
    body = r.json()
    assert isinstance(body["signup_rate"], (int, float))
    assert 0 <= body["signup_rate"] <= 100, f"signup_rate {body['signup_rate']} out of [0,100]"
    assert 0 <= body["conversion_rate"] <= 100



# ---------- Iteration 4: atomic booking race + bcrypt legacy magic-link removed ----------
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timedelta, timezone


def _create_capacity_one_instance(admin_hdrs):
    """Admin helper: create a class template (capacity=1) + a future class instance (capacity=1).

    Returns (instance_id, template_id). Used by the atomic-booking race test.
    """
    # Admin's user id — used as instructor_id (admin role is allowed as instructor for templates)
    me = requests.get(f"{BASE}/api/auth/me", headers=admin_hdrs, timeout=15).json()
    instructor_id = me["id"]

    tmpl_payload = {
        "title": f"TEST Atomic Cap1 {uuid.uuid4().hex[:6]}",
        "description": "Atomic capacity test template",
        "instructor_id": instructor_id,
        "location_type": "online",
        "location_detail": "https://example.com/zoom",
        "style": "Hatha",
        "level": "all",
        "duration_minutes": 60,
        "capacity": 1,
    }
    t = requests.post(f"{BASE}/api/admin/class-templates", json=tmpl_payload, headers=admin_hdrs, timeout=15)
    assert t.status_code == 200, t.text
    template_id = t.json()["id"]

    # Schedule far in the future so 'upcoming' filters keep it visible & no past-date validators trip
    future = (datetime.now(timezone.utc) + timedelta(days=30)).replace(microsecond=0).isoformat()
    inst_payload = {"template_id": template_id, "start_time": future, "capacity": 1, "is_recorded": False}
    i = requests.post(f"{BASE}/api/admin/class-instances", json=inst_payload, headers=admin_hdrs, timeout=15)
    assert i.status_code == 200, i.text
    instance_id = i.json()["id"]
    assert i.json()["capacity"] == 1
    assert i.json()["bookings_count"] == 0
    return instance_id, template_id


def test_atomic_booking_concurrent_capacity_one(admin_headers, student_headers, admin_token, student_token):
    """Iteration 4: race condition — two parallel POST /api/bookings for the same capacity=1 instance.
    Exactly ONE must be 'confirmed', the other 'waitlist'. bookings_count must equal 1 (never 2).
    Atomicity is guaranteed by find_one_and_update + $expr capacity guard in routers/scheduling.py.
    """
    instance_id, _ = _create_capacity_one_instance(admin_headers)

    def _book(token):
        return requests.post(
            f"{BASE}/api/bookings",
            json={"class_instance_id": instance_id},
            headers={"Authorization": f"Bearer {token}"},
            timeout=20,
        )

    # Fire both POSTs as close to simultaneously as possible
    with ThreadPoolExecutor(max_workers=2) as pool:
        f_student = pool.submit(_book, student_token)
        f_admin = pool.submit(_book, admin_token)
        r_student = f_student.result()
        r_admin = f_admin.result()

    assert r_student.status_code == 200, r_student.text
    assert r_admin.status_code == 200, r_admin.text

    statuses = sorted([r_student.json()["status"], r_admin.json()["status"]])
    assert statuses == ["confirmed", "waitlist"], (
        f"Expected exactly one confirmed + one waitlist, got {statuses}"
    )

    # Verify the DB-side counter is at 1 (never 2) — via the public detail endpoint
    detail = requests.get(f"{BASE}/api/class-instances/{instance_id}", timeout=15)
    assert detail.status_code == 200
    body = detail.json()
    assert body["capacity"] == 1
    assert body["bookings_count"] == 1, f"bookings_count race! expected 1, got {body['bookings_count']}"


def test_legacy_bcrypt_magic_link_returns_400():
    """Iteration 4: the bcrypt fallback loop has been REMOVED from /api/auth/magic-link/consume.
    A legacy row that stores only a bcrypt hash (no token_sha) must no longer be matchable —
    consume must return 400 'Invalid or expired magic link'.
    """
    pymongo = pytest.importorskip("pymongo")
    bcrypt = pytest.importorskip("bcrypt")
    # Read MONGO_URL / DB_NAME directly from backend/.env (env not exported into pytest process)
    env = {}
    try:
        with open("/app/backend/.env", "r") as fh:
            for line in fh:
                if "=" in line and not line.strip().startswith("#"):
                    k, _, v = line.strip().partition("=")
                    env[k] = v.strip('"').strip("'")
    except FileNotFoundError:
        pytest.skip("backend/.env not accessible")
    mongo_url = env.get("MONGO_URL")
    db_name = env.get("DB_NAME")
    if not (mongo_url and db_name):
        pytest.skip("MONGO_URL/DB_NAME unavailable")

    client = pymongo.MongoClient(mongo_url, serverSelectionTimeoutMS=3000)
    try:
        coll = client[db_name].magic_link_tokens
        plain_token = f"legacy-{uuid.uuid4().hex}"
        legacy_doc = {
            "id": str(uuid.uuid4()),
            "email": f"test_legacy_{uuid.uuid4().hex[:6]}@demo.com",
            # bcrypt hash only — intentionally NO 'token_sha' field, mimicking a pre-migration row
            "token_hash": bcrypt.hashpw(plain_token.encode(), bcrypt.gensalt()).decode(),
            "type": "login",
            "expires_at": (datetime.now(timezone.utc) + timedelta(minutes=15)).isoformat(),
            "used_at": None,
            "created_at": datetime.now(timezone.utc).isoformat(),
        }
        coll.insert_one(legacy_doc)
        try:
            r = requests.post(
                f"{BASE}/api/auth/magic-link/consume",
                json={"token": plain_token},
                timeout=20,
            )
            assert r.status_code == 400, (
                f"Legacy bcrypt path should return 400 after fallback removal, got {r.status_code}: {r.text}"
            )
            detail = (r.json().get("detail") or "").lower()
            assert "invalid" in detail or "expired" in detail
        finally:
            coll.delete_one({"id": legacy_doc["id"]})
    finally:
        client.close()
