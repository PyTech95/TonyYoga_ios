import hashlib
from commerce_lock import delivery_lock
"""Printful print-on-demand integration.

Part A: product sync + admin edit (syncs products from a Printful store into our
`products` collection; local merchandising fields are preserved across syncs).
Part B: order fulfillment — after a cart order is paid, push it to Printful for
printing & shipping, and receive tracking via the package_shipped webhook.
"""
import os
from typing import Any, List
import httpx
from fastapi import Request, HTTPException
from pydantic import BaseModel
from typing import Optional
from operation_lock import operation_lock

from core import api, db, logger, gen_id, now_utc, require_role

PRINTFUL_TOKEN = os.environ.get("PRINTFUL_TOKEN")
PRINTFUL_STORE_ID = os.environ.get("PRINTFUL_STORE_ID")
BASE = "https://api.printful.com"


async def _resolve_token() -> str:
    """Printful API token: DB setting (pasted in Admin → Print Media) first, env fallback."""
    from routers.settings import get_setting
    return (await get_setting("printful_token")) or PRINTFUL_TOKEN or ""


async def _selected_store_id():
    meta = await db.app_settings.find_one({"key": "printful_sync"}, {"_id": 0})
    return (meta or {}).get("store_id") or PRINTFUL_STORE_ID


async def _headers(store_id=None):
    token = await _resolve_token()
    if not token:
        raise HTTPException(400, "Printful is not connected. Paste your API token in Admin → Print Media.")
    h = {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}
    sid = store_id if store_id is not None else await _selected_store_id()
    if sid:
        h["X-PF-Store-Id"] = str(sid)
    return h


async def _pf_get(client: httpx.AsyncClient, path: str, store_id=None, **kw):
    r = await client.get(f"{BASE}{path}", headers=await _headers(store_id), **kw)
    if r.status_code >= 400:
        raise HTTPException(502, f"Printful error {r.status_code}: {r.text[:200]}")
    body = r.json()
    return body.get("result", body)


def _normalize(full: dict) -> dict:
    sp = full.get("sync_product", full)
    svs = full.get("sync_variants", [])
    variants: List[dict] = []
    prices = []
    currency = "usd"
    # Bucket images by kind so the storefront shows the product MOCKUP, not the
    # raw print-file artwork. Printful file types: 'preview' = generated mockup
    # (the product with the design applied) → what we want first; 'default' =
    # the print file (bare artwork) → last resort only. product.image = the
    # catalog product shot. All are on files.cdn.printful.com (no WordPress).
    mockups: List[str] = []
    catalog: List[str] = []
    other_files: List[str] = []
    prints: List[str] = []
    for v in svs:
        try:
            price = float(v.get("retail_price") or 0)
        except (TypeError, ValueError):
            price = 0.0
        if price:
            prices.append(price)
        currency = (v.get("currency") or currency).lower()
        v_mock, v_print, v_other = [], [], []
        for f in v.get("files", []):
            pu = f.get("preview_url")
            if not pu:
                continue
            ftype = (f.get("type") or "").lower()
            if ftype == "preview":
                v_mock.append(pu)
            elif ftype == "default":
                v_print.append(pu)
            else:
                v_other.append(pu)
        pimg = (v.get("product") or {}).get("image")
        mockups += v_mock
        other_files += v_other
        prints += v_print
        if pimg:
            catalog.append(pimg)
        # Per-variant image list mirrors the same preference (mockup first).
        v_imgs = v_mock + ([pimg] if pimg else []) + v_other + v_print
        variants.append({
            "printful_variant_id": v.get("id"),
            "catalog_variant_id": v.get("variant_id"),
            "sku": v.get("sku"),
            "size": v.get("size") or v.get("name"),
            "color": v.get("color"),
            "price": price,
            "images": list(dict.fromkeys(v_imgs)),
            "available": v.get("availability_status", "active") != "discontinued",
        })
    # Product-level ordering: mockups → catalog shot → other previews → print files.
    # All from files.cdn.printful.com — we deliberately do NOT fall back to the
    # WordPress (tonyoga.*) thumbnail, so images never depend on that domain.
    ordered = list(dict.fromkeys(mockups + catalog + other_files + prints))
    return {
        "printful_product_id": sp.get("id"),
        "title": sp.get("name", "Untitled"),
        "images": ordered[:8],
        "variants": variants,
        "price": round(min(prices), 2) if prices else 0.0,
        "currency": currency,
    }


@api.get("/admin/printful/status")
async def printful_status(request: Request):
    await require_role(request, ["admin"])
    cfg = bool(await _resolve_token())
    meta = await db.app_settings.find_one({"key": "printful_sync"}, {"_id": 0})
    count = await db.products.count_documents({"source": "printful"})
    from routers.settings import get_setting
    fulfill_enabled = await get_setting("printful_fulfill_enabled")
    auto_sync_enabled = await get_setting("printful_auto_sync_enabled")
    live = await _is_live_payments()
    return {
        "configured": cfg,
        "store_id": (meta or {}).get("store_id") or PRINTFUL_STORE_ID,
        "synced_products": count,
        "last_sync": (meta or {}).get("last_sync"),
        "last_result": (meta or {}).get("last_result"),
        "fulfill_enabled": fulfill_enabled is not False,  # default on
        "auto_sync_enabled": auto_sync_enabled is True,
        "payments_live": live,
    }


@api.post("/admin/printful/connect")
async def printful_connect(request: Request):
    """Save the Printful API token pasted in the admin UI and verify it immediately."""
    admin = await require_role(request, ["admin"])
    body = await request.json()
    token = (body.get("token") or "").strip()
    store_id = str(body.get("store_id") or "").strip()
    if not token:
        raise HTTPException(400, "API token is required.")
    from routers.settings import save_settings
    await save_settings({"printful_token": token}, admin)
    # Verify the token by listing stores.
    try:
        async with httpx.AsyncClient(timeout=40) as client:
            stores = await _pf_get(client, "/stores")
    except HTTPException as e:
        # Roll back the bad token so status doesn't report "connected".
        await save_settings({"printful_token": ""}, admin)
        raise HTTPException(400, f"Printful rejected that token: {e.detail}")
    if store_id:
        await db.app_settings.update_one(
            {"key": "printful_sync"},
            {"$set": {"key": "printful_sync", "store_id": store_id}}, upsert=True)
    return {"ok": True, "stores": [
        {"id": s.get("id"), "name": s.get("name"), "type": s.get("type")} for s in (stores or [])
    ]}


@api.post("/admin/printful/verify")
async def printful_verify(request: Request):
    """Test the currently-stored token without changing anything."""
    await require_role(request, ["admin"])
    if not await _resolve_token():
        return {"ok": False, "error": "No token configured."}
    try:
        async with httpx.AsyncClient(timeout=40) as client:
            stores = await _pf_get(client, "/stores")
        return {"ok": True, "store_count": len(stores or [])}
    except HTTPException as e:
        return {"ok": False, "error": e.detail}


@api.post("/admin/printful/disconnect")
async def printful_disconnect(request: Request):
    admin = await require_role(request, ["admin"])
    from routers.settings import save_settings
    await save_settings({"printful_token": ""}, admin)
    return {"ok": True}


@api.get("/admin/printful/preview")
async def printful_preview(request: Request):
    """Synced Printful products (for the admin preview grid)."""
    await require_role(request, ["admin"])
    docs = await db.products.find({"source": "printful"}, {"_id": 0}).sort("printful_synced_at", -1).to_list(500)
    return {"products": docs, "count": len(docs)}


@api.get("/admin/printful/stores")
async def printful_stores(request: Request):
    """List all Printful stores on the account with a live product count each."""
    await require_role(request, ["admin"])
    if not await _resolve_token():
        raise HTTPException(400, "Printful is not connected. Paste your API token in Admin → Print Media.")
    selected = await _selected_store_id()
    out = []
    async with httpx.AsyncClient(timeout=40) as client:
        stores = await _pf_get(client, "/stores")
        for st in (stores or []):
            sid = st.get("id")
            count = None
            try:
                r = await client.get(
                    f"{BASE}/sync/products", headers=await _headers(sid),
                    params={"limit": 1, "offset": 0},
                )
                if r.status_code < 400:
                    count = ((r.json() or {}).get("paging") or {}).get("total")
            except Exception:
                count = None
            out.append({
                "id": sid, "name": st.get("name"), "type": st.get("type"), "product_count": count,
            })
    return {"stores": out, "selected_store_id": str(selected) if selected else None}


async def _sync_store_products(store_id: str, progress: dict) -> dict:
    """Core product/price sync from a Printful store into our `products` collection."""
    created = updated = 0
    async with httpx.AsyncClient(timeout=60) as client:
        # Paginate the sync-product list (works for platform stores too)
        summaries: List[dict] = []
        offset = 0
        while True:
            page = await _pf_get(client, "/sync/products", store_id=store_id, params={"offset": offset, "limit": 100})
            items = page if isinstance(page, list) else page.get("items", [])
            summaries += items
            if len(items) < 100:
                break
            offset += 100
        for s in summaries:
            full = await _pf_get(client, f"/sync/products/{s['id']}", store_id=store_id)
            doc = _normalize(full)
            existing = await db.products.find_one({"printful_product_id": doc["printful_product_id"]})
            pf_owned = {
                "variants": doc["variants"],
                "images": doc["images"],
                "price": doc["price"],
                "currency": doc["currency"],
                "source": "printful",
                "printful_store_id": str(store_id),
                "printful_synced_at": now_utc().isoformat(),
            }
            if existing:
                # Preserve admin overrides; refresh Printful-owned data + current price.
                await db.products.update_one({"id": existing["id"]}, {"$set": pf_owned})
                updated += 1
                progress["updated"] = updated
            else:
                new = {
                    "id": gen_id(),
                    "title": doc["title"],
                    "description": "",
                    "type": "physical",
                    "category": "Printful",
                    "price": doc["price"],
                    "currency": doc["currency"],
                    "stock_qty": 999,
                    "images": doc["images"],
                    "visible": True,
                    "printful_product_id": doc["printful_product_id"],
                    "rating": 0,
                    "created_at": now_utc().isoformat(),
                    **pf_owned,
                }
                await db.products.insert_one(new)
                created += 1
                progress["created"] = created
    result = {"created": created, "updated": updated, "total": created + updated}
    await db.app_settings.update_one(
        {"key": "printful_sync"},
        {"$set": {"key": "printful_sync", "store_id": str(store_id), "last_sync": now_utc().isoformat(), "last_result": result}},
        upsert=True,
    )
    return result


class SyncLogView(BaseModel):
    id: str
    source: str
    store_id: str
    started_at: str
    finished_at: Optional[str] = None
    status: str
    created: int = 0
    updated: int = 0
    total: int = 0
    error: Optional[str] = None


@api.get("/admin/printful/sync-history", response_model=List[SyncLogView])
async def sync_history(request: Request):
    await require_role(request, ["admin"])
    return await db.printful_sync_history.find({}, {"_id": 0}).sort("started_at", -1).limit(20).to_list(20)


async def _sync_store(store_id: str, source="manual") -> dict:
    async with operation_lock("printful-sync", minutes=60):
        # A previous run interrupted by a restart must not stay 'running' forever.
        await db.printful_sync_history.update_many({"status": "running"}, {"$set": {"status": "failed", "error": "Sync interrupted before completion.", "finished_at": now_utc().isoformat()}})
        run_id = gen_id()
        progress = {"created": 0, "updated": 0}
        await db.printful_sync_history.insert_one({"id": run_id, "source": source, "store_id": str(store_id), "started_at": now_utc().isoformat(), "status": "running", **progress})
        if source == "nightly":
            await db.app_settings.update_one({"key": "printful_sync"}, {"$set": {"auto_last_attempt": now_utc().isoformat()}}, upsert=True)
        try:
            result = await _sync_store_products(store_id, progress)
        except Exception as exc:
            # Do not persist raw provider responses, headers or credentials.
            message = "Printful could not complete the sync. Verify the connection and try again."
            if isinstance(exc, httpx.TimeoutException):
                message = "Printful timed out. Try syncing again."
            await db.printful_sync_history.update_one({"id": run_id}, {"$set": {"status": "failed", "finished_at": now_utc().isoformat(), "error": message, **progress, "total": sum(progress.values())}})
            raise
        await db.printful_sync_history.update_one({"id": run_id}, {"$set": {"status": "succeeded", "finished_at": now_utc().isoformat(), **result}})
        return result


@api.post("/admin/printful/sync")
async def printful_sync(request: Request):
    await require_role(request, ["admin"])
    if not await _resolve_token():
        raise HTTPException(400, "Printful is not connected. Paste your API token in Admin → Print Media.")
    try:
        body = await request.json()
    except Exception:
        body = {}
    store_id = str(body.get("store_id") or "").strip() or await _selected_store_id()
    if not store_id:
        raise HTTPException(400, "No Printful store selected.")
    return await _sync_store(store_id)


async def printful_nightly_sync_tick():
    """Once per ~24h, re-sync products/prices if auto-sync is enabled and Printful is connected."""
    from routers.settings import get_setting
    if not (await get_setting("printful_auto_sync_enabled")):
        return
    if not await _resolve_token():
        return
    meta = await db.app_settings.find_one({"key": "printful_sync"}, {"_id": 0}) or {}
    last = meta.get("auto_last_attempt") or meta.get("auto_last_sync") or meta.get("last_sync")
    if last:
        try:
            from datetime import datetime, timezone
            last_dt = datetime.fromisoformat(str(last).replace("Z", "+00:00"))
            if (now_utc() - last_dt).total_seconds() < 24 * 3600:
                return
        except Exception:
            pass
    store_id = await _selected_store_id()
    if not store_id:
        return
    try:
        result = await _sync_store(str(store_id), source="nightly")
        await db.app_settings.update_one({"key": "printful_sync"},
            {"$set": {"auto_last_sync": now_utc().isoformat()}}, upsert=True)
        logger.info(f"Printful nightly sync: {result}")
    except Exception as e:
        logger.warning(f"Printful nightly sync failed: {e}")



# ---------------------------------------------------------------------------
# Part B — Order fulfillment
# ---------------------------------------------------------------------------

# Minimal country-name -> ISO2 map for the addresses we capture at checkout.
_COUNTRY_ISO2 = {
    "united states": "US", "usa": "US", "us": "US",
    "united kingdom": "GB", "uk": "GB", "great britain": "GB",
    "spain": "ES", "espana": "ES", "españa": "ES",
    "canada": "CA", "australia": "AU", "germany": "DE", "france": "FR",
    "italy": "IT", "portugal": "PT", "ireland": "IE", "netherlands": "NL",
    "mexico": "MX", "india": "IN",
}


def _country_code(name: str) -> str:
    n = (name or "").strip()
    if len(n) == 2:
        return n.upper()
    return _COUNTRY_ISO2.get(n.lower(), n[:2].upper() if n else "US")


def _order_recipient(order: dict) -> dict:
    a = order.get("shipping_address") or {}
    r = {
        "name": a.get("name") or order.get("user_email", "Customer"),
        "address1": a.get("line1") or "",
        "city": a.get("city") or "",
        "state_code": (a.get("state") or None),
        "country_code": _country_code(a.get("country")),
        "zip": a.get("postal_code") or "",
    }
    if a.get("line2"):
        r["address2"] = a["line2"]
    if a.get("phone"):
        r["phone"] = a["phone"]
    if order.get("user_email"):
        r["email"] = order["user_email"]
    return r


async def _resolve_items(order: dict):
    """Map an order's line items to Printful sync_variant_ids. Returns (items, skipped, store_id)."""
    items: List[dict] = []
    skipped: List[str] = []
    store_id = None
    for line in order.get("items", []):
        pid = line.get("product_id")
        p = await db.products.find_one({"id": pid}) if pid else None
        variants = (p or {}).get("variants") or []
        if not p or p.get("source") != "printful" or not variants:
            skipped.append((p or line).get("title") or str(pid))
            continue
        want = str(line.get("variant") or "").strip().lower()
        chosen = None
        if want:
            chosen = next(
                (v for v in variants
                 if str(v.get("size") or "").lower() == want or str(v.get("color") or "").lower() == want),
                None,
            )
        chosen = chosen or variants[0]
        svid = chosen.get("printful_variant_id")
        if not svid:
            skipped.append(p.get("title") or str(pid))
            continue
        # All Printful items in an order should share a store; use the first product's store.
        if store_id is None and p.get("printful_store_id"):
            store_id = str(p["printful_store_id"])
        items.append({"sync_variant_id": int(svid), "quantity": int(line.get("quantity", 1) or 1)})
    return items, skipped, store_id


async def _pf_post(client: httpx.AsyncClient, path: str, json=None, params=None, store_id=None):
    r = await client.post(f"{BASE}{path}", headers=await _headers(store_id), json=json, params=params)
    if r.status_code >= 400:
        raise HTTPException(502, f"Printful error {r.status_code}: {r.text[:300]}")
    body = r.json()
    return body.get("result", body)


async def submit_printful_order(order: dict, confirm: bool) -> dict:
    async with delivery_lock(db, "printful:" + order["id"]):
        fresh = await db.orders.find_one({"id": order["id"]})
        if not fresh:
            raise HTTPException(404, "Order not found")
        if confirm and fresh.get("status") not in ("paid", "fulfilled", "shipped", "completed"):
            raise HTTPException(409, "Only paid orders can be sent for production.")
        return await _submit_printful_order(fresh, confirm)


async def _submit_printful_order(order: dict, confirm: bool) -> dict:
    """Create a Printful order for the given order's Printful line items.
    confirm=False -> draft (review in Printful); confirm=True -> submit for fulfillment."""
    if not await _resolve_token():
        raise HTTPException(400, "Printful is not connected. Paste your API token in Admin → Print Media.")
    items, skipped, store_id = await _resolve_items(order)
    store_id = store_id or await _selected_store_id()
    if not items:
        raise HTTPException(400, f"No Printful items in this order (skipped: {', '.join(skipped) or 'none'})")
    # Stable <=32-character external ID: retry after a lost API response must not
    # create another charge/production order in Printful.
    external_id = hashlib.sha256(("tonyoga:" + order["id"]).encode()).hexdigest()[:32]
    payload = {"external_id": external_id, "recipient": _order_recipient(order), "items": items}
    async with httpx.AsyncClient(timeout=45) as client:
        lookup = str(order["printful_order_id"]) if order.get("printful_order_id") else "@" + external_id
        response = await client.get(f"{BASE}/orders/{lookup}", headers=await _headers(store_id))
        if response.status_code == 404:
            res = await _pf_post(client, "/orders", json=payload, params={"confirm": 1 if confirm else 0}, store_id=store_id)
        elif response.status_code == 200:
            body = response.json(); res = body.get("result", body)
            if confirm and res.get("status") == "draft":
                res = await _pf_post(client, f"/orders/{res['id']}/confirm", store_id=store_id)
        else:
            raise HTTPException(502, "Could not reconcile the existing Printful order; retry later.")
    upd = {
        "printful_order_id": res.get("id"),
        "printful_status": res.get("status"),
        "printful_confirmed": bool(confirm),
        "printful_synced_at": now_utc().isoformat(),
        "fulfillment_skipped_items": skipped,
        "fulfillment_error": None,
    }
    await db.orders.update_one({"id": order["id"]}, {"$set": upd})
    return {"printful_order_id": res.get("id"), "status": res.get("status"), "skipped": skipped}


async def _is_live_payments() -> bool:
    try:
        from routers.settings import get_setting
        mode = (await get_setting("paypal_mode")) or os.environ.get("PAYPAL_MODE", "sandbox")
        stripe_key = (await get_setting("stripe_secret_key")) or os.environ.get("STRIPE_API_KEY", "")
        return mode == "live" or str(stripe_key).startswith("sk_live")
    except Exception:
        return False


async def try_auto_fulfill_order(order_id: str):
    """Best-effort: called after a cart order is paid. Auto-confirms a Printful
    order ONLY when real (live) payments are active; otherwise records a
    skipped-in-test-mode marker so nothing is charged during sandbox testing."""
    try:
        if not await _resolve_token():
            return
        from routers.settings import get_setting
        if (await get_setting("printful_fulfill_enabled")) is False:
            return
        order = await db.orders.find_one({"id": order_id})
        if not order or order.get("printful_order_id"):
            return
        items, skipped, _store = await _resolve_items(order)
        if not items:
            return  # nothing Printful can fulfill (all manual products)
        payment = await db.payment_transactions.find_one({"item_type": "cart", "item_id": order_id, "payment_status": "paid"})
        sandbox_payment = (payment or {}).get("provider_environment") == "sandbox"
        if sandbox_payment or not await _is_live_payments():
            await db.orders.update_one(
                {"id": order_id},
                {"$set": {"printful_status": "skipped_test_mode", "fulfillment_skipped_items": skipped}},
            )
            logger.info(f"[printful] auto-fulfill skipped for order {order_id} (payments not live)")
            return
        await submit_printful_order(order, confirm=True)
        logger.info(f"[printful] auto-confirmed fulfillment for order {order_id}")
    except Exception as e:
        logger.warning(f"[printful] auto-fulfill failed for {order_id}: {e}")
        await db.orders.update_one({"id": order_id}, {"$set": {"fulfillment_error": str(e)[:300]}})


@api.post("/admin/orders/{order_id}/fulfill")
async def admin_fulfill_order(order_id: str, request: Request, confirm: bool = False):
    await require_role(request, ["admin"])
    order = await db.orders.find_one({"id": order_id})
    if not order:
        raise HTTPException(404, "Order not found")
    return await submit_printful_order(order, confirm=confirm)


@api.get("/admin/orders/{order_id}/fulfillment")
async def admin_order_fulfillment(order_id: str, request: Request):
    await require_role(request, ["admin"])
    order = await db.orders.find_one({"id": order_id}, {"_id": 0})
    if not order or not order.get("printful_order_id"):
        raise HTTPException(404, "Order not sent to Printful yet")
    store_id = await _selected_store_id()
    async with httpx.AsyncClient(timeout=30) as client:
        res = await _pf_get(client, f"/orders/{order['printful_order_id']}", store_id=store_id)
    shipments = res.get("shipments") or []
    if shipments:
        s0 = shipments[0]
        await db.orders.update_one(
            {"id": order_id},
            {"$set": {"tracking_number": s0.get("tracking_number"),
                      "tracking_url": s0.get("tracking_url"),
                      "printful_status": res.get("status")}},
        )
    return res


@api.post("/webhook/printful")
async def printful_webhook(request: Request):
    """Printful webhook — package_shipped delivers tracking. Idempotent."""
    try:
        event = await request.json()
    except Exception:
        raise HTTPException(400, "Invalid JSON")
    if event.get("type") == "package_shipped":
        data = event.get("data", {}) or {}
        pf_id = (data.get("order", {}) or {}).get("id")
        local = await db.orders.find_one({"printful_order_id": pf_id}) if pf_id else None
        if local:
            store_id = await _selected_store_id()
            async with httpx.AsyncClient(timeout=30) as client:
                verified = await _pf_get(client, f"/orders/{int(pf_id)}", store_id=store_id)
            shipments = verified.get("shipments") or []
            if not shipments:
                return {"received": True}
            ship = shipments[-1]
            await db.orders.update_one(
                {"printful_order_id": pf_id},
                {"$set": {"status": "shipped", "printful_status": "shipped",
                          "tracking_number": ship.get("tracking_number"),
                          "tracking_url": ship.get("tracking_url"),
                          "shipped_at": now_utc().isoformat()}},
            )
    return {"received": True}
