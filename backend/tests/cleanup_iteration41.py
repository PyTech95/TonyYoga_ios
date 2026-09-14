"""Purge iteration-41 pending test orders + verify auth playbook basics (bcrypt hash format)."""
import asyncio
import os
from pathlib import Path

from dotenv import dotenv_values
from motor.motor_asyncio import AsyncIOMotorClient

env = dotenv_values("/app/backend/.env")
MONGO_URL = os.environ.get("MONGO_URL") or env.get("MONGO_URL")
DB_NAME = os.environ.get("DB_NAME") or env.get("DB_NAME")


async def main():
    client = AsyncIOMotorClient(MONGO_URL)
    db = client[DB_NAME]
    p = Path("/app/test_reports/iter41_orders.txt")
    ids = [x.strip() for x in p.read_text().splitlines() if x.strip()] if p.exists() else []
    if ids:
        res = await db.orders.delete_many({"id": {"$in": ids}, "status": "pending"})
        print(f"deleted {res.deleted_count} test orders")
    print("asanas count:", await db.asanas.count_documents({}))
    print("TEST_ asanas left:", await db.asanas.count_documents({"name": {"$regex": "^TEST_"}}))
    admin = await db.users.find_one({"email": "tony@tonyyoga.com"})
    ph = (admin or {}).get("password_hash") or (admin or {}).get("hashed_password") or ""
    print("admin role:", (admin or {}).get("role"), "| hash prefix:", ph[:4], "| len:", len(ph))


asyncio.run(main())
