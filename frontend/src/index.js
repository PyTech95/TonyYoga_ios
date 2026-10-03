import React from "react";
import ReactDOM from "react-dom/client";
import "@/index.css";
import "@/i18n";
import App from "@/App";
import AppErrorBoundary from "@/components/AppErrorBoundary";

// Register service worker for PWA
if ("serviceWorker" in navigator && !window.Capacitor?.isNativePlatform?.()) {
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
