import os, requests
from dotenv import dotenv_values
BASE = (os.environ.get("REACT_APP_BACKEND_URL") or dotenv_values("/app/frontend/.env")["REACT_APP_BACKEND_URL"]).rstrip("/")
API = BASE + "/api"
PID = "7585a2ef-01a1-4854-84f5-1eba68cfea66"
j = requests.post(f"{API}/auth/login", json={"email": "student@demo.com", "password": "Student2026!"}).json()
tok = j.get("token")
d = requests.get(f"{API}/programs/{PID}", headers={"Authorization": f"Bearer {tok}"}).json()
print("viewer:", d["viewer"], "price_model:", d.get("price_model"))
print("unlocked:", sum(1 for l in d["lessons"] if l.get("is_unlocked")), "/", len(d["lessons"]))
print("demo:", d.get("demo_video"))
