import React from "react";
import ReactDOM from "react-dom/client";
import "@/index.css";
import "@/i18n";
import App from "@/App";
import AppErrorBoundary from "@/components/AppErrorBoundary";
import { isNativeApp, setSiteUrl } from "@/lib/platform";
import { api } from "@/lib/api";

const native = isNativeApp();

if (native) {
  // Inside the iOS / Android app the page should behave like a native screen:
  // no pinch / double-tap zoom and no input-focus zoom that leaves the layout stuck.
  document.documentElement.classList.add("ty-native");
  const viewport = document.querySelector('meta[name="viewport"]');
  if (viewport) {
    viewport.setAttribute("content", "width=device-width, initial-scale=1, minimum-scale=1, maximum-scale=1, user-scalable=no, viewport-fit=cover");
  }

  // Payment pages open in the phone's browser. When the member comes back to the app,
  // reload once so their new membership / course / booking shows straight away.
  const refreshAfterCheckout = () => {
    if (document.visibilityState === "hidden") return;
    let pending = null;
    try { pending = sessionStorage.getItem("ty_checkout_pending"); } catch {}
    if (!pending) return;
    // Ignore the instant before the browser actually opens.
    if (Date.now() - Number(pending) < 1500) return;
    try { sessionStorage.removeItem("ty_checkout_pending"); } catch {}
    window.location.reload();
  };
  document.addEventListener("visibilitychange", refreshAfterCheckout);
  document.addEventListener("resume", refreshAfterCheckout);
  window.addEventListener("focus", refreshAfterCheckout);

  // Learn the public website address for shareable links (see lib/platform.js).
  api.get("/settings/public").then(({ data }) => setSiteUrl(data?.site_url)).catch(() => {});
}

// Hide images that fail to load (offline, deleted upload) instead of showing the
// broken-image icon with alt text spilling over cards. Card backgrounds remain.
document.addEventListener("error", (event) => {
  const el = event.target;
  if (el && el.tagName === "IMG") el.classList.add("ty-img-broken");
}, true);
document.addEventListener("load", (event) => {
  const el = event.target;
  if (el && el.tagName === "IMG") el.classList.remove("ty-img-broken");
}, true);

// Register service worker for PWA (website only).
// The native app already ships its files inside the app bundle; a service worker there
// can keep serving screens from an older build after an app-store update, so it is
// skipped and any worker left over from earlier versions is removed.
if ("serviceWorker" in navigator && native) {
  navigator.serviceWorker.getRegistrations()
    .then((regs) => regs.forEach((r) => r.unregister()))
    .catch(() => {});
  if (window.caches?.keys) {
    window.caches.keys()
      .then((keys) => keys.filter((k) => k.startsWith("tony-yoga")).forEach((k) => window.caches.delete(k)))
      .catch(() => {});
  }
} else if ("serviceWorker" in navigator) {
  // When a NEW build's service worker takes over an already-controlled page,
  // reload once so users run the latest code. Skip the reload on the very first
  // visit (no prior controller) — clients.claim() fires controllerchange there
  // too, and reloading then blanks the first paint / aborts initial requests.
  const hadController = !!navigator.serviceWorker.controller;
  let refreshing = false;
  navigator.serviceWorker.addEventListener("controllerchange", () => {
    if (refreshing || !hadController) return;
    refreshing = true;
    window.location.reload();
  });
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js").then((reg) => {
      // Proactively check for an updated worker on each load.
      reg.update().catch(() => {});
    }).catch((err) => {
      console.warn("SW registration failed", err);
    });
  });
}

const root = ReactDOM.createRoot(document.getElementById("root"));
root.render(<AppErrorBoundary><App /></AppErrorBoundary>);
