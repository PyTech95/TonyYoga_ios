import asyncio
import os

from dotenv import load_dotenv
from motor.motor_asyncio import AsyncIOMotorClient

load_dotenv("/app/backend/.env")


async def main():
    c = AsyncIOMotorClient(os.environ["MONGO_URL"])
    db = c[os.environ["DB_NAME"]]
    print("social_whatsapp:", await db.settings.find_one({"key": "social_whatsapp"}, {"_id": 0}))
    print("assistant settings:", await db.settings.find({"key": {"$regex": "assistant"}}, {"_id": 0}).to_list(10))
    print("TEST leads:", await db.ai_leads.count_documents({"name": {"$regex": "^TEST_"}}))
    r = await db.ai_leads.delete_many({"name": {"$regex": "^TEST_"}})
    print("deleted test leads:", r.deleted_count)
    books = await db.products.find({"category": "books"}, {"_id": 0, "title": 1, "price": 1, "images": 1}).to_list(10)
    for b in books:
        print("BOOK", b["title"], b["price"], len(b.get("images") or []))


asyncio.run(main())
