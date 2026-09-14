"""Iteration 47d — cart order paid fully by store credit must NOT auto-confirm Printful (test mode)."""
import os
import re
import time
from pathlib import Path

import pytest
import requests
from dotenv import dotenv_values

BASE_URL = (os.environ.get("REACT_APP_BACKEND_URL") or dotenv_values("/app/frontend/.env")["REACT_APP_BACKEND_URL"]).rstrip("/")
API = f"{BASE_URL}/api"


def _sess(section):
    c = Path("/app/memory/test_credentials.md").read_text()
    b = c.split(f"## {section}")[1]
    r = requests.post(f"{API}/auth/login", json={
        "email": re.search(r"Email:\s*(\S+)", b).group(1),
        "password": re.search(r"Password:\s*(\S+)", b).group(1)}, timeout=30)
    assert r.status_code == 200, r.text[:200]
    s = requests.Session()
    s.headers.update({"Authorization": f"Bearer {r.json()['token']}"})
    return s


@pytest.fixture(scope="module")
def admin():
    return _sess("Admin")


@pytest.fixture(scope="module")
def student():
    return _sess("Demo Student")


def test_credit_paid_cart_order_skips_printful_in_test_mode(admin, student):
    body = requests.get(f"{API}/products?limit=300", timeout=60).json()
    items = body if isinstance(body, list) else body.get("products", [])
    pf = [p for p in items if p.get("source") == "printful" and float(p.get("price") or 0) < 60]
    assert pf, "no cheap printful product available"
    prod = pf[0]
    variant = (prod.get("variants") or [{}])[0]

    # top up credit so it fully covers the order
    gc = admin.post(f"{API}/admin/gift-cards", json={"amount": 300, "currency": "usd"}, timeout=30)
    assert gc.status_code in (200, 201), gc.text[:200]
    student.post(f"{API}/gift-cards/redeem", json={"code": gc.json()["code"]}, timeout=30)

    order_payload = {
        "items": [{
            "product_id": prod["id"], "title": prod.get("title"),
            "variant": variant.get("id") or variant.get("variant_id"),
            "price": prod["price"], "quantity": 1,
        }],
        "shipping_address": {
            "name": "TEST QA Buyer", "line1": "19749 Dearborn St",
            "city": "Chatsworth", "state": "CA", "country": "US",
            "postal_code": "91311", "phone": "3105550123",
        },
    }
    oc = student.post(f"{API}/orders/create", json=order_payload, timeout=60)
    assert oc.status_code in (200, 201), f"{oc.status_code} {oc.text[:400]}"
    order = oc.json()
    order_id = order.get("id") or (order.get("order") or {}).get("id")
    total = float(order.get("total") or order.get("amount") or prod["price"])
    print(f"order {order_id} total {total}")

    r = student.post(f"{API}/checkout/session", json={
        "item_type": "cart", "item_id": order_id, "quantity": 1,
        "origin_url": BASE_URL, "apply_credit": True,
    }, timeout=60)
    assert r.status_code == 200, f"{r.status_code} {r.text[:400]}"
    d = r.json()
    assert d.get("credit_only") is True, f"expected credit_only for cart order: {d}"

    time.sleep(4)
    got = admin.get(f"{API}/admin/orders", timeout=60).json()
    orders = got if isinstance(got, list) else got.get("orders", [])
    mine = next((o for o in orders if o["id"] == order_id), None)
    assert mine, f"order {order_id} not visible to admin"
    print(f"order state: status={mine.get('status')} printful_status={mine.get('printful_status')} pf_id={mine.get('printful_order_id')}")
    assert mine.get("status") in ("paid", "processing", "fulfilled"), mine.get("status")
    assert mine.get("printful_order_id") in (None, ""), \
        f"TEST-MODE GUARD BROKEN: printful order {mine.get('printful_order_id')} created in sandbox"
    assert mine.get("printful_status") == "skipped_test_mode", \
        f"expected skipped_test_mode, got {mine.get('printful_status')}"


def test_draft_fulfill_for_that_order_is_admin_only(student):
    r = student.post(f"{API}/admin/orders/whatever/fulfill?confirm=false", timeout=30)
    assert r.status_code in (401, 403), r.status_code
