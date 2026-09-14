"""Leak check: public list endpoint must not expose zoom_start_url / recording_url."""
import os
import requests
from datetime import datetime, timedelta, timezone
from dotenv import dotenv_values

BASE = (os.environ.get("REACT_APP_BACKEND_URL") or dotenv_values("/app/frontend/.env")["REACT_APP_BACKEND_URL"]).rstrip("/") + "/api"


def tok(e, p):
    return requests.post(f"{BASE}/auth/login", json={"email": e, "password": p}, timeout=30).json()["token"]


def h(t):
    return {"Authorization": f"Bearer {t}", "Content-Type": "application/json"}


admin = tok("tony@tonyyoga.com", "TonyYoga2026!")
tmpl = [t for t in requests.get(f"{BASE}/class-templates", timeout=30).json() if t["location_type"] == "online"][0]
start = (datetime.now(timezone.utc) + timedelta(days=4)).isoformat()
inst = requests.post(f"{BASE}/admin/class-instances", json={"template_id": tmpl["id"], "start_time": start},
                     headers=h(admin), timeout=30).json()
iid = inst["id"]
requests.post(f"{BASE}/admin/class-instances/{iid}/recording",
              json={"recording_url": "https://example.com/LEAKCHECK.mp4", "replay_days": 1},
              headers=h(admin), timeout=30)

rows = requests.get(f"{BASE}/class-instances", params={"include_cancelled": "true"}, timeout=30).json()
row = next(r for r in rows if r["id"] == iid)
print("ANON list -> zoom_start_url present:", "zoom_start_url" in row, row.get("zoom_start_url"))
print("ANON list -> recording_url present:", "recording_url" in row, row.get("recording_url"))

requests.delete(f"{BASE}/admin/class-instances/{iid}", headers=h(admin), timeout=30)
print("cleaned up", iid)
