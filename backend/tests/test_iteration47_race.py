"""Iteration 47c — credit reserve atomicity under concurrency + printful image hosts."""
import os
import re
import time
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

import requests
from dotenv import dotenv_values

BASE_URL = (os.environ.get("REACT_APP_BACKEND_URL") or dotenv_values("/app/frontend/.env")["REACT_APP_BACKEND_URL"]).rstrip("/")
API = f"{BASE_URL}/api"


def _admin():
    c = Path("/app/memory/test_credentials.md").read_text()
    b = c.split("## Admin")[1]
    r = requests.post(f"{API}/auth/login", json={
        "email": re.search(r"Email:\s*(\S+)", b).group(1),
        "password": re.search(r"Password:\s*(\S+)", b).group(1)}, timeout=30)
    s = requests.Session()
    s.headers.update({"Authorization": f"Bearer {r.json()['token']}"})
    return s


def test_concurrent_reserve_never_oversells():
    admin = _admin()
    email = f"TEST_race_{int(time.time())}@example.com"
    reg = requests.post(f"{API}/auth/register", json={"email": email, "name": "TEST Race", "password": "TestPass2026!"}, timeout=30)
    assert reg.status_code in (200, 201), reg.text[:200]
    s = requests.Session()
    s.headers.update({"Authorization": f"Bearer {reg.json()['token']}"})
    gc = admin.post(f"{API}/admin/gift-cards", json={"amount": 25, "currency": "usd"}, timeout=30)
    s.post(f"{API}/gift-cards/redeem", json={"code": gc.json()["code"]}, timeout=30)
    start = float(s.get(f"{API}/me/store-credit", timeout=30).json()["store_credit"])
    assert start == 25.0

    def buy(_):
        return requests.post(f"{API}/checkout/session", headers=dict(s.headers),
                             json={"item_type": "drop_in", "item_id": "drop_in", "quantity": 1,
                                   "origin_url": BASE_URL, "apply_credit": True}, timeout=60)

    with ThreadPoolExecutor(max_workers=6) as ex:
        res = list(ex.map(buy, range(6)))
    applied_total = 0.0
    credit_only = 0
    for r in res:
        assert r.status_code == 200, f"{r.status_code} {r.text[:200]}"
        d = r.json()
        if d.get("credit_only"):
            credit_only += 1
            applied_total += float(d["credit_applied"])
    end = float(s.get(f"{API}/me/store-credit", timeout=30).json()["store_credit"])
    print(f"start={start} end={end} credit_only={credit_only} applied={applied_total}")
    assert end >= 0, f"negative balance {end}"
    assert credit_only <= 1, f"oversold credit-only purchases: {credit_only}"


def test_printful_image_hosts_and_counts():
    admin = _admin()
    stores = admin.get(f"{API}/admin/printful/stores", timeout=90).json()["stores"]
    target = next((x for x in stores if str(x["id"]) == "16428293"), None)
    assert target, stores
    print(f"store 16428293 product_count={target['product_count']}")
    body = requests.get(f"{API}/products?limit=300", timeout=60).json()
    items = body if isinstance(body, list) else body.get("products", [])
    pf = [p for p in items if p.get("source") == "printful"]
    hosts = {}
    for p in pf:
        u = (p.get("images") or [p.get("image_url") or ""])[0] or ""
        h = u.split("/")[2] if "//" in u else "MISSING"
        hosts.setdefault(h, 0)
        hosts[h] += 1
    print(f"printful products={len(pf)} image hosts={hosts}")
    assert "MISSING" not in hosts, "some printful products have no image"
