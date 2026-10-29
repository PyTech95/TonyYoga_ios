// Shared pieces for the Teacher Hub pages (directory, profile, hub, course viewer).
import { useState } from "react";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import { useTranslation } from "react-i18next";
import { BadgeCheck, CreditCard, Compass } from "lucide-react";
import { api } from "@/lib/api";
import { checkoutContext, markExternalCheckout } from "@/lib/platform";
import PageHeader from "@/components/PageHeader";

export function fmtDate(iso) {
  if (!iso) return "";
  const d = new Date(String(iso).length === 10 ? `${iso}T12:00:00` : iso);
  if (Number.isNaN(d.getTime())) return String(iso).slice(0, 10);
  return d.toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
}

export function fmtWhen(iso) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short" }) + " · " +
    d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
}

export function money(amount, currency) {
  const n = Number(amount || 0);
  try { return new Intl.NumberFormat(undefined, { style: "currency", currency: String(currency || "EUR").toUpperCase() }).format(n); }
  catch { return `${n.toFixed(2)} ${String(currency || "").toUpperCase()}`; }
}

/** {EUR: 12, USD: 3} → "€12.00 · $3.00" */
export function moneyMap(map) {
  const entries = Object.entries(map || {});
  if (!entries.length) return money(0, "EUR");
  return entries.map(([cur, v]) => money(v, cur)).join(" · ");
}

export const errText = (e, fallback = "Something went wrong. Please try again.") => {
  const d = e?.response?.data?.detail;
  if (Array.isArray(d)) return d.map((x) => x.msg).join(", ");
  return typeof d === "string" ? d : fallback;
};

/** ISO (UTC) → value for <input type="datetime-local"> in the viewer's time zone. */
export function toLocalInput(iso) {
  const d = iso ? new Date(iso) : new Date();
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** <input type="datetime-local"> value (local time) → ISO string with time zone. */
export function fromLocalInput(value) {
  if (!value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

export const inputCls = "w-full rounded-2xl border border-[#E5E6DF] bg-white px-4 py-2.5 text-[14px] focus:outline-none focus:ring-2 focus:ring-[#B25A45]";

export function Label({ children, hint, className = "" }) {
  return (
    <label className={`block ${className}`}>
      {children}
      {hint && <span className="block text-[11px] text-[#6B7269] mt-1">{hint}</span>}
    </label>
  );
}

export function LabelText({ children }) {
  return <span className="block text-[11px] uppercase tracking-widest font-semibold text-[#839682] mb-1.5">{children}</span>;
}

export function CertBadge({ label, level, compact = false, testId }) {
  return (
    <span data-testid={testId} className={`inline-flex items-center gap-1 rounded-full bg-[#E9F0E6] text-[#3E6B4C] font-semibold ${compact ? "px-2 py-0.5 text-[10px]" : "px-2.5 py-1 text-[11px]"}`}>
      <BadgeCheck className={compact ? "h-3 w-3" : "h-3.5 w-3.5"} />
      {label}{level && !compact ? ` · ${level}` : ""}
    </span>
  );
}

export function Section({ icon: Icon, title, children, action, testId }) {
  return (
    <section data-testid={testId} className="scroll-mt-24">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          {Icon && <Icon className="h-4 w-4 text-[#B25A45]" />}
          <h2 className="eyebrow !text-[11px]">{title}</h2>
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}

export function NotOpen({ testId = "teachers-not-open" }) {
  const { t } = useTranslation();
  return (
    <div data-testid={testId} className="pb-24">
      <PageHeader eyebrow={t("teachers.eyebrow", "Tony-certified teachers")} title={t("teachers.not_open_title", "Coming soon")} />
      <div className="mx-auto max-w-2xl px-5">
        <div className="rounded-3xl bg-white border border-[#E5E6DF] p-8 text-center">
          <Compass className="h-8 w-8 text-[#839682] mx-auto" />
          <p className="text-[15px] text-[#545E56] mt-3">{t("teachers.not_open_body", "The directory of Tony-certified teachers isn't open yet. Practise with Tony in the meantime.")}</p>
          <div className="mt-5 flex flex-wrap justify-center gap-2">
            <Link to="/schedule" className="pill pill-primary">{t("teachers.see_schedule", "Live classes")}</Link>
            <Link to="/programs" className="pill pill-ghost">{t("teachers.see_courses", "Courses")}</Link>
          </div>
        </div>
      </div>
    </div>
  );
}

/** Card payment for a teacher's class, course or pack. The money goes straight to the
 *  teacher's own Stripe account, so PayPal and gift-card credit aren't offered here. */
export function TeacherPayButton({ offeringId, sessionId, label, disabled, testId, onBefore }) {
  const { t } = useTranslation();
  const [busy, setBusy] = useState(false);
  const pay = async () => {
    if (busy || disabled) return;
    if (onBefore && onBefore() === false) return;
    setBusy(true);
    try {
      const { data } = await api.post("/checkout/session", {
        item_type: "teacher_offering", item_id: offeringId, quantity: 1,
        metadata: sessionId ? { session_id: sessionId } : undefined, ...checkoutContext(), apply_credit: false,
      });
      if (data?.url) { markExternalCheckout(); window.location.href = data.url; }
      else toast.error(t("teachers.pay_failed", "Could not start the payment."));
    } catch (e) {
      toast.error(errText(e, t("teachers.pay_failed", "Could not start the payment.")));
    } finally { setBusy(false); }
  };
  return (
    <button type="button" onClick={pay} disabled={disabled || busy} data-testid={testId}
      className="pill pill-primary !py-2 !px-4 !text-xs">
      <CreditCard className="h-3.5 w-3.5" />{busy ? t("teachers.redirecting", "Redirecting…") : label}
    </button>
  );
}

export const LANGS = ["English", "Spanish", "Italian", "French", "German", "Portuguese", "Dutch", "Polish", "Hindi", "Japanese", "Chinese", "Arabic", "Russian", "Swedish"];

/** Comma-separated text ⇄ list. */
export const toList = (s) => String(s || "").split(",").map((x) => x.trim()).filter(Boolean);
export const fromList = (l) => (l || []).join(", ");
