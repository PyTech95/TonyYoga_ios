import { useEffect, useRef, useState } from "react";
import { useLocation } from "react-router-dom";
import { useAuth } from "@/lib/auth";
import { api } from "@/lib/api";

const PUBLIC_PAGES = new Set(["/", "/home", "/welcome", "/schedule", "/programs", "/asanas", "/discover", "/meditations", "/find-your-path", "/quiz", "/breathwork", "/memberships", "/shop", "/teacher-training", "/private-sessions", "/challenges", "/workshops", "/news", "/broadcasts", "/leaderboard", "/passes", "/support", "/privacy", "/terms"]);
const SESSION_KEY = "ty_usage_session";
function sessionId() {
  const now = Date.now();
  let session;
  try { session = JSON.parse(sessionStorage.getItem(SESSION_KEY)); } catch {}
  if (!session?.id || now - session.last > 30 * 60 * 1000) session = { id: crypto.randomUUID() };
  session.last = now;
  sessionStorage.setItem(SESSION_KEY, JSON.stringify(session));
  return session.id;
}
function platform() {
  // Never treat the ?native=1 preview override as an actual app installation.
  if (window.Capacitor?.isNativePlatform?.()) return "native";
  return window.matchMedia("(display-mode: standalone)").matches || navigator.standalone ? "pwa" : "website";
}

export const UsageTracker = () => {
  const { pathname, key, search } = useLocation();
  const { user, ready } = useAuth();
  const [preference, setPreference] = useState(0);
  const sent = useRef(null), measured = useRef(false);
  useEffect(() => {
    const changed = () => setPreference(value => value + 1);
    window.addEventListener("tony-analytics-preference", changed);
    window.addEventListener("storage", changed);
    return () => { window.removeEventListener("tony-analytics-preference", changed); window.removeEventListener("storage", changed); };
  }, []);
  useEffect(() => {
    try { if (localStorage.getItem("ty_usage_opt_out") === "1") return; } catch { return; }
    const root = "/" + pathname.split("/").filter(Boolean).slice(0, 1).join("");
    if (!ready || window.self !== window.top || !PUBLIC_PAGES.has(root) ||
        ["admin", "instructor", "support"].includes(user?.role) ||
        new URLSearchParams(search).has("edit") || navigator.doNotTrack === "1" || navigator.globalPrivacyControl) return;
    let cancelled = false;
    const timer = setTimeout(async () => {
      try {
        const { data } = await api.get("/analytics/config");
        if (cancelled || !data.enabled || sent.current === key) return;
        const nav = performance.getEntriesByType("navigation")[0];
        const load = !measured.current && nav?.loadEventEnd > 0 ? Math.round(nav.loadEventEnd - nav.startTime) : null;
        measured.current = true;
        sent.current = key;
        await api.post("/analytics/events", { event_id: crypto.randomUUID(), session_id: sessionId(), path: root,
          platform: platform(), load_ms: load !== null && load <= 120000 ? load : null });
      } catch { /* Usage collection must never interrupt the visitor experience. */ }
    }, 750);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [pathname, key, search, user?.role, ready, preference]);
  return null;
};