import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Users, Calendar, TrendingUp, Send, Check, X, CreditCard, Mail, Bell, Save, RefreshCw, History, BookOpen, Plus, ArrowLeft, Trash2, ChevronUp, ChevronDown, ChevronRight, Youtube, Play, Clock, Eye, EyeOff, ListPlus, Instagram, Wallet, ClipboardCheck, Package, GraduationCap, Award, MessageCircle, Video, Mic, LayoutDashboard, MountainSnow, Gift, Settings as SettingsIcon, Upload } from "lucide-react";
import { api, API_BASE } from "@/lib/api";
import Spinner from "@/components/Spinner";
import { AppDownloadsSettings } from './AppDownloadsSettings';
import { NotificationStatus } from './NotificationStatus';
import { IntegrationStatus } from './IntegrationStatus';
import { ReminderSettings } from './ReminderSettings';
import { NativePushSettings } from './NativePushSettings';
import MemberCareSettings from './MemberCareSettings';
import { Field, Toggle, inputCls } from "./shared";

function SettingsPane() {
  const [s, setS] = useState(null);      // raw settings (for display flags)
  const [form, setForm] = useState({});  // editable values
  const [init, setInit] = useState({});  // snapshot to compute dirty fields
  const [audit, setAudit] = useState([]);
  const [saving, setSaving] = useState(false);
  const [testTo, setTestTo] = useState("");
  const [testing, setTesting] = useState(false);
  const [genning, setGenning] = useState(false);
  const [verifyingPaypal, setVerifyingPaypal] = useState(false);
  const [connectingPaypal, setConnectingPaypal] = useState(false);
  const [connectingStripe, setConnectingStripe] = useState(false);
  const [syncingIg, setSyncingIg] = useState(false);
  const [verifyingZoom, setVerifyingZoom] = useState(false);
  const [testingWa, setTestingWa] = useState(false);
  const [waTo, setWaTo] = useState("");

  const load = async () => {
    try {
      const { data } = await api.get("/admin/settings");
      setS(data);
      const next = {
        stripe_enabled: !!data.stripe_enabled,
        stripe_mode: data.stripe_mode || "test",
        stripe_publishable_key: data.stripe_publishable_key || "",
        stripe_secret_key: "",
        stripe_webhook_secret: "",
        paypal_enabled: !!data.paypal_enabled,
        paypal_mode: data.paypal_mode || "sandbox",
        paypal_client_id: data.paypal_client_id || "",
        paypal_client_secret: "",
        email_enabled: !!data.email_enabled,
        smtp_host: data.smtp_host || "smtp.gmail.com",
        smtp_port: data.smtp_port || 587,
        smtp_user: data.smtp_user || "",
        smtp_password: "",
        sender_email: data.sender_email || "",
        sender_name: data.sender_name || "Tony Yoga",
        push_enabled: !!data.push_enabled,
        vapid_claim_email: data.vapid_claim_email || "",
        reminder_lead_minutes: data.reminder_lead_minutes ?? 30,
        reels_enabled: data.reels_enabled !== false,
        social_instagram: data.social_instagram || "",
        instagram_reels: Array.isArray(data.instagram_reels) ? data.instagram_reels : [],
        instagram_auto_sync: !!data.instagram_auto_sync,
        instagram_user_id: data.instagram_user_id || "",
        instagram_access_token: "",
        assistant_enabled: data.assistant_enabled !== false,
        assistant_greeting: data.assistant_greeting || "",
        assistant_popup_delay: data.assistant_popup_delay ?? 12,
        assistant_voice: data.assistant_voice || "nova",
        assistant_daily_limit: data.assistant_daily_limit ?? 300,
        assistant_session_limit: data.assistant_session_limit ?? 25,
        lead_alert_enabled: data.lead_alert_enabled !== false,
        lead_alert_whatsapp: data.lead_alert_whatsapp || "",
        openai_api_key: "",
        openai_api_key_set: !!data.openai_api_key_set,
        openai_api_key_from_env: !!data.openai_api_key_from_env,
        assistant_provider: data.assistant_provider || "auto",
        assistant_gemini_model: data.assistant_gemini_model || "gemini-3.5-flash-lite",
        assistant_gemini_voice: data.assistant_gemini_voice || "Kore",
        gemini_api_key: "",
        gemini_api_key_set: !!data.gemini_api_key_set,
        gemini_api_key_from_env: !!data.gemini_api_key_from_env,
        social_whatsapp: data.social_whatsapp || "",
        zoom_enabled: !!data.zoom_enabled,
        zoom_account_id: data.zoom_account_id || "",
        zoom_client_id: data.zoom_client_id || "",
        zoom_client_secret: "",
        zoom_host_user_id: data.zoom_host_user_id || "",
        recording_replay_days: data.recording_replay_days ?? 3,
        whatsapp_enabled: !!data.whatsapp_enabled,
        twilio_account_sid: data.twilio_account_sid || "",
        twilio_auth_token: "",
        twilio_whatsapp_from: data.twilio_whatsapp_from || "",
      };
      setForm(next);
      setInit(next);
      api.get("/admin/settings/audit").then(({ data: a }) => setAudit(a || [])).catch(() => {});
    } catch { setS(false); }
  };
  useEffect(() => { load(); }, []);

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  // ---- Instagram reels editor helpers ----
  const extractShortcode = (raw) => {
    const v = (raw || "").trim();
    const m = v.match(/instagram\.com\/(?:reel|p|tv)\/([A-Za-z0-9_-]+)/i);
    return m ? m[1] : v.replace(/\/+$/, "");
  };
  const addReel = () => setForm((f) => ({ ...f, instagram_reels: [...(f.instagram_reels || []), { shortcode: "", caption: "" }] }));
  const removeReel = (idx) => setForm((f) => ({ ...f, instagram_reels: (f.instagram_reels || []).filter((_, i) => i !== idx) }));
  const updateReel = (idx, key, value) => setForm((f) => ({
    ...f,
    instagram_reels: (f.instagram_reels || []).map((r, i) =>
      i === idx ? { ...r, [key]: key === "shortcode" ? extractShortcode(value) : value } : r
    ),
  }));

  const save = async () => {
    setSaving(true);
    try {
      // Only send fields the admin actually changed — avoids persisting
      // env-derived values (e.g. publishable key) into the DB and shadowing env.
      const payload = {};
      Object.keys(form).forEach((k) => {
        if (form[k] === init[k]) return;
        if (k === "smtp_port") payload[k] = Number(form[k]) || 587;
        else if (k === "reminder_lead_minutes") payload[k] = Number(form[k]) || 30;
        else payload[k] = form[k];
      });
      // Never send blank secrets.
      ["stripe_secret_key", "stripe_webhook_secret", "smtp_password", "paypal_client_secret", "instagram_access_token", "zoom_client_secret", "twilio_auth_token", "openai_api_key", "gemini_api_key"].forEach((k) => {
        if (!payload[k]) delete payload[k];
      });
      if (Object.keys(payload).length === 0) { toast.info("No changes to save."); setSaving(false); return; }
      const { data } = await api.patch("/admin/settings", payload);
      toast.success("Settings saved.");
      (data.warnings || []).forEach((w) => (toast.warning ? toast.warning(w) : toast(w)));
      await load();
    } catch (e) { toast.error(e?.response?.data?.detail || "Save failed"); }
    finally { setSaving(false); }
  };

  const clearSecret = async (key) => {
    if (!window.confirm("Clear this saved secret? Checkout/email that relies on it will stop working until you enter a new value.")) return;
    try {
      await api.patch("/admin/settings", { [key]: "__clear__" });
      toast.success("Secret cleared.");
      await load();
    } catch (e) { toast.error(e?.response?.data?.detail || "Could not clear"); }
  };

  const sendTest = async () => {
    setTesting(true);
    try {
      const { data } = await api.post("/admin/email/test", { to: testTo || undefined });
      if (data.ok) toast.success(`Test email sent to ${data.to}`);
      else toast.error(data.error || "Send failed");
    } catch (e) { toast.error(e?.response?.data?.detail || "Send failed"); }
    finally { setTesting(false); }
  };

  const generateVapid = async () => {
    if (s.vapid_public_key && !window.confirm("Regenerate VAPID keys? Existing push subscriptions will stop working and students will need to re-enable reminders.")) return;
    setGenning(true);
    try {
      await api.post("/admin/push/generate-vapid");
      toast.success("VAPID keys generated — web push is on.");
      await load();
    } catch (e) { toast.error(e?.response?.data?.detail || "Generation failed"); }
    finally { setGenning(false); }
  };

  const verifyPaypal = async () => {
    setVerifyingPaypal(true);
    try {
      const { data } = await api.post("/admin/paypal/verify");
      if (data.ok) toast.success(data.message || "PayPal connected.");
      else toast.error(data.error || "PayPal verification failed.");
    } catch (e) { toast.error(e?.response?.data?.detail || "Verification failed"); }
    finally { setVerifyingPaypal(false); }
  };

  const connectPaypal = async () => {
    setConnectingPaypal(true);
    try {
      const { data } = await api.post("/admin/paypal/connect", {
        client_id: form.paypal_client_id || null,
        client_secret: form.paypal_client_secret || null,
        enabled: true,
      });
      if (data.ok) { toast.success(data.message || `PayPal connected (${data.mode}).`); await load(); }
      else toast.error(data.error || "Couldn't connect PayPal.");
    } catch (e) { toast.error(e?.response?.data?.detail || "Couldn't connect PayPal."); }
    finally { setConnectingPaypal(false); }
  };

  const connectStripe = async () => {
    setConnectingStripe(true);
    try {
      const { data } = await api.post("/admin/stripe/connect", {
        secret_key: form.stripe_secret_key || null,
        publishable_key: form.stripe_publishable_key || null,
        webhook_secret: form.stripe_webhook_secret || null,
        enabled: form.stripe_enabled,
      });
      if (data.ok) { toast.success(data.message || `Stripe connected (${data.mode}).`); await load(); }
      else toast.error(data.error || "Couldn't connect Stripe.");
    } catch (e) { toast.error(e?.response?.data?.detail || "Couldn't connect Stripe."); }
    finally { setConnectingStripe(false); }
  };

  const syncInstagram = async () => {
    setSyncingIg(true);
    try {
      const { data } = await api.post("/admin/instagram/sync");
      toast.success(`Synced ${data.count} reel${data.count === 1 ? "" : "s"} from Instagram.`);
      await load();
    } catch (e) { toast.error(e?.response?.data?.detail || "Sync failed — check the access token & account id."); }
    finally { setSyncingIg(false); }
  };

  const verifyZoom = async () => {
    setVerifyingZoom(true);
    try {
      const { data } = await api.post("/admin/zoom/connect", {
        zoom_account_id: form.zoom_account_id, zoom_client_id: form.zoom_client_id,
        zoom_client_secret: form.zoom_client_secret, zoom_host_user_id: form.zoom_host_user_id,
        enabled: form.zoom_enabled,
      });
      if (data.ok) { toast.success(data.message || "Zoom connected."); await load(); }
      else toast.error(data.error || "Zoom verification failed.");
    } catch (e) { toast.error(e?.response?.data?.detail || "Verification failed"); }
    finally { setVerifyingZoom(false); }
  };

  const testWhatsapp = async () => {
    setTestingWa(true);
    try {
      const { data } = await api.post("/admin/whatsapp/test", { to: waTo });
      if (data.ok) toast.success(`Test WhatsApp sent to ${data.to}`);
      else toast.error(data.error || "Send failed");
    } catch (e) { toast.error(e?.response?.data?.detail || "Send failed"); }
    finally { setTestingWa(false); }
  };

  if (s === null) return <Spinner />;
  if (s === false) return <p className="text-sm text-[#6B7269]">Could not load settings.</p>;

  const card = "rounded-2xl bg-white border border-[#E5E6DF] p-5 space-y-4";
  const secretHint = (key) =>
    s[`${key}_set`]
      ? (s[`${key}_from_env`] ? "Configured from server env. Enter a value to override." : "Configured. Leave blank to keep current.")
      : "Not set.";

  const StatusBadge = ({ connected, mode }) => (
    connected ? (
      <span data-testid="integration-status-connected" className="inline-flex items-center gap-1.5 rounded-full bg-[#EAF3EC] text-[#2F6B44] border border-[#CFE6D5] px-2.5 py-1 text-[11px] font-semibold">
        <Check className="h-3 w-3" /> Connected{mode ? ` · ${mode}` : ""}
      </span>
    ) : (
      <span data-testid="integration-status-disconnected" className="inline-flex items-center gap-1.5 rounded-full bg-[#F3EEE7] text-[#6B7269] border border-[#E5E6DF] px-2.5 py-1 text-[11px] font-semibold">
        <X className="h-3 w-3" /> Not connected
      </span>
    )
  );

  return (
    <div className="space-y-4" data-testid="admin-settings">
      <AppDownloadsSettings />
      <NotificationStatus />
      <ReminderSettings />
      <NativePushSettings />
      <MemberCareSettings />
      {/* -------- Payments / Stripe -------- */}
      <div className={card} data-testid="settings-payments-card">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-[#635BFF]"><CreditCard className="h-4 w-4" /><span className="eyebrow !text-[11px]">Payments · Stripe <span className="text-[#6B7269]">(card backup)</span></span></div>
          <Toggle checked={form.stripe_enabled} onChange={(v) => set("stripe_enabled", v)} tid="settings-stripe-enabled" />
        </div>
        <IntegrationStatus provider="stripe" revision={s} />
        <p className="text-[12px] text-[#6B7269] -mt-1" data-testid="settings-stripe-notice">Test and live mode are detected from your key. Live mode takes real payments when enabled. Verification never creates a charge.</p>
        <Field label="Secret key" hint={secretHint("stripe_secret_key") + " Starts with sk_live_ or sk_test_ (or a restricted rk_ key)."}>
          <input data-testid="settings-stripe-sk" type="password" className={inputCls} value={form.stripe_secret_key}
            onChange={(e) => set("stripe_secret_key", e.target.value)} placeholder={s.stripe_secret_key_set ? "•••• configured — leave blank to keep" : "sk_live_..."} />
          {s.stripe_secret_key_set && !s.stripe_secret_key_from_env && <button type="button" onClick={() => clearSecret("stripe_secret_key")} data-testid="clear-stripe-sk" className="text-[11px] text-[#B25A45] hover:underline mt-1">Clear saved key</button>}
        </Field>
        <Field label="Publishable key (optional)" hint="Starts with pk_live_ or pk_test_.">
          <input data-testid="settings-stripe-pk" className={inputCls} value={form.stripe_publishable_key}
            onChange={(e) => set("stripe_publishable_key", e.target.value)} placeholder="pk_live_..." />
        </Field>
        <Field label="Webhook signing secret (required to enable payments)" hint={secretHint("stripe_webhook_secret") + " From your Stripe webhook endpoint (whsec_...)."}>
          <input data-testid="settings-stripe-whsec" type="password" className={inputCls} value={form.stripe_webhook_secret}
            onChange={(e) => set("stripe_webhook_secret", e.target.value)} placeholder={s.stripe_webhook_secret_set ? "•••• configured" : "whsec_..."} />
          {s.stripe_webhook_secret_set && !s.stripe_webhook_secret_from_env && <button type="button" onClick={() => clearSecret("stripe_webhook_secret")} data-testid="clear-stripe-whsec" className="text-[11px] text-[#B25A45] hover:underline mt-1">Clear saved key</button>}
        </Field>
        <button type="button" onClick={connectStripe} disabled={connectingStripe} data-testid="settings-stripe-connect" className="pill pill-primary disabled:opacity-60">
          <RefreshCw className="h-4 w-4" /> {connectingStripe ? "Verifying…" : "Save & Verify"}
        </button>
        <p className="text-[11px] text-[#6B7269]">Get your key at <span className="font-semibold">dashboard.stripe.com → Developers → API keys</span>.</p>
      </div>

      {/* -------- Zoom (live classes + recordings) -------- */}
      <div className={card} data-testid="settings-zoom-card">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-[#2D8CFF]"><Video className="h-4 w-4" /><span className="eyebrow !text-[11px]">Live classes · Zoom</span></div>
          <Toggle checked={form.zoom_enabled} onChange={(v) => set("zoom_enabled", v)} tid="settings-zoom-enabled" />
        </div>
        <IntegrationStatus provider="zoom" revision={s} />
        <p className="text-[12px] text-[#6B7269] -mt-1" data-testid="settings-zoom-notice">Server-to-Server OAuth. Activate your Zoom app with meeting creation and user-read scopes. A verified connection and the on/off switch control real meetings; no demo links are generated.</p>
        <Field label="Account ID" hint="From your Zoom Server-to-Server OAuth app.">
          <input data-testid="settings-zoom-account" className={inputCls} value={form.zoom_account_id}
            onChange={(e) => set("zoom_account_id", e.target.value)} placeholder="Account ID" />
        </Field>
        <Field label="Client ID">
          <input data-testid="settings-zoom-client-id" className={inputCls} value={form.zoom_client_id}
            onChange={(e) => set("zoom_client_id", e.target.value)} placeholder="Client ID" />
        </Field>
        <Field label="Client Secret" hint={secretHint("zoom_client_secret")}>
          <input data-testid="settings-zoom-secret" type="password" className={inputCls} value={form.zoom_client_secret}
            onChange={(e) => set("zoom_client_secret", e.target.value)} placeholder={s.zoom_client_secret_set ? "•••• configured" : "Client Secret"} />
          {s.zoom_client_secret_set && !s.zoom_client_secret_from_env && <button type="button" onClick={() => clearSecret("zoom_client_secret")} data-testid="clear-zoom-secret" className="text-[11px] text-[#B25A45] hover:underline mt-1">Clear saved secret</button>}
        </Field>
        <Field label="Host user" hint="Licensed Zoom user email or id that owns the meetings.">
          <input data-testid="settings-zoom-host" className={inputCls} value={form.zoom_host_user_id}
            onChange={(e) => set("zoom_host_user_id", e.target.value)} placeholder="tony@tonyyoga.com" />
        </Field>
        <Field label="Default replay window (days)" hint="How long class recordings stay watchable after the class.">
          <input data-testid="settings-zoom-replay-days" type="number" min={1} max={60} className={inputCls}
            value={form.recording_replay_days} onChange={(e) => set("recording_replay_days", Number(e.target.value) || 3)} />
        </Field>
        <button type="button" onClick={verifyZoom} disabled={verifyingZoom} data-testid="settings-zoom-verify" className="pill pill-ghost !py-2 !px-4 !text-[13px]">
          {verifyingZoom ? "Verifying…" : "Save & Verify Zoom"}
        </button>
      </div>

      {/* -------- WhatsApp (Twilio) -------- */}
      <div className={card} data-testid="settings-whatsapp-card">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-[#25D366]"><MessageCircle className="h-4 w-4" /><span className="eyebrow !text-[11px]">Notifications · WhatsApp</span></div>
          <Toggle checked={form.whatsapp_enabled} onChange={(v) => set("whatsapp_enabled", v)} tid="settings-whatsapp-enabled" />
        </div>
        <p className="text-[12px] text-[#6B7269] -mt-1">Twilio WhatsApp. When on and configured, class reminders and new episodes are also sent over WhatsApp to members who have a number on file.</p>
        <Field label="Account SID" hint="From your Twilio Console.">
          <input data-testid="settings-twilio-sid" className={inputCls} value={form.twilio_account_sid} onChange={(e) => set("twilio_account_sid", e.target.value)} placeholder="ACxxxxxxxx" />
        </Field>
        <Field label="Auth Token" hint={secretHint("twilio_auth_token")}>
          <input data-testid="settings-twilio-token" type="password" className={inputCls} value={form.twilio_auth_token} onChange={(e) => set("twilio_auth_token", e.target.value)} placeholder={s.twilio_auth_token_set ? "•••• configured" : "Auth token"} />
          {s.twilio_auth_token_set && !s.twilio_auth_token_from_env && <button type="button" onClick={() => clearSecret("twilio_auth_token")} data-testid="clear-twilio-token" className="text-[11px] text-[#B25A45] hover:underline mt-1">Clear saved token</button>}
        </Field>
        <Field label="WhatsApp From number" hint="e.g. whatsapp:+14155238886 (Twilio sandbox) or your approved sender.">
          <input data-testid="settings-twilio-from" className={inputCls} value={form.twilio_whatsapp_from} onChange={(e) => set("twilio_whatsapp_from", e.target.value)} placeholder="whatsapp:+14155238886" />
        </Field>
        <div className="flex gap-2">
          <input data-testid="settings-whatsapp-testto" className={inputCls + " flex-1"} value={waTo} onChange={(e) => setWaTo(e.target.value)} placeholder="+34600123456" />
          <button type="button" onClick={testWhatsapp} disabled={testingWa} data-testid="settings-whatsapp-test" className="pill pill-ghost !py-2 !px-4 !text-[13px] shrink-0">{testingWa ? "Sending…" : "Send test"}</button>
        </div>
      </div>

      {/* -------- Payments / PayPal (primary) -------- */}
      <div className={card} data-testid="settings-paypal-card">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-[#003087]"><Wallet className="h-4 w-4" /><span className="eyebrow !text-[11px]">Payments · PayPal <span className="text-[#B25A45]">(primary)</span></span></div>
          <StatusBadge connected={!!s.paypal_client_secret_set} mode={s.paypal_client_secret_set ? (s.paypal_mode || "sandbox") : null} />
        </div>
        <p className="text-[12px] text-[#6B7269] -mt-1">Paste your PayPal <strong>Client ID</strong> and <strong>Secret</strong>, then click <strong>Save &amp; Verify</strong>. We detect Sandbox vs Live automatically — you don't pick a mode. When connected, PayPal is the primary checkout button.</p>
        <Field label="Client ID" hint="From your PayPal Developer app (REST API app).">
          <input data-testid="settings-paypal-client-id" className={inputCls} value={form.paypal_client_id}
            onChange={(e) => set("paypal_client_id", e.target.value)} placeholder="AXxx…" />
        </Field>
        <Field label="Client secret" hint={secretHint("paypal_client_secret")}>
          <input data-testid="settings-paypal-secret" type="password" className={inputCls} value={form.paypal_client_secret}
            onChange={(e) => set("paypal_client_secret", e.target.value)} placeholder={s.paypal_client_secret_set ? "•••• configured — leave blank to keep" : "EXxxx…"} />
          {s.paypal_client_secret_set && !s.paypal_client_secret_from_env && <button type="button" onClick={() => clearSecret("paypal_client_secret")} data-testid="clear-paypal-secret" className="text-[11px] text-[#B25A45] hover:underline mt-1">Clear saved secret</button>}
        </Field>
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={connectPaypal} disabled={connectingPaypal} data-testid="settings-paypal-connect" className="pill pill-primary disabled:opacity-60">
            <RefreshCw className="h-4 w-4" /> {connectingPaypal ? "Verifying…" : "Save & Verify"}
          </button>
          {s.paypal_client_secret_set && (
            <button type="button" onClick={verifyPaypal} disabled={verifyingPaypal} data-testid="settings-paypal-verify" className="pill pill-ghost">
              {verifyingPaypal ? "Checking…" : "Re-check connection"}
            </button>
          )}
        </div>
        <p className="text-[11px] text-[#6B7269]">Get keys at <span className="font-semibold">developer.paypal.com → Apps &amp; Credentials</span>. Copy the Client ID + Secret exactly (no extra spaces). We figure out Sandbox vs Live for you.</p>
      </div>

      {/* -------- Email / SMTP -------- */}
      <div className={card} data-testid="settings-email-card">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-[#B25A45]"><Mail className="h-4 w-4" /><span className="eyebrow !text-[11px]">Email · SMTP</span></div>
          <Toggle checked={form.email_enabled} onChange={(v) => set("email_enabled", v)} tid="settings-email-enabled" />
        </div>
        <p className="text-[12px] text-[#6B7269] -mt-1">When on, students get a confirmation email each time they book a class.</p>
        <div className="grid grid-cols-2 gap-3">
          <Field label="SMTP host"><input data-testid="settings-smtp-host" className={inputCls} value={form.smtp_host} onChange={(e) => set("smtp_host", e.target.value)} placeholder="smtp.gmail.com" /></Field>
          <Field label="Port"><input data-testid="settings-smtp-port" className={inputCls} value={form.smtp_port} onChange={(e) => set("smtp_port", e.target.value)} placeholder="587" /></Field>
        </div>
        <Field label="SMTP username" hint="Usually the full email address."><input data-testid="settings-smtp-user" className={inputCls} value={form.smtp_user} onChange={(e) => set("smtp_user", e.target.value)} placeholder="you@gmail.com" /></Field>
        <Field label="SMTP password / app password" hint={secretHint("smtp_password")}>
          <input data-testid="settings-smtp-pass" type="password" className={inputCls} value={form.smtp_password} onChange={(e) => set("smtp_password", e.target.value)} placeholder={s.smtp_password_set ? "•••• configured" : "app password"} />
          {s.smtp_password_set && !s.smtp_password_from_env && <button type="button" onClick={() => clearSecret("smtp_password")} data-testid="clear-smtp-pass" className="text-[11px] text-[#B25A45] hover:underline mt-1">Clear saved password</button>}
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Sender email"><input data-testid="settings-sender-email" className={inputCls} value={form.sender_email} onChange={(e) => set("sender_email", e.target.value)} placeholder="tony@tonysanchezyoga.com" /></Field>
          <Field label="Sender name"><input data-testid="settings-sender-name" className={inputCls} value={form.sender_name} onChange={(e) => set("sender_name", e.target.value)} placeholder="Tony Yoga" /></Field>
        </div>
        <div className="flex flex-col sm:flex-row gap-2 pt-1">
          <input data-testid="settings-test-email-to" className={inputCls} value={testTo} onChange={(e) => setTestTo(e.target.value)} placeholder="Send test to (defaults to your email)" />
          <button type="button" onClick={sendTest} disabled={testing} data-testid="settings-send-test-email" className="pill pill-ghost shrink-0"><Send className="h-4 w-4" /> {testing ? "Sending…" : "Send test"}</button>
        </div>
      </div>

      {/* -------- Push / VAPID -------- */}
      <div className={card} data-testid="settings-push-card">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-[#B25A45]"><Bell className="h-4 w-4" /><span className="eyebrow !text-[11px]">Class reminders · Web Push</span></div>
          <Toggle checked={form.push_enabled} onChange={(v) => set("push_enabled", v)} tid="settings-push-enabled" />
        </div>
        <p className="text-[12px] text-[#6B7269] -mt-1">When on, students who opt in get a push nudge {form.reminder_lead_minutes || 30} minutes before class.</p>
        <Field label="VAPID public key" hint={s.vapid_public_key ? "Keys are configured." : "No keys yet — generate a keypair to enable push."}>
          <input data-testid="settings-vapid-public" readOnly className={inputCls + " bg-[#F7F7F2] text-[#6B7269]"} value={s.vapid_public_key || ""} placeholder="Not generated" />
        </Field>
        <Field label="Contact email (VAPID claim)"><input data-testid="settings-vapid-email" className={inputCls} value={form.vapid_claim_email} onChange={(e) => set("vapid_claim_email", e.target.value)} placeholder="mailto:tony@tonysanchezyoga.com" /></Field>
        <Field label="Reminder timing" hint="How many minutes before a class the reminder push is sent.">
          <div className="flex items-center gap-2">
            <input data-testid="settings-reminder-lead" type="number" min="5" max="240" className={inputCls + " max-w-[120px]"} value={form.reminder_lead_minutes} onChange={(e) => set("reminder_lead_minutes", e.target.value)} />
            <span className="text-sm text-[#6B7269]">minutes before class</span>
          </div>
        </Field>
        <button type="button" onClick={generateVapid} disabled={genning} data-testid="settings-generate-vapid" className="pill pill-ghost">
          <RefreshCw className="h-4 w-4" /> {genning ? "Generating…" : (s.vapid_public_key ? "Regenerate keys" : "Generate keys")}
        </button>
      </div>

      {/* -------- Instagram feed -------- */}
      <div className={card} data-testid="settings-instagram-card">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-[#B25A45]"><Instagram className="h-4 w-4" /><span className="eyebrow !text-[11px]">Instagram feed · Homepage</span></div>
          <Toggle checked={form.reels_enabled} onChange={(v) => set("reels_enabled", v)} tid="settings-reels-enabled" />
        </div>
        <p className="text-[12px] text-[#6B7269] -mt-1">Controls the “Fresh from the mat” reels section on the homepage. Turn off to hide it entirely.</p>
        <Field label="Instagram profile URL" hint="Used by the “Follow on Instagram” links.">
          <input data-testid="settings-instagram-handle" className={inputCls} value={form.social_instagram}
            onChange={(e) => set("social_instagram", e.target.value)} placeholder="https://www.instagram.com/tonyoga_school/" />
        </Field>

        {/* Auto-sync via Meta Graph API */}
        <div className="rounded-2xl bg-[#F7F7F2] border border-[#E5E6DF] p-4 space-y-3" data-testid="settings-instagram-autosync">
          <div className="flex items-center justify-between">
            <span className="text-[11px] uppercase tracking-widest font-semibold text-[#839682]">Auto-sync latest reels</span>
            <Toggle checked={form.instagram_auto_sync} onChange={(v) => set("instagram_auto_sync", v)} tid="settings-ig-autosync-toggle" />
          </div>
          <p className="text-[11px] text-[#6B7269] -mt-1">Pulls the latest reels automatically every ~30 min using the Instagram Graph API. Needs a Business/Creator account, its account id, and a long-lived access token.</p>
          <Field label="Instagram account id">
            <input data-testid="settings-ig-user-id" className={inputCls} value={form.instagram_user_id} onChange={(e) => set("instagram_user_id", e.target.value)} placeholder="17841400000000000" />
          </Field>
          <Field label="Access token (long-lived)" hint={secretHint("instagram_access_token")}>
            <input data-testid="settings-ig-token" type="password" className={inputCls} value={form.instagram_access_token} onChange={(e) => set("instagram_access_token", e.target.value)} placeholder={s.instagram_access_token_set ? "•••• configured" : "IGQVJ…"} />
            {s.instagram_access_token_set && !s.instagram_access_token_from_env && <button type="button" onClick={() => clearSecret("instagram_access_token")} data-testid="clear-ig-token" className="text-[11px] text-[#B25A45] hover:underline mt-1">Clear saved token</button>}
          </Field>
          <div className="flex items-center gap-2 flex-wrap">
            <button type="button" onClick={syncInstagram} disabled={syncingIg} data-testid="settings-ig-sync-now" className="pill pill-primary !py-1.5 !px-3 !text-xs"><RefreshCw className="h-3.5 w-3.5" /> {syncingIg ? "Syncing…" : "Sync now"}</button>
            {s.instagram_last_sync && <span className="text-[11px] text-[#6B7269]">Last synced {new Date(s.instagram_last_sync).toLocaleString()}</span>}
          </div>
          {s.instagram_last_error && <p className="text-[11px] text-[#B25A45]">Last error: {s.instagram_last_error}</p>}
          <p className="text-[11px] text-[#6B7269]">Tip: save the token first, then “Sync now”. Synced reels fill the list below automatically.</p>
        </div>

        <div className="space-y-2">
          <div className="text-[11px] uppercase tracking-widest font-semibold text-[#839682]">Reels shown (first 4)</div>
          {(form.instagram_reels || []).length === 0 && (
            <p className="text-[12px] text-[#6B7269]">No reels added — a curated default set is shown until you add your own.</p>
          )}
          <ul className="space-y-2" data-testid="settings-reels-list">
            {(form.instagram_reels || []).map((r, idx) => (
              <li key={idx} className="rounded-2xl bg-[#F7F7F2] border border-[#E5E6DF] p-3 space-y-2" data-testid={`settings-reel-row-${idx}`}>
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[11px] font-semibold text-[#839682]">Reel {idx + 1}</span>
                  <button type="button" onClick={() => removeReel(idx)} data-testid={`settings-reel-remove-${idx}`} className="text-[#B25A45] hover:text-[#8f4436]"><Trash2 className="h-4 w-4" /></button>
                </div>
                <input data-testid={`settings-reel-shortcode-${idx}`} className={inputCls} value={r.shortcode || ""}
                  onChange={(e) => updateReel(idx, "shortcode", e.target.value)} placeholder="Paste Instagram reel link or shortcode (e.g. C_2wKtGRJJP)" />
                <input data-testid={`settings-reel-caption-${idx}`} className={inputCls} value={r.caption || ""}
                  onChange={(e) => updateReel(idx, "caption", e.target.value)} placeholder="Caption (optional)" />
              </li>
            ))}
          </ul>
          <button type="button" onClick={addReel} data-testid="settings-reel-add" className="pill pill-ghost !py-1.5 !px-3 !text-xs"><Plus className="h-3.5 w-3.5" /> Add reel</button>
        </div>
      </div>

      {/* -------- AI Assistant -------- */}
      <AssistantCard form={form} set={set} inputCls={inputCls} card={card} clearSecret={clearSecret} />

      {/* -------- Audit log -------- */}
      <div className={card} data-testid="settings-audit-card">
        <div className="flex items-center gap-2 text-[#B25A45]"><History className="h-4 w-4" /><span className="eyebrow !text-[11px]">Change history</span></div>
        <p className="text-[12px] text-[#6B7269] -mt-1">Who changed settings and when. Secret values are never recorded — only which keys changed.</p>
        {audit.length === 0 ? (
          <p className="text-sm text-[#6B7269] py-2">No changes recorded yet.</p>
        ) : (
          <ul className="space-y-2 max-h-72 overflow-y-auto" data-testid="settings-audit-list">
            {audit.map((a, i) => (
              <li key={i} className="rounded-xl bg-[#F7F7F2] border border-[#E5E6DF] p-3">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[13px] font-semibold truncate">{a.admin_email || a.admin_id || "admin"}</span>
                  <span className="text-[11px] text-[#6B7269] shrink-0">{new Date(a.at).toLocaleString()}</span>
                </div>
                <div className="text-[12px] text-[#545E56] mt-1">
                  Changed: {(a.keys || []).join(", ")}
                  {(a.secret_changed || []).length > 0 && <span className="text-[#B25A45]"> · incl. secret{a.secret_changed.length > 1 ? "s" : ""}</span>}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      <button type="button" onClick={save} disabled={saving} data-testid="settings-save" className="pill pill-primary w-full sticky bottom-3">
        <Save className="h-4 w-4" /> {saving ? "Saving…" : "Save all settings"}
      </button>
    </div>
  );
}
function UsageChart({ history }) {
  const max = Math.max(1, ...history.map((d) => d.count));
  const DOW = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const dow = (iso) => DOW[new Date(iso + "T00:00:00").getDay()];
  return (
    <div className="flex items-end gap-1.5" data-testid="settings-usage-chart">
      {history.map((d, i) => (
        <div key={i} className="flex-1 flex flex-col items-center gap-1">
          <span className="text-[9px] font-semibold text-[#1C221F]">{d.count}</span>
          <div className="w-full flex items-end justify-center" style={{ height: 56 }}>
            <div
              className="w-full max-w-[26px] rounded-t bg-[#B25A45] transition-all"
              style={{ height: `${Math.round((d.count / max) * 100)}%`, minHeight: d.count > 0 ? 4 : 2, opacity: i === history.length - 1 ? 1 : 0.5 }}
              title={`${d.count} turns on ${d.date}`}
            />
          </div>
          <span className="text-[9px] text-[#6B7269]">{dow(d.date)}</span>
        </div>
      ))}
    </div>
  );
}

function AssistantCard({ form, set, inputCls, card, clearSecret }) {
  const [leads, setLeads] = useState(null);
  const [showLeads, setShowLeads] = useState(false);
  const [usage, setUsage] = useState(null);
  useEffect(() => { api.get("/admin/assistant/leads").then(({ data }) => setLeads(data.leads)).catch(() => setLeads([])); }, []);
  useEffect(() => { api.get("/admin/assistant/usage").then(({ data }) => setUsage(data)).catch(() => setUsage(null)); }, []);
  const VOICES = ["nova", "shimmer", "alloy", "echo", "fable", "onyx"];
  const GEMINI_VOICES = [
    ["Kore", "Kore — firm, female"], ["Aoede", "Aoede — breezy, female"], ["Leda", "Leda — youthful, female"],
    ["Zephyr", "Zephyr — bright, female"], ["Callirrhoe", "Callirrhoe — easy-going, female"], ["Despina", "Despina — smooth, female"],
    ["Sulafat", "Sulafat — warm, female"], ["Vindemiatrix", "Vindemiatrix — gentle, female"], ["Achernar", "Achernar — soft, female"],
    ["Puck", "Puck — upbeat, male"], ["Charon", "Charon — informative, male"], ["Fenrir", "Fenrir — excitable, male"],
    ["Orus", "Orus — firm, male"], ["Iapetus", "Iapetus — clear, male"], ["Umbriel", "Umbriel — easy-going, male"],
    ["Algieba", "Algieba — smooth, male"], ["Achird", "Achird — friendly, male"], ["Sadaltager", "Sadaltager — knowledgeable, male"],
  ];
  // Which AI answers right now: "auto" uses Gemini as soon as a Gemini key is saved (or typed).
  const usesGemini = form.assistant_provider === "gemini"
    || (form.assistant_provider !== "openai" && (form.gemini_api_key_set || !!form.gemini_api_key));
  const [check, setCheck] = useState(null);
  const runCheck = async () => {
    setCheck({ busy: true });
    try {
      const { data } = await api.post("/admin/assistant/test", null, { timeout: 120000 });
      setCheck(data);
      if (data.audio_url) new Audio(`${process.env.REACT_APP_BACKEND_URL}${data.audio_url}`).play().catch(() => {});
    } catch (e) {
      setCheck({ error: e?.response?.data?.detail || "The test could not run. Please try again." });
    }
  };
  return (
    <div className={card} data-testid="settings-assistant-card">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-[#B25A45]"><MessageCircle className="h-4 w-4" /><span className="eyebrow !text-[11px]">AI Assistant · Homepage</span></div>
        <Toggle checked={form.assistant_enabled} onChange={(v) => set("assistant_enabled", v)} tid="settings-assistant-enabled" />
      </div>
      <p className="text-[12px] text-[#6B7269] -mt-1">A calm chat + voice helper that greets visitors, recommends courses, and captures leads.</p>
      <Field label="Greeting message"><textarea data-testid="settings-assistant-greeting" rows={2} className={inputCls} value={form.assistant_greeting} onChange={(e) => set("assistant_greeting", e.target.value)} /></Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Popup delay (10–15 seconds)"><input data-testid="settings-assistant-delay" type="number" min="10" max="15" className={inputCls} value={form.assistant_popup_delay} onChange={(e) => set("assistant_popup_delay", e.target.value)} /></Field>
        <Field label="WhatsApp number" hint="For the 'Chat with Tony' handoff (with country code)."><input data-testid="settings-assistant-whatsapp" className={inputCls} value={form.social_whatsapp} onChange={(e) => set("social_whatsapp", e.target.value)} placeholder="+34 600 000 000" /></Field>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <Field label="AI provider" hint={usesGemini ? "Now answering with Google Gemini." : "Now answering with OpenAI."}>
          <select data-testid="settings-assistant-provider" className={inputCls} value={form.assistant_provider} onChange={(e) => set("assistant_provider", e.target.value)}>
            <option value="auto">Automatic (Gemini when its key is saved)</option>
            <option value="gemini">Google Gemini</option>
            <option value="openai">OpenAI</option>
          </select>
        </Field>
        {usesGemini ? (
          <Field label="Voice" hint="The spoken voice (Gemini text-to-speech).">
            <select data-testid="settings-assistant-gemini-voice" className={inputCls} value={form.assistant_gemini_voice} onChange={(e) => set("assistant_gemini_voice", e.target.value)}>
              {GEMINI_VOICES.map(([v, label]) => <option key={v} value={v}>{label}</option>)}
            </select>
          </Field>
        ) : (
          <Field label="Voice" hint="The spoken voice (OpenAI text-to-speech).">
            <select data-testid="settings-assistant-voice" className={inputCls} value={form.assistant_voice} onChange={(e) => set("assistant_voice", e.target.value)}>
              {VOICES.map((v) => <option key={v} value={v}>{v.charAt(0).toUpperCase() + v.slice(1)}</option>)}
            </select>
          </Field>
        )}
        <Field label="Daily cap (AI turns)" hint="Guards against surprise bills. 0 = unlimited.">
          <input data-testid="settings-assistant-limit" type="number" min="0" className={inputCls} value={form.assistant_daily_limit} onChange={(e) => set("assistant_daily_limit", e.target.value)} />
        </Field>
        <Field label="Per-visitor cap (turns/chat)" hint="Stops one person using the whole budget. 0 = unlimited.">
          <input data-testid="settings-assistant-session-limit" type="number" min="0" className={inputCls} value={form.assistant_session_limit} onChange={(e) => set("assistant_session_limit", e.target.value)} />
        </Field>
      </div>
      {usage && (
        <div className="rounded-xl bg-[#F7F2EC] border border-[#E7D9CB] p-3" data-testid="settings-assistant-usage">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[11px] uppercase tracking-widest font-bold text-[#B25A45]">Assistant usage · last 7 days</span>
            <span className="text-[11px] text-[#6B7269]">
              Today: <span className="font-semibold text-[#1C221F]">{usage.count}</span>{usage.limit > 0 ? ` / ${usage.limit}` : " (unlimited)"}
              {usage.limit > 0 && usage.count >= usage.limit && <span className="ml-1.5 text-[#B25A45] font-semibold">· cap reached</span>}
            </span>
          </div>
          <UsageChart history={usage.history || []} />
        </div>
      )}

      <div className="rounded-xl bg-[#F7F2EC] border border-[#E7D9CB] p-3 space-y-2" data-testid="settings-lead-alert">
        <div className="flex items-center justify-between">
          <span className="text-[11px] uppercase tracking-widest font-bold text-[#B25A45]">WhatsApp me on new leads</span>
          <Toggle checked={form.lead_alert_enabled} onChange={(v) => set("lead_alert_enabled", v)} tid="settings-lead-alert-toggle" />
        </div>
        <p className="text-[11px] text-[#6B7269] leading-relaxed">
          Get an instant WhatsApp the moment the assistant captures a lead (name, email, phone &amp; interest) so you can follow up fast.
          Requires WhatsApp (Twilio) to be set up in the WhatsApp settings card.
        </p>
        <Field label="Alert number" hint="Where to send lead alerts. Leave blank to use your WhatsApp number above.">
          <input data-testid="settings-lead-alert-number" className={inputCls} value={form.lead_alert_whatsapp} onChange={(e) => set("lead_alert_whatsapp", e.target.value)} placeholder={form.social_whatsapp || "+34 600 000 000"} />
        </Field>
      </div>

      <div className="rounded-xl bg-[#F7F2EC] border border-[#E7D9CB] p-3 space-y-2">
        <div className="flex items-center justify-between">
          <span className="text-[11px] uppercase tracking-widest font-bold text-[#B25A45]">OpenAI API key</span>
          {form.openai_api_key_set
            ? <span className="text-[10px] font-semibold text-[#3E7C57] bg-[#E4F0E8] rounded-full px-2 py-0.5" data-testid="settings-openai-status">● Configured{form.openai_api_key_from_env ? " (env)" : ""}</span>
            : <span className="text-[10px] font-semibold text-[#8A6D3B] bg-[#F3E7C9] rounded-full px-2 py-0.5" data-testid="settings-openai-status">Not configured</span>}
        </div>
        <p className="text-[11px] text-[#6B7269] leading-relaxed">
          OpenAI can power chat and voice. Set a key here or use the server's OPENAI_API_KEY.
          Leave blank to keep the saved key. Stored securely on the server, never shown in full.
        </p>
        <input
          data-testid="settings-openai-key"
          type="password"
          className={inputCls}
          value={form.openai_api_key}
          onChange={(e) => set("openai_api_key", e.target.value)}
          placeholder={form.openai_api_key_set ? "••••••••  (leave blank to keep current)" : "sk-..."}
          autoComplete="off"
        />
        <a data-testid="settings-openai-key-link" href="https://platform.openai.com/api-keys" target="_blank" rel="noopener noreferrer" className="text-[11px] font-semibold text-[#B25A45] hover:opacity-70">Get an OpenAI key →</a>
      </div>

      <div className="rounded-xl bg-[#F7F2EC] border border-[#E7D9CB] p-3 space-y-2" data-testid="settings-gemini-box">
        <div className="flex items-center justify-between">
          <span className="text-[11px] uppercase tracking-widest font-bold text-[#B25A45]">Google Gemini API key</span>
          {form.gemini_api_key_set
            ? <span className="text-[10px] font-semibold text-[#3E7C57] bg-[#E4F0E8] rounded-full px-2 py-0.5" data-testid="settings-gemini-status">● Configured{form.gemini_api_key_from_env ? " (env)" : ""}</span>
            : <span className="text-[10px] font-semibold text-[#8A6D3B] bg-[#F3E7C9] rounded-full px-2 py-0.5" data-testid="settings-gemini-status">Not configured</span>}
        </div>
        <p className="text-[11px] text-[#6B7269] leading-relaxed">
          Gemini can power chat and voice instead of OpenAI. Paste a key from Google AI Studio and press Save —
          with the provider on Automatic it is used straight away. Leave blank to keep the saved key. Stored securely on the server, never shown in full.
        </p>
        <input
          data-testid="settings-gemini-key"
          type="password"
          className={inputCls}
          value={form.gemini_api_key}
          onChange={(e) => set("gemini_api_key", e.target.value)}
          placeholder={form.gemini_api_key_set ? "••••••••  (leave blank to keep current)" : "AIza..."}
          autoComplete="off"
        />
        <Field label="Gemini model">
          <select data-testid="settings-gemini-model" className={inputCls} value={form.assistant_gemini_model} onChange={(e) => set("assistant_gemini_model", e.target.value)}>
            <option value="gemini-3.5-flash-lite">Gemini 3.5 Flash-Lite — fastest, lowest cost</option>
            <option value="gemini-3.8-flash">Gemini 3.8 Flash — smarter, a little slower</option>
          </select>
        </Field>
        <div className="flex flex-wrap items-center gap-3">
          <a data-testid="settings-gemini-key-link" href="https://aistudio.google.com/apikey" target="_blank" rel="noopener noreferrer" className="text-[11px] font-semibold text-[#B25A45] hover:opacity-70">Get a Gemini key →</a>
          {form.gemini_api_key_set && !form.gemini_api_key_from_env && (
            <button type="button" onClick={() => clearSecret("gemini_api_key")} className="text-[11px] font-semibold text-[#6B7269] hover:text-[#B25A45]" data-testid="settings-gemini-clear">Remove saved key</button>
          )}
        </div>
      </div>

      <div className="rounded-xl bg-white border border-[#E7D9CB] p-3 space-y-2" data-testid="settings-assistant-check">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="text-[11px] text-[#6B7269]">Save first, then check that the saved key answers and speaks.</span>
          <button type="button" onClick={runCheck} disabled={check?.busy} data-testid="settings-assistant-test" className="pill pill-ghost !py-1.5 !px-3 !text-xs">
            {check?.busy ? <><span className="h-3.5 w-3.5 rounded-full border-2 border-[#E5E6DF] border-t-[#B25A45] animate-spin inline-block" /> Testing…</> : <><Mic className="h-3.5 w-3.5" /> Test the assistant</>}
          </button>
        </div>
        {check && !check.busy && (
          <div className="text-[12px] leading-relaxed" data-testid="settings-assistant-test-result">
            {check.chat_ok ? (
              <>
                <p className="font-semibold text-[#3E7C57]">✓ {check.provider === "gemini" ? "Gemini" : "OpenAI"} is answering{check.model ? ` (${check.model})` : ""}.</p>
                <p className="text-[#1C221F] italic">“{check.reply}”</p>
                {check.voice_ok
                  ? <p className="text-[#3E7C57]">✓ Voice works — you should hear a short greeting.</p>
                  : <p className="text-[#8A6D3B]">Voice: {check.voice_error || "not available"}</p>}
                {check.voice_google && <p className="text-[11px] text-[#6B7269] break-words" data-testid="settings-assistant-test-google">Google says: {check.voice_google}</p>}
              </>
            ) : (
              <>
                <p className="font-semibold text-[#B25A45]">✗ {check.error || "The assistant did not answer."}</p>
                {check.google && <p className="text-[11px] text-[#6B7269] break-words" data-testid="settings-assistant-test-google">Google says: {check.google}</p>}
              </>
            )}
          </div>
        )}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" onClick={() => setShowLeads((v) => !v)} data-testid="settings-assistant-leads-toggle" className="pill pill-ghost !py-1.5 !px-3 !text-xs">
          <Users className="h-3.5 w-3.5" /> {showLeads ? "Hide" : "View"} captured leads {leads ? `(${leads.length})` : ""}
        </button>
        <button
          type="button"
          data-testid="settings-assistant-leads-export"
          onClick={async () => {
            try {
              const res = await api.get("/admin/assistant/leads/export.csv", { responseType: "blob" });
              const href = URL.createObjectURL(new Blob([res.data], { type: "text/csv" }));
              const a = document.createElement("a"); a.href = href; a.download = "ai_leads.csv"; a.click();
              URL.revokeObjectURL(href);
            } catch { toast.error("Export failed"); }
          }}
          className="pill pill-ghost !py-1.5 !px-3 !text-xs"
        >
          <Users className="h-3.5 w-3.5" /> Export leads CSV
        </button>
      </div>
      {showLeads && leads && (
        <ul className="space-y-2 pt-1" data-testid="assistant-leads-list">
          {leads.length === 0 ? <li className="text-xs text-[#6B7269]">No leads captured yet.</li> : leads.slice(0, 30).map((l) => (
            <li key={l.id} className="rounded-xl bg-[#F7F7F2] border border-[#E5E6DF] p-2.5 text-xs" data-testid={`assistant-lead-${l.id}`}>
              <div className="font-semibold">{l.name || "—"} <span className="font-normal text-[#6B7269]">· {l.email || "no email"} · {l.phone || "no phone"}</span></div>
              {l.interest && <div className="text-[#6B7269] mt-0.5">Interest: {l.interest}</div>}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export default SettingsPane;
