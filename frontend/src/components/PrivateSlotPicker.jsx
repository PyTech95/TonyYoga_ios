import { useEffect, useState, useCallback } from "react";
import { RefreshCw, Check } from "lucide-react";
import { api } from "@/lib/api";

export const PrivateSlotPicker = ({ selected, onChange, count, refreshKey }) => {
  const [slots, setSlots] = useState(null);
  const [error, setError] = useState("");
  const [day, setDay] = useState("");
  const zone = "Europe/Madrid";
  const dayKey = (slot) => new Date(slot.start_time).toLocaleDateString("en-CA", { timeZone: zone });
  const load = useCallback(() => {
    setError("");
    api.get("/private-sessions/availability").then(({ data }) => { setSlots(data); }).catch(() => setError("Could not load Tony’s openings. Please try again."));
  }, []);
  useEffect(() => { load(); }, [load, refreshKey]);
  const days = [...new Set((slots || []).map(dayKey))];
  const activeDay = days.includes(day) ? day : days[0];
  const choose = (s) => {
    if (selected.some((v) => v.id === s.id)) onChange(selected.filter((v) => v.id !== s.id));
    else if (selected.length < count) onChange([...selected, s]);
  };
  return <section data-testid="private-slot-picker" className="space-y-3 min-w-0">
    <div className="flex items-center justify-between gap-2">
      <span className="eyebrow">Available openings</span>
      <button type="button" onClick={load} data-testid="private-slots-refresh" title="Refresh openings" aria-label="Refresh openings" className="p-2 text-[#6B7269] hover:text-[#B25A45]"><RefreshCw className="h-4 w-4" /></button>
    </div>
    <p data-testid="private-slots-timezone" className="text-xs text-[#6B7269]">Málaga time · Europe/Madrid</p>
    {error && <p data-testid="private-slots-error" role="alert" className="text-sm text-[#B25A45]">{error}</p>}
    {slots === null ? <p data-testid="private-slots-loading" className="text-sm text-[#6B7269]">Loading openings…</p> : !slots.length ? <p data-testid="private-slots-empty" className="text-sm text-[#6B7269] py-4">Tony has no openings available right now.</p> : <>
      <div data-testid="private-slot-days" className="flex flex-wrap gap-2">
        {days.map((key) => <button key={key} data-testid={`private-slot-day-${key}`} type="button" onClick={() => setDay(key)} aria-pressed={key === activeDay} className={`rounded-xl border px-3 py-2 text-xs transition-colors ${key === activeDay ? "border-[#B25A45] bg-[#FBF1EE] text-[#B25A45]" : "border-[#E5E6DF] hover:border-[#B25A45]"}`}>
          {new Date(slots.find((s) => dayKey(s) === key).start_time).toLocaleDateString(undefined, { timeZone: zone, weekday: "short", month: "short", day: "numeric" })}
        </button>)}
      </div>
      <div data-testid="private-slot-times" className="grid grid-cols-2 sm:grid-cols-3 gap-2">
        {slots.filter((s) => dayKey(s) === activeDay).map((s) => {
          const picked = selected.some((x) => x.id === s.id);
          return <button key={s.id} type="button" data-testid={`private-slot-${s.id}`} onClick={() => choose(s)} disabled={!picked && selected.length >= count} aria-pressed={picked} className={`rounded-xl border px-2 py-2.5 text-sm flex items-center justify-center gap-1.5 transition-colors disabled:opacity-40 ${picked ? "border-[#B25A45] bg-[#FBF1EE] text-[#B25A45]" : "border-[#E5E6DF] hover:border-[#B25A45]"}`}>
            {picked && <Check className="h-3.5 w-3.5" />}{new Date(s.start_time).toLocaleTimeString(undefined, { timeZone: zone, hour: "2-digit", minute: "2-digit", hour12: false })}
          </button>;
        })}
      </div>
    </>}
    <p data-testid="private-slot-summary" className="text-xs font-semibold text-[#545E56]">{selected.length} of {count} session times selected</p>
    {selected.length > 0 && <ul className="space-y-1">
      {selected.map((s) => <li key={s.id} className="flex items-center justify-between gap-2 text-xs text-[#545E56]" data-testid={`private-selected-${s.id}`}>
        {new Date(s.start_time).toLocaleString(undefined, { timeZone: zone, month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}
        <button data-testid={`private-deselect-${s.id}`} type="button" onClick={() => onChange(selected.filter((v) => v.id !== s.id))} className="text-[#B25A45] hover:underline">Remove</button>
      </li>)}
    </ul>}
  </section>;
};
