"""Cleanup / state-restore for iteration 15 testing."""
from dotenv import dotenv_values
from pymongo import MongoClient

env = dotenv_values("/app/backend/.env")
client = MongoClient(env["MONGO_URL"])
db = client[env["DB_NAME"]]

emails = ["test_csv1@example.com", "test_csv2@example.com", "test_ui1@example.com",
          "test_ui2@example.com", "test_reset_iter15@example.com"]
print("users removed:", db.users.delete_many({"email": {"$in": emails}}).deleted_count)
print("test classes removed:", db.class_instances.delete_many({"title": {"$regex": "^TEST_"}}).deleted_count)
print("test batches removed:", db.import_batches.delete_many({"name": {"$regex": "^TEST_"}}).deleted_count)
print("reset tokens removed:", db.password_reset_tokens.delete_many({"user_id": {"$exists": True}, "used": True}).deleted_count)

# restore instructor classes cancelled during testing
inst = db.users.find_one({"email": "instructor@demo.com"})
if inst:
    r = db.class_instances.update_many(
        {"instructor_id": inst["id"], "status": "cancelled", "cancelled_reason": "instructor_cancelled"},
        {"$set": {"status": "scheduled"}, "$unset": {"cancelled_reason": ""}})
    print("instructor classes restored:", r.modified_count)

# cancel the booking created by the UI regression test
student = db.users.find_one({"email": "student@demo.com"})
if student:
    cls = db.class_instances.find_one({"title": "Therapeutic Back Care"})
    if cls:
        r = db.bookings.delete_many({"user_id": student["id"], "class_instance_id": cls["id"], "status": "confirmed"})
        print("regression bookings removed:", r.deleted_count)
        db.class_instances.update_one({"id": cls["id"]}, {"$set": {"bookings_count": 0}})
client.close()
