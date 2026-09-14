import os, requests
from dotenv import dotenv_values
BASE = (os.environ.get("REACT_APP_BACKEND_URL") or dotenv_values("/app/frontend/.env")["REACT_APP_BACKEND_URL"]).rstrip("/")
API = BASE + "/api"
PID = "7585a2ef-01a1-4854-84f5-1eba68cfea66"
j = requests.post(f"{API}/auth/login", json={"email": "tony@tonyyoga.com", "password": "TonyYoga2026!"}).json()
print("login keys:", list(j.keys()))
tok = j.get("access_token") or j.get("token")
h = {"Authorization": f"Bearer {tok}"}
r = requests.patch(f"{API}/admin/programs/{PID}", headers=h, json={"demo_video_url": ""})
print("restore status", r.status_code)
print("public demo now:", requests.get(f"{API}/programs/{PID}").json()["demo_video"])
