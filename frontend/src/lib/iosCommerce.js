import { registerPlugin } from "@capacitor/core";
import { api, tokenStore } from "./api";
import { isIOSApp } from "./iosPlatform";

export const AppleCommerce = registerPlugin("TonYogaCommerce");
export const COMMERCE_UPDATED = "tonyoga-commerce-updated";
export const refreshCommerce = () => window.dispatchEvent(new Event(COMMERCE_UPDATED));
let restoring = false;

export async function getIOSOffer(itemType, itemId) {
  const { data } = await api.get("/ios-commerce/offer", { params: { item_type: itemType, item_id: itemId } });
  return data;
}
export async function getAppleProduct(productId) {
  const { products } = await AppleCommerce.products({ ids: [productId] });
  const product = products.find(p => p.id === productId);
  if (!product) throw new Error("This item is not available from the App Store yet. Please try again later.");
  return product;
}
export async function deliverAppleTransaction(result) {
  if (!result?.jws) throw new Error("No signed Apple transaction was received.");
  const { data } = await api.post("/ios-commerce/verify", { signed_transaction: result.jws });
  if (data.finish !== true) throw new Error("Your purchase is pending verification. It will be retried; do not buy it again.");
  // A transaction is finished ONLY after the server verifies and durably handles it.
  await AppleCommerce.finishTransaction({ transactionId: result.transactionId });
  refreshCommerce();
  return data;
}
export async function buyWithApple(itemType, itemId) {
  const { data } = await api.post("/ios-commerce/prepare", { item_type: itemType, item_id: itemId });
  const product = await getAppleProduct(data.product_id);
  if (product.type !== data.apple_type) throw new Error("The App Store product type does not match this offer. Contact support.");
  const result = await AppleCommerce.purchase({ productId: data.product_id, appAccountToken: data.app_account_token });
  if (result.status === "cancelled" || result.status === "pending") return result;
  await deliverAppleTransaction(result);
  return { status: "success" };
}
export async function restoreApplePurchases(manual = true) {
  if (!isIOSApp() || !tokenStore.get() || restoring) return { restored: 0 };
  restoring = true;
  try {
    const result = manual ? await AppleCommerce.restorePurchases() : await AppleCommerce.pendingTransactions();
    let restored = 0, failed = 0;
    for (const transaction of result.transactions || []) {
      try { await deliverAppleTransaction(transaction); restored += 1; }
      catch { failed += 1; } // Leave unfinished transactions in Apple's queue for the next attempt.
    }
    return { restored, failed, truncated: !!result.truncated };
  } finally { restoring = false; }
}
export async function openIOSExternal(url) {
  if (!isIOSApp()) { window.location.assign(url); return; }
  await AppleCommerce.openExternal({ url });
}
export async function startIOSExternalCheckout(itemType, itemId, quantity = 1) {
  const { data } = await api.post("/ios-commerce/external-checkout", {
    item_type: itemType, item_id: itemId, quantity,
  });
  // Store an order reference only, never passwords, keys, or bearer tokens in a URL.
  sessionStorage.setItem("tonyoga_pending_checkout", data.order_id);
  await openIOSExternal(data.url);
  return data;
}
export async function checkIOSExternalCheckout() {
  const id = sessionStorage.getItem("tonyoga_pending_checkout");
  if (!id || !tokenStore.get()) return null;
  const { data } = await api.get(`/ios-commerce/external-status/${encodeURIComponent(id)}`);
  if (data.status === "paid") {
    sessionStorage.removeItem("tonyoga_pending_checkout");
    refreshCommerce();
  }
  return data;
}
