import { useEffect, useState } from "react";
import { Save, Video } from "lucide-react";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { AccessTermFields, defaultTerm, termError } from "@/components/AccessTerm";
import { inputCls } from "./shared";

export const ClassPricingPane = () => {
  const [templates, setTemplates] = useState([]);
  const [id, setId] = useState("");
  const [form, setForm] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const load = () => api.get("/class-templates").then(({ data }) => {
    const rows = data.filter((t) => t.location_type === "online");
    setTemplates(rows); setId((prev) => prev || rows[0]?.id || ""); setError("");
  }).catch(() => setError("Could not load class series."));
  useEffect(() => { load(); }, []);
  useEffect(() => {
    const t = templates.find((row) => row.id === id);
    setForm(t ? { mode: "both", one_time_price: 22, subscription_price: 79, currency: "usd", term: defaultTerm, ...t.purchase_options } : null);
  }, [id, templates]);
  const save = async () => {
    const problem = form.mode !== "one_time" && form.mode !== "free" ? termError(form.term) : null;
    if (problem) return setError(problem);
    setBusy(true); setError("");
    try {
      await api.patch(`/admin/class-templates/${id}/pricing`, form);
      toast.success("Class pricing saved"); await load();
    } catch (e) { setError(typeof e.response?.data?.detail === "string" ? e.response.data.detail : "Check the prices and subscription dates."); }
    finally { setBusy(false); }
  };
  return <section data-testid="class-pricing-pane" className="space-y-4 border-b border-[#E5E6DF] pb-6 mb-6">
    <h2 className="serif text-lg flex items-center gap-2"><Video className="h-5 w-5 text-[#B25A45]" /> Zoom class purchases</h2>
    {error && <p role="alert" data-testid="class-pricing-error" className="text-sm text-[#B25A45]">{error}</p>}
    <label className="block text-xs text-[#545E56]">Class series
      <select data-testid="class-pricing-template" className={`${inputCls} mt-1`} value={id} onChange={(e) => setId(e.target.value)}>
        {!templates.length && <option value="">No Zoom class series</option>}
        {templates.map((t) => <option key={t.id} value={t.id}>{t.title}</option>)}
      </select>
    </label>
    {form && <>
      <label className="block text-xs text-[#545E56]">Purchase options
        <select data-testid="class-pricing-mode" className={`${inputCls} mt-1`} value={form.mode} onChange={(e) => setForm({ ...form, mode: e.target.value })}>
          <option value="both">One-time or subscription</option><option value="one_time">One-time only</option><option value="subscription">Subscription only</option><option value="free">Free</option>
        </select>
      </label>
      {form.mode !== "free" && <div className="grid sm:grid-cols-3 gap-3">
        <label className="text-xs text-[#545E56]">Currency<select data-testid="class-pricing-currency" className={`${inputCls} mt-1`} value={form.currency} onChange={(e) => setForm({ ...form, currency: e.target.value })}>{["usd", "eur", "gbp"].map((c) => <option key={c} value={c}>{c.toUpperCase()}</option>)}</select></label>
        {form.mode !== "subscription" && <label className="text-xs text-[#545E56]">Single class price<input data-testid="class-one-time-price" type="number" min="0.01" step="0.01" className={`${inputCls} mt-1`} value={form.one_time_price} onChange={(e) => setForm({ ...form, one_time_price: Number(e.target.value) })} /></label>}
        {form.mode !== "one_time" && <label className="text-xs text-[#545E56]">Subscription price<input data-testid="class-subscription-price" type="number" min="0.01" step="0.01" className={`${inputCls} mt-1`} value={form.subscription_price} onChange={(e) => setForm({ ...form, subscription_price: Number(e.target.value) })} /></label>}
      </div>}
      {["both", "subscription"].includes(form.mode) && <AccessTermFields value={form.term} onChange={(term) => setForm({ ...form, term })} prefix="class" />}
      <button data-testid="class-pricing-save" onClick={save} disabled={busy} className="pill pill-primary"><Save className="h-4 w-4" /> {busy ? "Saving…" : "Save pricing"}</button>
    </>}
  </section>;
};