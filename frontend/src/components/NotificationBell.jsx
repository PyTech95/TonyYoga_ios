import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { Bell, Megaphone, Mic, Video, X } from "lucide-react";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";

const ICONS = { announcement: Megaphone, broadcast: Mic, recording: Video };

function timeAgo(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  const s = Math.floor((Date.now() - d.getTime()) / 1000);
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

export default function NotificationBell() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState([]);
  const [unread, setUnread] = useState(0);
  const ref = useRef(null);

  const load = async () => {
    try {
      const { data } = await api.get("/notifications");
      setItems(data.items || []);
      setUnread(data.unread || 0);
    } catch { /* not logged in / transient */ }
  };

  useEffect(() => {
    if (!user) return;
    load();
    const t = setInterval(load, 60000);
    return () => clearInterval(t);
  }, [user]);

  useEffect(() => {
    const onClick = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  if (!user) return null;

  const toggle = async () => {
    const next = !open;
    setOpen(next);
    if (next && unread > 0) {
      try { await api.post("/notifications/seen"); } catch {}
      setUnread(0);
    }
  };

  return (
    <div ref={ref} className="relative" data-testid="notification-bell">
      <button
        onClick={toggle}
        data-testid="notification-bell-button"
        className="relative flex h-10 w-10 items-center justify-center rounded-full bg-white/90 text-[#1C221F] shadow-sm ring-1 ring-black/5 backdrop-blur transition hover:bg-white"
        aria-label="Notifications"
      >
        <Bell className="h-[18px] w-[18px]" strokeWidth={1.8} />
        {unread > 0 && (
          <span
            data-testid="notification-unread-badge"
            className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-[#B25A45] px-1 text-[10px] font-bold text-white"
          >
            {unread > 9 ? "9+" : unread}
          </span>
        )}
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -8, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -8, scale: 0.98 }}
            transition={{ duration: 0.16 }}
            data-testid="notification-panel"
            className="absolute right-0 mt-2 w-80 overflow-hidden rounded-2xl border border-[#E5E6DF] bg-white shadow-xl"
          >
            <div className="flex items-center justify-between border-b border-[#EFF0EA] px-4 py-3">
              <span className="text-[13px] font-semibold text-[#1C221F]">Notifications</span>
              <button onClick={() => setOpen(false)} className="text-[#6B7269] hover:text-[#1C221F]">
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="max-h-[60vh] overflow-y-auto">
              {items.length === 0 ? (
                <div className="px-4 py-10 text-center text-[13px] text-[#6B7269]">
                  You're all caught up 🌿
                </div>
              ) : (
                items.map((n, i) => {
                  const Icon = ICONS[n.type] || Bell;
                  return (
                    <button
                      key={i}
                      data-testid={`notification-item-${i}`}
                      onClick={() => { setOpen(false); if (n.url) navigate(n.url); }}
                      className="flex w-full gap-3 border-b border-[#F4F4EF] px-4 py-3 text-left transition hover:bg-[#FAFAF7]"
                    >
                      <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#B25A45]/10 text-[#B25A45]">
                        <Icon className="h-4 w-4" strokeWidth={1.8} />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[13px] font-semibold text-[#1C221F]">{n.title}</span>
                        {n.body && <span className="mt-0.5 block line-clamp-2 text-[12px] text-[#6B7269]">{n.body}</span>}
                        <span className="mt-1 block text-[11px] text-[#9AA096]">{timeAgo(n.at)}</span>
                      </span>
                    </button>
                  );
                })
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
