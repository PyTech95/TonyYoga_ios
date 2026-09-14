"""Iteration 49 — focused re-test: Printful product images must be MOCKUPs
from files.cdn.printful.com and must not reference tonyoga.com/.online."""
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


@pytest.fixture(scope="session")
def creds():
    content = Path("/app/memory/test_credentials.md").read_text(encoding="utf-8")
    email = re.search(r"(?im)^-\s*Email:\s*(\S+)", content).group(1)
    password = re.search(r"(?im)^-\s*Password:\s*(\S+)", content).group(1)
    return {"email": email, "password": password}


@pytest.fixture(scope="session")
def client():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    return s


@pytest.fixture(scope="session")
def admin(client, creds):
    r = client.post(f"{BASE_URL}/api/auth/login", json=creds)
    if r.status_code != 200:
        pytest.fail(f"admin login failed {r.status_code}: {r.text[:300]}")
    tok = r.json().get("access_token") or r.json().get("token")
    assert tok, f"no token in {r.json().keys()}"
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json", "Authorization": f"Bearer {tok}"})
    return s


# --- public storefront products ---
def test_public_products_images(client):
    r = client.get(f"{BASE_URL}/api/products", timeout=60)
    assert r.status_code == 200
    data = r.json()
    items = data if isinstance(data, list) else data.get("items", data.get("products", []))
    assert items, "no products returned"
    bad_domain = [p["title"] for p in items
                  if any("tonyoga.com" in (u or "") or "tonyoga.online" in (u or "")
                         for u in (p.get("images") or []))]
    assert not bad_domain, f"tonyoga.* image URLs found: {bad_domain}"

    physical = [p for p in items if (p.get("images") or [])]
    print(f"total={len(items)} with_images={len(physical)}")
    non_cdn = [(p["title"], p["images"][0]) for p in physical
               if not p["images"][0].startswith("https://files.cdn.printful.com/files/")]
    assert not non_cdn, f"images[0] not a printful CDN file: {non_cdn}"
    # printfile-preview path = bare artwork, must not be first
    printfile_first = [(p["title"], p["images"][0]) for p in physical
                       if "printfile" in p["images"][0]]
    assert not printfile_first, f"print-file used as primary image: {printfile_first}"


def test_named_products_have_mockups(client):
    r = client.get(f"{BASE_URL}/api/products", timeout=60)
    items = r.json() if isinstance(r.json(), list) else r.json().get("items", [])
    wanted = ["mug", "beanie", "notebook", "poster"]
    found = {}
    for p in items:
        t = (p.get("title") or "").lower()
        for w in wanted:
            if w in t and w not in found:
                found[w] = (p.get("title"), (p.get("images") or [None])[0])
    print(found)
    for w in wanted:
        assert w in found, f"no product matching '{w}'"
        title, img = found[w]
        assert img and img.startswith("https://files.cdn.printful.com/files/"), f"{title} -> {img}"


def test_mockup_urls_return_200_image(client):
    r = client.get(f"{BASE_URL}/api/products", timeout=60)
    items = r.json() if isinstance(r.json(), list) else r.json().get("items", [])
    urls = [p["images"][0] for p in items if p.get("images")][:3]
    assert urls
    for u in urls:
        h = requests.get(u, timeout=45, stream=True)
        assert h.status_code == 200, f"{u} -> {h.status_code}"
        assert h.headers.get("content-type", "").startswith("image/"), f"{u} -> {h.headers.get('content-type')}"
        h.close()


def test_product_detail_images(client):
    r = client.get(f"{BASE_URL}/api/products", timeout=60)
    items = r.json() if isinstance(r.json(), list) else r.json().get("items", [])
    p = next(x for x in items if x.get("images"))
    pid = p.get("id") or p.get("_id") or p.get("slug")
    d = client.get(f"{BASE_URL}/api/products/{pid}", timeout=60)
    assert d.status_code == 200, d.text[:200]
    det = d.json()
    assert "_id" not in det
    assert det.get("images") and det["images"][0].startswith("https://files.cdn.printful.com/files/")


# --- admin products ---
def test_admin_products_no_tonyoga(admin):
    r = admin.get(f"{BASE_URL}/api/admin/products", timeout=90)
    assert r.status_code == 200, r.text[:300]
    data = r.json()
    items = data if isinstance(data, list) else data.get("items", data.get("products", []))
    assert items
    pf = [p for p in items if p.get("printful_product_id")]
    print(f"admin total={len(items)} printful={len(pf)} with_images={sum(1 for p in pf if p.get('images'))}")
    bad = []
    for p in items:
        for u in (p.get("images") or []):
            if "tonyoga.com" in u or "tonyoga.online" in u:
                bad.append((p.get("title"), u))
    assert not bad, f"tonyoga URLs in admin products: {bad}"
    assert len(pf) == 36, f"expected 36 printful products, got {len(pf)}"


def test_printful_status_store_default(admin):
    r = admin.get(f"{BASE_URL}/api/admin/printful/status", timeout=60)
    assert r.status_code == 200, r.text[:300]
    body = r.json()
    print(body)
    assert "16428293" in str(body.get("store_id") or body.get("selected_store_id") or body)
