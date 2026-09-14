"""Iteration 43 — product-page bundle endpoint + i18n locale key coverage."""
import json
import os

import pytest
import requests
from dotenv import dotenv_values

frontend_env = dotenv_values("/app/frontend/.env")
base_url = os.environ.get("REACT_APP_BACKEND_URL") or frontend_env.get("REACT_APP_BACKEND_URL")
if not base_url:
    raise RuntimeError("REACT_APP_BACKEND_URL missing")
BASE_URL = base_url.rstrip("/")
API = f"{BASE_URL}/api"

MAT = "dc749b67-fb67-4349-96b0-b63f9988ff06"
JOURNAL = "84e6e494-93ac-4467-a262-1ac3158c229d"
PROGRAM = "7585a2ef-01a1-4854-84f5-1eba68cfea66"


@pytest.fixture(scope="module")
def client():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    return s


# --- module: products / bundle ---
class TestProductBundle:
    def test_products_list(self, client):
        r = client.get(f"{API}/products")
        assert r.status_code == 200, r.text
        data = r.json()
        assert isinstance(data, list) and len(data) >= 2
        assert all("_id" not in p for p in data)
        ids = [p["id"] for p in data]
        assert MAT in ids and JOURNAL in ids

    @pytest.mark.parametrize("pid", [MAT, JOURNAL])
    def test_bundle_present(self, client, pid):
        r = client.get(f"{API}/products/{pid}/bundle")
        assert r.status_code == 200, r.text
        b = r.json().get("bundle")
        assert b is not None, f"expected bundle for {pid}"
        assert b["program_id"] == PROGRAM
        assert b["discount_pct"] == 15
        assert len(b["products"]) == 2
        pids = [p["id"] for p in b["products"]]
        assert set(pids) == {MAT, JOURNAL}
        total = sum(float(p["price"]) for p in b["products"])
        assert round(total, 2) == 117.0, total
        assert round(total * 0.15, 2) == 17.55
        assert all("_id" not in p for p in b["products"])

    def test_non_bundle_products_have_no_bundle(self, client):
        prods = client.get(f"{API}/products").json()
        others = [p for p in prods if p["id"] not in (MAT, JOURNAL)]
        assert len(others) >= 1, "expected other products to verify negative case"
        for p in others:
            r = client.get(f"{API}/products/{p['id']}/bundle")
            assert r.status_code == 200
            assert r.json().get("bundle") is None, f"{p['title']} unexpectedly has bundle"

    def test_bundle_unknown_product(self, client):
        r = client.get(f"{API}/products/does-not-exist-123/bundle")
        assert r.status_code == 200
        assert r.json().get("bundle") is None

    def test_program_still_exposes_bundle_fields(self, client):
        r = client.get(f"{API}/programs/{PROGRAM}")
        assert r.status_code == 200, r.text
        d = r.json()
        assert d.get("bundle_discount_pct") == 15
        assert set(d.get("related_product_ids") or []) == {MAT, JOURNAL}


# --- module: i18n locale parity ---
class TestLocaleParity:
    def _load(self, name):
        with open(f"/app/frontend/src/i18n/locales/{name}.json", encoding="utf-8") as f:
            return json.load(f)

    def _flat(self, d, prefix=""):
        out = {}
        for k, v in d.items():
            key = f"{prefix}{k}"
            if isinstance(v, dict):
                out.update(self._flat(v, key + "."))
            else:
                out[key] = v
        return out

    def test_en_es_same_keys(self):
        en = self._flat(self._load("en"))
        es = self._flat(self._load("es"))
        missing = sorted(set(en) - set(es))
        extra = sorted(set(es) - set(en))
        assert not missing, f"keys missing in es.json: {missing}"
        assert not extra, f"extra keys in es.json: {extra}"

    def test_new_namespaces_translated(self):
        en = self._flat(self._load("en"))
        es = self._flat(self._load("es"))
        prefixes = ("fc.", "fs.", "sb.", "vp.", "faq.", "tst.", "appf.", "join.", "ht.")
        keys = [k for k in en if k.startswith(prefixes)]
        assert keys, "no new i18n namespaces found"
        untranslated = [k for k in keys if isinstance(es.get(k), str) and es[k].strip() == en[k].strip()
                        and len(str(en[k])) > 4]
        # allow a few identical words (brand/proper nouns)
        assert len(untranslated) <= 3, f"untranslated es keys: {untranslated}"
