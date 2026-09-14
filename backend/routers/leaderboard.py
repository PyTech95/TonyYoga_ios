"""Community leaderboard — engagement ranking (privacy-aware, opt-out via settings).

Points blend the four engagement signals we already track:
  completed lessons, class attendance, certificates earned, and longest streak.
Only first names are exposed; user ids are never returned to the client.
"""
from typing import Optional
from fastapi import Depends

from core import api, db, get_optional_user

POINTS = {"lesson": 10, "attendance": 8, "certificate": 50, "streak_day": 3}


def _first_name(name: Optional[str], email: Optional[str]) -> str:
    if name and name.strip():
        return name.strip().split(" ")[0]
    return (email or "yogi").split("@")[0]


@api.get("/leaderboard")
async def leaderboard(user: Optional[dict] = Depends(get_optional_user), limit: int = 25):
    settings = await db.app_settings.find_one({"_id": "global"}, {"_id": 0, "leaderboard_enabled": 1}) or {}
    if settings.get("leaderboard_enabled") is False:
        return {"enabled": False, "rows": [], "me": None, "total": 0}

    async def _count_by_user(coll, match):
        rows = await db[coll].aggregate([
            {"$match": match},
            {"$group": {"_id": "$user_id", "n": {"$sum": 1}}},
        ]).to_list(10000)
        return {r["_id"]: r["n"] for r in rows}

    lessons_map = await _count_by_user("watch_progress", {"completed": True})
    att_map = await _count_by_user("bookings", {"status": {"$in": ["confirmed", "attended"]}})
    cert_map = await _count_by_user("certificates", {})
    streaks = await db.practice_streaks.find({}, {"_id": 0, "user_id": 1, "longest_streak": 1}).to_list(10000)
    streak_map = {s["user_id"]: int(s.get("longest_streak") or 0) for s in streaks}

    users = await db.users.find(
        {"role": {"$nin": ["admin", "instructor", "support"]}},
        {"_id": 0, "id": 1, "name": 1, "email": 1},
    ).to_list(10000)

    rows = []
    for u in users:
        uid = u["id"]
        lessons = lessons_map.get(uid, 0)
        att = att_map.get(uid, 0)
        certs = cert_map.get(uid, 0)
        longest = streak_map.get(uid, 0)
        points = (lessons * POINTS["lesson"] + att * POINTS["attendance"]
                  + certs * POINTS["certificate"] + longest * POINTS["streak_day"])
        if points <= 0:
            continue
        rows.append({
            "uid": uid,
            "name": _first_name(u.get("name"), u.get("email")),
            "lessons": lessons, "attendance": att, "certificates": certs,
            "longest_streak": longest, "points": points,
        })
    rows.sort(key=lambda r: r["points"], reverse=True)
    for i, r in enumerate(rows):
        r["rank"] = i + 1

    me = None
    if user:
        found = next((r for r in rows if r["uid"] == user["id"]), None)
        if found:
            me = {**found, "is_me": True}
            me.pop("uid", None)

    top = []
    for r in rows[:max(1, min(limit, 100))]:
        top.append({
            "rank": r["rank"], "name": r["name"], "points": r["points"],
            "lessons": r["lessons"], "attendance": r["attendance"],
            "certificates": r["certificates"], "longest_streak": r["longest_streak"],
            "is_me": bool(user and r["uid"] == user["id"]),
        })
    return {"enabled": True, "rows": top, "me": me, "total": len(rows)}
