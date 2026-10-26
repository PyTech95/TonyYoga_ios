// Detects whether the app is running inside the Capacitor native mobile app
// (iOS/Android) vs a normal web browser. The native runtime injects a global
// `window.Capacitor`; the web build never has isNativePlatform() === true.
//
// Testing override: append ?native=1 to the URL to simulate the mobile app in a
// browser (persists for the tab), or ?native=0 to clear it.
export function isNativeApp() {
  try {
    if (typeof window === "undefined") return false;

    const params = new URLSearchParams(window.location.search);
    const override = params.get("native");
    if (override === "1") { try { sessionStorage.setItem("__force_native", "1"); } catch {} }
    if (override === "0") { try { sessionStorage.removeItem("__force_native"); } catch {} }
    try { if (sessionStorage.getItem("__force_native") === "1") return true; } catch {}

    const cap = window.Capacitor;
    if (cap && typeof cap.isNativePlatform === "function") return cap.isNativePlatform();
    if (cap && typeof cap.getPlatform === "function") return ["ios", "android"].includes(cap.getPlatform());
    return false;
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// Public website address. Inside the app, window.location.origin is the app's
// internal server (https://localhost / capacitor://localhost), which nobody else
// can open — so shared links and payment return pages use the public site.
// Set REACT_APP_SITE_URL at build time, or the backend's FRONTEND_URL is used.
let siteUrl = (process.env.REACT_APP_SITE_URL || "").trim().replace(/\/$/, "");

export function setSiteUrl(url) {
  if (!siteUrl && typeof url === "string" && /^https?:\/\//.test(url)) siteUrl = url.trim().replace(/\/$/, "");
}

export function publicOrigin() {
  if (typeof window === "undefined") return siteUrl;
  return isNativeApp() ? (siteUrl || window.location.origin) : window.location.origin;
}

/** Fields every checkout request sends so the server can build the right return URLs. */
export function checkoutContext() {
  return { origin_url: publicOrigin(), client: isNativeApp() ? "app" : "web" };
}

/** Remember that a payment page was opened outside the app, so the app refreshes on return. */
export function markExternalCheckout() {
  if (!isNativeApp()) return;
  try { sessionStorage.setItem("ty_checkout_pending", String(Date.now())); } catch {}
}

/** Copy text, falling back to a hidden textarea where the Clipboard API is unavailable
 *  (older Android WebViews, non-secure contexts). Resolves true on success. */
export async function copyText(text) {
  try {
    if (navigator.clipboard?.writeText) { await navigator.clipboard.writeText(text); return true; }
  } catch { /* fall through */ }
  try {
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.setAttribute("readonly", "");
    ta.style.cssText = "position:fixed;top:0;left:0;opacity:0;pointer-events:none;font-size:16px";
    document.body.appendChild(ta);
    ta.select();
    ta.setSelectionRange(0, text.length);
    const ok = document.execCommand("copy");
    document.body.removeChild(ta);
    return ok;
  } catch {
    return false;
  }
}
