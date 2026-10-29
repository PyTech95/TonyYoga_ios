// Shared pieces for Admin → Students & access.
import { useEffect, useState } from "react";
import { api } from "@/lib/api";

export const LIFETIME = "2099";

export function fmtDate(iso) {
  if (!iso) return "—";
  if (String(iso).startsWith(LIFETIME)) return "Lifetime";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? String(iso).slice(0, 10) : d.toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
}

export function fmtDateTime(iso) {
  if (!iso) return "—";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? String(iso) : d.toLocaleString(undefined, { day: "numeric", month: "short", year: "numeric", hour: "numeric", minute: "2-digit" });
}

export function money(amount, currency) {
  const n = Number(amount || 0);
  try { return new Intl.NumberFormat(undefined, { style: "currency", currency: String(currency || "EUR").toUpperCase() }).format(n); }
  catch { return `${n.toFixed(2)} ${String(currency || "").toUpperCase()}`; }
}

export const errText = (e, fallback = "Something went wrong") => {
  const d = e?.response?.data?.detail;
  if (Array.isArray(d)) return d.map((x) => x.msg).join(", ");
  return d || fallback;
};

const STATE_STYLE = {
  active: "bg-[#E4F0E8] text-[#3E7C57]", upcoming: "bg-[#F3E7C9] text-[#8A6D3B]", expired: "bg-[#F2F2EC] text-[#6B7269]",
  revoked: "bg-[#FBEFEA] text-[#B25A45]", cancelled: "bg-[#FBEFEA] text-[#B25A45]", none: "bg-[#F2F2EC] text-[#6B7269]",
  paid: "bg-[#E4F0E8] text-[#3E7C57]", unconfirmed: "bg-[#F3E7C9] text-[#8A6D3B]", abandoned: "bg-[#F2F2EC] text-[#6B7269]",
};

export function StateChip({ state, children }) {
  return <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-widest ${STATE_STYLE[state] || STATE_STYLE.none}`}>{children || state}</span>;
}

export const inputCls = "w-full rounded-xl border border-[#E5E6DF] bg-white px-3 py-2 text-[14px] focus:outline-none focus:ring-2 focus:ring-[#B25A45]";
export const smallBtn = "inline-flex items-center gap-1.5 rounded-full border border-[#E5E6DF] bg-white px-3 py-1.5 text-[12px] font-semibold text-[#1C221F] hover:border-[#B25A45] disabled:opacity-50";
export const primaryBtn = "inline-flex items-center justify-center gap-1.5 rounded-full bg-[#B25A45] px-4 py-2 text-[13px] font-semibold text-white hover:opacity-90 disabled:opacity-50";

/** How long access lasts: preset days, until a date, or lifetime (+ optional start date). */
export function DurationPicker({ value, onChange, allowStart = true }) {
  const set = (patch) => onChange({ ...value, ...patch });
  const presets = [[30, "30 days"], [90, "3 months"], [180, "6 months"], [365, "1 year"]];
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-1.5">
        {presets.map(([d, label]) => (
          <button key={d} type="button" onClick={() => set({ mode: "days", days: d })}
            className={`rounded-full px-3 py-1.5 text-[12px] font-semibold border ${value.mode === "days" && Number(value.days) === d ? "bg-[#1C221F] text-white border-[#1C221F]" : "bg-white border-[#E5E6DF]"}`}>{label}</button>
        ))}
        <button type="button" onClick={() => set({ mode: "until" })} className={`rounded-full px-3 py-1.5 text-[12px] font-semibold border ${value.mode === "until" ? "bg-[#1C221F] text-white border-[#1C221F]" : "bg-white border-[#E5E6DF]"}`}>Until a date</button>
        <button type="button" onClick={() => set({ mode: "lifetime" })} className={`rounded-full px-3 py-1.5 text-[12px] font-semibold border ${value.mode === "lifetime" ? "bg-[#1C221F] text-white border-[#1C221F]" : "bg-white border-[#E5E6DF]"}`}>Lifetime</button>
      </div>
      <div className="grid grid-cols-2 gap-2">
        {value.mode === "days" && (
          <label className="text-[11px] text-[#6B7269]">Days
            <input type="number" min="1" max="3650" className={inputCls} value={value.days || ""} onChange={(e) => set({ days: e.target.value })} />
          </label>
        )}
        {value.mode === "until" && (
          <label className="text-[11px] text-[#6B7269]">Ends on
            <input type="date" className={inputCls} value={value.until || ""} onChange={(e) => set({ until: e.target.value })} />
          </label>
        )}
        {allowStart && (
          <label className="text-[11px] text-[#6B7269]">Starts (optional)
            <input type="date" className={inputCls} value={value.start || ""} onChange={(e) => set({ start: e.target.value })} />
          </label>
        )}
      </div>
    </div>
  );
}

export const defaultDuration = () => ({ mode: "days", days: 30, until: "", start: "" });

export function durationPayload(v) {
  const out = {};
  if (v.start) out.starts_at = new Date(`${v.start}T00:00:00`).toISOString();
  if (v.mode === "lifetime") out.lifetime = true;
  else if (v.mode === "until") {
    if (!v.until) throw new Error("Choose the end date.");
    out.ends_at = new Date(`${v.until}T23:59:00`).toISOString();
  } else {
    const d = parseInt(v.days, 10);
    if (!d || d < 1) throw new Error("Enter the number of days.");
    out.days = d;
  }
  return out;
}

/** Courses, plans, class series and upcoming classes for the admin pickers (loaded once). */
let catalogCache = null;
export function useCatalog() {
  const [cat, setCat] = useState(catalogCache);
  useEffect(() => {
    if (catalogCache) return;
    Promise.all([
      api.get("/admin/programs").catch(() => ({ data: [] })),
      api.get("/admin/membership-plans").catch(() => ({ data: [] })),
      api.get("/class-templates").catch(() => ({ data: [] })),
      api.get("/class-instances").catch(() => ({ data: [] })),
    ]).then(([p, m, ct, ci]) => {
      const now = new Date().toISOString();
      catalogCache = {
        programs: (p.data || []).map((x) => ({ id: x.id, title: x.title })).sort((a, b) => a.title.localeCompare(b.title)),
        plans: (m.data || []).map((x) => ({ ...x, label: planLabel(x) })),
        series: (ct.data || []).filter((x) => x.location_type === "online").map((x) => ({ id: x.id, title: x.title })),
        classes: (ci.data || []).filter((x) => x.status !== "cancelled" && String(x.start_time) > now)
          .sort((a, b) => String(a.start_time).localeCompare(String(b.start_time))).slice(0, 120),
      };
      setCat(catalogCache);
    });
  }, []);
  return cat;
}
export const resetCatalog = () => { catalogCache = null; };

const I18N_PLAN = { "i18n:memb.plan.essential.name": "Essential", "i18n:memb.plan.unlimited.name": "Unlimited", "i18n:memb.plan.annual.name": "Annual VIP" };
export function planLabel(plan) {
  const n = plan?.name || "";
  if (I18N_PLAN[n]) return I18N_PLAN[n];
  if (n.startsWith("i18n:")) { const parts = n.slice(5).split("."); return (parts[parts.length - 2] || n).replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()); }
  return n || "Membership";
}
