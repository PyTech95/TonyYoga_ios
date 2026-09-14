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
