import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Save, PauseCircle, Gift, Sparkles } from "lucide-react";
import { api } from "@/lib/api";
import { invalidateSiteData } from "@/lib/siteData";
import { Field, Toggle, inputCls } from "./shared";

const errText = (e, f) => {
  const d = e?.response?.data?.detail;
  return Array.isArray(d) ? d.map((x) => x.msg).join(", ") : d || f;
};

const thisMonth = () => new Date().toISOString().slice(0, 7);
const EMPTY_THEME = { title: "", text: "", image: "", link_label: "", link_url: "", month: "" };

/** Admin → Settings: what members can do themselves (pause, cancel offer, card grace, gifts)
 *  and Tony's monthly theme shown on the app's Today screen. */
export default function MemberCareSettings() {
  const [f, setF] = useState(null);
  const [busy, setBusy] = useState(false);

  const load = () => api.get("/admin/settings").then(({ data }) => setF({
    pause_enabled: data.pause_enabled !== false,
    pause_max_months: data.pause_max_months ?? 3,
    stay_offer_percent: data.stay_offer_percent ?? 0,
    stay_offer_text: data.stay_offer_text || "",
    past_due_grace_days: data.past_due_grace_days ?? 7,
    gifts_enabled: data.gifts_enabled !== false,
    monthly_theme: { ...EMPTY_THEME, ...(data.monthly_theme || {}) },
  })).catch(() => setF(false));
  useEffect(() => { load(); }, []);

  if (f === null) return <div className="h-40 rounded-3xl bg-[#F2F2EC] animate-pulse" />;
  if (f === false) return null;

  const set = (k, v) => setF((x) => ({ ...x, [k]: v }));
  const setTheme = (k, v) => setF((x) => ({ ...x, monthly_theme: { ...x.monthly_theme, [k]: v } }));
  const theme = f.monthly_theme;

  const save = async () => {
    setBusy(true);
    try {
      const cleanTheme = Object.fromEntries(Object.entries(theme).map(([k, v]) => [k, String(v || "").trim()]).filter(([, v]) => v));
      await api.patch("/admin/settings", {
        pause_enabled: f.pause_enabled,
        pause_max_months: Number(f.pause_max_months) || 1,
        stay_offer_percent: Number(f.stay_offer_percent) || 0,
        stay_offer_text: f.stay_offer_text.trim(),
        past_due_grace_days: Number(f.past_due_grace_days) || 0,
        gifts_enabled: f.gifts_enabled,
        monthly_theme: cleanTheme,
      });
      invalidateSiteData();
      toast.success("Member settings saved");
      load();
    } catch (e) { toast.error(errText(e, "Could not save")); } finally { setBusy(false); }
  };

  const card = "rounded-3xl bg-white border border-[#E5E6DF] p-5 space-y-4";
  return (
    <div className="space-y-4" data-testid="settings-member-self-service">
      <div className={card}>
        <div className="flex items-center gap-2 text-[#B25A45]"><PauseCircle className="h-4 w-4" /><span className="eyebrow !text-[11px]">What members can do themselves</span></div>
        <label className="flex items-start gap-3 text-[13px]">
          <Toggle checked={f.pause_enabled} onChange={(v) => set("pause_enabled", v)} tid="care-pause-enabled" />
          <span><span className="font-semibold">Pause membership</span><span className="block text-[12px] text-[#6B7269]">Members pause from My Yoga (once every 6 months). Access stops and the unused days come back when they resume.</span></span>
        </label>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Field label="Longest pause (months)">
            <input type="number" min="1" max="12" className={inputCls} value={f.pause_max_months} onChange={(e) => set("pause_max_months", e.target.value)} data-testid="care-pause-max" />
          </Field>
          <Field label="Days of access after a card fails" hint="Members keep access while they update their card (0 = stop at once).">
            <input type="number" min="0" max="30" className={inputCls} value={f.past_due_grace_days} onChange={(e) => set("past_due_grace_days", e.target.value)} data-testid="care-grace-days" />
          </Field>
          <Field label="Stay offer when cancelling (% of the plan price as store credit)" hint="0 = no offer. Each member can use it once a year.">
            <input type="number" min="0" max="100" className={inputCls} value={f.stay_offer_percent} onChange={(e) => set("stay_offer_percent", e.target.value)} data-testid="care-stay-percent" />
          </Field>
          <Field label="Stay offer text" hint="Shown to the member, e.g. “Stay and get 20% back as credit”.">
            <input className={inputCls} maxLength={300} value={f.stay_offer_text} onChange={(e) => set("stay_offer_text", e.target.value)} data-testid="care-stay-text" />
          </Field>
        </div>
        <label className="flex items-start gap-3 text-[13px]">
          <Toggle checked={f.gifts_enabled} onChange={(v) => set("gifts_enabled", v)} tid="care-gifts-enabled" />
          <span><span className="font-semibold inline-flex items-center gap-1"><Gift className="h-3.5 w-3.5" />Gift memberships</span><span className="block text-[12px] text-[#6B7269]">“Give a membership” on the website. Not shown in the iPhone app.</span></span>
        </label>
      </div>

      <div className={card} data-testid="settings-monthly-theme">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 text-[#B25A45]"><Sparkles className="h-4 w-4" /><span className="eyebrow !text-[11px]">Tony's monthly theme</span></div>
          <button type="button" className="text-[12px] text-[#6B7269] underline" onClick={() => set("monthly_theme", { ...EMPTY_THEME })} data-testid="care-theme-clear">Clear</button>
        </div>
        <p className="text-[12px] text-[#6B7269]">Shown at the top of the app's Today screen. Set the month so it disappears by itself when the month ends.</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Field label="Title"><input className={inputCls} maxLength={80} value={theme.title} onChange={(e) => setTheme("title", e.target.value)} placeholder="Backbends month" data-testid="care-theme-title" /></Field>
          <Field label="Month (YYYY-MM)" hint="Empty = always shown.">
            <div className="flex gap-2">
              <input className={inputCls} maxLength={7} value={theme.month} onChange={(e) => setTheme("month", e.target.value)} placeholder={thisMonth()} data-testid="care-theme-month" />
              <button type="button" className="shrink-0 rounded-full border border-[#E5E6DF] px-3 text-[12px] font-semibold" onClick={() => setTheme("month", thisMonth())}>This month</button>
            </div>
          </Field>
          <div className="sm:col-span-2"><Field label="Text"><textarea rows={2} maxLength={400} className={inputCls} value={theme.text} onChange={(e) => setTheme("text", e.target.value)} placeholder="Open the chest with a little more each day." data-testid="care-theme-text" /></Field></div>
          <Field label="Image URL (optional)"><input className={inputCls} maxLength={500} value={theme.image} onChange={(e) => setTheme("image", e.target.value)} placeholder="https://…" data-testid="care-theme-image" /></Field>
          <Field label="Button label"><input className={inputCls} maxLength={40} value={theme.link_label} onChange={(e) => setTheme("link_label", e.target.value)} placeholder="Practise now" data-testid="care-theme-link-label" /></Field>
          <div className="sm:col-span-2"><Field label="Button link" hint="A page on the site (/library, /programs/…) or a https:// link."><input className={inputCls} maxLength={300} value={theme.link_url} onChange={(e) => setTheme("link_url", e.target.value)} placeholder="/library" data-testid="care-theme-link-url" /></Field></div>
        </div>
      </div>

      <button onClick={save} disabled={busy} data-testid="care-save" className="pill pill-primary"><Save className="h-4 w-4" />{busy ? "Saving…" : "Save member settings"}</button>
    </div>
  );
}
