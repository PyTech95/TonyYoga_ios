import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { BadgeCheck, Download, Plus, Trash2, RefreshCw, Settings2, ExternalLink } from "lucide-react";
import { api } from "@/lib/api";
import Spinner from "@/components/Spinner";
import { Field, inputCls, Toggle } from "./shared";
import TeacherDrawer, { StatusChip, moneyMap } from "./teachers/TeacherDrawer";

const STATUSES = [["", "All"], ["applied", "Applications"], ["approved", "Approved"], ["paused", "Paused"], ["removed", "Removed"], ["declined", "Declined"]];
const errText = (e) => {
  const d = e?.response?.data?.detail;
  return Array.isArray(d) ? d.map((x) => x.msg).join(", ") : d || "Something went wrong";
};
const blankTier = () => ({ id: "", name: "", price: 0, currency: "eur", max_offerings: 5, max_students: 100, platform_fee_percent: 0, stripe_price_id: "", features: [] });

function Settings({ onSaved }) {
  const [s, setS] = useState(null);
  const [tiers, setTiers] = useState([]);
  const [busy, setBusy] = useState(false);
  const [openTiers, setOpenTiers] = useState(false);

  useEffect(() => {
    api.get("/admin/settings").then(({ data }) => {
      setS({ teachers_enabled: !!data.teachers_enabled, teacher_certified_label: data.teacher_certified_label || "Tony-Certified", teacher_ce_hours_per_year: data.teacher_ce_hours_per_year ?? 20 });
      setTiers((data.teacher_tiers || []).map((t) => ({ ...blankTier(), ...t, features: t.features || [] })));
    }).catch(() => setS({ teachers_enabled: false, teacher_certified_label: "Tony-Certified", teacher_ce_hours_per_year: 20 }));
  }, []);

  const save = async (patch, ok = "Saved") => {
    setBusy(true);
    try { await api.patch("/admin/settings", patch); toast.success(ok); onSaved?.(); return true; }
    catch (e) { toast.error(errText(e)); return false; }
    finally { setBusy(false); }
  };
  const setTier = (i, k, v) => setTiers((ts) => ts.map((t, j) => (j === i ? { ...t, [k]: v } : t)));
  const saveTiers = () => {
    const clean = tiers.map((t) => ({
      ...t, id: String(t.id || t.name).toLowerCase().replace(/[^a-z0-9_-]+/g, "-").slice(0, 20), price: Number(t.price) || 0,
      max_offerings: Number(t.max_offerings) || 0, max_students: Number(t.max_students) || 0, platform_fee_percent: Number(t.platform_fee_percent) || 0,
      features: (Array.isArray(t.features) ? t.features : String(t.features).split("\n")).map((x) => x.trim()).filter(Boolean),
    }));
    if (clean.some((t) => t.id.length < 2)) { toast.error("Each tier needs a name or id of at least 2 letters."); return; }
    save({ teacher_tiers: clean }, "Tiers saved");
  };

  if (!s) return <div className="h-24 rounded-2xl bg-[#F2F2EC] animate-pulse" />;
  return (
    <div className="rounded-2xl bg-white border border-[#E5E6DF] p-4 space-y-4" data-testid="teachers-settings">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="text-[15px] font-semibold">Teacher Hub</div>
          <div className="text-[12px] text-[#6B7269]">Public directory at /teachers and teacher accounts. Hidden in the iPhone app.</div>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[12px] font-semibold">{s.teachers_enabled ? "Open" : "Closed"}</span>
          <Toggle checked={s.teachers_enabled} tid="teachers-enabled" onChange={async (v) => { if (await save({ teachers_enabled: v }, v ? "Teacher Hub is open" : "Teacher Hub closed")) setS((x) => ({ ...x, teachers_enabled: v })); }} />
          <a href="/teachers" target="_blank" rel="noreferrer" className="text-[12px] text-[#B25A45] inline-flex items-center gap-1"><ExternalLink className="h-3.5 w-3.5" />View</a>
        </div>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 items-end">
        <Field label="Badge name"><input className={inputCls} value={s.teacher_certified_label} onChange={(e) => setS((x) => ({ ...x, teacher_certified_label: e.target.value }))} data-testid="teachers-label" /></Field>
        <Field label="CE hours per year"><input type="number" min={0} max={200} className={inputCls} value={s.teacher_ce_hours_per_year} onChange={(e) => setS((x) => ({ ...x, teacher_ce_hours_per_year: e.target.value }))} data-testid="teachers-ce-hours" /></Field>
        <button className="pill pill-primary !py-2.5" disabled={busy} onClick={() => save({ teacher_certified_label: s.teacher_certified_label, teacher_ce_hours_per_year: Number(s.teacher_ce_hours_per_year) || 0 })} data-testid="teachers-settings-save">Save</button>
      </div>

      <div className="border-t border-[#F0F0EA] pt-3">
        <button type="button" onClick={() => setOpenTiers((o) => !o)} className="inline-flex items-center gap-1.5 text-[13px] font-semibold" data-testid="teachers-tiers-toggle"><Settings2 className="h-4 w-4 text-[#B25A45]" />Monthly plans for teachers ({tiers.length})</button>
        {openTiers && (
          <div className="mt-3 space-y-3" data-testid="teachers-tiers">
            {tiers.map((t, i) => (
              <div key={i} className="rounded-xl border border-[#E5E6DF] p-3 space-y-2" data-testid={`tier-row-${i}`}>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  <Field label="Name"><input className={inputCls} value={t.name} onChange={(e) => setTier(i, "name", e.target.value)} data-testid={`tier-name-${i}`} /></Field>
                  <Field label="Id"><input className={inputCls} value={t.id} onChange={(e) => setTier(i, "id", e.target.value)} placeholder="auto" /></Field>
                  <Field label="Price / month"><input type="number" min={0} step="1" className={inputCls} value={t.price} onChange={(e) => setTier(i, "price", e.target.value)} data-testid={`tier-price-${i}`} /></Field>
                  <Field label="Currency"><select className={inputCls} value={t.currency} onChange={(e) => setTier(i, "currency", e.target.value)}><option value="eur">EUR</option><option value="usd">USD</option><option value="gbp">GBP</option></select></Field>
                  <Field label="Max active classes"><input type="number" min={0} className={inputCls} value={t.max_offerings} onChange={(e) => setTier(i, "max_offerings", e.target.value)} /></Field>
                  <Field label="Max students"><input type="number" min={0} className={inputCls} value={t.max_students} onChange={(e) => setTier(i, "max_students", e.target.value)} /></Field>
                  <Field label="Fee per sale %"><input type="number" min={0} max={30} step="0.5" className={inputCls} value={t.platform_fee_percent} onChange={(e) => setTier(i, "platform_fee_percent", e.target.value)} /></Field>
                  <Field label="Stripe price id (optional)"><input className={inputCls} value={t.stripe_price_id || ""} onChange={(e) => setTier(i, "stripe_price_id", e.target.value)} placeholder="price_…" /></Field>
                </div>
                <Field label="What's included (one per line)">
                  <textarea rows={3} className={inputCls} value={Array.isArray(t.features) ? t.features.join("\n") : t.features} onChange={(e) => setTier(i, "features", e.target.value.split("\n"))} />
                </Field>
                <button type="button" onClick={() => setTiers((ts) => ts.filter((_, j) => j !== i))} className="text-[12px] text-[#B25A45] inline-flex items-center gap-1"><Trash2 className="h-3.5 w-3.5" />Remove tier</button>
              </div>
            ))}
            <div className="flex flex-wrap gap-2">
              {tiers.length < 6 && <button type="button" onClick={() => setTiers((ts) => [...ts, blankTier()])} className="inline-flex items-center gap-1.5 rounded-full border border-[#E5E6DF] bg-white px-3 py-1.5 text-[12px] font-semibold"><Plus className="h-3.5 w-3.5" />Add tier</button>}
              <button type="button" onClick={saveTiers} disabled={busy} className="pill pill-primary !py-2 !px-4 !text-xs" data-testid="tiers-save">Save plans</button>
            </div>
            <p className="text-[11px] text-[#9AA096]">0 = free tier. A fee per sale is taken from card payments to the teacher (Stripe application fee). Existing teachers keep their Stripe price until they change plan.</p>
          </div>
        )}
      </div>
    </div>
  );
}

export default function TeachersPane() {
  const [status, setStatus] = useState("");
  const [data, setData] = useState(null);
  const [open, setOpen] = useState(null);
  const closeDrawer = useCallback(() => setOpen(null), []);
  const [q, setQ] = useState("");
  const thisYear = new Date().getFullYear();
  const [year, setYear] = useState(new Date().getMonth() === 0 ? thisYear - 1 : thisYear);

  const load = useCallback(() => {
    api.get(`/admin/teachers${status ? `?status=${status}` : ""}`).then(({ data: d }) => setData(d)).catch((e) => { toast.error(errText(e)); setData({ teachers: [], tiers: [] }); });
  }, [status]);
  useEffect(() => { load(); }, [load]);

  const exportDac7 = async () => {
    try {
      const res = await api.get(`/admin/teachers-dac7.csv?year=${year}`, { responseType: "blob" });
      const href = URL.createObjectURL(new Blob([res.data], { type: "text/csv" }));
      const a = document.createElement("a"); a.href = href; a.download = `tony-yoga-dac7-${year}.csv`; document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(href), 1000);
      toast.success("DAC7 report downloaded");
    } catch { toast.error("Export failed"); }
  };

  const rows = (data?.teachers || []).filter((t) => !q || `${t.display_name} ${t.email} ${t.city} ${t.country}`.toLowerCase().includes(q.toLowerCase()));
  const tierName = (id) => (data?.tiers || []).find((t) => t.id === id)?.name || id || "—";
  const pending = (data?.teachers || []).filter((t) => t.status === "applied").length;

  return (
    <div className="space-y-4" data-testid="teachers-pane">
      <Settings onSaved={load} />

      <div className="flex flex-wrap items-center gap-2">
        {STATUSES.map(([k, label]) => (
          <button key={k || "all"} onClick={() => setStatus(k)} data-testid={`teachers-filter-${k || "all"}`}
            className={`rounded-full px-3.5 py-1.5 text-[12px] font-semibold border ${status === k ? "bg-[#1C221F] text-white border-[#1C221F]" : "bg-white border-[#E5E6DF]"}`}>
            {label}{k === "applied" && pending > 0 && status === "" ? ` (${pending})` : ""}
          </button>
        ))}
        <button onClick={load} className="h-8 w-8 rounded-full border border-[#E5E6DF] bg-white flex items-center justify-center" aria-label="Refresh"><RefreshCw className="h-3.5 w-3.5" /></button>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search name, email, city" className={`${inputCls} max-w-xs`} data-testid="teachers-admin-search" />
        <div className="ml-auto flex items-center gap-2">
          <select value={year} onChange={(e) => setYear(Number(e.target.value))} className="rounded-full border border-[#E5E6DF] bg-white px-3 py-2 text-[12px] font-semibold" data-testid="dac7-year">
            {[thisYear, thisYear - 1, thisYear - 2].map((y) => <option key={y} value={y}>{y}</option>)}
          </select>
          <button onClick={exportDac7} className="inline-flex items-center gap-1.5 rounded-full border border-[#E5E6DF] bg-white px-3 py-2 text-[12px] font-semibold hover:border-[#B25A45]" data-testid="dac7-export"><Download className="h-3.5 w-3.5" />DAC7 report (CSV)</button>
        </div>
      </div>

      {!data ? <Spinner /> : rows.length === 0 ? (
        <div className="rounded-2xl bg-white border border-[#E5E6DF] p-6 text-center text-[13px] text-[#6B7269]" data-testid="teachers-admin-empty">
          <BadgeCheck className="h-6 w-6 text-[#839682] mx-auto mb-2" />No teachers here yet. Teachers apply at /teachers/apply once the Teacher Hub is open.
        </div>
      ) : (
        <ul className="space-y-2" data-testid="teachers-admin-list">
          {rows.map((t) => (
            <li key={t.id}>
              <button type="button" onClick={() => setOpen(t.id)} data-testid={`teacher-row-${t.slug}`}
                className="w-full text-left rounded-2xl bg-white border border-[#E5E6DF] p-4 hover:border-[#B25A45] transition">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2"><span className="text-[15px] font-semibold">{t.display_name}</span><StatusChip status={t.status} /></div>
                    <div className="text-[12px] text-[#6B7269] mt-0.5">{t.email} · {[t.city, t.country].filter(Boolean).join(", ")} · {tierName(t.tier_id)}{t.certificate?.id ? ` · ${t.certificate.id}` : ""}</div>
                  </div>
                  <div className="flex flex-wrap gap-1.5 text-[10px] font-bold uppercase tracking-widest">
                    <span className={`rounded-full px-2 py-0.5 ${t.listed ? "bg-[#E4F0E8] text-[#3E7C57]" : "bg-[#F2F2EC] text-[#6B7269]"}`}>{t.listed ? "Listed" : "Not listed"}</span>
                    <span className={`rounded-full px-2 py-0.5 ${t.fee_ok ? "bg-[#E4F0E8] text-[#3E7C57]" : "bg-[#F3E7C9] text-[#8A6D3B]"}`}>{t.fee_ok ? (t.billing?.mode === "comped" ? "Fee waived" : "Fee ok") : "Fee due"}</span>
                    <span className={`rounded-full px-2 py-0.5 ${t.has_tax_details ? "bg-[#E4F0E8] text-[#3E7C57]" : "bg-[#F2F2EC] text-[#6B7269]"}`}>{t.has_tax_details ? "Tax ✓" : "No tax"}</span>
                  </div>
                </div>
                <div className="mt-2 text-[12px] text-[#545E56]">{t.offerings} active · {t.students} students · income {moneyMap(t.income_year)} · fees {t.fees_year ? `€${t.fees_year}` : "—"}</div>
              </button>
            </li>
          ))}
        </ul>
      )}
      {open && <TeacherDrawer teacherId={open} tiers={data?.tiers || []} onClose={closeDrawer} onChanged={load} />}
    </div>
  );
}
