"""Admin-managed website content: SEO, custom pages (About, Services, …),
packages & prices, and instructor profiles.

Public
    GET  /seo/config                     SEO overrides, verification codes, locations
    GET  /pages                          Published custom pages (for menus)
    GET  /pages/{slug}                   One published custom page
Admin
    GET/PUT  /admin/seo
    GET/POST /admin/pages · PATCH/DELETE /admin/pages/{id}
    GET      /admin/packages · PUT /admin/packages/passes · PUT /admin/packages/teacher-training
    GET      /admin/membership-plans · PATCH/DELETE /admin/membership-plans/{id}
    GET      /admin/team · PATCH /admin/team/{user_id}
    GET/POST /admin/seo/refresh          Re-write the static copy search engines read

Search engines read a pre-rendered HTML copy of every public page (scripts/prerender.mjs).
Set PRERENDER_COMMAND on the server (see VPS_DEPLOYMENT.md) and that copy is refreshed
automatically a few seconds after the admin saves SEO settings, pages or Journal posts.
"""
import asyncio
import logging
import os
import re
from copy import deepcopy
from typing import Any, Dict, List
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from fastapi import HTTPException, Request

from core import api, db, now_utc, gen_id, require_role
from content_settings import safe_url

_logger = logging.getLogger("tony-yoga.cms")

# ---------------------------------------------------------------------------
# Refreshing the pre-rendered pages after admin edits

PRERENDER_COMMAND = os.environ.get("PRERENDER_COMMAND", "").strip()
_refresh = {"task": None, "running": False, "again": False}


async def _run_prerender():
    await db.cms_config.update_one({"_id": "prerender_status"}, {"$set": {"state": "running", "started_at": now_utc().isoformat()}}, upsert=True)
    state, log = "failed", ""
    try:
        proc = await asyncio.create_subprocess_shell(PRERENDER_COMMAND, stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.STDOUT)
        try:
            out, _ = await asyncio.wait_for(proc.communicate(), timeout=600)
            log = out.decode(errors="replace")[-800:]
            state = "ok" if proc.returncode == 0 else "failed"
        except asyncio.TimeoutError:
            proc.kill()
            log = "Stopped after 10 minutes."
    except Exception as e:  # noqa: BLE001 — report, never crash the API
        log = f"Could not start: {type(e).__name__}"
    if state != "ok":
        _logger.warning("Prerender refresh failed: %s", log[-300:])
    await db.cms_config.update_one({"_id": "prerender_status"}, {"$set": {"state": state, "finished_at": now_utc().isoformat(), "log": log}}, upsert=True)


def schedule_prerender(delay: float = 15) -> bool:
    """Refresh the search-engine copy soon. Saves in quick succession share one run."""
    if not PRERENDER_COMMAND:
        return False
    task = _refresh["task"]
    if task and not task.done():
        if _refresh["running"]:
            _refresh["again"] = True  # data changed mid-run: run once more afterwards
        return True

    async def runner():
        await asyncio.sleep(delay)
        while True:
            _refresh["again"] = False
            _refresh["running"] = True
            try:
                await _run_prerender()
            finally:
                _refresh["running"] = False
            if not _refresh["again"]:
                break

    try:
        _refresh["task"] = asyncio.get_running_loop().create_task(runner())
    except RuntimeError:
        return False
    return True


@api.get("/admin/seo/refresh")
async def admin_refresh_status(request: Request):
    await require_role(request, ["admin"])
    doc = await db.cms_config.find_one({"_id": "prerender_status"}, {"_id": 0}) or {}
    return {"configured": bool(PRERENDER_COMMAND), **doc}


@api.post("/admin/seo/refresh")
async def admin_refresh_now(request: Request):
    await require_role(request, ["admin"])
    if not PRERENDER_COMMAND:
        return {"configured": False, "state": "not_configured"}
    schedule_prerender(0)
    return {"configured": True, "state": "queued"}

# ---------------------------------------------------------------------------
# Small validators


def _text(value, max_len: int, label: str, *, required: bool = False) -> str:
    if value is None:
        value = ""
    if not isinstance(value, str):
        raise HTTPException(422, f"{label} must be text.")
    value = value.strip()
    if len(value) > max_len:
        raise HTTPException(422, f"{label} is too long (max {max_len} characters).")
    if required and not value:
        raise HTTPException(422, f"{label} is required.")
    return value


def _bool(value) -> bool:
    return bool(value) if isinstance(value, (bool, int)) else str(value).lower() in {"true", "1", "yes"}


def _num(value, label: str, *, lo: float = 0, hi: float = 1_000_000) -> float:
    try:
        n = float(value)
    except (TypeError, ValueError):
        raise HTTPException(422, f"{label} must be a number.")
    if n < lo or n > hi:
        raise HTTPException(422, f"{label} must be between {lo:g} and {hi:g}.")
    return round(n, 2)


def _list(value, max_items: int, label: str) -> list:
    if value is None:
        return []
    if not isinstance(value, list) or len(value) > max_items:
        raise HTTPException(422, f"{label}: up to {max_items} items.")
    return value


SLUG_RE = re.compile(r"^[a-z0-9]+(?:-[a-z0-9]+)*$")
CURRENCIES = {"eur", "usd", "gbp"}

# ---------------------------------------------------------------------------
# SEO configuration

SEO_ID = "seo"
TOKEN_RE = re.compile(r"^[A-Za-z0-9_\-:.=+/]{0,200}$")
PATH_RE = re.compile(r"^/[a-z0-9\-/]*$")
REGIONS = {"europe", "usa", "world"}


def _clean_location(row: dict) -> dict:
    if not isinstance(row, dict):
        raise HTTPException(422, "Invalid location.")
    slug = _text(row.get("slug"), 60, "Location slug", required=True).lower()
    if not SLUG_RE.match(slug):
        raise HTTPException(422, "Location slug: lowercase letters, numbers and dashes only.")
    tz = _text(row.get("timeZone"), 64, "Time zone", required=True)
    try:
        ZoneInfo(tz)
    except (ZoneInfoNotFoundError, ValueError):
        raise HTTPException(422, f"Unknown time zone: {tz}")
    region = _text(row.get("region") or "world", 10, "Region")
    if region not in REGIONS:
        raise HTTPException(422, "Region must be europe, usa or world.")
    cc = _text(row.get("countryCode"), 2, "Country code").upper()
    out = {
        "slug": slug,
        "city": _text(row.get("city"), 80, "City", required=True),
        "country": _text(row.get("country"), 80, "Country", required=True),
        "countryCode": cc,
        "region": region,
        "timeZone": tz,
        "state": _text(row.get("state"), 80, "State") or None,
        "appLanguage": _text(row.get("appLanguage"), 80, "App language") or None,
    }
    for key, lo, hi in (("lat", -90, 90), ("lon", -180, 180)):
        if row.get(key) not in (None, ""):
            out[key] = _num(row.get(key), key, lo=lo, hi=hi)
    return out


def _clean_seo(payload: Dict[str, Any]) -> Dict[str, Any]:
    if not isinstance(payload, dict):
        raise HTTPException(422, "Invalid SEO settings.")
    g = payload.get("global") or {}
    if not isinstance(g, dict):
        raise HTTPException(422, "Invalid global SEO settings.")
    out_global = {
        "site_name": _text(g.get("site_name"), 80, "Site name"),
        "default_description": _text(g.get("default_description"), 320, "Default description"),
        "default_image": safe_url(g.get("default_image") or ""),
        "google_verification": _text(g.get("google_verification"), 200, "Google verification code"),
        "bing_verification": _text(g.get("bing_verification"), 200, "Bing verification code"),
        "organization_email": _text(g.get("organization_email"), 200, "Contact email"),
        "same_as": [safe_url(u) for u in _list(g.get("same_as"), 12, "Social profiles") if isinstance(u, str) and u.strip()],
    }
    for key in ("google_verification", "bing_verification"):
        # Accept either the bare code or the whole <meta …content="…"> tag pasted from Google/Bing.
        m = re.search(r'content="([^"]+)"', out_global[key])
        if m:
            out_global[key] = m.group(1)
        if not TOKEN_RE.match(out_global[key]):
            raise HTTPException(422, "Paste only the verification code (letters, numbers, - and _).")

    pages_in = payload.get("pages") or {}
    if not isinstance(pages_in, dict) or len(pages_in) > 300:
        raise HTTPException(422, "Invalid page SEO settings.")
    pages = {}
    for path, row in pages_in.items():
        if not isinstance(path, str) or not PATH_RE.match(path) or len(path) > 120 or not isinstance(row, dict):
            raise HTTPException(422, f"Invalid page path: {path}")
        clean = {
            "title": _text(row.get("title"), 120, "Page title"),
            "description": _text(row.get("description"), 320, "Page description"),
            "image": safe_url(row.get("image") or ""),
            "noindex": _bool(row.get("noindex", False)),
        }
        if any(clean.values()):
            pages[path] = clean

    loc_in = payload.get("locations") or {}
    if not isinstance(loc_in, dict):
        raise HTTPException(422, "Invalid locations settings.")
    disabled = [s for s in _list(loc_in.get("disabled"), 500, "Hidden locations") if isinstance(s, str) and SLUG_RE.match(s)]
    notes_in = loc_in.get("notes") or {}
    if not isinstance(notes_in, dict) or len(notes_in) > 500:
        raise HTTPException(422, "Invalid location notes.")
    notes = {k: _text(v, 1500, "Location note") for k, v in notes_in.items() if isinstance(k, str) and SLUG_RE.match(k) and (v or "").strip()}
    custom = [_clean_location(r) for r in _list(loc_in.get("custom"), 150, "Added locations")]
    slugs = [c["slug"] for c in custom]
    if len(set(slugs)) != len(slugs):
        raise HTTPException(422, "Two added locations use the same slug.")
    return {"global": out_global, "pages": pages, "locations": {"disabled": sorted(set(disabled)), "notes": notes, "custom": custom}}


EMPTY_SEO = {"global": {}, "pages": {}, "locations": {"disabled": [], "notes": {}, "custom": []}}


async def _load_seo() -> Dict[str, Any]:
    doc = await db.cms_config.find_one({"_id": SEO_ID}, {"_id": 0}) or {}
    out = deepcopy(EMPTY_SEO)
    out.update({k: v for k, v in doc.items() if k in out})
    return out


@api.get("/seo/config")
async def public_seo_config():
    return await _load_seo()


@api.get("/admin/seo")
async def admin_get_seo(request: Request):
    await require_role(request, ["admin"])
    return await _load_seo()


@api.put("/admin/seo")
async def admin_put_seo(payload: Dict[str, Any], request: Request):
    await require_role(request, ["admin"])
    clean = _clean_seo(payload)
    await db.cms_config.update_one({"_id": SEO_ID}, {"$set": {**clean, "updated_at": now_utc().isoformat()}}, upsert=True)
    schedule_prerender()
    return await _load_seo()


# ---------------------------------------------------------------------------
# Custom pages (About us, Services, …)

# Top-level paths the app already uses — custom pages can't take these.
RESERVED_SLUGS = {
    "admin", "api", "app", "brand", "breathwork", "broadcasts", "cart", "certificate", "challenges", "checkout",
    "discover", "find-your-path", "fonts", "home", "icons", "instructor", "leaderboard", "library", "locations",
    "login", "magic-link", "meditations", "memberships", "menu", "news", "passes", "privacy", "private-sessions",
    "profile", "programs", "quiz", "referrals", "register", "reset-password", "schedule", "shop", "static", "streak",
    "support", "teacher-training", "terms", "account-deletion", "welcome", "wishlist", "workshops", "asanas", "p",
}
BLOCK_TYPES = {"heading", "text", "image", "button", "list", "quote", "faq", "cards", "video"}


def _clean_block(b: dict) -> dict:
    if not isinstance(b, dict):
        raise HTTPException(422, "Invalid content block.")
    kind = b.get("type")
    if kind not in BLOCK_TYPES:
        raise HTTPException(422, f"Unknown block type: {kind}")
    bid = b.get("id") if isinstance(b.get("id"), str) and re.fullmatch(r"[\w-]{1,60}", b.get("id") or "") else gen_id()
    out: Dict[str, Any] = {"id": bid, "type": kind}
    if kind == "heading":
        out["text"] = _text(b.get("text"), 200, "Heading", required=True)
        out["level"] = 3 if b.get("level") == 3 else 2
    elif kind == "text":
        out["text"] = _text(b.get("text"), 10000, "Text", required=True)
    elif kind == "image":
        out["src"] = safe_url(b.get("src") or "")
        if not out["src"]:
            raise HTTPException(422, "Image blocks need an image.")
        out["alt"] = _text(b.get("alt"), 200, "Image description")
        out["caption"] = _text(b.get("caption"), 300, "Caption")
    elif kind == "button":
        out["label"] = _text(b.get("label"), 80, "Button text", required=True)
        out["href"] = safe_url(b.get("href") or "", link=True)
        if not out["href"]:
            raise HTTPException(422, "Buttons need a link.")
        out["style"] = "ghost" if b.get("style") == "ghost" else "primary"
    elif kind == "list":
        out["items"] = [_text(x, 400, "List item") for x in _list(b.get("items"), 60, "List") if isinstance(x, str) and x.strip()]
    elif kind == "quote":
        out["text"] = _text(b.get("text"), 1200, "Quote", required=True)
        out["author"] = _text(b.get("author"), 120, "Quote author")
    elif kind == "faq":
        items = []
        for row in _list(b.get("items"), 40, "Questions"):
            if not isinstance(row, dict):
                continue
            q, a = _text(row.get("q"), 300, "Question"), _text(row.get("a"), 3000, "Answer")
            if q and a:
                items.append({"q": q, "a": a})
        out["items"] = items
    elif kind == "cards":
        items = []
        for row in _list(b.get("items"), 16, "Cards"):
            if not isinstance(row, dict):
                continue
            title = _text(row.get("title"), 120, "Card title")
            if not title:
                continue
            items.append({
                "title": title,
                "text": _text(row.get("text"), 800, "Card text"),
                "href": safe_url(row.get("href") or "", link=True),
                "image": safe_url(row.get("image") or ""),
            })
        out["items"] = items
    elif kind == "video":
        url = safe_url(b.get("url") or "")
        if not url:
            raise HTTPException(422, "Video blocks need a YouTube/Vimeo link or an MP4 file.")
        out["poster"] = safe_url(b.get("poster") or "")
        out["url"] = url
        out["caption"] = _text(b.get("caption"), 300, "Caption")
    return out


def _clean_page(payload: Dict[str, Any], *, partial: bool = False) -> Dict[str, Any]:
    out: Dict[str, Any] = {}
    if "slug" in payload or not partial:
        slug = _text(payload.get("slug"), 60, "Page address", required=True).lower()
        if not SLUG_RE.match(slug):
            raise HTTPException(422, "Page address: lowercase letters, numbers and dashes only (e.g. about-us).")
        if slug in RESERVED_SLUGS:
            raise HTTPException(422, f"“/{slug}” is already used by the app. Choose another address.")
        out["slug"] = slug
    if "title" in payload or not partial:
        out["title"] = _text(payload.get("title"), 120, "Title", required=True)
    for key, max_len in (("eyebrow", 80), ("intro", 1500), ("menu_label", 40), ("seo_title", 120), ("seo_description", 320)):
        if key in payload or not partial:
            out[key] = _text(payload.get(key), max_len, key.replace("_", " ").capitalize())
    for key in ("cover_image", "seo_image"):
        if key in payload or not partial:
            out[key] = safe_url(payload.get(key) or "")
    for key in ("published", "show_in_header", "show_in_footer", "show_in_app_menu", "noindex"):
        if key in payload or not partial:
            out[key] = _bool(payload.get(key, False))
    if "order_index" in payload or not partial:
        out["order_index"] = int(_num(payload.get("order_index", 0) or 0, "Order", lo=-1000, hi=1000))
    if "blocks" in payload or not partial:
        out["blocks"] = [_clean_block(b) for b in _list(payload.get("blocks"), 80, "Content blocks")]
    return out


def _default_pages() -> List[dict]:
    now = now_utc().isoformat()
    base = {"published": True, "show_in_header": True, "show_in_footer": True, "show_in_app_menu": True, "noindex": False,
            "cover_image": "", "seo_image": "", "created_at": now, "updated_at": now}
    T = "/brand/tony"  # Tony's photos shipped with the website (public/brand/tony)
    about = {
        **base, "id": gen_id(), "slug": "about", "title": "About Tony Yoga", "menu_label": "About", "eyebrow": "Our story",
        "order_index": 1, "cover_image": f"{T}/tony-portrait.jpg", "seo_image": f"{T}/tony-portrait.jpg",
        "intro": "Tony Sanchez has practised yoga for over five decades and has taught The Ideal Yoga Practice since 1986 — slowly, precisely, and with reverence for the breath.",
        "seo_title": "About Tony Sanchez & Tony Yoga — Ghosh Lineage Hatha Yoga",
        "seo_description": "Meet Tony Sanchez: five decades of practice, trained at Ghosh's College in Kolkata, creator of the Core 26+, Core 40 and Core 84 yoga programs.",
        "blocks": [
            {"id": gen_id(), "type": "heading", "text": "A lifetime on the mat", "level": 2},
            {"id": gen_id(), "type": "text", "text": "Tony Sanchez has practiced yoga for over five decades. As a direct student of Bikram Choudhury in the 1970s and a keeper of the Ghosh lineage from Kolkata, Tony teaches yoga as it was taught to him: slowly, precisely, and with reverence for the breath."},
            {"id": gen_id(), "type": "text", "text": "The Core Series — 26+, 40, and 84 — are Tony's contribution to the tradition. Each posture is broken down into detail unavailable anywhere else, refined across thousands of teaching hours in California, Mexico, and now Spain."},
            {"id": gen_id(), "type": "image", "src": f"{T}/pose-kneel-back.jpg", "alt": "Tony Sanchez in a kneeling backbend", "caption": ""},
            {"id": gen_id(), "type": "quote", "text": "Yoga is not something you do. It is something you become.", "author": "Tony Sanchez"},
            {"id": gen_id(), "type": "heading", "text": "The Ghosh lineage", "level": 2},
            {"id": gen_id(), "type": "text", "text": "Tony trained at Ghosh's College of Physical Education in Kolkata (1983). The 84-asana system taught there remains the deepest practical body of work in hatha yoga — and the root of everything taught at Tony Yoga."},
            {"id": gen_id(), "type": "heading", "text": "Inside the studio", "level": 2},
            {"id": gen_id(), "type": "text", "text": "Tony still teaches in the hot room every week — adjusting, explaining and watching every breath. A few moments from recent classes:"},
            {"id": gen_id(), "type": "video", "url": f"{T}/studio-class-1.mp4", "poster": f"{T}/studio-class-1.jpg", "caption": "Tony guiding a student through the posture"},
            {"id": gen_id(), "type": "video", "url": f"{T}/studio-class-2.mp4", "poster": f"{T}/studio-class-2.jpg", "caption": "A live class in the hot room"},
            {"id": gen_id(), "type": "image", "src": f"{T}/group.jpg", "alt": "Tony Sanchez with students after class", "caption": "After class with the Mi Hot Shala community"},
            {"id": gen_id(), "type": "button", "label": "See the Core Series", "href": "/programs", "style": "primary"},
            {"id": gen_id(), "type": "button", "label": "Book a private session", "href": "/private-sessions", "style": "ghost"},
        ],
    }
    services = {
        **base, "id": gen_id(), "slug": "services", "title": "Services", "menu_label": "Services", "eyebrow": "Ways to practise",
        "order_index": 2, "cover_image": "", "seo_image": f"{T}/private-session.jpg",
        "intro": "Practise with Tony live, on demand, one-to-one or in person in Málaga, Spain.",
        "seo_title": "Yoga Services — Live Classes, Courses, Private Sessions & Retreats | Tony Yoga",
        "seo_description": "Live online yoga classes on Zoom, the on-demand Core Series, private one-to-one sessions, retreats and teacher training in Málaga with Tony Sanchez.",
        "blocks": [
            {"id": gen_id(), "type": "cards", "items": [
                {"title": "Live online classes", "text": "Join Tony live on Zoom. Every class is added to your library within a day.", "href": "/schedule", "image": f"{T}/studio-class-2.jpg"},
                {"title": "The Core Series", "text": "Core 26+, Core 40 and Core 84 — step-by-step on-demand programs.", "href": "/programs", "image": "/brand/seed/core26.png"},
                {"title": "Private sessions", "text": "One-to-one with Tony over Zoom: posture, breath and a plan for your body.", "href": "/private-sessions", "image": f"{T}/private-session.jpg"},
                {"title": "Retreats in Málaga", "text": "Small-group retreats of up to sixteen students in Andalusia.", "href": "/workshops", "image": f"{T}/group.jpg"},
                {"title": "Teacher training", "text": "200, 300 and 500-hour paths in Málaga, Spain.", "href": "/teacher-training", "image": f"{T}/tt-hero.jpg"},
                {"title": "Membership", "text": "Live classes and the full on-demand library — cancel anytime.", "href": "/memberships", "image": f"{T}/tony-seated.jpg"},
                {"title": "Class passes", "text": "Pay per class with a drop-in or a 5-class pack.", "href": "/passes", "image": f"{T}/pose-kneel-fold.jpg"},
                {"title": "Meditation & breathwork", "text": "Guided meditation, breathwork and yoga nidra.", "href": "/meditations", "image": f"{T}/tony-portrait.jpg"},
            ]},
            {"id": gen_id(), "type": "faq", "items": [
                {"q": "I'm a total beginner — where do I start?", "a": "Start with Core 26+ and come to a live class. Tony meets you where you are and gives you the modifications you need."},
                {"q": "Do I need to attend the Zoom classes live?", "a": "No. Every class is added to your library within a day, so you can practise it whenever suits you."},
            ]},
            {"id": gen_id(), "type": "button", "label": "Start free", "href": "/register", "style": "primary"},
        ],
    }
    return [about, services]


async def _ensure_default_pages():
    if await db.cms_config.find_one({"_id": "pages_seeded"}):
        return
    if await db.cms_pages.count_documents({}) == 0:
        await db.cms_pages.insert_many(_default_pages())
    await db.cms_config.update_one({"_id": "pages_seeded"}, {"$set": {"at": now_utc().isoformat()}}, upsert=True)


PAGE_SUMMARY = {"_id": 0, "id": 1, "slug": 1, "title": 1, "menu_label": 1, "eyebrow": 1, "show_in_header": 1, "show_in_footer": 1,
                "show_in_app_menu": 1, "order_index": 1, "noindex": 1, "seo_title": 1, "seo_description": 1, "updated_at": 1}


@api.get("/pages")
async def public_pages():
    await _ensure_default_pages()
    rows = await db.cms_pages.find({"published": True}, PAGE_SUMMARY).to_list(200)
    return sorted(rows, key=lambda r: (r.get("order_index") or 0, r.get("title") or ""))


@api.get("/pages/{slug}")
async def public_page(slug: str):
    await _ensure_default_pages()
    page = await db.cms_pages.find_one({"slug": slug.lower(), "published": True}, {"_id": 0})
    if not page:
        raise HTTPException(404, "Page not found")
    return page


@api.get("/admin/pages")
async def admin_list_pages(request: Request):
    await require_role(request, ["admin"])
    await _ensure_default_pages()
    rows = await db.cms_pages.find({}, {"_id": 0}).to_list(500)
    return sorted(rows, key=lambda r: (r.get("order_index") or 0, r.get("title") or ""))


@api.post("/admin/pages")
async def admin_create_page(payload: Dict[str, Any], request: Request):
    await require_role(request, ["admin"])
    await _ensure_default_pages()  # About/Services exist before the first custom page
    doc = _clean_page(payload)
    if await db.cms_pages.find_one({"slug": doc["slug"]}):
        raise HTTPException(409, f"A page already uses /{doc['slug']}.")
    now = now_utc().isoformat()
    doc.update({"id": gen_id(), "created_at": now, "updated_at": now})
    await db.cms_pages.insert_one(dict(doc))
    schedule_prerender()
    return doc


@api.patch("/admin/pages/{page_id}")
async def admin_update_page(page_id: str, payload: Dict[str, Any], request: Request):
    await require_role(request, ["admin"])
    if not await db.cms_pages.find_one({"id": page_id}):
        raise HTTPException(404, "Page not found")
    update = _clean_page(payload, partial=True)
    if "slug" in update and await db.cms_pages.find_one({"slug": update["slug"], "id": {"$ne": page_id}}):
        raise HTTPException(409, f"A page already uses /{update['slug']}.")
    update["updated_at"] = now_utc().isoformat()
    await db.cms_pages.update_one({"id": page_id}, {"$set": update})
    schedule_prerender()
    return await db.cms_pages.find_one({"id": page_id}, {"_id": 0})


@api.delete("/admin/pages/{page_id}")
async def admin_delete_page(page_id: str, request: Request):
    await require_role(request, ["admin"])
    res = await db.cms_pages.delete_one({"id": page_id})
    if not res.deleted_count:
        raise HTTPException(404, "Page not found")
    schedule_prerender()
    return {"ok": True}


# ---------------------------------------------------------------------------
# Packages & prices: class passes and teacher training tiers

async def get_pass_catalog() -> Dict[str, dict]:
    """Class-pass catalogue with admin edits applied (keys: drop_in, class_pack)."""
    from routers.passes import PASS_CATALOG
    doc = await db.cms_config.find_one({"_id": "pass_catalog"}, {"_id": 0}) or {}
    saved = doc.get("items") or {}
    out = {}
    for key, base in PASS_CATALOG.items():
        out[key] = {**base, "active": True, **{k: v for k, v in (saved.get(key) or {}).items() if k != "id"}, "id": key}
    return out


async def get_tt_catalog() -> Dict[str, dict]:
    """Teacher-training tiers with admin edits applied, in display order."""
    from routers.payments import TEACHER_TRAINING_CATALOG
    doc = await db.cms_config.find_one({"_id": "teacher_training"}, {"_id": 0})
    items = doc.get("items") if doc else None
    if not items:
        items = [{**v, "currency": "eur", "active": True} for v in TEACHER_TRAINING_CATALOG.values()]
    return {row["id"]: row for row in items}


@api.get("/admin/packages")
async def admin_get_packages(request: Request):
    await require_role(request, ["admin"])
    return {"passes": list((await get_pass_catalog()).values()), "teacher_training": list((await get_tt_catalog()).values())}


@api.put("/admin/packages/passes")
async def admin_put_passes(payload: Dict[str, Any], request: Request):
    await require_role(request, ["admin"])
    from routers.passes import PASS_CATALOG
    items = payload.get("items")
    if not isinstance(items, list):
        raise HTTPException(422, "Send a list of passes.")
    saved = {}
    for row in items:
        if not isinstance(row, dict) or row.get("id") not in PASS_CATALOG:
            raise HTTPException(422, "Unknown pass.")
        currency = _text(row.get("currency") or "eur", 3, "Currency").lower()
        if currency not in CURRENCIES:
            raise HTTPException(422, "Currency must be EUR, USD or GBP.")
        saved[row["id"]] = {
            "title": _text(row.get("title"), 80, "Pass name", required=True),
            "description": _text(row.get("description"), 300, "Pass description"),
            "price": _num(row.get("price"), "Price", lo=0, hi=100000),
            "credits": int(_num(row.get("credits"), "Credits", lo=1, hi=200)),
            "currency": currency,
            "active": _bool(row.get("active", True)),
        }
    await db.cms_config.update_one({"_id": "pass_catalog"}, {"$set": {"items": saved, "updated_at": now_utc().isoformat()}}, upsert=True)
    return list((await get_pass_catalog()).values())


@api.put("/admin/packages/teacher-training")
async def admin_put_tt(payload: Dict[str, Any], request: Request):
    await require_role(request, ["admin"])
    items = payload.get("items")
    if not isinstance(items, list) or len(items) > 20:
        raise HTTPException(422, "Send up to 20 trainings.")
    clean, seen = [], set()
    for row in items:
        if not isinstance(row, dict):
            raise HTTPException(422, "Invalid training.")
        tid = _text(row.get("id"), 40, "Training code", required=True).lower()
        if not SLUG_RE.match(tid) or tid in seen:
            raise HTTPException(422, "Each training needs a unique code (letters, numbers, dashes).")
        seen.add(tid)
        currency = _text(row.get("currency") or "eur", 3, "Currency").lower()
        if currency not in CURRENCIES:
            raise HTTPException(422, "Currency must be EUR, USD or GBP.")
        clean.append({
            "id": tid,
            "name": _text(row.get("name"), 160, "Training name", required=True),
            "price": _num(row.get("price"), "Price", lo=0, hi=1000000),
            "currency": currency,
            "hours": int(_num(row.get("hours") or 0, "Hours", lo=0, hi=5000)),
            "dates": _text(row.get("dates"), 120, "Dates"),
            "includes": [_text(x, 200, "Included item") for x in _list(row.get("includes"), 30, "Included items") if isinstance(x, str) and x.strip()],
            "active": _bool(row.get("active", True)),
        })
    await db.cms_config.update_one({"_id": "teacher_training"}, {"$set": {"items": clean, "updated_at": now_utc().isoformat()}}, upsert=True)
    return list((await get_tt_catalog()).values())


# ---------------------------------------------------------------------------
# Membership plans (create already lives in routers/content.py)

BILLING = {"weekly", "monthly", "quarterly", "yearly"}


@api.get("/admin/membership-plans")
async def admin_list_plans(request: Request):
    await require_role(request, ["admin"])
    return await db.membership_plans.find({}, {"_id": 0}).to_list(200)


@api.patch("/admin/membership-plans/{plan_id}")
async def admin_update_plan(plan_id: str, payload: Dict[str, Any], request: Request):
    await require_role(request, ["admin"])
    if not await db.membership_plans.find_one({"id": plan_id}):
        raise HTTPException(404, "Plan not found")
    update: Dict[str, Any] = {}
    if "name" in payload:
        update["name"] = _text(payload["name"], 120, "Plan name", required=True)
    if "description" in payload:
        update["description"] = _text(payload["description"], 600, "Plan description")
    if "price" in payload:
        update["price"] = _num(payload["price"], "Price", lo=0, hi=100000)
    if "currency" in payload:
        cur = _text(payload["currency"], 3, "Currency").lower()
        if cur not in CURRENCIES:
            raise HTTPException(422, "Currency must be EUR, USD or GBP.")
        update["currency"] = cur
    if "billing_cycle" in payload:
        if payload["billing_cycle"] not in BILLING:
            raise HTTPException(422, "Billing must be weekly, monthly, quarterly or yearly.")
        update["billing_cycle"] = payload["billing_cycle"]
    if "trial_days" in payload:
        update["trial_days"] = int(_num(payload["trial_days"] or 0, "Trial days", lo=0, hi=90))
    if "features" in payload:
        update["features"] = [_text(x, 200, "Feature") for x in _list(payload["features"], 20, "Features") if isinstance(x, str) and x.strip()]
    if "is_active" in payload:
        update["is_active"] = _bool(payload["is_active"])
    if "tier" in payload:
        update["tier"] = _text(payload["tier"], 60, "Tier")
    if update:
        update["updated_at"] = now_utc().isoformat()
        await db.membership_plans.update_one({"id": plan_id}, {"$set": update})
    return await db.membership_plans.find_one({"id": plan_id}, {"_id": 0})


@api.delete("/admin/membership-plans/{plan_id}")
async def admin_hide_plan(plan_id: str, request: Request):
    """Plans are hidden, not deleted, so existing members keep their subscription details."""
    await require_role(request, ["admin"])
    res = await db.membership_plans.update_one({"id": plan_id}, {"$set": {"is_active": False, "updated_at": now_utc().isoformat()}})
    if not res.matched_count:
        raise HTTPException(404, "Plan not found")
    return {"ok": True}


# ---------------------------------------------------------------------------
# Instructor profiles (photo, name and bio shown on classes)

TEAM_FIELDS = {"_id": 0, "id": 1, "name": 1, "email": 1, "role": 1, "bio": 1, "photo_url": 1, "years_experience": 1, "styles": 1}


@api.get("/admin/team")
async def admin_team(request: Request):
    await require_role(request, ["admin"])
    return await db.users.find({"role": {"$in": ["admin", "instructor"]}}, TEAM_FIELDS).to_list(200)


@api.patch("/admin/team/{user_id}")
async def admin_update_team_member(user_id: str, payload: Dict[str, Any], request: Request):
    await require_role(request, ["admin"])
    if not await db.users.find_one({"id": user_id, "role": {"$in": ["admin", "instructor"]}}):
        raise HTTPException(404, "Team member not found")
    update: Dict[str, Any] = {}
    if "name" in payload:
        update["name"] = _text(payload["name"], 120, "Name", required=True)
    if "bio" in payload:
        update["bio"] = _text(payload["bio"], 3000, "Bio")
    if "photo_url" in payload:
        update["photo_url"] = safe_url(payload["photo_url"] or "")
    if "years_experience" in payload and payload["years_experience"] not in (None, ""):
        update["years_experience"] = int(_num(payload["years_experience"], "Years of experience", lo=0, hi=100))
    if "styles" in payload:
        update["styles"] = [_text(x, 60, "Style") for x in _list(payload["styles"], 20, "Styles") if isinstance(x, str) and x.strip()]
    if update:
        await db.users.update_one({"id": user_id}, {"$set": update})
    return await db.users.find_one({"id": user_id}, TEAM_FIELDS)
