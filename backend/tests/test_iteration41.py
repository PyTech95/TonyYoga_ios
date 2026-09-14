"""Iteration 41 — Asana Index (public + admin CRUD) & Bundle Upsell discount security."""
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

PROGRAM_ID = "7585a2ef-01a1-4854-84f5-1eba68cfea66"
MAT_ID = "dc749b67-fb67-4349-96b0-b63f9988ff06"
JOURNAL_ID = "84e6e494-93ac-4467-a262-1ac3158c229d"


def _creds():
    content = Path("/app/memory/test_credentials.md").read_text(encoding="utf-8")
    blocks = re.findall(r"##\s*(.+)\n(?:.|\n)*?Email:\s*(\S+)\n.*?Password:\s*(\S+)", content)
    out = {}
    for label, email, pwd in blocks:
        out[label.strip().lower()] = {"email": email, "password": pwd}
    return out


CREDS = _creds()


@pytest.fixture(scope="session")
def client():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    return s


def _login(client, key):
    c = CREDS.get(key)
    if not c:
        pytest.fail(f"Missing credentials for {key} in test_credentials.md")
    r = client.post(f"{API}/auth/login", json={"email": c["email"], "password": c["password"]})
    if r.status_code != 200:
        pytest.fail(f"Login failed for {key}: {r.status_code} {r.text[:300]}")
    data = r.json()
    token = data.get("access_token") or data.get("token")
    assert token, f"No token in login response: {list(data.keys())}"
    return token, r


@pytest.fixture(scope="session")
def admin_token(client):
    return _login(client, "admin")[0]


@pytest.fixture(scope="session")
def student_token(client):
    return _login(client, "demo student")[0]


@pytest.fixture(scope="session")
def created_asana_ids():
    return []


# ---------- Public asana index ----------
class TestPublicAsanas:
    def test_list_asanas(self, client):
        r = client.get(f"{API}/asanas")
        assert r.status_code == 200
        rows = r.json()
        assert isinstance(rows, list)
        assert len(rows) >= 12, f"expected >=12 seeded poses, got {len(rows)}"
        a = rows[0]
        for k in ("id", "name", "sanskrit", "benefits", "category", "is_published"):
            assert k in a, f"missing {k}"
        assert "_id" not in a
        assert all(x.get("is_published") for x in rows)

    def test_search_filter(self, client):
        r = client.get(f"{API}/asanas", params={"q": "camel"})
        assert r.status_code == 200
        rows = r.json()
        assert len(rows) >= 1
        assert any("camel" in (x.get("name") or "").lower() for x in rows)

    def test_search_no_match(self, client):
        r = client.get(f"{API}/asanas", params={"q": "zzzznotapose"})
        assert r.status_code == 200
        assert r.json() == []

    def test_categories(self, client):
        r = client.get(f"{API}/asanas/categories")
        assert r.status_code == 200
        cats = r.json()
        assert isinstance(cats, list) and len(cats) > 0
        assert cats == sorted(cats)
        # category filter returns only that category
        cat = cats[0]
        r2 = client.get(f"{API}/asanas", params={"category": cat})
        assert r2.status_code == 200
        assert all(x["category"] == cat for x in r2.json())

    def test_get_single_and_404(self, client):
        rows = client.get(f"{API}/asanas").json()
        aid = rows[0]["id"]
        r = client.get(f"{API}/asanas/{aid}")
        assert r.status_code == 200
        assert r.json()["id"] == aid
        assert client.get(f"{API}/asanas/does-not-exist").status_code == 404


# ---------- Admin asana CRUD ----------
class TestAdminAsanaCRUD:
    def test_requires_auth(self, client):
        r = requests.get(f"{API}/admin/asanas")
        assert r.status_code in (401, 403), r.status_code

    def test_student_forbidden(self, client, student_token):
        r = requests.get(f"{API}/admin/asanas", headers={"Authorization": f"Bearer {student_token}"})
        assert r.status_code in (401, 403), r.status_code

    def test_crud_lifecycle(self, client, admin_token, created_asana_ids):
        h = {"Authorization": f"Bearer {admin_token}"}
        payload = {
            "name": "TEST_Pose Alpha",
            "sanskrit": "TEST_Alphasana",
            "benefits": ["Opens chest", "Builds focus"],
            "description": "TEST description",
            "category": "Backbend",
            "difficulty": "beginner",
            "youtube_url": "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
            "is_published": True,
        }
        r = requests.post(f"{API}/admin/asanas", json=payload, headers=h)
        assert r.status_code in (200, 201), r.text[:300]
        doc = r.json()
        aid = doc["id"]
        created_asana_ids.append(aid)
        assert doc["name"] == payload["name"]
        assert doc["benefits"] == payload["benefits"]
        assert doc["youtube_id"] == "dQw4w9WgXcQ"
        assert doc["cover_image"].endswith("dQw4w9WgXcQ/hqdefault.jpg")

        # published pose visible publicly
        pub = client.get(f"{API}/asanas/{aid}")
        assert pub.status_code == 200
        assert pub.json()["name"] == payload["name"]

        # search finds it
        found = client.get(f"{API}/asanas", params={"q": "TEST_Alphasana"}).json()
        assert any(x["id"] == aid for x in found)

        # UPDATE
        r = requests.patch(f"{API}/admin/asanas/{aid}",
                           json={"name": "TEST_Pose Beta", "benefits": ["Only one"]}, headers=h)
        assert r.status_code == 200, r.text[:300]
        assert r.json()["name"] == "TEST_Pose Beta"
        got = client.get(f"{API}/asanas/{aid}").json()
        assert got["name"] == "TEST_Pose Beta"
        assert got["benefits"] == ["Only one"]
        assert got["sanskrit"] == payload["sanskrit"]  # untouched

        # unpublish hides from public
        r = requests.patch(f"{API}/admin/asanas/{aid}", json={"is_published": False}, headers=h)
        assert r.status_code == 200
        assert client.get(f"{API}/asanas/{aid}").status_code == 404
        assert not any(x["id"] == aid for x in client.get(f"{API}/asanas").json())

        # DELETE
        r = requests.delete(f"{API}/admin/asanas/{aid}", headers=h)
        assert r.status_code in (200, 204), r.text[:300]
        created_asana_ids.remove(aid)
        admin_rows = requests.get(f"{API}/admin/asanas", headers=h).json()
        assert not any(x["id"] == aid for x in admin_rows)

    def test_update_missing_404(self, admin_token):
        h = {"Authorization": f"Bearer {admin_token}"}
        r = requests.patch(f"{API}/admin/asanas/nope-id", json={"name": "x"}, headers=h)
        assert r.status_code == 404

    def test_create_validation(self, admin_token):
        h = {"Authorization": f"Bearer {admin_token}"}
        r = requests.post(f"{API}/admin/asanas", json={"sanskrit": "no name"}, headers=h)
        assert r.status_code == 422, r.status_code

    def test_seeded_count_intact(self, admin_token):
        h = {"Authorization": f"Bearer {admin_token}"}
        rows = requests.get(f"{API}/admin/asanas", headers=h).json()
        leftovers = [x["name"] for x in rows if str(x.get("name", "")).startswith("TEST_")]
        assert leftovers == [], f"leftover test poses: {leftovers}"


# ---------- Bundle upsell ----------
class TestBundle:
    def test_program_exposes_bundle(self, client):
        r = client.get(f"{API}/programs/{PROGRAM_ID}")
        assert r.status_code == 200
        p = r.json()
        assert p.get("bundle_discount_pct") == 15, p.get("bundle_discount_pct")
        rel = p.get("related_products") or []
        assert len(rel) == 2, rel
        ids = {x["id"] for x in rel}
        assert ids == {MAT_ID, JOURNAL_ID}
        assert round(sum(x["price"] for x in rel), 2) == 117.0

    @staticmethod
    def _order(token, items, bundle=True):
        body = {
            "items": items,
            "shipping_address": {
                "name": "TEST QA", "line1": "1 Test St", "city": "Austin",
                "state": "TX", "postal_code": "78701", "country": "US",
            },
        }
        if bundle:
            body["bundle_program_id"] = PROGRAM_ID
        return requests.post(f"{API}/orders/create", json=body,
                             headers={"Authorization": f"Bearer {token}"})

    def test_full_set_gets_discount(self, student_token, created_order_ids):
        r = self._order(student_token, [{"product_id": MAT_ID, "quantity": 1},
                                        {"product_id": JOURNAL_ID, "quantity": 1}])
        assert r.status_code == 200, r.text[:300]
        o = r.json()
        created_order_ids.append(o["id"])
        assert o["subtotal"] == 117.0
        assert o["discount"] == 17.55
        assert o["total"] == 99.45
        assert o["bundle"]["discount_pct"] == 15
        assert "_id" not in o

    def test_partial_set_no_discount(self, student_token, created_order_ids):
        r = self._order(student_token, [{"product_id": MAT_ID, "quantity": 1}])
        assert r.status_code == 200, r.text[:300]
        o = r.json()
        created_order_ids.append(o["id"])
        assert o["discount"] == 0, o["discount"]
        assert o["bundle"] is None
        assert o["total"] == o["subtotal"] == 89.0

    def test_partial_set_journal_only_no_discount(self, student_token, created_order_ids):
        r = self._order(student_token, [{"product_id": JOURNAL_ID, "quantity": 1}])
        assert r.status_code == 200
        o = r.json()
        created_order_ids.append(o["id"])
        assert o["discount"] == 0
        assert o["bundle"] is None

    def test_bogus_bundle_program_no_discount(self, student_token, created_order_ids):
        body = {
            "items": [{"product_id": MAT_ID, "quantity": 1}, {"product_id": JOURNAL_ID, "quantity": 1}],
            "shipping_address": {"name": "TEST QA", "line1": "1 Test St", "city": "Austin",
                                 "state": "TX", "postal_code": "78701", "country": "US"},
            "bundle_program_id": "not-a-real-program",
        }
        r = requests.post(f"{API}/orders/create", json=body,
                          headers={"Authorization": f"Bearer {student_token}"})
        assert r.status_code == 200, r.text[:300]
        o = r.json()
        created_order_ids.append(o["id"])
        assert o["discount"] == 0
        assert o["total"] == 117.0

    def test_order_requires_auth(self):
        r = requests.post(f"{API}/orders/create", json={"items": [], "shipping_address": {}})
        assert r.status_code in (401, 403, 422)

    def test_persisted_order_matches(self, student_token, created_order_ids):
        assert created_order_ids, "no order created earlier"
        oid = created_order_ids[0]
        r = requests.get(f"{API}/orders/{oid}", headers={"Authorization": f"Bearer {student_token}"})
        assert r.status_code == 200
        o = r.json()
        assert o["total"] == 99.45
        assert o["discount"] == 17.55


@pytest.fixture(scope="session")
def created_order_ids():
    return []


@pytest.fixture(scope="session", autouse=True)
def cleanup(created_asana_ids, created_order_ids):
    yield
    # remove any leftover test asanas
    try:
        token, _ = _login(requests.Session(), "admin")
        h = {"Authorization": f"Bearer {token}"}
        for aid in list(created_asana_ids):
            requests.delete(f"{API}/admin/asanas/{aid}", headers=h)
    except Exception as e:  # noqa: BLE001
        print(f"asana cleanup skipped: {e}")
    if created_order_ids:
        print("TEST ORDERS to purge:", created_order_ids)
        Path("/app/test_reports/iter41_orders.txt").write_text("\n".join(created_order_ids))
