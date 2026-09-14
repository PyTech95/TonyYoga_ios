// Shared primitives used across the admin panes.

export function Field({ label, hint, children }) {
  return (
    <label className="block">
      <div className="text-[11px] uppercase tracking-widest font-semibold text-[#839682] mb-1.5">{label}</div>
      {children}
      {hint && <div className="text-[11px] text-[#6B7269] mt-1">{hint}</div>}
    </label>
  );
}

export const inputCls =
  "w-full rounded-2xl border border-[#E5E6DF] px-4 py-2.5 text-[14px] focus:outline-none focus:ring-2 focus:ring-[#B25A45]";

export function Toggle({ checked, onChange, tid }) {
  return (
    <button
      type="button"
      onClick={() => onChange(!checked)}
      data-testid={tid}
      role="switch"
      aria-checked={checked}
      className={`relative h-6 w-11 rounded-full transition-colors ${checked ? "bg-[#B25A45]" : "bg-[#D8D9D1]"}`}
    >
      <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white transition-all ${checked ? "left-[22px]" : "left-0.5"}`} />
    </button>
  );
}
