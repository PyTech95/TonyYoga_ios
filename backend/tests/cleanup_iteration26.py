"""Cleanup for iteration 26 test artifacts (TEST_ gift cards, test submissions, test lesson)."""
from dotenv import dotenv_values
from pymongo import MongoClient

env = dotenv_values("/app/backend/.env")
cli = MongoClient(env["MONGO_URL"])
db = cli[env["DB_NAME"]]

gc = db.gift_cards.delete_many({"note": {"$regex": "^TEST_iter26"}})
subs = db.assignment_submissions.delete_many({"note": {"$regex": "^TEST_iter26"}})
lessons = db.program_lessons.find({}, {"id": 1, "video_id": 1})
vids = {v["id"]: v for v in db.videos.find({"title": {"$regex": "^TEST_iter26"}}, {"id": 1})}
removed_lessons = 0
for l in list(lessons):
    if l.get("video_id") in vids:
        db.program_lessons.delete_one({"id": l["id"]})
        removed_lessons += 1
v = db.videos.delete_many({"title": {"$regex": "^TEST_iter26"}})
# drop submissions pointing at deleted test lessons
orphans = db.assignment_submissions.delete_many({"video_url": "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
                                                 "note": None})
print("gift_cards:", gc.deleted_count, "submissions:", subs.deleted_count,
      "orphan_subs:", orphans.deleted_count, "lessons:", removed_lessons, "videos:", v.deleted_count)
cli.close()
