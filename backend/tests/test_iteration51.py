"""Iteration 51 — Assistant knowledge base, assistant lead capture, passes € currency,
admin product (book) price/cover persistence."""
import os
import re
import time

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


@pytest.fixture(scope="session")
def client():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    return s


@pytest.fixture(scope="session")
def admin_client(client):
    s = requests.Session()
    r = s.post(f"{API}/auth/login", json=ADMIN, timeout=60)
    if r.status_code != 200:
        pytest.fail(f"Admin login failed {r.status_code}: {r.text[:300]}")
    token = r.json().get("access_token") or r.json().get("token")
    assert token, f"no token in login response: {r.json().keys()}"
    s.headers.update({"Authorization": f"Bearer {token}", "Content-Type": "application/json"})
    return s


# ---------------- Assistant config / knowledge ----------------
class TestAssistantKnowledge:
    def test_config(self, client):
        r = client.get(f"{API}/assistant/config", timeout=60)
        assert r.status_code == 200, r.text[:300]
        d = r.json()
        assert d.get("enabled") is True
        assert isinstance(d.get("greeting"), str) and len(d["greeting"]) > 5
        assert isinstance(d.get("popup_delay"), int)

    def test_catalog_grounded_reply(self, client):
        r = client.post(f"{API}/assistant/chat",
                        json={"message": "What memberships do you have and how much do they cost?"}, timeout=180)
        assert r.status_code == 200, r.text[:400]
        d = r.json()
        reply = d["reply"]
        print("REPLY(books/memberships):", reply)
        assert d.get("session_id")
        assert len(reply) > 20
        # € currency, never $
        assert "$" not in reply, f"dollar sign leaked in assistant reply: {reply}"
        assert "€" in reply, f"no euro price in reply: {reply}"
        # spoken style: short, no markdown bullets
        assert "**" not in reply and "\n-" not in reply, f"markdown in spoken reply: {reply}"
        assert len(reply) < 700, f"reply too long for spoken style ({len(reply)} chars)"

    def test_book_titles_match_catalog(self, client, admin_client):
        books = admin_client.get(f"{API}/products?category=books", timeout=60)
        assert books.status_code == 200, books.text[:300]
        payload = books.json()
        items = payload if isinstance(payload, list) else payload.get("products", payload.get("items", []))
        titles = [b["title"] for b in items]
        prices = {b["title"]: b.get("price") for b in items}
        print("CATALOG BOOKS:", prices)
        assert len(titles) >= 1

        r = client.post(f"{API}/assistant/chat",
                        json={"message": "List the books Tony sells and their prices."}, timeout=180)
        assert r.status_code == 200, r.text[:300]
        reply = r.json()["reply"]
        print("REPLY(books):", reply)
        matched = [t for t in titles if t.lower()[:12] in reply.lower()]
        assert matched, f"no seeded book title in reply. titles={titles} reply={reply}"
        # any price mentioned should be a real catalog price
        nums = set(re.findall(r"€\s?(\d+(?:[.,]\d+)?)", reply))
        real = {str(round(p)) for p in prices.values() if p is not None} | \
               {f"{p:.2f}" for p in prices.values() if p is not None}
        for n in nums:
            assert n.replace(",", ".").rstrip("0").rstrip(".") in {x.rstrip("0").rstrip(".") for x in real}, \
                f"hallucinated book price €{n}; real={real}; reply={reply}"

    def test_ebook_price_not_rounded(self, client):
        """BUG: _catalog_text uses round(price) so the €14.99 eBook is quoted as €15."""
        r = client.post(f"{API}/assistant/chat",
                        json={"message": "Exactly how much does the Pranayama and Meditation digital guide cost?"},
                        timeout=180)
        assert r.status_code == 200
        reply = r.json()["reply"]
        print("REPLY(ebook price):", reply)
        assert "15" not in reply or "14.99" in reply or "14,99" in reply, \
            f"assistant quotes a rounded price (€15) instead of the real €14.99: {reply}"

    def test_beginner_recommendation(self, client):
        r = client.post(f"{API}/assistant/chat",
                        json={"message": "I am a beginner, where do I start?"}, timeout=180)
        assert r.status_code == 200, r.text[:300]
        reply = r.json()["reply"]
        print("REPLY(beginner):", reply)
        assert "core 26" in reply.lower(), f"beginner reply does not recommend Core 26+: {reply}"
        assert "$" not in reply

    def test_session_continuity(self, client):
        r1 = client.post(f"{API}/assistant/chat", json={"message": "Hi, my name is Marta."}, timeout=180)
        assert r1.status_code == 200
        sid = r1.json()["session_id"]
        r2 = client.post(f"{API}/assistant/chat",
                         json={"session_id": sid, "message": "What is my name?"}, timeout=180)
        assert r2.status_code == 200
        assert r2.json()["session_id"] == sid
        print("REPLY(memory):", r2.json()["reply"])
        assert "marta" in r2.json()["reply"].lower(), "assistant lost session context"

    def test_empty_message_rejected(self, client):
        r = client.post(f"{API}/assistant/chat", json={"message": "   "}, timeout=60)
        assert r.status_code == 400, r.text[:200]


# ---------------- Assistant lead ----------------
class TestAssistantLead:
    def test_lead_capture_and_admin_list(self, client, admin_client):
        payload = {"name": "TEST_QA Lead51", "email": "test_qa51@qatest.com", "phone": "+34600111222",
                   "interest": "Core 26+"}
        r = client.post(f"{API}/assistant/lead", json=payload, timeout=90)
        assert r.status_code == 200, r.text[:300]
        d = r.json()
        assert d.get("ok") is True
        assert d.get("lead_id")
        assert "whatsapp_url" in d
        print("whatsapp_url:", d["whatsapp_url"])

        time.sleep(0.5)
        lr = admin_client.get(f"{API}/admin/assistant/leads", timeout=60)
        assert lr.status_code == 200, lr.text[:300]
        leads = lr.json()["leads"]
        mine = [x for x in leads if x["id"] == d["lead_id"]]
        assert mine, "lead not returned by admin endpoint"
        assert mine[0]["email"] == payload["email"]
        assert mine[0]["name"] == payload["name"]
        assert "_id" not in mine[0]

    def test_lead_requires_some_contact(self, client):
        r = client.post(f"{API}/assistant/lead", json={}, timeout=60)
        assert r.status_code == 400, r.text[:200]

    def test_leads_admin_only(self, client):
        r = client.get(f"{API}/admin/assistant/leads", timeout=60)
        assert r.status_code in (401, 403), r.status_code


# ---------------- Passes currency ----------------
class TestPassesCurrency:
    def test_passes_euro(self, client):
        r = client.get(f"{API}/passes/catalog", timeout=60)
        if r.status_code == 404:
            r = client.get(f"{API}/passes", timeout=60)
        assert r.status_code == 200, f"{r.status_code} {r.text[:200]}"
        body = r.text
        print("PASSES:", body[:600])
        assert "$" not in body, "dollar sign in passes catalog"
        assert "€" in body


# ---------------- Admin book edit: price + cover image ----------------
class TestAdminBookEdit:
    def test_price_and_images_persist(self, admin_client):
        lr = admin_client.get(f"{API}/products?category=books", timeout=60)
        assert lr.status_code == 200
        payload = lr.json()
        items = payload if isinstance(payload, list) else payload.get("products", payload.get("items", []))
        assert items, "no book products seeded"
        book = items[0]
        pid = book["id"]
        orig_price = book.get("price")
        orig_images = book.get("images") or []

        new_price = round((orig_price or 20) + 3.5, 2)
        new_images = list(orig_images) + ["https://example.com/TEST_cover51.jpg"]
        up = admin_client.patch(f"{API}/admin/products/{pid}", json={
            "price": new_price, "images": new_images,
            "type": book.get("type") or "physical",
            "author": "TEST_Author51",
            "external_amazon_link": "https://amazon.com/dp/TEST51",
        }, timeout=60)
        assert up.status_code in (200, 201), f"{up.status_code} {up.text[:400]}"

        g = admin_client.get(f"{API}/products/{pid}", timeout=60)
        assert g.status_code == 200, g.text[:200]
        got = g.json()
        assert abs(float(got["price"]) - new_price) < 0.01, f"price not persisted: {got.get('price')}"
        assert "https://example.com/TEST_cover51.jpg" in (got.get("images") or []), \
            f"cover image not persisted: {got.get('images')}"
        assert got.get("author") == "TEST_Author51"
        assert got.get("external_amazon_link") == "https://amazon.com/dp/TEST51"
        assert "_id" not in got

        # restore
        restore = {"price": orig_price, "images": orig_images}
        if book.get("author"):
            restore["author"] = book["author"]
        if book.get("external_amazon_link"):
            restore["external_amazon_link"] = book["external_amazon_link"]
        rb = admin_client.patch(f"{API}/admin/products/{pid}", json=restore, timeout=60)
        assert rb.status_code in (200, 201)
        back = admin_client.get(f"{API}/products/{pid}", timeout=60).json()
        assert abs(float(back["price"]) - float(orig_price)) < 0.01
