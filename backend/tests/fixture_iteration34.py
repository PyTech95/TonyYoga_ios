"""Setup/teardown helper for the iteration-34 frontend waitlist UI test.

usage: python fixture_iteration34.py setup|cancel|cleanup
"""
import json
import sys
from datetime import datetime, timedelta, timezone

import requests
from dotenv import dotenv_values

fe = dotenv_values("/app/frontend/.env")
API = fe["REACT_APP_BACKEND_URL"].rstrip("/") + "/api"
STATE = "/tmp/iter34_state.json"
ADMIN = {"email": "tony@tonyyoga.com", "password": "TonyYoga2026!"}
GALLERY = [
    "https://images.unsplash.com/photo-1544367567-0f2fcb009e0b?w=800",
    "https://images.unsplash.com/photo-1506126613408-eca07ce68773?w=800",
]


def sess(creds):
    t = requests.post(f"{API}/auth/login", json=creds, timeout=30).json()["token"]
    s = requests.Session()
    s.headers.update({"Authorization": f"Bearer {t}"})
    return s


def setup():
    s = sess(ADMIN)
    start = datetime.now(timezone.utc) + timedelta(days=150)
    r = s.post(f"{API}/admin/workshops", json={
        "title": "TEST_UI Waitlist Villa",
        "subtitle": "TEST fixture — safe to delete",
        "system": "Core 40",
        "description": "TEST retreat used by automated UI verification of gallery + waitlist.",
        "start_date": start.isoformat(),
        "end_date": (start + timedelta(days=6)).isoformat(),
        "capacity": 1, "price_eur": 1600.0, "deposit_eur": 500.0,
        "cover_image": GALLERY[0], "gallery": GALLERY,
    }, timeout=30)
    r.raise_for_status()
    wid = r.json()["id"]
    res = s.post(f"{API}/retreats/reserve", json={
        "workshop_id": wid, "name": "TEST Admin Holder", "email": ADMIN["email"],
    }, timeout=30)
    res.raise_for_status()
    state = {"workshop_id": wid, "admin_reservation_id": res.json()["id"]}
    json.dump(state, open(STATE, "w"))
    print(json.dumps({**state, "availability": requests.get(f"{API}/retreats/{wid}/availability", timeout=30).json()}))


def cancel():
    st = json.load(open(STATE))
    s = sess(ADMIN)
    r = s.post(f"{API}/retreats/{st['admin_reservation_id']}/cancel", timeout=30)
    print(r.status_code, r.text[:200])
    print(requests.get(f"{API}/retreats/{st['workshop_id']}/availability", timeout=30).json())


def cleanup():
    import asyncio
    from motor.motor_asyncio import AsyncIOMotorClient
    be = dotenv_values("/app/backend/.env")
    s = sess(ADMIN)

    async def go():
        cli = AsyncIOMotorClient(be["MONGO_URL"])
        d = cli[be["DB_NAME"]]
        ws = await d.workshops.find({"title": {"$regex": "^TEST_"}}, {"_id": 0, "id": 1, "title": 1}).to_list(50)
        for w in ws:
            res = await d.workshop_registrations.delete_many({"workshop_id": w["id"]})
            print("regs deleted", w["title"], res.deleted_count)
        cli.close()
        return ws

    ws = asyncio.run(go())
    for w in ws:
        print("delete workshop", w["id"], s.delete(f"{API}/admin/workshops/{w['id']}", timeout=30).status_code)


{"setup": setup, "cancel": cancel, "cleanup": cleanup}[sys.argv[1]]()
