from dotenv import dotenv_values
from pymongo import MongoClient
env = dotenv_values("/app/backend/.env")
db = MongoClient(env["MONGO_URL"])[env["DB_NAME"]]
s = db.app_settings.find_one({}, {"_id": 0})
if s:
    print({k: v for k, v in s.items() if "stripe" in k})
for a in db.settings_audit.find({}, {"_id": 0}).sort("at", -1).limit(6):
    print(a)
