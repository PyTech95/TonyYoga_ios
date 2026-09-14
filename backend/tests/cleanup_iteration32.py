"""Remove TEST_ ai_leads seeded during iteration 32."""
import asyncio
from dotenv import dotenv_values
from motor.motor_asyncio import AsyncIOMotorClient

env = dotenv_values("/app/backend/.env")


async def main():
    cl = AsyncIOMotorClient(env["MONGO_URL"])
    db = cl[env["DB_NAME"]]
    res = await db.ai_leads.delete_many({"name": {"$regex": "^TEST_"}})
    print(f"deleted ai_leads: {res.deleted_count}")
    print(f"remaining ai_leads: {await db.ai_leads.count_documents({})}")
    cl.close()


asyncio.run(main())
