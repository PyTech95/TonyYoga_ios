// Shared pieces for the Hotel & Resort Partner Program pages (public, partner portal, admin).
import { CheckCircle2 } from "lucide-react";

export function fmtDate(iso) {
  if (!iso) return "—";
  const s = String(iso);
  // Plain dates (YYYY-MM-DD) are calendar days: show them without a time-zone shift.
  const d = /^\d{4}-\d{2}-\d{2}$/.test(s) ? new Date(`${s}T12:00:00`) : new Date(s);
  return Number.isNaN(d.getTime()) ? s.slice(0, 10) : d.toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
}

export function fmtDateTime(iso) {
  if (!iso) return "—";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? String(iso) : d.toLocaleString(undefined, { day: "numeric", month: "short", year: "numeric", hour: "numeric", minute: "2-digit" });
}

export function fmtRange(start, end) {
  if (!start) return "";
  return end && end !== start ? `${fmtDate(start)} – ${fmtDate(end)}` : fmtDate(start);
}

export function money(amount, currency) {
  const n = Number(amount || 0);
  const digits = n % 1 ? 2 : 0;
  try { return new Intl.NumberFormat(undefined, { style: "currency", currency: String(currency || "EUR").toUpperCase(), minimumFractionDigits: digits, maximumFractionDigits: digits }).format(n); }
  catch { return `${n.toFixed(2)} ${String(currency || "").toUpperCase()}`; }
}

export const errText = (e, fallback = "Something went wrong. Please try again.") => {
  const d = e?.response?.data?.detail;
  if (Array.isArray(d)) return d.map((x) => x.msg).join(", ");
  return typeof d === "string" ? d : fallback;
};

export function addDays(isoDate, n) {
  const d = new Date(`${isoDate}T12:00:00`);
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
}

export const STATUS = {
  requested: { label: "Requested", cls: "bg-[#F3E7C9] text-[#8A6D3B]" },
  quoted: { label: "Quote ready", cls: "bg-[#FBF1EE] text-[#B25A45]" },
  signed: { label: "Signed · deposit due", cls: "bg-[#FBF1EE] text-[#B25A45]" },
  deposit_paid: { label: "Dates confirmed", cls: "bg-[#E4F0E8] text-[#3E7C57]" },
  confirmed: { label: "Paid in full", cls: "bg-[#E4F0E8] text-[#3E7C57]" },
  completed: { label: "Completed", cls: "bg-[#EEF1EC] text-[#545E56]" },
  cancelled: { label: "Cancelled", cls: "bg-[#F2F2EC] text-[#6B7269]" },
  // partner statuses
  applied: { label: "Applied", cls: "bg-[#F3E7C9] text-[#8A6D3B]" },
  approved: { label: "Approved", cls: "bg-[#E4F0E8] text-[#3E7C57]" },
  paused: { label: "Paused", cls: "bg-[#F2F2EC] text-[#6B7269]" },
  declined: { label: "Declined", cls: "bg-[#FBEFEA] text-[#B25A45]" },
};

export function StatusChip({ status, label, testId }) {
  const s = STATUS[status] || { label: status, cls: "bg-[#F2F2EC] text-[#6B7269]" };
  return (
    <span data-testid={testId} className={`inline-flex items-center rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-widest whitespace-nowrap ${s.cls}`}>
      {label || s.label}
    </span>
  );
}

/** Ordered steps a stay goes through, for the partner's timeline. */
export const STAY_STEPS = ["requested", "quoted", "signed", "deposit_paid", "confirmed", "completed"];

export function Ticks({ items, className = "" }) {
  if (!items?.length) return null;
  return (
    <ul className={`space-y-1.5 ${className}`}>
      {items.map((x) => (
        <li key={x} className="flex items-start gap-2 text-[13px] text-[#1C221F] leading-snug">
          <CheckCircle2 className="h-4 w-4 text-[#839682] shrink-0 mt-0.5" />{x}
        </li>
      ))}
    </ul>
  );
}

export const fieldCls = "w-full rounded-2xl border border-[#E5E6DF] bg-white px-4 py-3 text-[15px] focus:outline-none focus:ring-2 focus:ring-[#B25A45]";

export function FormField({ label, hint, children, className = "" }) {
  return (
    <label className={`block ${className}`}>
      <span className="eyebrow !text-[10px]">{label}</span>
      <div className="mt-1.5">{children}</div>
      {hint && <span className="block text-[11px] text-[#6B7269] mt-1">{hint}</span>}
    </label>
  );
}

/** Quote total, computed the same way as the backend's compute_quote (admin live preview). */
export function previewQuote(pkg, form, addonsCatalog) {
  const fee = form.programme_fee !== "" && form.programme_fee != null ? Number(form.programme_fee) : Number(pkg?.programme_fee || 0);
  const perGuest = form.per_guest_fee !== "" && form.per_guest_fee != null ? Number(form.per_guest_fee) : Number(pkg?.per_guest_fee || 0);
  const guests = Number(form.guests || 0);
  const extraGuests = Math.max(0, guests - Number(pkg?.min_guests || 0));
  const guestFee = Math.round(perGuest * extraGuests * 100) / 100;
  const addons = (form.addons || []).map((a) => {
    const cat = (addonsCatalog || []).find((c) => c.id === a.id);
    if (!cat || !Number(a.qty)) return null;
    const price = a.price !== "" && a.price != null ? Number(a.price) : Number(cat.price);
    return { name: cat.name, qty: Number(a.qty), total: Math.round(price * Number(a.qty) * 100) / 100 };
  }).filter(Boolean);
  const extras = (form.extras || []).filter((x) => x.label && x.amount !== "").map((x) => ({ label: x.label, amount: Number(x.amount) }));
  const total = Math.round((fee + guestFee + addons.reduce((s, a) => s + a.total, 0) + extras.reduce((s, x) => s + x.amount, 0)) * 100) / 100;
  const pct = form.deposit_percent !== "" && form.deposit_percent != null ? Number(form.deposit_percent) : null;
  return { fee, perGuest, extraGuests, guestFee, addons, extras, total, deposit: pct == null ? null : Math.round(total * pct) / 100 };
}
