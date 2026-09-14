import { CalendarRange } from "lucide-react";

export const defaultTerm = { mode: "rolling", duration_days: 30, starts_at: null, ends_at: null };
export const dateLabel = (value) => new Date(value).toLocaleString(undefined, { year: "numeric", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
const localInput = (iso) => {
  if (!iso) return "";
  const d = new Date(iso);
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
};
const isoInput = (value) => value ? new Date(value).toISOString() : null;

export const AccessTermFields = ({ value, onChange, prefix }) => {
  const term = { ...defaultTerm, ...value };
  const set = (key, v) => onChange({ ...term, [key]: v });
  const cls = "mt-1 w-full min-w-0 rounded-xl border border-[#E5E6DF] bg-white px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#B25A45]";
  return <fieldset className="space-y-3 min-w-0" data-testid={`${prefix}-term-fields`}>
    <legend className="text-sm font-semibold mb-2 flex items-center gap-2"><CalendarRange className="h-4 w-4 text-[#B25A45]" /> Subscription period</legend>
    <label className="block text-xs text-[#545E56]">Access window
      <select data-testid={`${prefix}-term-mode`} className={cls} value={term.mode} onChange={(e) => set("mode", e.target.value)}>
        <option value="rolling">From purchase date</option><option value="fixed">Specific start and end</option>
      </select>
    </label>
    {term.mode === "rolling" ? <label className="block text-xs text-[#545E56]">Access days
      <input data-testid={`${prefix}-term-days`} type="number" min="1" max="3650" className={cls} value={term.duration_days} onChange={(e) => set("duration_days", Number(e.target.value))} />
    </label> : <div className="grid sm:grid-cols-2 gap-3">
      <label className="block text-xs text-[#545E56] min-w-0">Starts (your local time)
        <input data-testid={`${prefix}-term-start`} type="datetime-local" className={cls} value={localInput(term.starts_at)} onChange={(e) => set("starts_at", isoInput(e.target.value))} />
      </label>
      <label className="block text-xs text-[#545E56] min-w-0">Ends (your local time)
        <input data-testid={`${prefix}-term-end`} type="datetime-local" className={cls} value={localInput(term.ends_at)} onChange={(e) => set("ends_at", isoInput(e.target.value))} />
      </label>
    </div>}
    <p data-testid={`${prefix}-renewal-policy`} className="text-xs text-[#6B7269]">One payment per term · no automatic renewal</p>
  </fieldset>;
};

export const AccessTermSummary = ({ term, prefix, access }) => {
  const t = { ...defaultTerm, ...term };
  return <div data-testid={`${prefix}-term-summary`} className="space-y-1 text-xs leading-relaxed">
    {access?.starts_at && access?.ends_at ? <p data-testid={`${prefix}-access-dates`}>{dateLabel(access.starts_at)} – {dateLabel(access.ends_at)}</p>
      : t.mode === "fixed" ? <p data-testid={`${prefix}-offer-dates`}>{dateLabel(t.starts_at)} – {dateLabel(t.ends_at)}</p>
      : <p data-testid={`${prefix}-offer-days`}>{t.duration_days} days from purchase</p>}
    <p data-testid={`${prefix}-no-auto-renewal`} className="opacity-70">Fixed-term subscription · no automatic renewal</p>
  </div>;
};

export const termError = (term) => {
  if (term?.mode === "fixed" && (!term.starts_at || !term.ends_at || new Date(term.ends_at) <= new Date(term.starts_at))) return "Choose an end date after the subscription start.";
  if (term?.mode !== "fixed" && (!Number.isInteger(term?.duration_days) || term.duration_days < 1 || term.duration_days > 3650)) return "Access days must be between 1 and 3650.";
  return null;
};
