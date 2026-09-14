"""Remove test-injected secrets from app_settings so real env fallbacks apply again."""
import asyncio, os
from motor.motor_asyncio import AsyncIOMotorClient
from dotenv import dotenv_values

env = {**dotenv_values("/app/backend/.env"), **os.environ}


async def main():
    client = AsyncIOMotorClient(env["MONGO_URL"])
    db = client[env["DB_NAME"]]
    res = await db.app_settings.update_one(
        {"_id": "global"},
        {"$unset": {"stripe_secret_key": "", "stripe_webhook_secret": "", "smtp_password": "",
                    "smtp_user": "", "sender_email": ""}},
    )
    doc = await db.app_settings.find_one({"_id": "global"})
    print("modified:", res.modified_count)
    print({k: v for k, v in doc.items() if k.startswith(("stripe", "smtp", "sender", "email_", "push_", "vapid_public"))})


asyncio.run(main())
