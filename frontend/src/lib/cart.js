// LocalStorage-backed cart with react hook for reactivity
import { useSyncExternalStore } from "react";

const KEY = "ty_cart_v1";
const PROMO_KEY = "ty_cart_promo_v1";
const listeners = new Set();

function read() {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? JSON.parse(raw) : [];
  } catch { return []; }
}
function write(items) {
  try { localStorage.setItem(KEY, JSON.stringify(items)); } catch {}
  listeners.forEach((fn) => fn());
}
function readPromo() {
  try {
    const raw = localStorage.getItem(PROMO_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}
function writePromo(promo) {
  try {
    if (promo) localStorage.setItem(PROMO_KEY, JSON.stringify(promo));
    else localStorage.removeItem(PROMO_KEY);
  } catch {}
  listeners.forEach((fn) => fn());
}

export const cart = {
  get: () => read(),
  add: (product, variant = null, qty = 1) => {
    const items = read();
    const key = `${product.id}|${variant || ""}`;
    const idx = items.findIndex((i) => i.key === key);
    if (idx >= 0) items[idx].quantity += qty;
    else items.push({
      key, product_id: product.id, title: product.title,
      price: product.price, currency: product.currency || "usd",
      image: product.images?.[0] || null, variant, quantity: qty,
    });
    write(items);
  },
  updateQty: (key, qty) => {
    const items = read();
    const idx = items.findIndex((i) => i.key === key);
    if (idx < 0) return;
    if (qty <= 0) items.splice(idx, 1);
    else items[idx].quantity = qty;
    write(items);
  },
  remove: (key) => write(read().filter((i) => i.key !== key)),
  clear: () => { writePromo(null); write([]); },
  count: () => read().reduce((n, i) => n + i.quantity, 0),
  subtotal: () => read().reduce((n, i) => n + i.price * i.quantity, 0),
  // Bundle "buy-together" promo (a course's related products at a discount)
  getPromo: () => readPromo(),
  setPromo: (promo) => writePromo(promo),
  clearPromo: () => writePromo(null),
  // Discount amount that actually applies given what's in the cart right now.
  discount: () => {
    const promo = readPromo();
    if (!promo || !promo.product_ids?.length || !promo.pct) return 0;
    const items = read();
    const inCart = new Set(items.map((i) => i.product_id));
    const hasAll = promo.product_ids.every((pid) => inCart.has(pid));
    if (!hasAll) return 0;
    const eligible = items
      .filter((i) => promo.product_ids.includes(i.product_id))
      .reduce((n, i) => n + i.price * i.quantity, 0);
    return Math.round(eligible * promo.pct) / 100;
  },
};

function subscribe(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}
function getSnapshot() { return localStorage.getItem(KEY) || "[]"; }

export function useCart() {
  useSyncExternalStore(subscribe, getSnapshot, () => "[]");
  const promo = cart.getPromo();
  const discount = cart.discount();
  const subtotal = cart.subtotal();
  return {
    items: cart.get(),
    count: cart.count(),
    subtotal,
    promo,
    discount,
    total: Math.max(0, Math.round((subtotal - discount) * 100) / 100),
    add: cart.add,
    updateQty: cart.updateQty,
    remove: cart.remove,
    clear: cart.clear,
    setPromo: cart.setPromo,
    clearPromo: cart.clearPromo,
  };
}
