import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Save, Plus, Trash2, Sparkles, Ticket, GraduationCap } from "lucide-react";
import { api } from "@/lib/api";
import { t as tr } from "@/lib/i18n";
import Spinner from "@/components/Spinner";
import { Field, inputCls, Toggle } from "./shared";

const CURRENCIES = [["eur", "EUR €"], ["usd", "USD $"], ["gbp", "GBP £"]];
const errText = (e, fallback) => (typeof e?.response?.data?.detail === "string" ? e.response.data.detail : fallback);
const lines = (s) => String(s || "").split("\n").map((x) => x.trim()).filter(Boolean);

// ---------------------------------------------------------------- Memberships
function PlanCard({ plan, onSaved }) {
  // Seeded plans store translation keys ("i18n:…"). Show the English text and only
  // send a field back if it was changed, so untouched plans stay translated.
  const initial = {
    name: tr(plan.name), description: tr(plan.description), features: (plan.features || []).map(tr).join("\n"),
    price: plan.price, currency: plan.currency || "eur", billing_cycle: plan.billing_cycle || "monthly",
    trial_days: plan.trial_days || 0, is_active: plan.is_active !== false,
  };
  const [f, setF] = useState(initial);
  const [busy, setBusy] = useState(false);
  const set = (k, v) => setF((x) => ({ ...x, [k]: v }));
  const save = async () => {
    const body = {};
    for (const k of ["price", "currency", "billing_cycle", "trial_days", "is_active"]) if (f[k] !== initial[k]) body[k] = f[k];
    if (f.name !== initial.name) body.name = f.name;
    if (f.description !== initial.description) body.description = f.description;
    if (f.features !== initial.features) body.features = lines(f.features);
    if (!Object.keys(body).length) return toast("No changes to save.");
    setBusy(true);
    try { await api.patch(`/admin/membership-plans/${plan.id}`, body); toast.success("Membership saved"); onSaved(); }
    catch (e) { toast.error(errText(e, "Could not save")); }
    finally { setBusy(false); }
  };
  return (
    <div className={`rounded-2xl border p-5 space-y-3 ${f.is_active ? "bg-white border-[#E5E6DF]" : "bg-[#F7F6F1] border-dashed border-[#D8D9D0]"}`} data-testid={`plan-card-${plan.id}`}>
      <div className="flex items-center justify-between gap-3">
        <input className={`${inputCls} !text-base font-semibold`} value={f.name} onChange={(e) => set("name", e.target.value)} aria-label="Plan name" data-testid="plan-name" />
        <label className="flex items-center gap-2 text-xs shrink-0">{f.is_active ? "Shown" : "Hidden"}<Toggle checked={f.is_active} onChange={(v) => set("is_active", v)} /></label>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Field label="Price"><input type="number" min="0" step="0.01" className={inputCls} value={f.price} onChange={(e) => set("price", e.target.value)} data-testid="plan-price" /></Field>
        <Field label="Currency"><select className={inputCls} value={f.currency} onChange={(e) => set("currency", e.target.value)}>{CURRENCIES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></Field>
        <Field label="Billing"><select className={inputCls} value={f.billing_cycle} onChange={(e) => set("billing_cycle", e.target.value)}>{["weekly", "monthly", "quarterly", "yearly"].map((c) => <option key={c} value={c}>{c}</option>)}</select></Field>
        <Field label="Free trial (days)"><input type="number" min="0" max="90" className={inputCls} value={f.trial_days} onChange={(e) => set("trial_days", Number(e.target.value) || 0)} /></Field>
      </div>
      <Field label="Description"><textarea rows={2} className={inputCls} value={f.description} onChange={(e) => set("description", e.target.value)} /></Field>
      <Field label="What's included (one per line)"><textarea rows={4} className={inputCls} value={f.features} onChange={(e) => set("features", e.target.value)} /></Field>
      <div className="flex justify-end"><button onClick={save} disabled={busy} className="pill pill-primary !py-2 !text-[13px]" data-testid="plan-save"><Save className="h-4 w-4" /> {busy ? "Saving…" : "Save"}</button></div>
    </div>
  );
}

function Memberships() {
  const [plans, setPlans] = useState(null);
  const [adding, setAdding] = useState(false);
  const load = () => api.get("/admin/membership-plans").then(({ data }) => setPlans(data)).catch(() => setPlans([]));
  useEffect(() => { load(); }, []);
  const add = async () => {
    setAdding(true);
    try {
      await api.post("/admin/membership-plans", { name: "New membership", description: "", price: 0, currency: "eur", billing_cycle: "monthly", tier: "online_only", trial_days: 0, features: [] });
      toast.success("Plan added — set its price and details");
      load();
    } catch (e) { toast.error(errText(e, "Could not add plan")); }
    finally { setAdding(false); }
  };
  if (plans === null) return <Spinner />;
  return (
    <div className="space-y-4">
      <p className="text-[13px] text-[#6B7269]">Shown on the Memberships page in the website and app. Price changes apply to new sign-ups; existing members keep their current period.</p>
      {plans.map((p) => <PlanCard key={p.id} plan={p} onSaved={load} />)}
      <button onClick={add} disabled={adding} className="pill pill-ghost" data-testid="plan-add"><Plus className="h-4 w-4" /> Add membership</button>
    </div>
  );
}

// ---------------------------------------------------------------- Class passes
function Passes({ data, onSaved }) {
  const [rows, setRows] = useState(data);
  const [busy, setBusy] = useState(false);
  const set = (i, k, v) => setRows((r) => r.map((x, j) => (j === i ? { ...x, [k]: v } : x)));
  const save = async () => {
    setBusy(true);
    try { const { data: saved } = await api.put("/admin/packages/passes", { items: rows }); setRows(saved); onSaved(); toast.success("Class passes saved"); }
    catch (e) { toast.error(errText(e, "Could not save")); }
    finally { setBusy(false); }
  };
  return (
    <div className="space-y-4">
      <p className="text-[13px] text-[#6B7269]">Pay-as-you-go passes on the Class passes page. Credits are added to the member's account when they pay.</p>
      {rows.map((p, i) => (
        <div key={p.id} className="rounded-2xl bg-white border border-[#E5E6DF] p-5 space-y-3" data-testid={`pass-card-${p.id}`}>
          <div className="flex items-center justify-between gap-3">
            <input className={`${inputCls} !text-base font-semibold`} value={p.title} onChange={(e) => set(i, "title", e.target.value)} aria-label="Pass name" />
            <label className="flex items-center gap-2 text-xs shrink-0">{p.active !== false ? "Shown" : "Hidden"}<Toggle checked={p.active !== false} onChange={(v) => set(i, "active", v)} /></label>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <Field label="Price"><input type="number" min="0" step="0.01" className={inputCls} value={p.price} onChange={(e) => set(i, "price", e.target.value)} data-testid={`pass-price-${p.id}`} /></Field>
            <Field label="Classes (credits)"><input type="number" min="1" max="200" className={inputCls} value={p.credits} onChange={(e) => set(i, "credits", e.target.value)} data-testid={`pass-credits-${p.id}`} /></Field>
            <Field label="Currency"><select className={inputCls} value={p.currency || "eur"} onChange={(e) => set(i, "currency", e.target.value)}>{CURRENCIES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></Field>
          </div>
          <Field label="Description"><textarea rows={2} className={inputCls} value={p.description || ""} onChange={(e) => set(i, "description", e.target.value)} /></Field>
        </div>
      ))}
      <div className="flex justify-end"><button onClick={save} disabled={busy} className="pill pill-primary" data-testid="passes-save"><Save className="h-4 w-4" /> {busy ? "Saving…" : "Save class passes"}</button></div>
    </div>
  );
}

// ---------------------------------------------------------------- Teacher training
function Trainings({ data, onSaved }) {
  const [rows, setRows] = useState(() => data.map((t) => ({ ...t, includesText: (t.includes || []).join("\n") })));
  const [busy, setBusy] = useState(false);
  const set = (i, k, v) => setRows((r) => r.map((x, j) => (j === i ? { ...x, [k]: v } : x)));
  const add = () => setRows((r) => [...r, { id: `training-${r.length + 1}`, name: "", price: 0, currency: "eur", hours: 200, dates: "", includesText: "", active: true, isNew: true }]);
  const remove = (i) => setRows((r) => r.filter((_, j) => j !== i));
  const save = async () => {
    setBusy(true);
    try {
      const items = rows.map(({ includesText, isNew, ...t }) => ({ ...t, includes: lines(includesText) }));
      const { data: saved } = await api.put("/admin/packages/teacher-training", { items });
      setRows(saved.map((t) => ({ ...t, includesText: (t.includes || []).join("\n") })));
      onSaved(); toast.success("Teacher training saved");
    } catch (e) { toast.error(errText(e, "Could not save")); }
    finally { setBusy(false); }
  };
  return (
    <div className="space-y-4">
      <p className="text-[13px] text-[#6B7269]">The packages on the Teacher training page. Each one can be booked and paid online.</p>
      {rows.map((t, i) => (
        <div key={i} className={`rounded-2xl border p-5 space-y-3 ${t.active !== false ? "bg-white border-[#E5E6DF]" : "bg-[#F7F6F1] border-dashed border-[#D8D9D0]"}`} data-testid={`tt-card-${i}`}>
          <div className="flex items-center gap-3">
            <input className={`${inputCls} !text-base font-semibold`} value={t.name} onChange={(e) => set(i, "name", e.target.value)} placeholder="Core 26+ · 200-Hour Teacher Training" aria-label="Training name" />
            <label className="flex items-center gap-2 text-xs shrink-0">{t.active !== false ? "Shown" : "Hidden"}<Toggle checked={t.active !== false} onChange={(v) => set(i, "active", v)} /></label>
            {t.isNew && <button type="button" onClick={() => remove(i)} className="text-[#B25A45]" aria-label="Remove"><Trash2 className="h-4 w-4" /></button>}
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <Field label="Price"><input type="number" min="0" step="1" className={inputCls} value={t.price} onChange={(e) => set(i, "price", e.target.value)} data-testid={`tt-price-${i}`} /></Field>
            <Field label="Currency"><select className={inputCls} value={t.currency || "eur"} onChange={(e) => set(i, "currency", e.target.value)}>{CURRENCIES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></Field>
            <Field label="Hours"><input type="number" min="0" className={inputCls} value={t.hours} onChange={(e) => set(i, "hours", e.target.value)} /></Field>
            <Field label="Code"><input className={inputCls} value={t.id} disabled={!t.isNew} onChange={(e) => set(i, "id", e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, "-"))} /></Field>
          </div>
          <Field label="Dates"><input className={inputCls} value={t.dates || ""} onChange={(e) => set(i, "dates", e.target.value)} placeholder="23–29 April 2027" /></Field>
          <Field label="What's included (one per line)"><textarea rows={4} className={inputCls} value={t.includesText} onChange={(e) => set(i, "includesText", e.target.value)} /></Field>
        </div>
      ))}
      <div className="flex flex-wrap justify-between gap-3">
        <button onClick={add} className="pill pill-ghost"><Plus className="h-4 w-4" /> Add training</button>
        <button onClick={save} disabled={busy} className="pill pill-primary" data-testid="tt-save"><Save className="h-4 w-4" /> {busy ? "Saving…" : "Save teacher training"}</button>
      </div>
    </div>
  );
}

const TABS = [
  { key: "memberships", label: "Memberships", icon: Sparkles },
  { key: "passes", label: "Class passes", icon: Ticket },
  { key: "training", label: "Teacher training", icon: GraduationCap },
];

export default function PackagesPane() {
  const [tab, setTab] = useState("memberships");
  const [pk, setPk] = useState(null);
  const loadPk = () => api.get("/admin/packages").then(({ data }) => setPk(data)).catch(() => setPk({ passes: [], teacher_training: [] }));
  useEffect(() => { loadPk(); }, []);
  return (
    <div className="space-y-5 min-w-0" data-testid="packages-pane">
      <div>
        <div className="eyebrow mb-1">Prices</div>
        <h2 className="serif text-2xl sm:text-3xl">Packages &amp; prices</h2>
        <p className="text-[13px] text-[#6B7269] mt-1 max-w-2xl">Memberships, class passes and teacher-training packages. Course prices are in “Courses &amp; videos”, private-session bundles in “Private sessions”, retreat prices in “Retreats” and single-class prices in “Class pricing”.</p>
      </div>
      <div className="flex gap-2 overflow-x-auto no-scrollbar" role="tablist">
        {TABS.map((tb) => (
          <button key={tb.key} role="tab" aria-selected={tab === tb.key} onClick={() => setTab(tb.key)} data-testid={`packages-tab-${tb.key}`}
            className={`shrink-0 pill !py-2 !px-4 !text-[13px] ${tab === tb.key ? "pill-primary" : "pill-ghost bg-white"}`}>
            <tb.icon className="h-4 w-4" /> {tb.label}
          </button>
        ))}
      </div>
      {tab === "memberships" && <Memberships />}
      {tab === "passes" && (pk ? <Passes data={pk.passes} onSaved={loadPk} /> : <Spinner />)}
      {tab === "training" && (pk ? <Trainings data={pk.teacher_training} onSaved={loadPk} /> : <Spinner />)}
    </div>
  );
}
