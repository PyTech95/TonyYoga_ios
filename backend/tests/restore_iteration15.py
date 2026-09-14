"""Restore state after iteration 15 testing (instructor classes + regression booking)."""
from dotenv import dotenv_values
from pymongo import MongoClient

env = dotenv_values("/app/backend/.env")
db = MongoClient(env["MONGO_URL"])[env["DB_NAME"]]

inst = db.users.find_one({"email": "instructor@demo.com"})
r = db.class_instances.update_many({"instructor_id": inst["id"], "status": "cancelled"},
                                   {"$set": {"status": "scheduled"}, "$unset": {"cancelled_reason": ""}})
print("instructor classes restored:", r.modified_count)

student = db.users.find_one({"email": "student@demo.com"})
b = db.bookings.delete_one({"user_id": student["id"], "class_instance_id": "19dbefe8-7c3f-4e0f-abec-8f6dbcd69aea"})
print("regression booking removed:", b.deleted_count)
db.class_instances.update_one({"id": "19dbefe8-7c3f-4e0f-abec-8f6dbcd69aea"}, {"$set": {"bookings_count": 0}})
