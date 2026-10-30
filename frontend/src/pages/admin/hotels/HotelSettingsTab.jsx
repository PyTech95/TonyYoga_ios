import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Save } from "lucide-react";
import { api } from "@/lib/api";
import Spinner from "@/components/Spinner";
import { errText } from "@/pages/hotels/hotelShared";
import { inputCls, primaryBtn, card, L, planName } from "./hotelAdminShared";

const KEYS = ["hotel_deposit_percent", "hotel_balance_due_days", "hotel_guest_free_days", "hotel_guest_plan_id", "hotel_cancellation_terms",
  "hotel_waiver_text", "hotel_contact_email", "invoice_business_name", "invoice_business_address", "invoice_tax_id", "invoice_footer"];
const NUMBERS = new Set(["hotel_deposit_percent", "hotel_balance_due_days", "hotel_guest_free_days"]);

export default function HotelSettingsTab() {
  const [f, setF] = useState(null);
  const [plans, setPlans] = useState([]);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    api.get("/admin/settings").then(({ data }) => setF(Object.fromEntries(KEYS.map((k) => [k, data?.[k] ?? ""])))).catch((e) => { toast.error(errText(e)); setF(Object.fromEntries(KEYS.map((k) => [k, ""]))); });
    api.get("/admin/membership-plans").then(({ data }) => setPlans(data || [])).catch(() => setPlans([]));
  }, []);
  if (!f) return <Spinner />;
  const set = (k) => (e) => setF((x) => ({ ...x, [k]: e.target.value }));
  const save = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      const body = Object.fromEntries(KEYS.map((k) => [k, NUMBERS.has(k) ? Number(f[k] || 0) : f[k]]));
      const { data } = await api.patch("/admin/settings", body);
      toast.success(data?.warnings?.length ? data.warnings.join(" ") : "Hotel settings saved");
    } catch (err) { toast.error(errText(err)); }
    finally { setBusy(false); }
  };
  return (
    <form onSubmit={save} className="space-y-4 text-[13px]" data-testid="hotels-settings">
      <div className={`${card} grid gap-3 sm:grid-cols-3`}>
        <L label="Deposit %" hint="Asked when the hotel signs"><input type="number" min={0} max={100} value={f.hotel_deposit_percent} onChange={set("hotel_deposit_percent")} className={inputCls} data-testid="hotels-s-deposit" /></L>
        <L label="Balance due (days before)" hint="Proposal: 30 days"><input type="number" min={0} max={120} value={f.hotel_balance_due_days} onChange={set("hotel_balance_due_days")} className={inputCls} data-testid="hotels-s-balance-days" /></L>
        <L label="Free online days for guests" hint="0 = no free access"><input type="number" min={0} max={365} value={f.hotel_guest_free_days} onChange={set("hotel_guest_free_days")} className={inputCls} data-testid="hotels-s-free-days" /></L>
        <L label="Membership guests get" className="sm:col-span-2">
          <select value={f.hotel_guest_plan_id} onChange={set("hotel_guest_plan_id")} className={inputCls} data-testid="hotels-s-plan">
            <option value="">Lowest-priced active plan</option>
            {plans.map((p) => <option key={p.id} value={p.id}>{planName(p)} · {p.price} {String(p.currency || "").toUpperCase()}</option>)}
          </select>
        </L>
        <L label="Applications go to" hint="Blank = all admins"><input type="email" value={f.hotel_contact_email} onChange={set("hotel_contact_email")} className={inputCls} data-testid="hotels-s-contact" /></L>
      </div>
      <div className={`${card} space-y-3`}>
        <L label="Default cancellation terms" hint="Used in every quote unless changed there. Tony to confirm."><textarea rows={4} value={f.hotel_cancellation_terms} onChange={set("hotel_cancellation_terms")} className={inputCls} data-testid="hotels-s-terms" /></L>
        <L label="Guest waiver" hint="Every guest accepts this on the guest page."><textarea rows={3} value={f.hotel_waiver_text} onChange={set("hotel_waiver_text")} className={inputCls} data-testid="hotels-s-waiver" /></L>
      </div>
      <div className={`${card} grid gap-3 sm:grid-cols-2`}>
        <L label="Business name on invoices"><input value={f.invoice_business_name} onChange={set("invoice_business_name")} className={inputCls} data-testid="hotels-s-biz-name" /></L>
        <L label="Tax ID / NIF"><input value={f.invoice_tax_id} onChange={set("invoice_tax_id")} className={inputCls} data-testid="hotels-s-tax" /></L>
        <L label="Business address" className="sm:col-span-2"><textarea rows={2} value={f.invoice_business_address} onChange={set("invoice_business_address")} className={inputCls} data-testid="hotels-s-address" /></L>
        <L label="Invoice footer (bank details, notes)" className="sm:col-span-2"><textarea rows={2} value={f.invoice_footer} onChange={set("invoice_footer")} className={inputCls} data-testid="hotels-s-footer" /></L>
      </div>
      <button disabled={busy} className={primaryBtn} data-testid="hotels-settings-save"><Save className="h-4 w-4" />Save hotel settings</button>
    </form>
  );
}
