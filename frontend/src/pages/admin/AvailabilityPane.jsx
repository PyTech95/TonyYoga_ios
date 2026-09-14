import { useEffect, useState } from "react";
import { Plus, RefreshCw, Trash2, CalendarDays } from "lucide-react";
import { api } from "@/lib/api";
import { toast } from "sonner";
import { inputCls } from "./shared";

export const AvailabilityPane = () => {
  const [slots, setSlots] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [form, setForm] = useState({ date: "", start: "09:00", end: "12:00", timezone: "Europe/Madrid", repeat_weeks: 1 });
  const load = () => api.get("/admin/private-availability").then(({ data }) => { setSlots(data); setError(""); }).catch(() => setError("Could not load availability."));
  useEffect(() => { load(); }, []);
  const set = (key, value) => setForm((f) => ({ ...f, [key]: value }));
  const add = async (event) => {
    event.preventDefault(); setBusy(true); setError("");
    try {
      const { data } = await api.post("/admin/private-availability", form);
      toast.success(`${data.length} opening${data.length === 1 ? "" : "s"} added`); await load();
    } catch (e) { setError(typeof e.response?.data?.detail === "string" ? e.response.data.detail : "Check the date and time window."); }
    finally { setBusy(false); }
  };
  const remove = async (id) => {
    setBusy(true);
    try { await api.delete(`/admin/private-availability/${id}`); await load(); }
    catch (e) { setError(e.response?.data?.detail || "Could not remove opening."); }
    finally { setBusy(false); }
  };
  const zones = ["Europe/Madrid", "Europe/London", "America/New_York", "America/Los_Angeles", "Asia/Kolkata", "UTC"];
  return <section data-testid="availability-pane" className="py-5 space-y-4 border-y border-[#E5E6DF]">
    <div className="flex items-center justify-between gap-3">
      <h2 className="serif text-lg flex items-center gap-2"><CalendarDays className="h-5 w-5 text-[#B25A45]" /> Tony’s availability</h2>
      <button data-testid="availability-refresh" type="button" onClick={load} aria-label="Refresh openings" title="Refresh openings" className="p-2 text-[#6B7269] hover:text-[#B25A45]"><RefreshCw className="h-4 w-4" /></button>
    </div>
    <form onSubmit={add} className="space-y-3">
      <div className="grid sm:grid-cols-2 gap-3">
        <label className="min-w-0 text-xs text-[#545E56]">Date<input required data-testid="availability-date" type="date" className={`${inputCls} mt-1 min-w-0`} value={form.date} onChange={(e) => set("date", e.target.value)} /></label>
        <label className="min-w-0 text-xs text-[#545E56]">Time zone<select data-testid="availability-timezone" className={`${inputCls} mt-1`} value={form.timezone} onChange={(e) => set("timezone", e.target.value)}>{zones.map((z) => <option key={z} value={z}>{z.replaceAll("_", " ")}</option>)}</select></label>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        <label className="min-w-0 text-xs text-[#545E56]">From<input required data-testid="availability-start" type="time" className={`${inputCls} mt-1`} value={form.start} onChange={(e) => set("start", e.target.value)} /></label>
        <label className="min-w-0 text-xs text-[#545E56]">Until<input required data-testid="availability-end" type="time" className={`${inputCls} mt-1`} value={form.end} onChange={(e) => set("end", e.target.value)} /></label>
        <label className="min-w-0 text-xs text-[#545E56]">Repeat weekly<input data-testid="availability-repeat" type="number" min="1" max="12" className={`${inputCls} mt-1`} value={form.repeat_weeks} onChange={(e) => set("repeat_weeks", Number(e.target.value))} /></label>
      </div>
      {error && <p data-testid="availability-error" role="alert" className="text-sm text-[#B25A45]">{error}</p>}
      <button type="submit" disabled={busy} data-testid="availability-add" className="pill pill-primary"><Plus className="h-4 w-4" /> {busy ? "Saving…" : "Add openings"}</button>
    </form>
    {slots === null ? <p data-testid="availability-loading" className="text-sm text-[#6B7269]">Loading openings…</p> : !slots.length ? <p data-testid="availability-empty" className="text-sm text-[#6B7269]">No upcoming openings.</p> : <ul data-testid="availability-list" className="divide-y divide-[#E5E6DF] max-h-80 overflow-y-auto">
      {slots.map((s) => <li key={s.id} data-testid={`availability-row-${s.id}`} className="flex items-center justify-between gap-3 py-3">
        <div className="min-w-0 text-sm"><p data-testid={`availability-time-${s.id}`}>{new Date(s.start_time).toLocaleString(undefined, { timeZone: s.timezone, month: "short", day: "numeric", year: "numeric", hour: "2-digit", minute: "2-digit" })}</p><p className="text-xs text-[#6B7269]" data-testid={`availability-zone-${s.id}`}>{s.duration_minutes} min · {s.timezone}</p></div>
        <span data-testid={`availability-status-${s.id}`} className={`text-xs capitalize ${s.status === "open" ? "text-[#5C7355]" : "text-[#B25A45]"}`}>{s.status === "held" ? "In checkout" : s.status}</span>
        {s.status === "open" && <button data-testid={`availability-remove-${s.id}`} type="button" disabled={busy} onClick={() => remove(s.id)} title="Remove opening" aria-label="Remove opening" className="p-2 text-[#6B7269] hover:text-[#B25A45]"><Trash2 className="h-4 w-4" /></button>}
      </li>)}
    </ul>}
  </section>;
};
