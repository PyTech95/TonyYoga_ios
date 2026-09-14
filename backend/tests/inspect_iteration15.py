from dotenv import dotenv_values
from pymongo import MongoClient
env = dotenv_values("/app/backend/.env")
db = MongoClient(env["MONGO_URL"])[env["DB_NAME"]]
inst = db.users.find_one({"email": "instructor@demo.com"})
for c in db.class_instances.find({"instructor_id": inst["id"]}, {"_id": 0, "title": 1, "status": 1, "cancelled_reason": 1, "start_time": 1}):
    print(c)
student = db.users.find_one({"email": "student@demo.com"})
for b in db.bookings.find({"user_id": student["id"]}, {"_id": 0, "class_instance_id": 1, "status": 1, "created_at": 1}):
    print(b)
