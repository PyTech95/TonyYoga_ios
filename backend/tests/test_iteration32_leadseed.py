"""Iteration 32b — seed ai_leads, verify CSV rows/escaping, then cleanup."""
import csv
import io
import os

import pytest
import requests
from dotenv import dotenv_values

frontend_env = dotenv_values("/app/frontend/.env")
BASE_URL = (os.environ.get("REACT_APP_BACKEND_URL") or frontend_env["REACT_APP_BACKEND_URL"]).rstrip("/")
API = f"{BASE_URL}/api"
ADMIN = {"email": "tony@tonyyoga.com", "password": "TonyYoga2026!"}
CSV_URL = f"{API}/admin/assistant/leads/export.csv"


@pytest.fixture(scope="module")
def admin_headers():
    r = requests.post(f"{API}/auth/login", json=ADMIN, timeout=30)
    if r.status_code != 200:
        pytest.fail(f"admin login failed {r.status_code}")
    return {"Authorization": f"Bearer {r.json()['token']}"}


@pytest.fixture(scope="module")
def seeded_leads(admin_headers):
    payloads = [
        {"name": "TEST_Lead One", "email": "test_lead1@qa-example.com", "phone": "+34600111222",
         "channel": "whatsapp", "goal": "flexibility", "interest": "Hatha, Vinyasa"},
        {"name": 'TEST_"Quote" Lead, Two', "email": "test_lead2@qa-example.com", "phone": "+34600333444",
         "channel": "email", "goal": "back pain\nrelief", "interest": "Ashtanga"},
    ]
    ids = []
    for p in payloads:
        r = requests.post(f"{API}/assistant/lead", json=p, timeout=30)
        assert r.status_code == 200, r.text[:300]
        ids.append(r.json()["lead_id"])
    yield payloads, ids
    # teardown via mongo (no delete endpoint exposed)
    import asyncio
    import sys
    sys.path.insert(0, "/app/backend")
    from motor.motor_asyncio import AsyncIOMotorClient

    async def _clean():
        from dotenv import dotenv_values as _dv; _e = _dv("/app/backend/.env"); cl = AsyncIOMotorClient(_e["MONGO_URL"])
        db = cl[_e["DB_NAME"]]
        await db.ai_leads.delete_many({"id": {"$in": ids}})
        cl.close()

    asyncio.run(_clean())


def test_csv_contains_seeded_rows_with_correct_escaping(admin_headers, seeded_leads):
    payloads, ids = seeded_leads
    r = requests.get(CSV_URL, headers=admin_headers, timeout=60)
    assert r.status_code == 200
    rows = list(csv.reader(io.StringIO(r.text)))
    header, data = rows[0], rows[1:]
    assert header == ["name", "email", "phone", "channel", "goal", "interest", "status", "created_at"]
    by_email = {row[1]: row for row in data}
    for p in payloads:
        assert p["email"] in by_email, f"{p['email']} missing from CSV"
        row = by_email[p["email"]]
        assert row[0] == p["name"], row
        assert row[2] == p["phone"]
        assert row[3] == p["channel"]
        assert row[4] == p["goal"]
        assert row[5] == p["interest"]
        assert row[6] == "new"
        assert row[7]


def test_csv_count_matches_leads_api(admin_headers, seeded_leads):
    leads = requests.get(f"{API}/admin/assistant/leads", headers=admin_headers, timeout=30).json()
    api_count = leads["total"]
    r = requests.get(CSV_URL, headers=admin_headers, timeout=60)
    data = list(csv.reader(io.StringIO(r.text)))[1:]
    assert len(data) == api_count, f"csv={len(data)} api={api_count}"
    assert api_count >= 2
