// Small pieces shared by the Admin → Hotels & resorts tabs.
export const inputCls = "w-full rounded-xl border border-[#E5E6DF] bg-white px-3 py-2 text-[14px] focus:outline-none focus:ring-2 focus:ring-[#B25A45]";
export const smallBtn = "inline-flex items-center gap-1.5 rounded-full border border-[#E5E6DF] bg-white px-3 py-1.5 text-[12px] font-semibold text-[#1C221F] hover:border-[#B25A45] disabled:opacity-50";
export const primaryBtn = "inline-flex items-center justify-center gap-1.5 rounded-full bg-[#B25A45] px-4 py-2 text-[13px] font-semibold text-white hover:opacity-90 disabled:opacity-50";
export const card = "rounded-2xl bg-white border border-[#E5E6DF] p-4";

export function L({ label, hint, children, className = "" }) {
  return (
    <label className={`block ${className}`}>
      <div className="text-[11px] uppercase tracking-widest font-semibold text-[#839682] mb-1">{label}</div>
      {children}
      {hint && <div className="text-[11px] text-[#6B7269] mt-1">{hint}</div>}
    </label>
  );
}

/** Bottom sheet on phones, centred dialog on larger screens. */
export function Sheet({ title, onClose, children, testId, wide = false }) {
  return (
    <div className="fixed inset-0 z-[70] flex items-end sm:items-center justify-center p-0 sm:p-4" data-testid={testId}>
      <button className="absolute inset-0 bg-black/40" onClick={onClose} aria-label="Close" />
      <div className={`relative w-full ${wide ? "sm:max-w-3xl" : "sm:max-w-lg"} max-h-[92vh] overflow-y-auto rounded-t-3xl sm:rounded-3xl bg-[#FAFAF7] p-5 space-y-4`}>
        <div className="flex items-center justify-between gap-3">
          <h3 className="serif text-xl">{title}</h3>
          <button onClick={onClose} aria-label="Close" data-testid={testId ? `${testId}-close` : undefined} className="h-8 w-8 rounded-full hover:bg-[#F2F2EC] flex items-center justify-center text-[#545E56]">✕</button>
        </div>
        {children}
      </div>
    </div>
  );
}

const I18N_PLAN = { "i18n:memb.plan.essential.name": "Essential", "i18n:memb.plan.unlimited.name": "Unlimited", "i18n:memb.plan.annual.name": "Annual VIP" };
export function planName(plan) {
  const n = plan?.name || "";
  if (I18N_PLAN[n]) return I18N_PLAN[n];
  if (n.startsWith("i18n:")) { const parts = n.slice(5).split("."); return (parts[parts.length - 2] || n).replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()); }
  return n || "Membership";
}

/** Edit a list of short text lines (programme "every day" items, inclusions). */
export function LinesEditor({ value, onChange, placeholder, testId }) {
  const lines = value || [];
  return (
    <div className="space-y-1.5" data-testid={testId}>
      {lines.map((l, i) => (
        <div key={i} className="flex gap-1.5">
          <input value={l} onChange={(e) => onChange(lines.map((x, j) => (j === i ? e.target.value : x)))} className={inputCls} data-testid={testId ? `${testId}-${i}` : undefined} />
          <button type="button" onClick={() => onChange(lines.filter((_, j) => j !== i))} className="px-2 text-[#B25A45]" aria-label="Remove">✕</button>
        </div>
      ))}
      <button type="button" onClick={() => onChange([...lines, ""])} className={smallBtn} data-testid={testId ? `${testId}-add` : undefined}>+ {placeholder || "Add line"}</button>
    </div>
  );
}
