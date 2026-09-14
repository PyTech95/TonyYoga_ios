import { useEffect, useState } from "react";
import { Save, Flag } from "lucide-react";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { Link } from "react-router-dom";
import Spinner from "@/components/Spinner";
import { Toggle, Field, inputCls } from "./shared";

export default function ChallengesPane() {
  const [data, setData] = useState(null);
  const [selected, setSelected] = useState(0);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const load = () => api.get("/admin/challenges").then(({ data }) => { setData(data); setError(""); }).catch(() => setError("Could not load the challenge."));
  useEffect(() => { load(); }, []);
  const toggle = async enabled => {
    setBusy(true);
    try { await api.patch("/admin/settings", { challenges_enabled: enabled }); setData(d => ({ ...d, enabled })); toast.success(enabled ? "Challenge is available." : "Challenge paused. Student progress is saved."); }
    catch { toast.error("Could not change challenge availability."); }
    finally { setBusy(false); }
  };
  const edit = (field, value) => setData(d => ({ ...d, challenge: { ...d.challenge, [field]: value } }));
  const editDay = (field, value) => edit("days", data.challenge.days.map((d, i) => i === selected ? { ...d, [field]: value } : d));
  const save = async event => {
    event.preventDefault(); setBusy(true);
    try { const { data: challenge } = await api.put("/admin/challenges", data.challenge); setData(d => ({ ...d, challenge })); toast.success("All 30 practices saved."); }
    catch (e) { toast.error(typeof e?.response?.data?.detail === "string" ? e.response.data.detail : "Check the title, description and all daily practices."); }
    finally { setBusy(false); }
  };
  if (error) return <p data-testid="admin-challenge-error" role="alert">{error} <button onClick={load} data-testid="admin-challenge-retry">Retry</button></p>;
  if (!data) return <Spinner />;
  const day = data.challenge.days[selected];
  return <section data-testid="admin-challenges-pane" className="space-y-6 min-w-0">
    <div className="flex flex-wrap items-center justify-between gap-4 border-b border-[#E5E6DF] pb-5">
      <div><h2 className="text-lg font-semibold flex items-center gap-2"><Flag className="h-5 w-5 text-[#B25A45]" /> 30-day practice challenge</h2>
        <p data-testid="admin-challenge-availability" className="text-xs text-[#6B7269] mt-2">{data.enabled ? "Available to students" : "Paused · progress preserved"}</p></div>
      <div className={busy ? "pointer-events-none opacity-50" : ""}><Toggle tid="challenge-master-toggle" checked={data.enabled} onChange={toggle} /></div>
    </div>
    <div className="flex flex-wrap gap-4 text-sm"><span data-testid="admin-challenge-enrolled">{data.enrolled} enrolled</span><span data-testid="admin-challenge-finished">{data.finished} completed</span><Link data-testid="admin-challenge-preview" to="/challenges" className="text-[#B25A45] underline">Student view</Link></div>
    <form onSubmit={save} className="space-y-5" data-testid="admin-challenge-form">
      <Field label="Challenge title"><input required maxLength={120} data-testid="admin-challenge-title" className={inputCls} value={data.challenge.title} onChange={e => edit("title", e.target.value)} /></Field>
      <Field label="Description"><textarea required maxLength={600} rows={2} data-testid="admin-challenge-description" className={inputCls} value={data.challenge.description} onChange={e => edit("description", e.target.value)} /></Field>
      <Field label="Daily practice"><select data-testid="admin-challenge-day-select" className={inputCls} value={selected} onChange={e => setSelected(Number(e.target.value))}>{data.challenge.days.map((d, i) => <option key={d.day} value={i}>Day {d.day} · {d.title}</option>)}</select></Field>
      <div className="grid sm:grid-cols-[1fr_150px] gap-4">
        <Field label={`Day ${day.day} title`}><input required maxLength={100} data-testid="admin-challenge-day-title" className={inputCls} value={day.title} onChange={e => editDay("title", e.target.value)} /></Field>
        <Field label="Minutes"><input required type="number" min={5} max={120} data-testid="admin-challenge-day-duration" className={inputCls} value={day.duration_minutes} onChange={e => editDay("duration_minutes", Number(e.target.value))} /></Field>
      </div>
      <Field label="Practice instructions"><textarea required maxLength={3000} rows={6} data-testid="admin-challenge-day-instructions" className={inputCls} value={day.instructions} onChange={e => editDay("instructions", e.target.value)} /></Field>
      <button data-testid="admin-challenge-save" disabled={busy} className="pill pill-primary"><Save className="h-4 w-4" />{busy ? "Saving…" : "Save all practices"}</button>
    </form>
  </section>;
}