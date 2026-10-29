"""Admin "Needs attention" inbox: everything waiting for Tony's team, in one call."""
from datetime import timedelta

from fastapi import Request

from core import api, db, now_utc, require_role


@api.get("/admin/inbox")
async def admin_inbox(request: Request):
    await require_role(request, ["admin"])
    now = now_utc()
    now_iso = now.isoformat()
    day_end = (now.replace(hour=0, minute=0, second=0, microsecond=0) + timedelta(days=1)).isoformat()
    recent = (now - timedelta(days=3)).isoformat()
    week = (now + timedelta(days=7)).isoformat()
    unconfirmed = await db.payment_transactions.count_documents({"payment_status": {"$nin": ["paid", "refunded", "partially_refunded"]}, "status": {"$nin": ["expired", "cancelled", "failed"]},
                                                                 "created_at": {"$gte": recent, "$lte": (now - timedelta(minutes=10)).isoformat()}})
    today = await db.class_instances.find({"start_time": {"$gte": now_iso, "$lt": day_end}, "status": {"$ne": "cancelled"}},
                                          {"_id": 0, "id": 1, "title": 1, "start_time": 1, "capacity": 1}).sort("start_time", 1).to_list(50)
    for c in today:
        c["booked"] = await db.bookings.count_documents({"class_instance_id": c["id"], "status": "confirmed"})
        c["waitlist"] = await db.bookings.count_documents({"class_instance_id": c["id"], "status": "waitlist"})
    items = [
        {"key": "payments", "label": "Payments waiting for confirmation", "count": unconfirmed, "tab": "students", "view": "payments"},
        {"key": "past_due", "label": "Members whose card renewal failed", "count": await db.subscriptions.count_documents({"status": "past_due"}), "tab": "students"},
        {"key": "withdrawals", "label": "EU withdrawal requests", "count": await db.withdrawals.count_documents({"status": "received"}), "tab": "students", "view": "withdrawals"},
        {"key": "ending", "label": "Memberships ending in 7 days", "count": await db.subscriptions.count_documents(
            {"status": {"$in": ["active", "trialing"]}, "end_date": {"$gt": now_iso, "$lte": week}, "stripe_subscription_id": {"$in": [None, ""]}}), "tab": "students"},
        {"key": "questions", "label": "Course questions to answer", "count": await db.lesson_questions.count_documents({"status": "open", "hidden": {"$ne": True}}), "tab": "learning"},
        {"key": "reviews", "label": "Posture videos to review", "count": await db.assignment_submissions.count_documents({"status": "pending_review"}), "tab": "learning"},
        {"key": "hotel_apps", "label": "Hotel applications", "count": await db.hotel_partners.count_documents({"status": "applied"}), "tab": "hotels"},
        {"key": "hotel_requests", "label": "Hotel programme requests to quote", "count": await db.hotel_stays.count_documents({"status": "requested"}), "tab": "hotels"},
        {"key": "teacher_apps", "label": "Teacher applications", "count": await db.teachers.count_documents({"status": "applied"}), "tab": "teachers"},
        {"key": "orders", "label": "Shop orders to send", "count": await db.orders.count_documents({"status": {"$in": ["paid", "processing"]}}), "tab": "orders"},
    ]
    return {"items": items, "total": sum(i["count"] for i in items if i["key"] != "ending"), "classes_today": today}
