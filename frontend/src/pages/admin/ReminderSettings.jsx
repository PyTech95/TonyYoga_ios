import { useEffect, useState } from "react";
import { Bell, Save } from "lucide-react";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { Field, Toggle, inputCls } from "./shared";

export const ReminderSettings = () => {
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const load = () => api.get("/admin/private-reminders/status").then(({ data }) => { setData(data); setError(""); }).catch(() => setError("Reminder settings could not be loaded."));
  useEffect(() => { load(); }, []);
  const save = async () => {
    setSaving(true);
    try {
      await api.patch("/admin/settings", { private_reminders_enabled: data.enabled, private_reminder_lead_minutes: Number(data.lead_minutes) });
      toast.success("Session reminders saved."); await load();
    } catch (e) { toast.error(e?.response?.data?.detail || "Could not save reminders."); }
    finally { setSaving(false); }
  };
  return <section className="border-b border-[#E5E6DF] py-6 space-y-4" data-testid="settings-private-reminders">
    <div className="flex items-center justify-between gap-3">
      <h2 className="text-base font-semibold flex items-center gap-2"><Bell className="h-4 w-4" /> Private session reminders</h2>
      {data && <Toggle tid="settings-private-reminders-enabled" checked={data.enabled} onChange={enabled => setData({ ...data, enabled })} />}
    </div>
    {error && <p role="alert" data-testid="settings-private-reminders-error">{error} <button data-testid="settings-private-reminders-retry" onClick={load}>Retry</button></p>}
    {data && <>
      <p className="text-xs text-[#6B7269]" data-testid="settings-private-reminders-channel">In-app notifications only. Students see reminders in their notification bell; no email or phone push is sent.</p>
      <Field label="Minutes before the session">
        <input data-testid="settings-private-reminders-lead" type="number" min="5" max="240" className={`${inputCls} max-w-40`} value={data.lead_minutes} onChange={e => setData({ ...data, lead_minutes: e.target.value })} />
      </Field>
      <p className="text-xs text-[#6B7269]" data-testid="settings-private-reminders-worker-status">{data.job.last_run_at ? `Last check: ${new Date(data.job.last_run_at).toLocaleString()} · ${data.job.total_sent || 0} reminders sent` : "Waiting for the first automatic check."}{data.job.errors ? " · Delivery will retry on the next check." : ""}</p>
      <button data-testid="settings-private-reminders-save" onClick={save} disabled={saving} className="pill pill-primary"><Save className="h-4 w-4" /> {saving ? "Saving…" : "Save reminders"}</button>
    </>}
  </section>;
};