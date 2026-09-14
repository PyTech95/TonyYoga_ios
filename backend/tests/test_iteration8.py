"""Iteration 8: Backend tests for admin instructor payout reports.

Covers:
- GET /api/admin/payouts/report (JSON, empty + seeded)
- GET /api/admin/payouts/report.csv (CSV format/headers)
- Auth/role enforcement (401, 403)
- Period filters (period_from in the future returns empty rows)
"""
import os
import io
import csv as csvmod
import pytest
import requests

def _read_frontend_env():
    try:
        with open("/app/frontend/.env") as f:
            for line in f:
                if line.startswith("REACT_APP_BACKEND_URL="):
                    return line.split("=", 1)[1].strip()
    except OSError:
        pass
    return None

BASE_URL = (os.environ.get("REACT_APP_BACKEND_URL") or _read_frontend_env() or "").rstrip("/")
assert BASE_URL, "REACT_APP_BACKEND_URL is required"
API = f"{BASE_URL}/api"

ADMIN = {"email": "tony@tonyyoga.com", "password": "TonyYoga2026!"}
STUDENT = {"email": "student@demo.com", "password": "Student2026!"}

EXPECTED_CSV_HEADER = (
    "instructor_id,name,email,period_from,period_to,gross_bookings,gross_revenue,"
    "currency,revenue_share_pct,net_payout,tax_nif,iban"
)


def _login(email, password):
    r = requests.post(f"{API}/auth/login", json={"email": email, "password": password}, timeout=20)
    assert r.status_code == 200, f"login failed: {r.status_code} {r.text}"
    return r.json()["token"]


def _h(tok):
    return {"Authorization": f"Bearer {tok}"}


@pytest.fixture(scope="module")
def admin_token():
    return _login(**ADMIN)


@pytest.fixture(scope="module")
def student_token():
    return _login(**STUDENT)


# ---------- Auth/role enforcement ----------
def test_payouts_report_unauthenticated_401():
    r = requests.get(f"{API}/admin/payouts/report", timeout=20)
    assert r.status_code in (401, 403), f"expected 401/403 got {r.status_code}"


def test_payouts_report_student_forbidden(student_token):
    r = requests.get(f"{API}/admin/payouts/report", headers=_h(student_token), timeout=20)
    assert r.status_code == 403, f"expected 403 got {r.status_code} {r.text}"


def test_payouts_report_csv_student_forbidden(student_token):
    r = requests.get(f"{API}/admin/payouts/report.csv", headers=_h(student_token), timeout=20)
    assert r.status_code == 403, f"expected 403 got {r.status_code} {r.text}"


# ---------- JSON shape ----------
def test_payouts_report_admin_returns_200_and_shape(admin_token):
    r = requests.get(f"{API}/admin/payouts/report", headers=_h(admin_token), timeout=30)
    assert r.status_code == 200, r.text
    body = r.json()
    assert "totals" in body and "rows" in body
    t = body["totals"]
    for k in ("instructors", "gross_revenue", "net_payouts", "bookings"):
        assert k in t, f"missing totals.{k}"
    assert isinstance(body["rows"], list)
    # totals.instructors must equal len(rows)
    assert t["instructors"] == len(body["rows"])


def test_payouts_report_future_period_returns_empty_rows(admin_token):
    r = requests.get(
        f"{API}/admin/payouts/report",
        params={"period_from": "2099-01-01"},
        headers=_h(admin_token), timeout=30,
    )
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["rows"] == [], f"expected empty rows for future period, got {len(body['rows'])}"
    assert body["totals"]["instructors"] == 0
    assert body["totals"]["bookings"] == 0
    assert body["totals"]["gross_revenue"] == 0
    assert body["totals"]["net_payouts"] == 0


# ---------- CSV ----------
def test_payouts_report_csv_admin_200_and_headers(admin_token):
    r = requests.get(f"{API}/admin/payouts/report.csv", headers=_h(admin_token), timeout=30)
    assert r.status_code == 200, r.text
    ct = r.headers.get("content-type", "")
    assert "text/csv" in ct, f"unexpected content-type {ct}"
    cd = r.headers.get("content-disposition", "")
    assert "attachment" in cd.lower(), f"missing attachment in content-disposition: {cd}"
    text = r.text
    first_line = text.splitlines()[0] if text else ""
    assert first_line == EXPECTED_CSV_HEADER, f"bad CSV header: {first_line}"


# ---------- Seed + verify aggregation ----------
@pytest.fixture(scope="module")
def seeded_payout(admin_token):
    """Create a TEST instructor, a TEST program, a revenue_share_rule, and a paid txn.

    We hit the public API for instructor creation (register + role bump via direct DB
    isn't exposed); instead we use existing instructor list if available, else fall
    back to creating one via /api/auth/register and promoting it isn't possible.

    Strategy: pick the first existing instructor returned by /api/admin/users?role=instructor.
    If none exists we skip the seed test.
    """
    users = requests.get(
        f"{API}/admin/users", params={"role": "instructor"},
        headers=_h(admin_token), timeout=20,
    )
    assert users.status_code == 200, users.text
    instructors = users.json()
    if not instructors:
        pytest.skip("no instructors in DB to seed payout test")
    ins = instructors[0]

    # Find or create a program. Use /api/programs (public list).
    progs = requests.get(f"{API}/programs", timeout=20).json()
    if not isinstance(progs, list) or not progs:
        pytest.skip("no programs in DB to seed payout test")
    program = progs[0]
    pid = program["id"]
    price = float(program.get("price", 0))
    if price <= 0:
        pytest.skip("program has no price")

    # Create revenue_share_rule for this instructor + program @ 70%
    rule_payload = {
        "instructor_id": ins["id"],
        "type": "program",
        "target_id": pid,
        "percentage": 70,
    }
    rr = requests.post(
        f"{API}/admin/revenue-share", headers=_h(admin_token), json=rule_payload, timeout=20,
    )
    assert rr.status_code == 200, rr.text

    # Insert a fake paid txn directly via the API? There's no admin txn-insert
    # endpoint. We'll use the legacy/manual path: POST /api/admin/seed/payment-txn
    # if available; otherwise skip the deep-aggregation portion.
    seed_url = f"{API}/admin/seed/payment-txn"
    seed_payload = {
        "user_email": STUDENT["email"],
        "amount": price,
        "currency": "usd",
        "item_type": "program",
        "item_id": pid,
        "payment_status": "paid",
    }
    sr = requests.post(seed_url, headers=_h(admin_token), json=seed_payload, timeout=20)
    if sr.status_code == 404:
        pytest.skip("no admin seed endpoint to insert payment_transactions; aggregation test skipped")
    assert sr.status_code in (200, 201), sr.text

    return {"instructor_id": ins["id"], "program_id": pid, "price": price, "pct": 70}


def test_payouts_report_aggregates_seeded_row(admin_token, seeded_payout):
    r = requests.get(f"{API}/admin/payouts/report", headers=_h(admin_token), timeout=30)
    assert r.status_code == 200, r.text
    rows = r.json()["rows"]
    row = next((x for x in rows if x["instructor_id"] == seeded_payout["instructor_id"]), None)
    assert row is not None, f"no row for seeded instructor; rows={rows}"
    assert row["gross_bookings"] >= 1
    assert row["gross_revenue"] >= seeded_payout["price"]
    # net_payout should be at least price * 70/100 (could be more if other txns exist)
    expected_min = seeded_payout["price"] * seeded_payout["pct"] / 100.0
    assert row["net_payout"] + 0.01 >= expected_min, (
        f"net_payout {row['net_payout']} < expected_min {expected_min}"
    )
