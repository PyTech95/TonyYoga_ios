"""Shipping & orders module: cart address capture + admin order fulfillment."""
from typing import Optional, List, Dict, Any
from fastapi import Depends, HTTPException, Request
from pydantic import BaseModel, EmailStr

from core import api, db, now_utc, gen_id, get_current_user, require_role


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
    status: str  # pending | paid | fulfilled | shipped | completed | cancelled
    tracking_number: Optional[str] = None
    notes: Optional[str] = None


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
async def list_all_orders(request: Request, status: Optional[str] = None):
    await require_role(request, ["admin", "support"])
    q = {"status": status} if status else {}
    return await db.orders.find(q, {"_id": 0}).sort("created_at", -1).to_list(500)


@api.post("/admin/orders/status")
async def update_order_status(payload: OrderStatusUpdate, request: Request):
    await require_role(request, ["admin", "support"])
    valid = ["pending", "paid", "fulfilled", "shipped", "completed", "cancelled"]
    if payload.status not in valid:
        raise HTTPException(400, f"Invalid status. Must be one of {valid}")
    update = {"status": payload.status, "updated_at": now_utc().isoformat()}
    if payload.tracking_number:
        update["tracking_number"] = payload.tracking_number
    if payload.notes:
        update["admin_notes"] = payload.notes
    r = await db.orders.update_one({"id": payload.order_id}, {"$set": update})
    if r.matched_count == 0:
        raise HTTPException(404, "Order not found")
    return {"ok": True}
