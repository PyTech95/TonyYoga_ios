"""Concurrency check: parallel redemption of the same gift card (race condition probe)."""
import os
from concurrent.futures import ThreadPoolExecutor

import requests
from dotenv import dotenv_values

fe = dotenv_values("/app/frontend/.env")
BASE = (os.environ.get("REACT_APP_BACKEND_URL") or fe["REACT_APP_BACKEND_URL"]).rstrip("/") + "/api"


def login(email, pwd):
    return requests.post(f"{BASE}/auth/login", json={"email": email, "password": pwd}, timeout=30).json()["token"]


admin = login("tony@tonyyoga.com", "TonyYoga2026!")
stud = login("student@demo.com", "Student2026!")
AH = {"Authorization": f"Bearer {admin}"}
SH = {"Authorization": f"Bearer {stud}"}

before = requests.get(f"{BASE}/me/store-credit", headers=SH, timeout=30).json()["store_credit"]
code = requests.post(f"{BASE}/admin/gift-cards", headers=AH,
                     json={"amount": 10, "note": "TEST_iter26_race"}, timeout=30).json()["code"]


def redeem(_):
    r = requests.post(f"{BASE}/gift-cards/redeem", headers=SH, json={"code": code}, timeout=30)
    return r.status_code


with ThreadPoolExecutor(max_workers=6) as ex:
    codes = list(ex.map(redeem, range(6)))

after = requests.get(f"{BASE}/me/store-credit", headers=SH, timeout=30).json()["store_credit"]
print("statuses:", codes)
print("credit before/after:", before, after, "delta:", round(after - before, 2))
print("RACE BUG" if round(after - before, 2) > 10 else "OK: single credit applied")

# restore
from pymongo import MongoClient  # noqa: E402
env = dotenv_values("/app/backend/.env")
cli = MongoClient(env["MONGO_URL"])
cli[env["DB_NAME"]].users.update_one({"email": "student@demo.com"},
                                     {"$inc": {"store_credit": -(round(after - before, 2))}})
cli[env["DB_NAME"]].gift_cards.delete_many({"note": "TEST_iter26_race"})
print("restored credit to", cli[env["DB_NAME"]].users.find_one({"email": "student@demo.com"},
                                                               {"_id": 0, "store_credit": 1}))
cli.close()
