import { useState } from "react";
import { toast } from "sonner";
import { ChevronDown, ChevronUp, Plus, X, Save } from "lucide-react";
import { api } from "@/lib/api";
import { money, errText } from "@/pages/hotels/hotelShared";
import { Toggle } from "../shared";
import { inputCls, smallBtn, primaryBtn, card, L, LinesEditor } from "./hotelAdminShared";

const BLANK = { name: "", days: 3, summary: "", daily: [], includes: [], min_guests: 6, max_guests: 20, programme_fee: 0, per_guest_fee: 0, currency: "eur", image: "", active: false };

export default function ProgrammesTab({ data, reload }) {
  const [open, setOpen] = useState(null);
  const [creating, setCreating] = useState(false);
  return (
    <div className="space-y-5" data-testid="hotels-programmes">
      <div className="space-y-2">
        <div className="flex items-center justify-between gap-3">
          <div className="text-[13px] text-[#6B7269]">Programmes hotels can request. Only programmes switched on are shown on /hotels.</div>
          <button onClick={() => setCreating((c) => !c)} className={primaryBtn} data-testid="hotels-programme-new"><Plus className="h-4 w-4" />New programme</button>
        </div>
        {creating && <div className={card}><PackageForm initial={BLANK} onSaved={() => { setCreating(false); reload(); }} isNew /></div>}
        <ul className="space-y-2">
          {data.packages.map((p) => (
            <li key={p.id} className={card} data-testid={`hotels-programme-${p.id}`}>
              <button onClick={() => setOpen(open === p.id ? null : p.id)} className="w-full text-left flex items-start gap-3" data-testid={`hotels-programme-open-${p.id}`}>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-[15px] font-semibold">{p.name}</span>
                    <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-widest ${p.active ? "bg-[#E4F0E8] text-[#3E7C57]" : "bg-[#F2F2EC] text-[#6B7269]"}`}>{p.active ? "Shown" : "Hidden"}</span>
                    {p.draft && <span className="rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-widest bg-[#F3E7C9] text-[#8A6D3B]" data-testid={`hotels-programme-draft-${p.id}`}>Draft prices — Tony to confirm</span>}
                  </div>
                  <div className="text-[12px] text-[#6B7269] mt-0.5">{p.days} days · {p.min_guests}–{p.max_guests} guests · {money(p.programme_fee, p.currency)} + {money(p.per_guest_fee, p.currency)} per guest above {p.min_guests}</div>
                </div>
                {open === p.id ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
              </button>
              {open === p.id && <div className="mt-4 pt-4 border-t border-[#EFEFE9]"><PackageForm initial={p} onSaved={reload} /></div>}
            </li>
          ))}
        </ul>
      </div>
      <AddonsEditor addons={data.addons} reload={reload} />
    </div>
  );
}

function PackageForm({ initial, onSaved, isNew = false }) {
  const [f, setF] = useState(() => ({ ...BLANK, ...initial, image: initial.image || "" }));
  const [busy, setBusy] = useState(false);
  const set = (k, v) => setF((x) => ({ ...x, [k]: v }));
  const save = async (e) => {
    e.preventDefault();
    setBusy(true);
    const body = {
      name: f.name, days: Number(f.days), summary: f.summary || "", daily: f.daily.filter(Boolean), includes: f.includes.filter(Boolean),
      min_guests: Number(f.min_guests), max_guests: Number(f.max_guests), programme_fee: Number(f.programme_fee), per_guest_fee: Number(f.per_guest_fee),
      currency: f.currency, image: f.image || null, active: !!f.active,
    };
    try {
      if (isNew) await api.post("/admin/hotel-packages", body);
      else await api.put(`/admin/hotel-packages/${initial.id}`, body);
      toast.success(isNew ? "Programme created" : "Programme saved");
      onSaved();
    } catch (err) { toast.error(errText(err)); }
    finally { setBusy(false); }
  };
  const tid = isNew ? "new" : initial.id;
  return (
    <form onSubmit={save} className="space-y-3 text-[13px]" data-testid={`hotels-programme-form-${tid}`}>
      <div className="grid gap-3 sm:grid-cols-3">
        <L label="Name" className="sm:col-span-2"><input required minLength={2} value={f.name} onChange={(e) => set("name", e.target.value)} className={inputCls} data-testid={`hotels-pf-name-${tid}`} /></L>
        <L label="Days"><input type="number" min={1} max={14} value={f.days} onChange={(e) => set("days", e.target.value)} className={inputCls} data-testid={`hotels-pf-days-${tid}`} /></L>
      </div>
      <L label="Summary"><input value={f.summary} onChange={(e) => set("summary", e.target.value)} className={inputCls} data-testid={`hotels-pf-summary-${tid}`} /></L>
      <div className="grid gap-3 sm:grid-cols-2">
        <L label="Every day"><LinesEditor value={f.daily} onChange={(v) => set("daily", v)} placeholder="Add class" testId={`hotels-pf-daily-${tid}`} /></L>
        <L label="Included"><LinesEditor value={f.includes} onChange={(v) => set("includes", v)} placeholder="Add item" testId={`hotels-pf-includes-${tid}`} /></L>
      </div>
      <div className="grid gap-3 grid-cols-2 sm:grid-cols-5">
        <L label="Min guests"><input type="number" min={1} value={f.min_guests} onChange={(e) => set("min_guests", e.target.value)} className={inputCls} /></L>
        <L label="Max guests"><input type="number" min={1} value={f.max_guests} onChange={(e) => set("max_guests", e.target.value)} className={inputCls} /></L>
        <L label="Programme fee"><input type="number" min={0} step="0.01" value={f.programme_fee} onChange={(e) => set("programme_fee", e.target.value)} className={inputCls} data-testid={`hotels-pf-fee-${tid}`} /></L>
        <L label="Per extra guest"><input type="number" min={0} step="0.01" value={f.per_guest_fee} onChange={(e) => set("per_guest_fee", e.target.value)} className={inputCls} data-testid={`hotels-pf-perguest-${tid}`} /></L>
        <L label="Currency"><select value={f.currency} onChange={(e) => set("currency", e.target.value)} className={inputCls}>{["eur", "usd", "gbp"].map((c) => <option key={c} value={c}>{c.toUpperCase()}</option>)}</select></L>
      </div>
      <L label="Image link (optional)"><input value={f.image} onChange={(e) => set("image", e.target.value)} placeholder="https://" className={inputCls} /></L>
      <div className="flex flex-wrap items-center gap-3">
        <span className="flex items-center gap-2"><Toggle checked={!!f.active} onChange={(v) => set("active", v)} tid={`hotels-pf-active-${tid}`} />Show on /hotels</span>
        <button disabled={busy} className={`${primaryBtn} ml-auto`} data-testid={`hotels-pf-save-${tid}`}><Save className="h-4 w-4" />{isNew ? "Create" : "Save programme"}</button>
      </div>
      {!isNew && initial.draft && <div className="text-[12px] text-[#8A6D3B]">These are draft prices from the proposal. Saving marks the programme as confirmed.</div>}
    </form>
  );
}

function AddonsEditor({ addons, reload }) {
  const [rows, setRows] = useState(() => addons.map((a) => ({ ...a })));
  const [busy, setBusy] = useState(false);
  const set = (i, k, v) => setRows((r) => r.map((x, j) => (j === i ? { ...x, [k]: v } : x)));
  const save = async () => {
    setBusy(true);
    try {
      const { data } = await api.put("/admin/hotel-addons", rows.filter((r) => r.name).map((r) => ({ id: r.id || null, name: r.name, price: Number(r.price || 0), unit: r.unit || "per item", active: r.active !== false })));
      setRows(data.map((a) => ({ ...a })));
      toast.success("Add-ons saved");
      reload();
    } catch (err) { toast.error(errText(err)); }
    finally { setBusy(false); }
  };
  return (
    <div className={`${card} space-y-3`} data-testid="hotels-addons-editor">
      <div className="font-semibold">Add-ons</div>
      {rows.map((r, i) => (
        <div key={r.id || `new-${i}`} className="grid grid-cols-12 gap-2 items-center text-[13px]">
          <input value={r.name} onChange={(e) => set(i, "name", e.target.value)} placeholder="Name" className={`${inputCls} col-span-12 sm:col-span-5`} data-testid={`hotels-addon-name-${i}`} />
          <input type="number" min={0} step="0.01" value={r.price} onChange={(e) => set(i, "price", e.target.value)} placeholder="Price" className={`${inputCls} col-span-4 sm:col-span-2`} data-testid={`hotels-addon-price-${i}`} />
          <input value={r.unit} onChange={(e) => set(i, "unit", e.target.value)} placeholder="per class" className={`${inputCls} col-span-4 sm:col-span-3`} />
          <span className="col-span-3 sm:col-span-1"><Toggle checked={r.active !== false} onChange={(v) => set(i, "active", v)} tid={`hotels-addon-active-${i}`} /></span>
          <button type="button" onClick={() => setRows((x) => x.filter((_, j) => j !== i))} className="col-span-1 text-[#B25A45]" aria-label="Remove"><X className="h-4 w-4" /></button>
        </div>
      ))}
      <div className="flex gap-2">
        <button type="button" onClick={() => setRows((x) => [...x, { name: "", price: 0, unit: "per item", active: true }])} className={smallBtn} data-testid="hotels-addon-add"><Plus className="h-3.5 w-3.5" />Add</button>
        <button type="button" disabled={busy} onClick={save} className={`${primaryBtn} ml-auto`} data-testid="hotels-addons-save">Save add-ons</button>
      </div>
    </div>
  );
}
