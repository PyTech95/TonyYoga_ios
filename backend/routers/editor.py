"""Live visual editor — per-page content overrides with draft/publish + comments.

Data model (collection `page_edits`): one document per (route, selector).
    {
      id, route, selector, kind,          # kind: text|image|style|link
      draft:     {text?, src?, href?, backgroundColor?, color?} | None,
      published: {...} | None,
      updated_by, updated_at, published_at
    }

Public:
    GET  /editor/overrides?route=/x            Published overrides (all visitors)
Admin:
    GET  /editor/overrides?route=/x&mode=draft Effective draft (draft ?? published)
    PUT  /editor/override                      Upsert a draft override (merge props)
    DELETE /editor/override                    Remove an override entirely (reset)
    POST /editor/publish                       Promote drafts -> published (per route or all)
    POST /editor/discard                       Drop drafts (per route or all)
    GET  /editor/comments?route=/x             List comments for a route
    POST /editor/comments                      Add a comment
    POST /editor/comments/{cid}/resolve        Toggle resolved
    DELETE /editor/comments/{cid}              Delete a comment
"""
from typing import Any, Dict, Optional
from fastapi import HTTPException, Request
from pydantic import BaseModel

from core import api, db, now_utc, gen_id, require_role
from content_settings import safe_url, sync_published_content

ALLOWED_PROPS = {"text", "src", "href", "backgroundColor", "color", "alt", "poster"}
VALID_KINDS = {"text", "image", "style", "link", "video"}


class OverrideIn(BaseModel):
    route: str
    selector: str
    kind: str = "text"
    props: Dict[str, Any] = {}


class OverrideRef(BaseModel):
    route: str
    selector: str


class ScopeIn(BaseModel):
    route: Optional[str] = None


class CommentIn(BaseModel):
    route: str
    selector: Optional[str] = None
    text: str


def _clean_props(props: Dict[str, Any]) -> Dict[str, Any]:
    clean = {k: v for k, v in (props or {}).items() if k in ALLOWED_PROPS and v is not None}
    for key, value in clean.items():
        if not isinstance(value, str) or len(value) > 20000:
            raise HTTPException(422, "Editable values must be text of at most 20,000 characters.")
        if key in {"src", "href", "poster"}:
            clean[key] = safe_url(value, link=key == "href")
    return clean


# ------------------- Read -------------------
@api.get("/editor/overrides")
async def list_overrides(request: Request, route: str, mode: str = "published"):
    """Published mode is public. Draft mode is admin-only and returns the
    effective value (draft if present, else published) so the editor previews
    exactly what publishing would ship."""
    if mode == "draft":
        await require_role(request, ["admin"])
    docs = await db.page_edits.find({"route": route}, {"_id": 0}).to_list(2000)
    out = []
    for d in docs:
        if mode == "draft":
            props = d.get("draft") or d.get("published")
        else:
            props = d.get("published")
        if not props:
            continue
        out.append({
            "selector": d["selector"],
            "kind": d.get("kind", "text"),
            "props": props,
            "has_draft": bool(d.get("draft")),
        })
    return {"route": route, "mode": mode, "overrides": out}


# ------------------- Write -------------------
@api.put("/editor/override")
async def upsert_override(request: Request, body: OverrideIn):
    admin = await require_role(request, ["admin"])
    if body.kind not in VALID_KINDS:
        raise HTTPException(400, "Invalid kind")
    props = _clean_props(body.props)
    if not props:
        raise HTTPException(400, "No editable properties provided")
    existing = await db.page_edits.find_one({"route": body.route, "selector": body.selector})
    merged = {**((existing or {}).get("published") or {}), **((existing or {}).get("draft") or {}), **props}
    now = now_utc().isoformat()
    if existing:
        await db.page_edits.update_one(
            {"id": existing["id"]},
            {"$set": {"draft": merged, "kind": body.kind,
                      "updated_by": admin.get("email"), "updated_at": now}},
        )
        doc_id = existing["id"]
    else:
        doc_id = gen_id()
        await db.page_edits.insert_one({
            "id": doc_id, "route": body.route, "selector": body.selector,
            "kind": body.kind, "draft": merged, "published": None,
            "updated_by": admin.get("email"), "updated_at": now, "published_at": None,
        })
    return {"ok": True, "id": doc_id, "draft": merged}


@api.delete("/editor/override")
async def delete_override(request: Request, body: OverrideRef):
    await require_role(request, ["admin"])
    await db.page_edits.delete_one({"route": body.route, "selector": body.selector})
    return {"ok": True}


@api.post("/editor/publish")
async def publish(request: Request, body: ScopeIn):
    await require_role(request, ["admin"])
    query: Dict[str, Any] = {"draft": {"$ne": None}}
    if body.route:
        query["route"] = body.route
    docs = await db.page_edits.find(query).to_list(5000)
    now = now_utc().isoformat()
    count = 0
    for d in docs:
        await sync_published_content(d)
        await db.page_edits.update_one(
            {"id": d["id"]},
            {"$set": {"published": d["draft"], "draft": None, "published_at": now}},
        )
        count += 1
    return {"ok": True, "published": count}


@api.post("/editor/discard")
async def discard(request: Request, body: ScopeIn):
    await require_role(request, ["admin"])
    query: Dict[str, Any] = {"draft": {"$ne": None}}
    if body.route:
        query["route"] = body.route
    docs = await db.page_edits.find(query).to_list(5000)
    dropped = 0
    for d in docs:
        if d.get("published"):
            await db.page_edits.update_one({"id": d["id"]}, {"$set": {"draft": None}})
        else:
            await db.page_edits.delete_one({"id": d["id"]})
        dropped += 1
    return {"ok": True, "discarded": dropped}


@api.get("/editor/status")
async def status(request: Request):
    """Count pending drafts overall + per route, for the editor dashboard."""
    await require_role(request, ["admin"])
    docs = await db.page_edits.find({"draft": {"$ne": None}}, {"_id": 0, "route": 1}).to_list(5000)
    by_route: Dict[str, int] = {}
    for d in docs:
        by_route[d["route"]] = by_route.get(d["route"], 0) + 1
    return {"pending_total": len(docs), "by_route": by_route}


# ------------------- Comments -------------------
@api.get("/editor/comments")
async def list_comments(request: Request, route: str):
    await require_role(request, ["admin"])
    rows = await db.editor_comments.find({"route": route}, {"_id": 0}).sort("created_at", 1).to_list(1000)
    return rows


@api.post("/editor/comments")
async def add_comment(request: Request, body: CommentIn):
    admin = await require_role(request, ["admin"])
    text = (body.text or "").strip()
    if not text:
        raise HTTPException(400, "Comment cannot be empty")
    doc = {
        "id": gen_id(), "route": body.route, "selector": body.selector,
        "text": text, "author": admin.get("email"), "author_name": admin.get("name"),
        "resolved": False, "created_at": now_utc().isoformat(),
    }
    await db.editor_comments.insert_one(doc)
    doc.pop("_id", None)
    return doc


@api.post("/editor/comments/{cid}/resolve")
async def resolve_comment(request: Request, cid: str):
    await require_role(request, ["admin"])
    c = await db.editor_comments.find_one({"id": cid})
    if not c:
        raise HTTPException(404, "Comment not found")
    await db.editor_comments.update_one({"id": cid}, {"$set": {"resolved": not c.get("resolved", False)}})
    return {"ok": True, "resolved": not c.get("resolved", False)}


@api.delete("/editor/comments/{cid}")
async def delete_comment(request: Request, cid: str):
    await require_role(request, ["admin"])
    await db.editor_comments.delete_one({"id": cid})
    return {"ok": True}
