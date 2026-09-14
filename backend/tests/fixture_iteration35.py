"""Seed/cleanup helper for iteration 35 frontend tests."""
import sys
from datetime import datetime, timezone, timedelta
from dotenv import dotenv_values
from pymongo import MongoClient

env = dotenv_values("/app/backend/.env")
db = MongoClient(env["MONGO_URL"])[env["DB_NAME"]]

WID = "d133c455-feec-4665-952f-cbcc8825f835"
student = db.users.find_one({"email": "student@demo.com"})
uid = student["id"]
now = datetime.now(timezone.utc)

if sys.argv[1] == "seed_paid":
    db.workshop_registrations.delete_many({"user_id": uid, "workshop_id": WID})
    w = db.workshops.find_one({"id": WID})
    doc = {
        "id": "TEST_ui_paid_reg",
        "user_id": uid, "workshop_id": WID,
        "workshop_title": w["title"], "workshop_start_date": w["start_date"],
        "name": "Demo Student", "email": "student@demo.com",
        "total_eur": 1600.0, "deposit_eur": 500.0, "balance_eur": 1100.0,
        "balance_due_date": (datetime.fromisoformat(str(w["start_date"])) - timedelta(days=30)).isoformat(),
        "status": "deposit_paid", "deposit_paid_at": now.isoformat(),
        "created_at": now.isoformat(),
    }
    db.workshop_registrations.insert_one(doc)
    print("seeded deposit_paid reg TEST_ui_paid_reg")
elif sys.argv[1] == "seed_paid_near":
    db.workshop_registrations.delete_many({"user_id": uid, "workshop_id": WID})
    w = db.workshops.find_one({"id": WID})
    db.workshop_registrations.insert_one({
        "id": "TEST_ui_near_reg", "user_id": uid, "workshop_id": WID,
        "workshop_title": w["title"], "workshop_start_date": (now + timedelta(days=20)).isoformat(),
        "name": "Demo Student", "email": "student@demo.com",
        "total_eur": 1600.0, "deposit_eur": 500.0, "balance_eur": 1100.0,
        "balance_due_date": (now + timedelta(days=5)).isoformat(),
        "status": "deposit_paid", "created_at": now.isoformat(),
    })
    print("seeded near-date deposit_paid reg TEST_ui_near_reg")
elif sys.argv[1] == "seed_offer":
    db.workshop_registrations.delete_many({"user_id": uid, "workshop_id": WID})
    w = db.workshops.find_one({"id": WID})
    db.workshop_registrations.insert_one({
        "id": "TEST_ui_offer_reg", "user_id": uid, "workshop_id": WID,
        "workshop_title": w["title"], "workshop_start_date": w["start_date"],
        "name": "Demo Student", "email": "student@demo.com",
        "status": "seat_offered", "seat_offered_at": now.isoformat(),
        "seat_offer_expires_at": (now + timedelta(hours=48)).isoformat(),
        "created_at": now.isoformat(),
    })
    print("seeded seat_offered reg")
elif sys.argv[1] == "status":
    for r in db.workshop_registrations.find({"user_id": uid, "workshop_id": WID}, {"_id": 0, "id": 1, "status": 1, "refund_status": 1}):
        print(r)
elif sys.argv[1] == "clean":
    res = db.workshop_registrations.delete_many({"user_id": uid, "workshop_id": WID})
    db.workshop_registrations.delete_many({"id": {"$regex": "^TEST_"}})
    print("deleted", res.deleted_count)
