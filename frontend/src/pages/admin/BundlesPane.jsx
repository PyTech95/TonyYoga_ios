import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Users, Calendar, TrendingUp, Send, Check, X, CreditCard, Mail, Bell, Save, RefreshCw, History, BookOpen, Plus, ArrowLeft, Trash2, ChevronUp, ChevronDown, ChevronRight, Youtube, Play, Clock, Eye, EyeOff, ListPlus, Instagram, Wallet, ClipboardCheck, Package, GraduationCap, Award, MessageCircle, Video, Mic, LayoutDashboard, MountainSnow, Gift, Settings as SettingsIcon, Upload } from "lucide-react";
import { api, API_BASE } from "@/lib/api";
import Spinner from "@/components/Spinner";
import { Field } from "./shared";

function BundlesPane() {
  const [bundles, setBundles] = useState(null);
  const [programs, setPrograms] = useState([]);
  const [form, setForm] = useState(null);
  const [busy, setBusy] = useState(false);
  const ic = "w-full rounded-xl border border-[#E5E6DF] bg-white px-3 py-2 text-sm focus:outline-none focus:border-[#B25A45]";

  const load = async () => {
    try {
      const [b, p] = await Promise.all([api.get("/admin/bundles"), api.get("/programs")]);
      setBundles(b.data); setPrograms(p.data);
    } catch { setBundles([]); }
  };
  useEffect(() => { load(); /* eslint-disable-next-line */ }, []);

  const openNew = () => setForm({ title: "", description: "", price: 0, currency: "eur", program_ids: [], active: true });
  const openEdit = (b) => setForm({ id: b.id, title: b.title, description: b.description || "", price: b.price, currency: b.currency || "eur", program_ids: [...(b.program_ids || [])], active: b.active !== false });
  const toggleProg = (pid) => setForm((f) => ({ ...f, program_ids: f.program_ids.includes(pid) ? f.program_ids.filter((x) => x !== pid) : [...f.program_ids, pid] }));

  const save = async () => {
    if (!form.title.trim()) return toast.error("Bundle title is required.");
    if (form.program_ids.length < 2) return toast.error("Pick at least two courses for a bundle.");
    setBusy(true);
    const body = { title: form.title.trim(), description: form.description, price: Number(form.price) || 0, currency: form.currency, program_ids: form.program_ids, active: form.active };
    try {
      if (form.id) await api.patch(`/admin/bundles/${form.id}`, body);
      else await api.post("/admin/bundles", body);
      toast.success("Bundle saved."); setForm(null); await load();
    } catch (e) { toast.error(e?.response?.data?.detail || "Save failed"); }
    finally { setBusy(false); }
  };
  const del = async (b) => {
    if (!window.confirm(`Delete bundle "${b.title}"?`)) return;
    try { await api.delete(`/admin/bundles/${b.id}`); toast.success("Bundle deleted."); await load(); } catch { toast.error("Delete failed"); }
  };

  const total = form ? programs.filter((p) => form.program_ids.includes(p.id)).reduce((s, p) => s + (p.price || 0), 0) : 0;

  if (form) {
    return (
      <div className="rounded-2xl bg-white border border-[#E5E6DF] p-5 space-y-4" data-testid="bundle-form">
        <div className="flex items-center justify-between">
          <div className="eyebrow">{form.id ? "Edit bundle" : "New bundle"}</div>
          <button onClick={() => setForm(null)} data-testid="bundle-cancel" className="text-sm text-[#6B7269] hover:text-[#1C221F]">Cancel</button>
        </div>
        <Field label="Bundle title"><input data-testid="bundle-title" className={ic} value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="e.g. The Core Collection" /></Field>
        <Field label="Description"><textarea data-testid="bundle-desc" rows={2} className={ic} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></Field>
        <div>
          <div className="text-[11px] uppercase tracking-widest font-semibold text-[#839682] mb-2">Courses in this bundle</div>
          <ul className="space-y-2" data-testid="bundle-programs">
            {programs.map((p) => (
              <li key={p.id}>
                <label className="flex items-center justify-between gap-2 rounded-xl border border-[#E5E6DF] px-3 py-2 cursor-pointer">
                  <span className="flex items-center gap-2 text-sm">
                    <input type="checkbox" data-testid={`bundle-prog-${p.id}`} checked={form.program_ids.includes(p.id)} onChange={() => toggleProg(p.id)} className="h-4 w-4 accent-[#B25A45]" />
                    {p.title}
                  </span>
                  <span className="text-xs text-[#6B7269]">€{Math.round(p.price || 0)}</span>
                </label>
              </li>
            ))}
          </ul>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Bundle price (€)"><input data-testid="bundle-price" type="number" className={ic} value={form.price} onChange={(e) => setForm({ ...form, price: e.target.value })} /></Field>
          <div className="flex items-end pb-2 text-sm text-[#545E56]">Individually €{Math.round(total)} · save <b className="ml-1 text-[#B25A45]">€{Math.round(Math.max(0, total - (Number(form.price) || 0)))}</b></div>
        </div>
        <label className="flex items-center gap-2 text-sm cursor-pointer">
          <input type="checkbox" data-testid="bundle-active" checked={form.active} onChange={(e) => setForm({ ...form, active: e.target.checked })} className="h-4 w-4 accent-[#B25A45]" />
          Active (visible to students)
        </label>
        <button onClick={save} disabled={busy} data-testid="bundle-save" className="pill pill-primary w-full"><Save className="h-4 w-4" /> {busy ? "Saving…" : "Save bundle"}</button>
      </div>
    );
  }

  return (
    <div className="space-y-3" data-testid="bundles-pane">
      <div className="flex items-center justify-between">
        <div className="eyebrow">Course bundles {bundles ? `(${bundles.length})` : ""}</div>
        <button onClick={openNew} data-testid="bundle-new" className="pill pill-primary !py-1.5 !px-3 !text-xs"><Plus className="h-3.5 w-3.5" /> New bundle</button>
      </div>
      {bundles === null ? <Spinner /> : bundles.length === 0 ? (
        <p className="text-sm text-[#6B7269] py-4 text-center">No bundles yet. Group several courses into one discounted purchase.</p>
      ) : (
        <ul className="space-y-2" data-testid="bundles-list">
          {bundles.map((b) => (
            <li key={b.id} className="rounded-2xl bg-white border border-[#E5E6DF] p-4" data-testid={`bundle-row-${b.id}`}>
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <Package className="h-4 w-4 text-[#B25A45]" />
                    <span className="text-[15px] font-semibold truncate">{b.title}</span>
                    {b.active === false && <span className="text-[10px] uppercase tracking-widest font-bold text-[#B25A45]">hidden</span>}
                  </div>
                  <div className="text-xs text-[#6B7269] mt-1">{(b.programs || []).length} courses · €{Math.round(b.price)} <span className="text-[#839682]">(save €{Math.round(b.savings || 0)})</span></div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <button onClick={() => openEdit(b)} data-testid={`bundle-edit-${b.id}`} className="pill pill-ghost !py-1 !px-2.5 !text-xs">Edit</button>
                  <button onClick={() => del(b)} data-testid={`bundle-delete-${b.id}`} className="text-[#B25A45] hover:text-[#8f4436]"><Trash2 className="h-4 w-4" /></button>
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export default BundlesPane;
