"""Regression tests for admin schedule controls."""
import os
import requests
from datetime import datetime, timedelta, timezone

BASE = os.environ.get("REACT_APP_BACKEND_URL", "http://localhost:8001")
ADMIN = {"email": "tony@tonyyoga.com", "password": "TonyYoga2026!"}


def _auth():
    r = requests.post(f"{BASE}/api/auth/login", json=ADMIN, timeout=10)
    r.raise_for_status()
    token = r.json().get("access_token") or r.json().get("token")
    return {"Authorization": f"Bearer {token}"}


def test_template_crud():
    headers = _auth()
    instructors = requests.get(f"{BASE}/api/instructors").json()
    assert instructors, "Need at least one instructor"
    iid = instructors[0]["id"]

    # CREATE
    r = requests.post(f"{BASE}/api/admin/class-templates", headers=headers, json={
        "title": "TEST_ScheduleAdmin",
        "description": "test",
        "instructor_id": iid,
        "location_type": "online",
        "location_detail": "Zoom",
        "style": "Hatha",
        "level": "all",
        "duration_minutes": 45,
        "capacity": 10,
    })
    assert r.status_code == 200, r.text
    tid = r.json()["id"]

    # PATCH
    r = requests.patch(f"{BASE}/api/admin/class-templates/{tid}", headers=headers, json={"capacity": 25})
    assert r.json()["updated"] == 1

    # Unknown field ignored
    r = requests.patch(f"{BASE}/api/admin/class-templates/{tid}", headers=headers, json={"foo": "bar"})
    assert r.json()["updated"] == 0

    # DELETE (no upcoming instances)
    r = requests.delete(f"{BASE}/api/admin/class-templates/{tid}", headers=headers)
    assert r.json()["deleted"] == 1

    # DELETE again → 404
    r = requests.delete(f"{BASE}/api/admin/class-templates/{tid}", headers=headers)
    assert r.status_code == 404


def test_instance_create_patch_delete():
    headers = _auth()
    # Pick first non-test template
    templates = requests.get(f"{BASE}/api/class-templates").json()
    tid = next(t["id"] for t in templates if not t["title"].startswith("TEST"))

    # CREATE single
    start = (datetime.now(timezone.utc) + timedelta(days=14)).replace(microsecond=0)
    r = requests.post(f"{BASE}/api/admin/class-instances", headers=headers, json={
        "template_id": tid,
        "start_time": start.isoformat(),
        "capacity": 12,
        "is_recorded": True,
    })
    assert r.status_code == 200, r.text
    inst_id = r.json()["id"]

    # PATCH status -> cancelled
    r = requests.patch(f"{BASE}/api/admin/class-instances/{inst_id}", headers=headers, json={"status": "cancelled"})
    assert r.json()["updated"] == 1

    # By default cancelled hidden; include_cancelled=true shows it
    listed = requests.get(f"{BASE}/api/class-instances", params={"upcoming": False}).json()
    assert all(i["id"] != inst_id for i in listed), "Cancelled class should be hidden by default"
    listed = requests.get(f"{BASE}/api/class-instances", params={"upcoming": False, "include_cancelled": True}).json()
    assert any(i["id"] == inst_id for i in listed)

    # DELETE
    r = requests.delete(f"{BASE}/api/admin/class-instances/{inst_id}", headers=headers)
    assert r.json()["deleted"] == 1


def test_bulk_generate():
    headers = _auth()
    templates = requests.get(f"{BASE}/api/class-templates").json()
    tid = next(t["id"] for t in templates if not t["title"].startswith("TEST"))

    start = (datetime.now(timezone.utc) + timedelta(days=60)).replace(hour=0, minute=0, microsecond=0)
    r = requests.post(f"{BASE}/api/admin/class-instances/bulk-generate", headers=headers, json={
        "template_id": tid,
        "start_date": start.isoformat(),
        "weeks_count": 3,
        "weekday": 1,  # Tue
        "hour": 7, "minute": 30,
        "is_recorded": False,
    })
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["created"] == 3
    first_dt = datetime.fromisoformat(body["first_start"])
    assert first_dt.weekday() == 1
    assert first_dt.hour == 7 and first_dt.minute == 30

    # Cleanup: delete the 3 we just made
    listed = requests.get(f"{BASE}/api/class-instances", params={"upcoming": False, "include_cancelled": True}).json()
    for i in listed:
        if i["template_id"] == tid and i["start_time"] >= body["first_start"]:
            requests.delete(f"{BASE}/api/admin/class-instances/{i['id']}", headers=headers)


def test_instance_bookings_list():
    headers = _auth()
    # Just check the endpoint contract on any existing instance
    listed = requests.get(f"{BASE}/api/class-instances", params={"upcoming": False}).json()
    if listed:
        iid = listed[0]["id"]
        r = requests.get(f"{BASE}/api/admin/class-instances/{iid}/bookings", headers=headers)
        assert r.status_code == 200
        for b in r.json():
            assert "user_name" in b and "user_email" in b and "status" in b


def test_admin_endpoints_require_auth():
    # Use a valid body so we hit the auth dep, not pydantic
    r = requests.post(
        f"{BASE}/api/admin/class-templates",
        json={"title": "x", "description": "x", "instructor_id": "x",
              "location_type": "online", "style": "x", "level": "all",
              "duration_minutes": 60, "capacity": 1},
    )
    assert r.status_code == 401
    r = requests.delete(f"{BASE}/api/admin/class-instances/nope")
    assert r.status_code == 401
