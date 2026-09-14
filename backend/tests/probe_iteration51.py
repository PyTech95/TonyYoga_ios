import os, json, requests
from dotenv import dotenv_values
BASE = (dotenv_values("/app/frontend/.env")["REACT_APP_BACKEND_URL"]).rstrip("/") + "/api"

qs = [
    "How much does a membership cost?",
    "What is the price of The Advanced 84 book?",
    "How much is a drop in class and a 5 class pack?",
    "Do you have any retreats coming up?",
    "Do you have meditations?",
]
for q in qs:
    r = requests.post(f"{BASE}/assistant/chat", json={"message": q}, timeout=180)
    print("Q:", q)
    print("  ->", r.status_code, r.json().get("reply") if r.status_code == 200 else r.text[:200])
    print()

# what does the catalog actually contain
adm = requests.Session()
lr = adm.post(f"{BASE}/auth/login", json={"email":"tony@tonyyoga.com","password":"TonyYoga2026!"}, timeout=60).json()
tok = lr.get("access_token") or lr.get("token")
adm.headers.update({"Authorization": f"Bearer {tok}"})
print("PLANS:", json.dumps([{k: p.get(k) for k in ("name","title","tier","price","billing_cycle","is_active")} for p in adm.get(f"{BASE}/membership-plans", timeout=60).json()], indent=1)[:1500])
books = adm.get(f"{BASE}/products?category=books", timeout=60).json()
print("BOOKS:", json.dumps([{k: b.get(k) for k in ("title","price","type","images","author","external_amazon_link")} for b in books], indent=1)[:1500])
