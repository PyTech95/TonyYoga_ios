import asyncio, json, os
from dotenv import dotenv_values
from motor.motor_asyncio import AsyncIOMotorClient

env = dotenv_values("/app/backend/.env")

async def main():
    cli = AsyncIOMotorClient(env["MONGO_URL"])
    db = cli[env["DB_NAME"]]
    u = await db.users.find_one({"email": "student@demo.com"}, {"_id": 0, "password_hash": 0})
    print(json.dumps({k: v for k, v in u.items() if k in ("id","email","store_credit","membership_plan_id","membership_status","membership_expires_at","level","quiz_result","role")}, default=str, indent=1))
    subs = await db.app_settings.find_one({"key": "stripe_subscriptions_enabled"}, {"_id": 0})
    print("subs setting:", subs)
    txns = await db.payment_transactions.find({"user_id": u["id"], "provider": "credit"}, {"_id": 0}).sort("created_at", -1).to_list(5)
    for t in txns:
        print("TXN", t.get("item_type"), t.get("item_id"), t.get("amount"), t.get("created_at"))
    ms = await db.memberships.find({"user_id": u["id"]}, {"_id": 0}).sort("created_at", -1).to_list(5) if "memberships" in await db.list_collection_names() else []
    for m in ms:
        print("MEMB", m.get("plan_id"), m.get("status"), m.get("created_at"), m.get("current_period_end"))
    orders = await db.orders.count_documents({"notes": "TEST_iter46"})
    print("test orders:", orders)
    cards = await db.gift_cards.count_documents({"note": "TEST_iter46"})
    print("test cards:", cards)
    cli.close()

asyncio.run(main())
