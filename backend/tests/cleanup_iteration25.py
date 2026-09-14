"""Cleanup for iteration 25 UI test artifacts: remove QA recording + student booking."""
import os
import requests
from dotenv import dotenv_values

BASE = (os.environ.get("REACT_APP_BACKEND_URL") or dotenv_values("/app/frontend/.env")["REACT_APP_BACKEND_URL"]).rstrip("/") + "/api"
INSTANCE = "b1c1b8cc-b7ae-4855-a1c5-07d367fda1f3"


def tok(email, pw):
    return requests.post(f"{BASE}/auth/login", json={"email": email, "password": pw}, timeout=30).json()["token"]


def h(t):
    return {"Authorization": f"Bearer {t}", "Content-Type": "application/json"}


admin = tok("tony@tonyyoga.com", "TonyYoga2026!")
stud = tok("student@demo.com", "Student2026!")

r = requests.delete(f"{BASE}/admin/class-instances/{INSTANCE}/recording", headers=h(admin), timeout=30)
print("remove recording:", r.status_code)

mine = requests.get(f"{BASE}/bookings/mine", headers=h(stud), timeout=30).json()
for b in mine:
    if b["class_instance_id"] == INSTANCE and b["status"] in ("confirmed", "waitlist"):
        d = requests.delete(f"{BASE}/bookings/{b['id']}", headers=h(stud), timeout=30)
        print("cancel booking:", d.status_code)

eps = requests.get(f"{BASE}/admin/broadcasts", headers=h(admin), timeout=30).json()
print("episodes remaining:", len(eps), [e["title"] for e in eps])
