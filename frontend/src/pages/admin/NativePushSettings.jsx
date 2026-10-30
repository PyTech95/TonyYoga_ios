import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Smartphone, Send, Save, HeartHandshake } from "lucide-react";
import { api } from "@/lib/api";
import { Field, Toggle, inputCls } from "./shared";

const errText = (e, f) => e?.response?.data?.detail || f;

/** Admin → Settings: phone notifications for the apps + member-care automation. */
export function NativePushSettings() {
  const [s, setS] = useState(null);
  const [st, setSt] = useState(null);
  const [f, setF] = useState({ fcm_service_account_json: "", apns_key_p8: "", apns_key_id: "", apns_team_id: "", apns_bundle_id: "com.tonyoga.app", apns_sandbox: false, native_push_enabled: true, membership_reminder_days: 3, auto_reconcile_payments: true });
  const [busy, setBusy] = useState(false);
  const load = () => {
    api.get("/admin/settings").then(({ data }) => {
      setS(data);
      setF((x) => ({ ...x, fcm_service_account_json: "", apns_key_p8: "", apns_key_id: data.apns_key_id || "", apns_team_id: data.apns_team_id || "",
        apns_bundle_id: data.apns_bundle_id || "com.tonyoga.app", apns_sandbox: !!data.apns_sandbox, native_push_enabled: data.native_push_enabled !== false,
        membership_reminder_days: data.membership_reminder_days ?? 3, auto_reconcile_payments: data.auto_reconcile_payments !== false }));
    }).catch(() => setS(false));
    api.get("/admin/native-push/status").then(({ data }) => setSt(data)).catch(() => setSt(null));
  };
  useEffect(() => { load(); }, []);
  const set = (k, v) => setF((x) => ({ ...x, [k]: v }));

  const save = async () => {
    const body = { ...f };
    if (!body.fcm_service_account_json.trim()) delete body.fcm_service_account_json;
    if (!body.apns_key_p8.trim()) delete body.apns_key_p8;
    setBusy(true);
    try { await api.patch("/admin/settings", body); toast.success("Saved"); load(); }
    catch (e) { toast.error(errText(e, "Could not save")); } finally { setBusy(false); }
  };
  const clear = async (key) => {
    if (!window.confirm("Remove this saved key? Phone notifications for that platform stop until you add a new one.")) return;
    try { await api.patch("/admin/settings", { [key]: "__clear__" }); toast.success("Removed"); load(); } catch (e) { toast.error(errText(e, "Could not remove")); }
  };
  const test = async () => {
    setBusy(true);
    try { const { data } = await api.post("/admin/native-push/test"); toast.success(`Sent to ${data.sent} phone(s)`); }
    catch (e) { toast.error(errText(e, "Test failed")); } finally { setBusy(false); }
  };
  if (s === false) return null;
  const card = "rounded-3xl bg-white border border-[#E5E6DF] p-5 space-y-4";
  const badge = (on, label) => <span className={`text-[10px] font-semibold rounded-full px-2 py-0.5 ${on ? "text-[#3E7C57] bg-[#E4F0E8]" : "text-[#8A6D3B] bg-[#F3E7C9]"}`}>{on ? `● ${label} ready` : `${label} not set up`}</span>;

  return (
    <>
      <div className={card} data-testid="settings-native-push">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-[#B25A45]"><Smartphone className="h-4 w-4" /><span className="eyebrow !text-[11px]">Phone app notifications</span></div>
          <Toggle checked={f.native_push_enabled} onChange={(v) => set("native_push_enabled", v)} tid="settings-native-push-enabled" />
        </div>
        <div className="flex flex-wrap gap-2">{badge(st?.android, "Android")}{badge(st?.ios, "iPhone")}
          {st && <span className="text-[11px] text-[#6B7269]">Phones signed in: {st.devices.android} Android · {st.devices.ios} iPhone</span>}</div>
        <p className="text-[12px] text-[#6B7269] leading-relaxed">
          Members already get every message under the bell and by email. To also pop up on their phone, connect Firebase (Android) and Apple Push (iPhone).
          The app asks for permission once these are saved and the new app version is installed.
        </p>
        <Field label={`Firebase service-account JSON (Android)${s?.fcm_service_account_json_set ? " — saved" : ""}`} hint="Firebase console → Project settings → Service accounts → Generate new private key. Paste the whole file. Stored encrypted.">
          <textarea rows={3} className={`${inputCls} font-mono !text-[12px]`} placeholder={s?.fcm_service_account_json_set ? "•••••••• (leave empty to keep)" : '{"type": "service_account", "project_id": …}'} value={f.fcm_service_account_json} onChange={(e) => set("fcm_service_account_json", e.target.value)} autoComplete="off" />
        </Field>
        {s?.fcm_service_account_json_set && <button type="button" onClick={() => clear("fcm_service_account_json")} className="text-[11px] font-semibold text-[#6B7269] hover:text-[#B25A45]">Remove Firebase key</button>}
        <Field label={`Apple Push key (.p8) (iPhone)${s?.apns_key_p8_set ? " — saved" : ""}`} hint="Apple Developer → Certificates, IDs & Profiles → Keys → + → Apple Push Notifications service. Paste the .p8 file contents.">
          <textarea rows={3} className={`${inputCls} font-mono !text-[12px]`} placeholder={s?.apns_key_p8_set ? "•••••••• (leave empty to keep)" : "-----BEGIN PRIVATE KEY-----"} value={f.apns_key_p8} onChange={(e) => set("apns_key_p8", e.target.value)} autoComplete="off" />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Key ID"><input className={inputCls} value={f.apns_key_id} onChange={(e) => set("apns_key_id", e.target.value.trim())} placeholder="10 characters" /></Field>
          <Field label="Team ID"><input className={inputCls} value={f.apns_team_id} onChange={(e) => set("apns_team_id", e.target.value.trim())} placeholder="10 characters" /></Field>
          <Field label="App bundle ID"><input className={inputCls} value={f.apns_bundle_id} onChange={(e) => set("apns_bundle_id", e.target.value.trim())} /></Field>
          <label className="flex items-center gap-2 text-[12px] mt-6"><Toggle checked={f.apns_sandbox} onChange={(v) => set("apns_sandbox", v)} />Test (Xcode) builds</label>
        </div>
        <div className="flex flex-wrap gap-2">
          <button onClick={save} disabled={busy} className="pill pill-primary !py-2 !text-[13px]" data-testid="settings-native-push-save"><Save className="h-4 w-4" /> Save</button>
          <button onClick={test} disabled={busy} className="pill pill-ghost !py-2 !text-[13px]"><Send className="h-4 w-4" /> Send a test to my phone</button>
        </div>
      </div>

      <div className={card} data-testid="settings-member-care">
        <div className="flex items-center gap-2 text-[#B25A45]"><HeartHandshake className="h-4 w-4" /><span className="eyebrow !text-[11px]">Member care (automatic)</span></div>
        <label className="flex items-start gap-3 text-[13px]"><Toggle checked={f.auto_reconcile_payments} onChange={(v) => set("auto_reconcile_payments", v)} tid="settings-auto-reconcile" />
          <span>Re-check unconfirmed card and PayPal payments every 5 minutes and give access automatically when they were paid (e.g. the customer closed the page before returning).</span></label>
        <label className="flex items-center gap-2 text-[13px]">Remind members
          <input type="number" min="0" max="30" className={`${inputCls} !w-20`} value={f.membership_reminder_days} onChange={(e) => set("membership_reminder_days", e.target.value)} />
          days before their membership ends <span className="text-[#6B7269]">(0 = off)</span></label>
        <button onClick={save} disabled={busy} className="pill pill-primary !py-2 !text-[13px]"><Save className="h-4 w-4" /> Save</button>
      </div>
    </>
  );
}
