"""Cleanup iteration-48 test users, their transactions and test gift cards."""
import asyncio, sys
sys.path.insert(0, "/app/backend")


async def main():
    from routers.payments import db
    users = [u async for u in db.users.find({"email": {"$regex": "qatest48.com$"}}, {"_id": 0, "id": 1, "email": 1})]
    ids = [u["id"] for u in users]
    t = await db.payment_transactions.delete_many({"user_id": {"$in": ids}})
    u = await db.users.delete_many({"id": {"$in": ids}})
    print(f"deleted users={u.deleted_count} txns={t.deleted_count} emails={[x['email'] for x in users]}")

asyncio.run(main())
