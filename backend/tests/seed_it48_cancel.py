"""Seed a partial-credit reserved checkout for the frontend CheckoutCancel test."""
import os, uuid, json, requests
from dotenv import dotenv_values

BASE = (dotenv_values("/app/frontend/.env").get("REACT_APP_BACKEND_URL")).rstrip("/") + "/api"
EMAIL = "TEST_it48fe@qatest48.com"
PWD = "TestPass2026!"

admin = requests.post(f"{BASE}/auth/login", json={"email": "tony@tonyyoga.com", "password": "TonyYoga2026!"}, timeout=30).json()
atok = admin.get("access_token") or admin.get("token")

r = requests.post(f"{BASE}/auth/register", json={"email": EMAIL, "password": PWD, "name": "TEST It48 FE"}, timeout=30)
if r.status_code in (200, 201):
    tok = r.json().get("access_token") or r.json().get("token")
else:
    tok = requests.post(f"{BASE}/auth/login", json={"email": EMAIL, "password": PWD}, timeout=30).json().get("access_token")

H = {"Authorization": f"Bearer {tok}", "Content-Type": "application/json"}
AH = {"Authorization": f"Bearer {atok}", "Content-Type": "application/json"}

bal = requests.get(f"{BASE}/me/store-credit", headers=H, timeout=30).json()["store_credit"]
if bal < 100:
    code = requests.post(f"{BASE}/admin/gift-cards", json={"amount": 100 - bal if bal else 100, "currency": "usd"}, headers=AH, timeout=30).json()["code"]
    requests.post(f"{BASE}/gift-cards/redeem", json={"code": code}, headers=H, timeout=30)
bal = requests.get(f"{BASE}/me/store-credit", headers=H, timeout=30).json()["store_credit"]

progs = [p for p in requests.get(f"{BASE}/programs", timeout=30).json() if float(p.get("price") or 0) > bal]
prog = max(progs, key=lambda p: float(p["price"]))
s = requests.post(f"{BASE}/checkout/session", json={
    "item_type": "program", "item_id": prog["id"], "apply_credit": True,
    "origin_url": "https://x.com"}, headers=H, timeout=60).json()
after = requests.get(f"{BASE}/me/store-credit", headers=H, timeout=30).json()["store_credit"]
print(json.dumps({"email": EMAIL, "password": PWD, "session_id": s.get("session_id"),
                  "url_has_stripe": "stripe" in (s.get("url") or ""),
                  "program": prog["title"], "price": prog["price"],
                  "balance_before": bal, "balance_after_reserve": after}, indent=2))
