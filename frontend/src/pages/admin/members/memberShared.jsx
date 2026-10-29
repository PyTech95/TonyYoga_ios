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

// ---------------------------------------------------------------------------
// Pickers and helpers shared by the Add-student wizard, the drawer and bulk actions

/** Bottom sheet on phones, centred dialog on larger screens. */
export function Modal({ title, onClose, children, testId, wide = false }) {
  return (
    <div className="fixed inset-0 z-[70] flex items-end sm:items-center justify-center p-0 sm:p-4" data-testid={testId}>
      <button className="absolute inset-0 bg-black/40" onClick={onClose} aria-label="Close" />
      <div className={`relative w-full ${wide ? "sm:max-w-2xl" : "sm:max-w-lg"} max-h-[92vh] overflow-y-auto rounded-t-3xl sm:rounded-3xl bg-[#FAFAF7] p-5 space-y-4`}>
        <div className="flex items-center justify-between gap-3">
          <h3 className="serif text-xl">{title}</h3>
          <button onClick={onClose} aria-label="Close" data-testid={testId ? `${testId}-close` : undefined} className="h-8 w-8 rounded-full hover:bg-[#F2F2EC] flex items-center justify-center text-[#545E56]">✕</button>
        </div>
        {children}
      </div>
    </div>
  );
}

export const emptyCourses = () => ({ all: false, ids: [] });

/** Several courses at once: search, tick boxes, or "Select all courses". */
export function CourseMultiSelect({ programs, value, onChange, testId = "course-multi" }) {
  const [q, setQ] = useState("");
  const list = (programs || []).filter((p) => !q.trim() || p.title.toLowerCase().includes(q.trim().toLowerCase()));
  const ids = new Set(value.ids || []);
  const toggle = (id) => {
    const next = new Set(ids);
    if (next.has(id)) next.delete(id); else next.add(id);
    onChange({ all: false, ids: [...next] });
  };
  const count = value.all ? (programs || []).length : ids.size;
  return (
    <div className="rounded-xl border border-[#E5E6DF] bg-white p-2.5 space-y-2" data-testid={testId}>
      <div className="flex items-center gap-2">
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search courses" className={inputCls} data-testid={`${testId}-search`} disabled={value.all} />
        <span className="shrink-0 text-[11px] font-semibold text-[#6B7269]" data-testid={`${testId}-count`}>{count} selected</span>
      </div>
      <label className="flex items-center gap-2 rounded-lg bg-[#F7F2EC] px-2.5 py-2 text-[13px] font-semibold cursor-pointer">
        <input type="checkbox" className="h-4 w-4 accent-[#B25A45]" checked={!!value.all} onChange={(e) => onChange({ all: e.target.checked, ids: [] })} data-testid={`${testId}-all`} />
        Select all courses{programs?.length ? ` (${programs.length})` : ""}
        <span className="font-normal text-[11px] text-[#6B7269]">every course on Tony Yoga today</span>
      </label>
      {!value.all && (
        <ul className="max-h-56 overflow-y-auto divide-y divide-[#F0F0EA]">
          {list.length === 0 && <li className="py-2 text-[12px] text-[#9AA096]">No course matches.</li>}
          {list.map((p) => (
            <li key={p.id}>
              <label className="flex items-center gap-2 py-2 px-1 text-[13px] cursor-pointer">
                <input type="checkbox" className="h-4 w-4 accent-[#B25A45]" checked={ids.has(p.id)} onChange={() => toggle(p.id)} data-testid={`${testId}-opt-${p.id}`} />
                <span className="truncate">{p.title}</span>
              </label>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** {all_programs:true} | {program_ids:[…]} for the API. Throws when nothing is chosen. */
export function coursePayload(sel) {
  if (sel?.all) return { all_programs: true };
  if (!sel?.ids?.length) throw new Error("Choose at least one course.");
  return { program_ids: sel.ids };
}

export const hasCourses = (sel) => !!(sel?.all || sel?.ids?.length);

/** Labels such as "old website", "VIP", "Madrid studio". */
export function TagsEditor({ tags, onChange, testId = "tags" }) {
  const [draft, setDraft] = useState("");
  const add = () => {
    const parts = draft.split(",").map((x) => x.trim()).filter(Boolean);
    if (!parts.length) return;
    onChange([...new Set([...(tags || []), ...parts.map((x) => x.slice(0, 30))])].slice(0, 20));
    setDraft("");
  };
  return (
    <div className="space-y-2" data-testid={testId}>
      <div className="flex flex-wrap gap-1.5">
        {(tags || []).length === 0 && <span className="text-[12px] text-[#9AA096]">No tags yet.</span>}
        {(tags || []).map((t) => (
          <span key={t} className="inline-flex items-center gap-1 rounded-full bg-[#EEF1EC] px-2.5 py-1 text-[12px] font-semibold text-[#3E5A47]" data-testid={`${testId}-chip-${t}`}>
            {t}
            <button type="button" aria-label={`Remove ${t}`} onClick={() => onChange((tags || []).filter((x) => x !== t))} className="text-[#839682] hover:text-[#B25A45]">×</button>
          </span>
        ))}
      </div>
      <div className="flex gap-2">
        <input value={draft} onChange={(e) => setDraft(e.target.value)} placeholder="Add a tag (e.g. old website, VIP)"
          onKeyDown={(e) => { if (e.key === "Enter" || e.key === ",") { e.preventDefault(); add(); } }}
          className={inputCls} data-testid={`${testId}-input`} />
        <button type="button" className={smallBtn} onClick={add} data-testid={`${testId}-add`}>Add</button>
      </div>
    </div>
  );
}

/** A password that is easy to read out (no 0/O, 1/l). */
export function genPassword(len = 12) {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789";
  const out = [];
  const rnd = new Uint32Array(len);
  try { window.crypto.getRandomValues(rnd); } catch { for (let i = 0; i < len; i++) rnd[i] = Math.floor(Math.random() * 1e9); }
  for (let i = 0; i < len; i++) out.push(chars[rnd[i] % chars.length]);
  return out.join("");
}

/** How a payment row should be shown: paid / refunded / part-refunded / waiting / not paid. */
export function paymentState(p) {
  if (p.payment_status === "refunded") return { state: "revoked", label: "Refunded", refundable: false };
  if (p.payment_status === "partially_refunded") return { state: "upcoming", label: "Part refunded", refundable: true };
  if (p.confirmed) return { state: "paid", label: p.delivered ? "Paid · delivered" : "Paid", refundable: true };
  if (["expired", "cancelled", "failed"].includes(p.status)) return { state: "abandoned", label: "Not paid", refundable: false };
  return { state: "unconfirmed", label: "Waiting", refundable: false };
}

export async function copyText(text) {
  try { await navigator.clipboard.writeText(text); return true; } catch { window.prompt("Copy this:", text); return false; }
}
