"""Iteration 50 — BOOKS offering (hybrid physical/Amazon + eBook direct sale)."""
import os
import io
import time
import uuid

import pytest
import requests
from dotenv import dotenv_values

frontend_env = dotenv_values("/app/frontend/.env")
base_url = os.environ.get("REACT_APP_BACKEND_URL") or frontend_env.get("REACT_APP_BACKEND_URL")
if not base_url:
    raise RuntimeError("REACT_APP_BACKEND_URL missing")
BASE_URL = base_url.rstrip("/")
API = f"{BASE_URL}/api"

ADMIN = {"email": "tony@tonyyoga.com", "password": "TonyYoga2026!"}
STUDENT = {"email": "student@demo.com", "password": "Student2026!"}


def _login(creds):
    r = requests.post(f"{API}/auth/login", json=creds, timeout=30)
    if r.status_code != 200:
        pytest.fail(f"login failed for {creds['email']}: {r.status_code} {r.text[:300]}")
    tok = r.json().get("access_token") or r.json().get("token")
    assert tok, f"no token in login response: {r.json()}"
    return tok


@pytest.fixture(scope="session")
def admin_token():
    return _login(ADMIN)


@pytest.fixture(scope="session")
def student_token():
    return _login(STUDENT)


@pytest.fixture(scope="session")
def books():
    r = requests.get(f"{API}/products", params={"category": "books"}, timeout=30)
    assert r.status_code == 200, r.text[:300]
    return r.json()


# --- Books catalog ---
class TestBooksCatalog:
    def test_books_category_returns_demo_books(self, books):
        titles = [b["title"] for b in books]
        assert len(books) >= 3, f"expected >=3 books, got {titles}"
        for t in ["The Core 26 & 40 — Original Hot Yoga",
                  "The Advanced 84 — Postures of Mastery",
                  "Pranayama & Meditation — Digital Guide"]:
            assert t in titles, f"missing seeded book {t}: {titles}"

    def test_print_books_have_amazon_link(self, books):
        prints = [b for b in books if b.get("type") == "book"]
        assert len(prints) >= 2
        for b in prints:
            assert (b.get("external_amazon_link") or "").startswith("http"), b["title"]
            assert b.get("author"), b["title"]
            assert b.get("currency") == "eur", (b["title"], b.get("currency"))

    def test_ebook_has_amazon_and_file(self, books):
        ebooks = [b for b in books if b.get("type") == "ebook"]
        assert len(ebooks) >= 1
        e = ebooks[0]
        assert (e.get("ebook_file_url") or "").startswith("http")
        assert (e.get("external_amazon_link") or "").startswith("http")
        assert e.get("currency") == "eur"

    def test_all_seeded_books_currency_eur(self, books):
        seeded = [b for b in books if b["title"] in (
            "The Core 26 & 40 — Original Hot Yoga",
            "The Advanced 84 — Postures of Mastery",
            "Pranayama & Meditation — Digital Guide")]
        assert all(b.get("currency") == "eur" for b in seeded), [
            (b["title"], b.get("currency")) for b in seeded]

    def test_no_mongo_id_leak(self, books):
        assert all("_id" not in b for b in books)


# --- eBook purchase via store credit + gated downloads ---
class TestEbookPurchaseAndDownloads:
    def test_ebook_credit_only_checkout_and_downloads(self, student_token, books):
        h = {"Authorization": f"Bearer {student_token}"}
        ebook = next(b for b in books if b.get("type") == "ebook")
        r = requests.post(f"{API}/checkout/session", headers=h, json={
            "item_type": "product", "item_id": ebook["id"], "apply_credit": True,
            "origin_url": BASE_URL}, timeout=60)
        assert r.status_code == 200, f"{r.status_code} {r.text[:400]}"
        data = r.json()
        assert data.get("credit_only") is True, data
        time.sleep(1.5)
        d = requests.get(f"{API}/me/downloads", headers=h, timeout=30)
        assert d.status_code == 200, d.text[:300]
        items = d.json()
        match = [i for i in items if i["product_id"] == ebook["id"]]
        assert match, f"eBook not in downloads: {items}"
        it = match[0]
        assert it["title"] == ebook["title"]
        assert it.get("author")
        assert it.get("images")
        assert (it.get("ebook_file_url") or "").startswith("http")

    def test_downloads_empty_for_fresh_user(self):
        email = f"TEST_dl_{uuid.uuid4().hex[:8]}@qatest.com"
        r = requests.post(f"{API}/auth/register", json={
            "email": email, "password": "QaTest2026!", "name": "TEST Downloads"}, timeout=30)
        assert r.status_code in (200, 201), f"{r.status_code} {r.text[:300]}"
        tok = r.json().get("access_token") or r.json().get("token") or _login(
            {"email": email, "password": "QaTest2026!"})
        d = requests.get(f"{API}/me/downloads", headers={"Authorization": f"Bearer {tok}"}, timeout=30)
        assert d.status_code == 200, d.text[:300]
        assert d.json() == [], d.json()

    def test_downloads_requires_auth(self):
        d = requests.get(f"{API}/me/downloads", timeout=30)
        assert d.status_code in (401, 403), d.status_code


# --- create_order must not block eBooks on stock ---
class TestOrderCreateEbookStockBypass:
    def test_ebook_order_bypasses_stock(self, student_token, books):
        h = {"Authorization": f"Bearer {student_token}"}
        ebook = next(b for b in books if b.get("type") == "ebook")
        assert int(ebook.get("stock_qty") or 0) == 0
        r = requests.post(f"{API}/orders/create", headers=h, json={
            "items": [{"product_id": ebook["id"], "quantity": 1}],
            "shipping_address": {"name": "TEST QA", "line1": "1 Test St", "city": "Lisbon",
                                 "postal_code": "1000", "country": "PT"},
        }, timeout=30)
        assert r.status_code == 200, f"{r.status_code} {r.text[:400]}"
        o = r.json()
        assert o["status"] == "pending"
        assert o["currency"] == "eur"
        assert o["total"] == pytest.approx(ebook["price"])

    def test_print_book_zero_stock_rejected(self, student_token, books):
        """type='book' with stock 0 — should still hit the stock guard (Amazon-only item)."""
        h = {"Authorization": f"Bearer {student_token}"}
        pb = next(b for b in books if b.get("type") == "book")
        r = requests.post(f"{API}/orders/create", headers=h, json={
            "items": [{"product_id": pb["id"], "quantity": 1}],
            "shipping_address": {"name": "TEST QA", "line1": "1 Test St", "city": "Lisbon",
                                 "postal_code": "1000", "country": "PT"},
        }, timeout=30)
        assert r.status_code == 400, f"expected 400, got {r.status_code} {r.text[:300]}"


# --- admin product patch: new book fields ---
class TestAdminBookFields:
    def test_patch_persists_book_fields(self, admin_token, books):
        h = {"Authorization": f"Bearer {admin_token}"}
        pb = next(b for b in books if b.get("type") == "book")
        orig = {k: pb.get(k) for k in ("type", "author", "external_amazon_link", "ebook_file_url")}
        payload = {"type": "ebook", "author": "TEST Author QA",
                   "external_amazon_link": "https://www.amazon.com/test-qa",
                   "ebook_file_url": "https://example.com/test-qa.pdf"}
        r = requests.patch(f"{API}/admin/products/{pb['id']}", headers=h, json=payload, timeout=30)
        assert r.status_code == 200, f"{r.status_code} {r.text[:400]}"
        g = requests.get(f"{API}/products/{pb['id']}", timeout=30)
        assert g.status_code == 200, g.text[:200]
        got = g.json()
        for k, v in payload.items():
            assert got.get(k) == v, f"{k}: {got.get(k)!r} != {v!r}"
        # restore
        rest = requests.patch(f"{API}/admin/products/{pb['id']}", headers=h, json={
            "type": orig["type"] or "book", "author": orig["author"] or "",
            "external_amazon_link": orig["external_amazon_link"] or "",
            "ebook_file_url": orig["ebook_file_url"] or ""}, timeout=30)
        assert rest.status_code == 200
        back = requests.get(f"{API}/products/{pb['id']}", timeout=30).json()
        assert back.get("type") == (orig["type"] or "book")

    def test_patch_requires_admin(self, student_token, books):
        pb = next(b for b in books if b.get("type") == "book")
        r = requests.patch(f"{API}/admin/products/{pb['id']}",
                           headers={"Authorization": f"Bearer {student_token}"},
                           json={"author": "hacker"}, timeout=30)
        assert r.status_code in (401, 403), r.status_code


# --- admin uploads: PDF/EPUB support ---
class TestUploadsDocs:
    def test_upload_pdf(self, admin_token):
        h = {"Authorization": f"Bearer {admin_token}"}
        pdf = b"%PDF-1.4\n1 0 obj<</Type/Catalog>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF\n"
        r = requests.post(f"{API}/admin/uploads", headers=h,
                          files={"file": ("TEST_qa.pdf", io.BytesIO(pdf), "application/pdf")},
                          timeout=120)
        assert r.status_code == 200, f"{r.status_code} {r.text[:400]}"
        d = r.json()
        assert d.get("url") or d.get("path"), d

    def test_upload_rejects_unsupported_ext(self, admin_token):
        h = {"Authorization": f"Bearer {admin_token}"}
        r = requests.post(f"{API}/admin/uploads", headers=h,
                          files={"file": ("TEST_qa.exe", io.BytesIO(b"MZ"), "application/octet-stream")},
                          timeout=60)
        assert r.status_code == 400, f"{r.status_code} {r.text[:300]}"


# --- regression: physical products & shop listing ---
class TestRegression:
    def test_products_list_ok(self):
        r = requests.get(f"{API}/products", timeout=30)
        assert r.status_code == 200
        prods = r.json()
        assert len(prods) > 0
        cats = {p.get("category") for p in prods}
        assert "books" in cats

    def test_physical_product_order_flow(self, student_token):
        h = {"Authorization": f"Bearer {student_token}"}
        prods = requests.get(f"{API}/products", timeout=30).json()
        phys = [p for p in prods if p.get("type") in (None, "physical")
                and int(p.get("stock_qty") or 0) > 0]
        assert phys, "no in-stock physical product to test"
        p = phys[0]
        r = requests.post(f"{API}/orders/create", headers=h, json={
            "items": [{"product_id": p["id"], "quantity": 1}],
            "shipping_address": {"name": "TEST QA", "line1": "1 Test St", "city": "Lisbon",
                                 "postal_code": "1000", "country": "PT"},
        }, timeout=30)
        assert r.status_code == 200, f"{r.status_code} {r.text[:300]}"
        assert r.json()["total"] == pytest.approx(p["price"])
