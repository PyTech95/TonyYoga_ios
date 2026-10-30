"""Shipping & orders module: cart address capture + admin order fulfillment."""
from typing import Optional, List, Dict, Any
from fastapi import Depends, HTTPException, Request
from pydantic import BaseModel, EmailStr

from core import api, db, now_utc, gen_id, get_current_user, require_role, logger


class ShippingAddress(BaseModel):
    name: str
    line1: str
    line2: Optional[str] = None
    city: str
    state: Optional[str] = None
    postal_code: str
    country: str
    phone: Optional[str] = None


class OrderCreate(BaseModel):
    items: List[Dict[str, Any]]  # [{product_id, quantity, variant?}]
    shipping_address: ShippingAddress
    notes: Optional[str] = None
    bundle_program_id: Optional[str] = None  # apply a course's "buy-together" discount


class OrderStatusUpdate(BaseModel):
    order_id: str
    status: str  # pending | paid | processing | shipped | delivered | completed | cancelled | refunded
    tracking_number: Optional[str] = None
    tracking_url: Optional[str] = None
    carrier: Optional[str] = None
    notes: Optional[str] = None
    notify: bool = True


ORDER_STATUSES = ["pending", "paid", "processing", "fulfilled", "shipped", "delivered", "completed", "cancelled", "refunded"]
_CUSTOMER_MESSAGES = {
    "processing": ("Your order is being prepared", "Good news — your order is in production and will ship soon."),
    "shipped": ("Your order is on its way", "Your order has shipped."),
    "delivered": ("Your order was delivered", "Your order has been delivered. Enjoy, and thank you for supporting Tony Yoga!"),
    "cancelled": ("Your order was cancelled", "Your order was cancelled. If you were charged, the refund is on its way."),
    "refunded": ("Your order was refunded", "We refunded your order. It can take a few days to show on your statement."),
}


async def set_order_status(order_id: str, status: str, *, tracking_number=None, tracking_url=None, carrier=None,
                           note=None, by: str = "system", notify: bool = True) -> dict:
    """Change an order's status, keep a timeline, and tell the customer (bell, push, email)."""
    if status not in ORDER_STATUSES:
        raise HTTPException(400, f"Invalid status. Must be one of {ORDER_STATUSES}")
    order = await db.orders.find_one({"id": order_id}, {"_id": 0})
    if not order:
        raise HTTPException(404, "Order not found")
    now = now_utc().isoformat()
    update = {"status": status, "updated_at": now}
    for key, value in (("tracking_number", tracking_number), ("tracking_url", tracking_url), ("carrier", carrier)):
        if value:
            update[key] = value.strip()
    if note:
        update["admin_notes"] = note
    if status == "shipped" and not order.get("shipped_at"):
        update["shipped_at"] = now
    if status == "delivered":
        update["delivered_at"] = now
    changed = status != order.get("status") or any(update.get(k) and update.get(k) != order.get(k) for k in ("tracking_number", "tracking_url"))
    entry = {"status": status, "at": now, "by": by, "note": note, "tracking_number": update.get("tracking_number")}
    await db.orders.update_one({"id": order_id}, {"$set": update, "$push": {"status_history": entry}})
    if notify and changed and status in _CUSTOMER_MESSAGES and order.get("user_id"):
        title, body = _CUSTOMER_MESSAGES[status]
        tn = update.get("tracking_number") or order.get("tracking_number")
        tu = update.get("tracking_url") or order.get("tracking_url")
        if status == "shipped" and tn:
            body += f" Tracking number: {tn}."
        try:
            from notify import notify_member
            html_body = None
            if status == "shipped" and tu:
                import html as _h
                html_body = _h.escape(body) + f'<br/><br/><a href="{_h.escape(tu)}">Track your parcel</a>'
            await notify_member(order["user_id"], title, body, "/my-yoga?tab=orders", email_html=html_body,
                                dedupe_key=f"order:{order_id}:{status}:{tn or ''}")
        except Exception as exc:
            logger.warning("order notification failed (%s)", type(exc).__name__)
    return {**order, **update}


@api.post("/orders/create")
async def create_order(payload: OrderCreate, user: dict = Depends(get_current_user)):
    """Create an order draft with shipping address. Caller must follow with /checkout/session for payment."""
    if not payload.items:
        raise HTTPException(400, "No items in cart")
    total = 0.0; currency = "usd"
    enriched_items = []
    for it in payload.items:
        product = await db.products.find_one({"id": it["product_id"]})
        if not product:
            raise HTTPException(404, f"Product not found: {it['product_id']}")
        qty = int(it.get("quantity", 1))
        if qty < 1:
            raise HTTPException(400, f"Invalid quantity for {product['title']}")
        is_digital = product.get("type") == "ebook"
        if not is_digital:
            stock = int(product.get("stock_qty", 0) or 0)
            if stock < qty:
                raise HTTPException(400, f"'{product['title']}' is out of stock (only {stock} left)")
        line_total = product["price"] * qty
        total += line_total
        currency = product.get("currency", "usd")
        enriched_items.append({
            "product_id": product["id"], "title": product["title"],
            "quantity": qty, "unit_price": product["price"],
            "variant": it.get("variant"), "line_total": line_total,
        })
    # Bundle "buy-together" discount: if a course id is passed, discount the lines
    # that belong to that course's related products (server recomputes to prevent tampering).
    discount = 0.0
    bundle_meta = None
    if payload.bundle_program_id:
        program = await db.programs.find_one({"id": payload.bundle_program_id}, {"_id": 0})
        if program:
            pct = int(program.get("bundle_discount_pct") or 15)
            related_ids = set(program.get("related_product_ids") or [])
            eligible_sum = sum(
                li["line_total"] for li in enriched_items if li["product_id"] in related_ids
            )
            # Only honour the discount when the customer actually has the whole set.
            has_all = related_ids and related_ids.issubset({li["product_id"] for li in enriched_items})
            if has_all and pct > 0 and eligible_sum > 0:
                discount = round(eligible_sum * pct / 100.0, 2)
                bundle_meta = {
                    "program_id": payload.bundle_program_id,
                    "program_title": program.get("title", ""),
                    "discount_pct": pct,
                    "discount_amount": discount,
                }
    grand_total = round(max(0.0, total - discount), 2)
    order = {
        "id": gen_id(),
        "user_id": user["id"],
        "user_email": user["email"],
        "items": enriched_items,
        "shipping_address": payload.shipping_address.model_dump(),
        "notes": payload.notes,
        "subtotal": round(total, 2),
        "discount": discount,
        "bundle": bundle_meta,
        "total": grand_total,
        "currency": currency,
        "status": "pending",
        "tracking_number": None,
        "created_at": now_utc().isoformat(),
    }
    await db.orders.insert_one(order)
    order.pop("_id", None)
    return order


@api.get("/orders/mine")
async def my_orders(user: dict = Depends(get_current_user)):
    return await db.orders.find({"user_id": user["id"]}, {"_id": 0}).sort("created_at", -1).to_list(200)


@api.get("/me/downloads")
async def my_downloads(user: dict = Depends(get_current_user)):
    """Digital products (eBooks) the user has purchased — download links are only
    revealed here, gated by a paid order containing that product."""
    orders = await db.orders.find(
        {"user_id": user["id"], "status": {"$in": ["paid", "fulfilled", "shipped", "completed"]}},
        {"_id": 0, "items": 1},
    ).to_list(500)
    pids = set()
    for o in orders:
        for line in o.get("items", []):
            if line.get("product_id"):
                pids.add(line["product_id"])
    if not pids:
        return []
    prods = await db.products.find(
        {"id": {"$in": list(pids)}, "type": "ebook"}, {"_id": 0},
    ).to_list(200)
    return [
        {
            "product_id": p["id"],
            "title": p.get("title"),
            "author": p.get("author"),
            "images": p.get("images", []),
            "ebook_file_url": p.get("ebook_file_url"),
        }
        for p in prods
        if p.get("ebook_file_url")
    ]


@api.get("/orders/{order_id}")
async def get_order(order_id: str, user: dict = Depends(get_current_user)):
    order = await db.orders.find_one({"id": order_id}, {"_id": 0})
    if not order:
        raise HTTPException(404, "Order not found")
    if order["user_id"] != user["id"] and user.get("role") not in ("admin", "support"):
        raise HTTPException(403, "Forbidden")
    return order


@api.get("/admin/orders")
async def list_all_orders(request: Request, status: Optional[str] = None, q: Optional[str] = None):
    await require_role(request, ["admin", "support"])
    query: Dict[str, Any] = {}
    if status == "open":
        query["status"] = {"$in": ["paid", "processing", "fulfilled"]}
    elif status:
        query["status"] = status
    if q and q.strip():
        import re
        rx = re.escape(q.strip())
        query["$or"] = [{"user_email": {"$regex": rx, "$options": "i"}}, {"id": {"$regex": rx, "$options": "i"}},
                        {"shipping_address.name": {"$regex": rx, "$options": "i"}}, {"tracking_number": {"$regex": rx, "$options": "i"}}]
    rows = await db.orders.find(query, {"_id": 0}).sort("created_at", -1).to_list(500)
    names = {u["id"]: u.get("name") for u in await db.users.find({"id": {"$in": list({r.get("user_id") for r in rows})}}, {"_id": 0, "id": 1, "name": 1}).to_list(1000)}
    for r in rows:
        r["customer_name"] = names.get(r.get("user_id")) or (r.get("shipping_address") or {}).get("name")
    return rows


@api.get("/admin/orders/{order_id}/detail")
async def admin_order_detail(order_id: str, request: Request):
    await require_role(request, ["admin", "support"])
    order = await db.orders.find_one({"id": order_id}, {"_id": 0})
    if not order:
        raise HTTPException(404, "Order not found")
    payment = await db.payment_transactions.find_one(
        {"$or": [{"item_type": "cart", "item_id": order_id}, {"metadata.order_id": order_id}, {"id": order_id.replace("payment:", "")}]},
        {"_id": 0, "access_snapshot": 0}, sort=[("created_at", -1)])
    customer = await db.users.find_one({"id": order.get("user_id")}, {"_id": 0, "id": 1, "name": 1, "email": 1, "phone": 1})
    return {"order": order, "payment": payment, "customer": customer}


@api.post("/admin/orders/status")
async def update_order_status(payload: OrderStatusUpdate, request: Request):
    admin = await require_role(request, ["admin", "support"])
    await set_order_status(payload.order_id, payload.status, tracking_number=payload.tracking_number,
                           tracking_url=payload.tracking_url, carrier=payload.carrier, note=payload.notes,
                           by=admin.get("email") or "admin", notify=payload.notify)
    return {"ok": True}
