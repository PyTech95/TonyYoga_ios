"""News / Blog / Events posts.

Public:
    GET  /news                    List published posts (paginated, newest first)
    GET  /news/{slug}             Fetch a single published post
Admin:
    GET  /admin/news              List all posts including drafts
    POST /admin/news              Create a post
    PATCH /admin/news/{post_id}   Update fields
    DELETE /admin/news/{post_id}  Delete
"""
import re
from typing import Any, Dict, Optional
from fastapi import HTTPException, Request

from core import api, db, now_utc, gen_id, require_role


def _slugify(title: str) -> str:
    """Turn 'Tony's Spring Retreat!' into 'tonys-spring-retreat'."""
    s = re.sub(r"[^\w\s-]", "", title.lower()).strip()
    s = re.sub(r"[\s_]+", "-", s)
    return s[:80] or "post"


async def _unique_slug(base: str, ignore_id: Optional[str] = None) -> str:
    """Append -2, -3, ... until unique."""
    slug = base
    i = 2
    while True:
        query: Dict[str, Any] = {"slug": slug}
        if ignore_id:
            query["id"] = {"$ne": ignore_id}
        if not await db.news_posts.find_one(query):
            return slug
        slug = f"{base}-{i}"
        i += 1


# ------------------- Public -------------------
@api.get("/news")
async def list_news(limit: int = 50, tag: Optional[str] = None):
    query: Dict[str, Any] = {"is_published": True}
    if tag:
        query["tags"] = tag
    rows = await (db.news_posts.find(query, {"_id": 0})
                  .sort("published_at", -1)
                  .limit(min(limit, 100))
                  .to_list(100))
    return rows


@api.get("/news/{slug}")
async def get_news(slug: str):
    post = await db.news_posts.find_one({"slug": slug, "is_published": True}, {"_id": 0})
    if not post:
        raise HTTPException(404, "Post not found")
    return post


# ------------------- Admin -------------------
@api.get("/admin/news")
async def admin_list_news(request: Request):
    await require_role(request, ["admin"])
    return await db.news_posts.find({}, {"_id": 0}).sort("created_at", -1).to_list(500)


@api.post("/admin/news")
async def admin_create_news(payload: Dict[str, Any], request: Request):
    user = await require_role(request, ["admin"])
    title = (payload.get("title") or "").strip()
    if not title:
        raise HTTPException(400, "Title required")
    slug = await _unique_slug(_slugify(payload.get("slug") or title))
    now = now_utc().isoformat()
    doc = {
        "id": gen_id(),
        "slug": slug,
        "title": title,
        "excerpt": payload.get("excerpt", "")[:400],
        "body": payload.get("body", ""),
        "cover_image": payload.get("cover_image", ""),
        "category": payload.get("category", "news"),  # news | blog | event
        "tags": payload.get("tags", []),
        "event_date": payload.get("event_date"),  # ISO string, optional (only for category=event)
        "event_location": payload.get("event_location", ""),
        "is_published": bool(payload.get("is_published", False)),
        "published_at": now if payload.get("is_published") else None,
        "author_id": user["id"],
        "author_name": user.get("name", "Tony Sanchez"),
        "created_at": now,
    }
    await db.news_posts.insert_one(doc)
    doc.pop("_id", None)
    return doc


@api.patch("/admin/news/{post_id}")
async def admin_patch_news(post_id: str, payload: Dict[str, Any], request: Request):
    await require_role(request, ["admin"])
    allowed = {"title", "slug", "excerpt", "body", "cover_image", "category",
               "tags", "event_date", "event_location", "is_published"}
    update = {k: v for k, v in payload.items() if k in allowed}
    if not update:
        return {"updated": 0}
    # Auto-slug when title changes and slug not overridden
    if "slug" in update:
        update["slug"] = await _unique_slug(_slugify(update["slug"]), ignore_id=post_id)
    # If flipping to published for the first time, set published_at
    existing = await db.news_posts.find_one({"id": post_id})
    if not existing:
        raise HTTPException(404, "Post not found")
    if update.get("is_published") and not existing.get("published_at"):
        update["published_at"] = now_utc().isoformat()
    await db.news_posts.update_one({"id": post_id}, {"$set": update})
    return {"updated": len(update)}


@api.delete("/admin/news/{post_id}")
async def admin_delete_news(post_id: str, request: Request):
    await require_role(request, ["admin"])
    res = await db.news_posts.delete_one({"id": post_id})
    if res.deleted_count == 0:
        raise HTTPException(404, "Post not found")
    return {"deleted": 1}
