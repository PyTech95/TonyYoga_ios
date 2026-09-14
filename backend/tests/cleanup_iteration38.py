"""Iteration 38 cleanup: remove TEST_UI description/cover from the seeded lesson."""
import os

import requests
from dotenv import dotenv_values

fe = dotenv_values("/app/frontend/.env")
API = (os.environ.get("REACT_APP_BACKEND_URL") or fe["REACT_APP_BACKEND_URL"]).rstrip("/") + "/api"
s = requests.Session()
tok = s.post(f"{API}/auth/login", json={"email": "tony@tonyyoga.com", "password": "TonyYoga2026!"}, timeout=30).json()
s.headers["Authorization"] = f"Bearer {tok.get('access_token') or tok.get('token')}"
PID = "7585a2ef-01a1-4854-84f5-1eba68cfea66"
lessons = s.get(f"{API}/admin/programs/{PID}/lessons", timeout=30).json()
for l in lessons:
    v = l["video"]
    if (v.get("description") or "").startswith("TEST_UI"):
        body = {
            "title": v["title"],
            "description": "",
            "cover_image": None,
            "youtube_url": v.get("source_url") or v.get("video_url"),
            "start_seconds": v.get("start_seconds") or 0,
            "end_seconds": v.get("end_seconds"),
        }
        r = s.patch(f"{API}/admin/lessons/{l['id']}", json=body, timeout=30)
        print("reverted", l["id"], r.status_code)
print("done")
