"""Student self-service extras: payment history with printable receipts, and practice stats."""
from datetime import timedelta

from fastapi import Depends, HTTPException, Response

from core import api, db, get_current_user, now_utc
from routers.settings import get_setting

PAID = ("paid", "refunded", "partially_refunded")


@api.get("/me/payments")
async def my_payments(user: dict = Depends(get_current_user)):
    from routers.payments import _receipt_description
    rows = await db.payment_transactions.find({"user_id": user["id"], "payment_status": {"$in": list(PAID)}}, {"_id": 0}).sort("completed_at", -1).to_list(500)
    out = []
    for t in rows:
        out.append({"id": t["id"], "description": await _receipt_description(t), "amount": t.get("amount"), "currency": t.get("currency"),
                    "credit_applied": t.get("credit_applied") or 0, "paid_at": t.get("completed_at") or t.get("created_at"),
                    "provider": t.get("provider") or "stripe", "status": t.get("payment_status"), "refunded_amount": t.get("refunded_amount") or 0,
                    "receipt_number": f"TY-{str(t['id'])[:8].upper()}", "item_type": t.get("item_type")})
    pending = await db.payment_transactions.count_documents({"user_id": user["id"], "payment_status": {"$nin": list(PAID)},
                                                             "status": {"$nin": ["expired", "cancelled", "failed"]},
                                                             "created_at": {"$gte": (now_utc() - timedelta(days=3)).isoformat()}})
    totals = {}
    for r in out:
        cur = str(r["currency"] or "eur").upper()
        totals[cur] = round(totals.get(cur, 0) + float(r["amount"] or 0) - float(r["refunded_amount"] or 0), 2)
    credit = (await db.users.find_one({"id": user["id"]}, {"_id": 0, "store_credit": 1}) or {}).get("store_credit") or 0
    return {"payments": out, "pending": pending, "totals": totals, "store_credit": round(float(credit), 2)}


@api.get("/me/payments/{txn_id}/receipt")
async def my_receipt(txn_id: str, user: dict = Depends(get_current_user)):
    t = await db.payment_transactions.find_one({"id": txn_id}, {"_id": 0})
    if not t or (t.get("user_id") != user["id"] and user.get("role") != "admin") or t.get("payment_status") not in PAID:
        raise HTTPException(404, "Receipt not found")
    from routers.payments import _receipt_description
    buyer = await db.users.find_one({"id": t["user_id"]}, {"_id": 0, "name": 1, "email": 1}) or {}
    return {"number": f"TY-{str(t['id'])[:8].upper()}", "date": (t.get("completed_at") or t.get("created_at") or "")[:10],
            "seller": {"name": await get_setting("invoice_business_name") or "Tony Yoga", "address": await get_setting("invoice_business_address") or "",
                       "tax_id": await get_setting("invoice_tax_id") or "", "footer": await get_setting("invoice_footer") or ""},
            "buyer": {"name": buyer.get("name"), "email": buyer.get("email")},
            "description": await _receipt_description(t), "quantity": t.get("quantity") or 1, "amount": t.get("amount"), "currency": t.get("currency"),
            "credit_applied": t.get("credit_applied") or 0, "provider": t.get("provider") or "stripe", "status": t.get("payment_status"),
            "refunds": t.get("refunds") or [], "refunded_amount": t.get("refunded_amount") or 0}


@api.get("/me/stats")
async def my_stats(user: dict = Depends(get_current_user)):
    """Practice history for the profile: classes, videos, minutes, streak, certificates, last 6 months."""
    uid = user["id"]
    now = now_utc()
    months = []
    for back in range(5, -1, -1):  # this month and the five before it
        mm, yy = now.month - back, now.year
        while mm <= 0:
            mm, yy = mm + 12, yy - 1
        months.append(f"{yy:04d}-{mm:02d}")
    attended = await db.bookings.find({"user_id": uid, "check_in_flag": True}, {"_id": 0, "checked_in_at": 1, "created_at": 1}).to_list(10000)
    watched = await db.watch_progress.find({"user_id": uid}, {"_id": 0, "seconds": 1, "completed": 1, "updated_at": 1, "video_id": 1}).to_list(20000)
    vids = {v["id"]: v for v in await db.videos.find({"id": {"$in": [w["video_id"] for w in watched]}}, {"_id": 0, "id": 1, "duration_minutes": 1}).to_list(20000)}
    minutes = 0
    by_month = {m: {"month": m, "classes": 0, "videos": 0, "minutes": 0} for m in months}
    for w in watched:
        mins = (vids.get(w["video_id"]) or {}).get("duration_minutes") or 0
        m = round(float(w.get("seconds") or 0) / 60) if w.get("seconds") else (mins if w.get("completed") else 0)
        if w.get("completed") and mins:
            m = max(m, mins)
        minutes += m
        key = str(w.get("updated_at") or "")[:7]
        if key in by_month:
            by_month[key]["minutes"] += m
            by_month[key]["videos"] += 1 if w.get("completed") else 0
    for a in attended:
        key = str(a.get("checked_in_at") or a.get("created_at") or "")[:7]
        if key in by_month:
            by_month[key]["classes"] += 1
    streak = await db.practice_streaks.find_one({"user_id": uid}, {"_id": 0, "current_streak": 1, "longest_streak": 1, "total_practice_days": 1}) or {}
    return {"classes_attended": len(attended), "videos_completed": sum(1 for w in watched if w.get("completed")), "minutes": minutes,
            "streak": streak.get("current_streak", 0), "longest_streak": streak.get("longest_streak", 0),
            "certificates": await db.certificates.count_documents({"user_id": uid}),
            "lessons_done": await db.lesson_completions.count_documents({"user_id": uid}), "months": [by_month[m] for m in months]}


from pydantic import BaseModel, Field  # noqa: E402


class PasswordChange(BaseModel):
    current_password: str = Field(min_length=1, max_length=200)
    new_password: str = Field(min_length=8, max_length=128)


@api.post("/me/password")
async def change_password(payload: PasswordChange, response: Response, user: dict = Depends(get_current_user)):
    """Change my password (signs out my other devices). Returns a fresh sign-in token."""
    from core import create_access_token, hash_password, verify_password
    full = await db.users.find_one({"id": user["id"]}, {"_id": 0, "password_hash": 1, "email": 1, "role": 1})
    if not full or not full.get("password_hash") or not verify_password(payload.current_password, full["password_hash"]):
        raise HTTPException(400, "Your current password isn't right.")
    if payload.current_password == payload.new_password:
        raise HTTPException(422, "Choose a new password that is different from the current one.")
    await db.users.update_one({"id": user["id"]}, {"$set": {"password_hash": hash_password(payload.new_password), "password_changed_at": now_utc().isoformat()}})
    await db.member_audit.insert_one({"id": __import__("uuid").uuid4().hex, "user_id": user["id"], "action": "profile", "details": "password changed by the member",
                                      "at": now_utc().isoformat()})
    token = create_access_token(user["id"], full["email"], full.get("role") or "student")
    response.set_cookie("access_token", token, httponly=True, samesite="lax", max_age=7 * 86400, path="/")
    return {"ok": True, "token": token}
