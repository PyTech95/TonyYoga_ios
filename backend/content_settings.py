"""Validated public content and synchronization between forms and visual editing."""
import re
from copy import deepcopy
from urllib.parse import urlparse
from fastapi import HTTPException
from core import db, gen_id

TESTIMONIALS = [
    {"id": "student-maria", "author": "María Castillo", "role": "Student, Madrid", "quote": "Tony's instruction is unlike anything I've received. He knows every muscle. Twenty years of practice and I've never gone this deep.", "photo": "https://images.unsplash.com/photo-1544005313-94ddf0286df2?w=200&h=200&fit=crop&crop=faces", "video_url": ""},
    {"id": "student-james", "author": "James Ridley", "role": "Perpetual Yogi, Los Angeles", "quote": "The Core 84 program rebuilt my back after a spinal injury. I can't imagine my life without this practice.", "photo": "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=200&h=200&fit=crop&crop=faces", "video_url": ""},
    {"id": "student-sofia", "author": "Sofia Larsen", "role": "Yoga Instructor, Barcelona", "quote": "A week in Málaga with Tony reset everything. I came home a different teacher — and a different person.", "photo": "https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?w=200&h=200&fit=crop&crop=faces", "video_url": ""},
]
FEATURED = {"enabled": True, "video_url": "", "poster_url": "https://images.unsplash.com/photo-1544367567-0f2fcb009e0b?w=1200&h=900&fit=crop", "name": "María Castillo", "role": "Student, Madrid", "headline": '"Tony gave me a practice I actually keep."'}
IMAGE_SLOTS = {
    "hero", "story", "app_cta", "teacher_training", "private_session", "tony_portrait", "app_home",
    "tt_page_hero", "tt_page_group", "library_1", "library_2", "library_3", "library_4", "hero_video",
}
CONTENT_KEYS = {"testimonials", "hero_testimonial", "site_images"}


def safe_url(value, *, link=False):
    if not isinstance(value, str) or len(value) > 3000:
        raise HTTPException(422, "Please enter a valid URL.")
    value = value.strip()
    if not value:
        return value
    if any(ord(c) < 32 for c in value) or "\\" in value:
        raise HTTPException(422, "Please enter a valid URL.")
    try:
        parsed = urlparse(value)
    except ValueError:
        raise HTTPException(422, "Please enter a valid URL.")
    valid = (value.startswith("/") and not value.startswith("//")) or (parsed.scheme in {"https", "http"} and bool(parsed.netloc) and not parsed.username and not parsed.password)
    if link:
        valid = valid or value.startswith("#") or parsed.scheme in {"mailto", "tel"}
    if not valid:
        raise HTTPException(422, "Use an http(s) URL or a local page/file path.")
    return value


def content_defaults(settings):
    settings["hero_testimonial"] = {**FEATURED, **(settings.get("hero_testimonial") or {})}
    settings["testimonials"] = [{**row, "id": row.get("id") or f"legacy-{i}", "video_url": row.get("video_url", "")} for i, row in enumerate(settings.get("testimonials") or [])]
    return settings


def validate_content(update):
    for key in CONTENT_KEYS.intersection(update):
        value = deepcopy(update[key])
        if key == "testimonials":
            if not isinstance(value, list) or len(value) > 100:
                raise HTTPException(422, "Provide up to 100 testimonials.")
            seen = set()
            for row in value:
                if not isinstance(row, dict):
                    raise HTTPException(422, "Invalid testimonial.")
                row["id"] = row.get("id") or gen_id()
                if not isinstance(row["id"], str) or not re.fullmatch(r"[\w-]{1,80}", row["id"]) or row["id"] in seen:
                    raise HTTPException(422, "Testimonial IDs must be unique.")
                seen.add(row["id"])
                for field in ("quote", "author", "role"):
                    if not isinstance(row.get(field, ""), str) or len(row.get(field, "")) > 4000:
                        raise HTTPException(422, "Testimonial text is too long or invalid.")
                    row[field] = row.get(field, "").strip()
                if not row["quote"] or not row["author"]:
                    raise HTTPException(422, "Each testimonial needs a quote and student name.")
                for field in ("photo", "video_url"):
                    row[field] = safe_url(row.get(field, ""))
        elif key == "hero_testimonial":
            if not isinstance(value, dict):
                raise HTTPException(422, "Invalid featured testimonial.")
            if "enabled" in value and not isinstance(value["enabled"], bool):
                raise HTTPException(422, "Featured visibility must be true or false.")
            for field in ("video_url", "poster_url"):
                if field in value:
                    value[field] = safe_url(value[field])
            for field in ("name", "role", "headline"):
                if field in value and (not isinstance(value[field], str) or len(value[field]) > 4000):
                    raise HTTPException(422, "Invalid featured testimonial text.")
        else:
            if not isinstance(value, dict) or len(value) > 50:
                raise HTTPException(422, "Invalid image settings.")
            # "off" switches the homepage hero video off; every other value is a link.
            value = {k: ("off" if k == "hero_video" and v == "off" else safe_url(v)) for k, v in value.items()}
        update[key] = value


async def clear_content_overrides(keys):
    for key in CONTENT_KEYS.intersection(keys):
        await db.page_edits.delete_many({"route": "/", "selector": {"$regex": r'^\[data-cms="' + key + ':'}})


async def sync_published_content(doc):
    """Only explicit public-content bindings may update structured settings."""
    if doc["route"] != "/":
        return
    match = re.fullmatch(r'\[data-cms="([\w:-]+)"\]', doc["selector"])
    if not match:
        return
    parts = match[1].split(":")
    key, field = parts[0], parts[-1]
    if key not in CONTENT_KEYS:
        return
    prop = "src" if field in {"photo", "poster_url"} or key == "site_images" or (field == "video_url" and doc.get("kind") == "video") else "href" if field == "video_url" else "text"
    draft = doc.get("draft") or {}
    if prop not in draft:
        return
    from routers.settings import get_all_settings
    settings = await get_all_settings()
    value = deepcopy(settings[key])
    if key == "testimonials" and len(parts) == 3 and field in {"quote", "author", "role", "photo", "video_url"}:
        row = next((row for row in value if row["id"] == parts[1]), None)
        if row is None:
            raise HTTPException(409, "This testimonial was removed. Reload the page.")
        row[field] = draft[prop]
    elif key == "hero_testimonial" and len(parts) == 2 and field in FEATURED and field != "enabled":
        value[field] = draft[prop]
        if field == "video_url" and "poster" in draft:
            value["poster_url"] = draft["poster"]
    elif key == "site_images" and len(parts) == 2 and field in IMAGE_SLOTS:
        value[field] = draft[prop]
    else:
        return
    update = {key: value}
    validate_content(update)
    await db.app_settings.update_one({"_id": "global"}, {"$set": update}, upsert=True)