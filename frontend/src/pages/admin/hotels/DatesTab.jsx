import { useState } from "react";
import { toast } from "sonner";
import { Trash2, Plus } from "lucide-react";
import { api } from "@/lib/api";
import { fmtRange, errText } from "@/pages/hotels/hotelShared";
import { inputCls, primaryBtn, card, L } from "./hotelAdminShared";

/** Dates Tony isn't available for hotel programmes (hotels can't request them). */
export default function DatesTab({ data, reload }) {
  const [f, setF] = useState({ start_date: "", end_date: "", reason: "" });
  const [busy, setBusy] = useState(false);
  const add = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      await api.post("/admin/hotel-blackouts", { start_date: f.start_date, end_date: f.end_date || f.start_date, reason: f.reason || null });
      toast.success("Dates blocked");
      setF({ start_date: "", end_date: "", reason: "" });
      reload();
    } catch (err) { toast.error(errText(err)); }
    finally { setBusy(false); }
  };
  const remove = async (id) => {
    try { await api.delete(`/admin/hotel-blackouts/${id}`); toast.success("Dates open again"); reload(); }
    catch (err) { toast.error(errText(err)); }
  };
  const today = new Date().toISOString().slice(0, 10);
  const rows = (data.blackouts || []).filter((b) => b.end_date >= today);
  const booked = data.stays.filter((s) => ["signed", "deposit_paid", "confirmed"].includes(s.status) && s.end_date >= today);
  return (
    <div className="space-y-4" data-testid="hotels-dates">
      <form onSubmit={add} className={`${card} grid gap-3 sm:grid-cols-4 items-end`} data-testid="hotels-blackout-form">
        <L label="From"><input type="date" required value={f.start_date} onChange={(e) => setF((x) => ({ ...x, start_date: e.target.value }))} className={inputCls} data-testid="hotels-blackout-start" /></L>
        <L label="To"><input type="date" min={f.start_date} value={f.end_date} onChange={(e) => setF((x) => ({ ...x, end_date: e.target.value }))} className={inputCls} data-testid="hotels-blackout-end" /></L>
        <L label="Reason (only you see it)"><input value={f.reason} onChange={(e) => setF((x) => ({ ...x, reason: e.target.value }))} className={inputCls} data-testid="hotels-blackout-reason" /></L>
        <button disabled={busy} className={primaryBtn} data-testid="hotels-blackout-add"><Plus className="h-4 w-4" />Block dates</button>
      </form>
      <div className={card}>
        <div className="font-semibold text-[14px]">Blocked</div>
        {!rows.length ? <div className="text-[13px] text-[#6B7269] mt-1">No blocked dates.</div> : (
          <ul className="mt-2 divide-y divide-[#EFEFE9] text-[13px]">
            {rows.map((b) => (
              <li key={b.id} className="py-2 flex items-center gap-3" data-testid="hotels-blackout-row">
                <span className="flex-1">{fmtRange(b.start_date, b.end_date)}{b.reason ? ` · ${b.reason}` : ""}</span>
                <button onClick={() => remove(b.id)} className="text-[#B25A45]" aria-label="Remove" data-testid="hotels-blackout-remove"><Trash2 className="h-4 w-4" /></button>
              </li>
            ))}
          </ul>
        )}
      </div>
      {booked.length > 0 && (
        <div className={card}>
          <div className="font-semibold text-[14px]">Booked by hotels</div>
          <ul className="mt-2 space-y-1 text-[13px] text-[#545E56]">{booked.map((s) => <li key={s.id}>{fmtRange(s.start_date, s.end_date)} · {s.partner_name} · {s.package_name}</li>)}</ul>
        </div>
      )}
    </div>
  );
}
