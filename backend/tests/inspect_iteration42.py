import os, requests
from dotenv import dotenv_values
BASE = (os.environ.get("REACT_APP_BACKEND_URL") or dotenv_values("/app/frontend/.env")["REACT_APP_BACKEND_URL"]).rstrip("/")
API = BASE + "/api"
progs = requests.get(f"{API}/programs").json()
print("count", len(progs))
for p in progs:
    d = requests.get(f"{API}/programs/{p['id']}").json()
    ls = d.get("lessons") or []
    first = (ls[0].get("video") if ls else None) or {}
    print(p["id"], "|", p["title"], "| lessons", len(ls), "| demo", d.get("demo_video"),
          "| demo_url", repr(d.get("demo_video_url")), "| firstvid keys", sorted(first.keys())[:8],
          "| unlocked0", ls[0].get("is_unlocked") if ls else None)
