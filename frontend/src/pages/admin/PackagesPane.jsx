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

// Courses the admin can attach to a plan or a training.
let programsCache = null;
function usePrograms() {
  const [rows, setRows] = useState(programsCache);
  useEffect(() => {
    if (programsCache) return;
    api.get("/admin/programs").then(({ data }) => { programsCache = (data || []).map((p) => ({ id: p.id, title: p.title })).sort((a, b) => a.title.localeCompare(b.title)); setRows(programsCache); }).catch(() => setRows([]));
  }, []);
  return rows || [];
}

function CourseChecklist({ value, onChange, programs, testId }) {
  const on = new Set(value || []);
  return (
    <div className="flex flex-wrap gap-1.5" data-testid={testId}>
      {programs.map((p) => (
        <button key={p.id} type="button" onClick={() => { const n = new Set(on); if (n.has(p.id)) n.delete(p.id); else n.add(p.id); onChange([...n]); }}
          className={`rounded-full px-3 py-1.5 text-[12px] font-semibold border ${on.has(p.id) ? "bg-[#1C221F] text-white border-[#1C221F]" : "bg-white border-[#E5E6DF] text-[#545E56]"}`}>{p.title}</button>
      ))}
      {!programs.length && <span className="text-[12px] text-[#9AA096]">No courses yet.</span>}
    </div>
  );
}

// ---------------------------------------------------------------- Memberships
function PlanCard({ plan, onSaved }) {
  const programs = usePrograms();
  // Seeded plans store translation keys ("i18n:…"). Show the English text and only
  // send a field back if it was changed, so untouched plans stay translated.
  const initial = {
    name: tr(plan.name), description: tr(plan.description), features: (plan.features || []).map(tr).join("\n"),
    price: plan.price, currency: plan.currency || "eur", billing_cycle: plan.billing_cycle || "monthly",
    trial_days: plan.trial_days || 0, is_active: plan.is_active !== false,
    courses_mode: plan.includes_all_courses ? "all" : (plan.choose_courses > 0 ? "choose" : ((plan.included_program_ids || []).length ? "chosen" : "none")),
    included_program_ids: plan.included_program_ids || [], choose_courses: plan.choose_courses || 1,
    choosable_program_ids: plan.choosable_program_ids || [], includes_library: plan.includes_library !== false,
    includes_live_classes: plan.includes_live_classes !== false, live_classes_per_week: plan.live_classes_per_week || 0,
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
    const accessKeys = ["courses_mode", "included_program_ids", "choose_courses", "choosable_program_ids", "includes_library", "includes_live_classes", "live_classes_per_week"];
    if (accessKeys.some((k) => JSON.stringify(f[k]) !== JSON.stringify(initial[k]))) {
      Object.assign(body, {
        includes_all_courses: f.courses_mode === "all",
        included_program_ids: f.courses_mode === "chosen" ? f.included_program_ids : [],
        choose_courses: f.courses_mode === "choose" ? Number(f.choose_courses) || 1 : 0,
        choosable_program_ids: f.courses_mode === "choose" ? f.choosable_program_ids : [],
        includes_library: f.includes_library, includes_live_classes: f.includes_live_classes,
        live_classes_per_week: f.includes_live_classes ? Number(f.live_classes_per_week) || 0 : 0,
      });
    }
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
      <Field label="What's included — text shown to customers (one per line)"><textarea rows={4} className={inputCls} value={f.features} onChange={(e) => set("features", e.target.value)} /></Field>
      <div className="rounded-xl bg-[#F7F2EC] border border-[#E7D9CB] p-3 space-y-3" data-testid="plan-access">
        <div className="text-[11px] uppercase tracking-widest font-bold text-[#B25A45]">What members actually get</div>
        <div className="flex flex-wrap gap-1.5">
          {[["all", "Every course"], ["chosen", "These courses"], ["choose", "Member chooses"], ["none", "No courses"]].map(([k, l]) => (
            <button key={k} type="button" onClick={() => set("courses_mode", k)} data-testid={`plan-courses-${k}`}
              className={`rounded-full px-3 py-1.5 text-[12px] font-semibold border ${f.courses_mode === k ? "bg-[#B25A45] text-white border-[#B25A45]" : "bg-white border-[#E5E6DF]"}`}>{l}</button>
          ))}
        </div>
        {f.courses_mode === "chosen" && <CourseChecklist programs={programs} value={f.included_program_ids} onChange={(v) => set("included_program_ids", v)} testId="plan-included" />}
        {f.courses_mode === "choose" && (
          <>
            <label className="flex items-center gap-2 text-[12px]">Member chooses
              <input type="number" min="1" max="20" className={`${inputCls} !w-20`} value={f.choose_courses} onChange={(e) => set("choose_courses", e.target.value)} />
              course(s){f.choosable_program_ids.length ? " from:" : " (any course)"}</label>
            <CourseChecklist programs={programs} value={f.choosable_program_ids} onChange={(v) => set("choosable_program_ids", v)} testId="plan-choosable" />
            <p className="text-[11px] text-[#6B7269]">Leave all unselected to let members choose any course. They choose in My Yoga; you can also choose for them in Students.</p>
          </>
        )}
        <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-[12px]">
          <label className="flex items-center gap-2"><Toggle checked={f.includes_library} onChange={(v) => set("includes_library", v)} />On-demand library</label>
          <label className="flex items-center gap-2"><Toggle checked={f.includes_live_classes} onChange={(v) => set("includes_live_classes", v)} />Live classes</label>
          {f.includes_live_classes && (
            <label className="flex items-center gap-2">Per week<input type="number" min="0" max="50" className={`${inputCls} !w-20`} value={f.live_classes_per_week} onChange={(e) => set("live_classes_per_week", e.target.value)} /><span className="text-[#6B7269]">(0 = unlimited)</span></label>
          )}
        </div>
      </div>
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
  const programs = usePrograms();
  const [rows, setRows] = useState(() => data.map((t) => ({ ...t, includesText: (t.includes || []).join("\n") })));
  const [busy, setBusy] = useState(false);
  const set = (i, k, v) => setRows((r) => r.map((x, j) => (j === i ? { ...x, [k]: v } : x)));
  const add = () => setRows((r) => [...r, { id: `training-${r.length + 1}`, name: "", price: 0, currency: "eur", hours: 200, dates: "", includesText: "", active: true, isNew: true, program_ids: [], access_days: 0 }]);
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
          <div className="rounded-xl bg-[#F7F2EC] border border-[#E7D9CB] p-3 space-y-2">
            <div className="text-[11px] uppercase tracking-widest font-bold text-[#B25A45]">Online courses opened after payment</div>
            <CourseChecklist programs={programs} value={t.program_ids || []} onChange={(v) => set(i, "program_ids", v)} testId={`tt-courses-${i}`} />
            <label className="flex items-center gap-2 text-[12px]">Access for
              <input type="number" min="0" max="3650" className={`${inputCls} !w-24`} value={t.access_days || 0} onChange={(e) => set(i, "access_days", Number(e.target.value) || 0)} />
              days <span className="text-[#6B7269]">(0 = lifetime)</span></label>
          </div>
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
