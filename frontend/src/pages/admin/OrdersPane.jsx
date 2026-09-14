import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Truck, RefreshCw, Send, ExternalLink, Package } from "lucide-react";
import { api } from "@/lib/api";
import Spinner from "@/components/Spinner";

const STATUS_STYLE = {
  paid: "bg-[#E7F0E7] text-[#3E5B3E]",
  shipped: "bg-[#E3ECF7] text-[#2C4A6E]",
  pending: "bg-[#F2F2EC] text-[#6B7269]",
  draft: "bg-[#FBF1E9] text-[#B25A45]",
  skipped_test_mode: "bg-[#F2F2EC] text-[#9AA096]",
};

function fmtMoney(v, c) { return `${(c || "eur").toUpperCase() === "USD" ? "$" : "€"}${Number(v || 0).toFixed(2)}`; }

export default function OrdersPane() {
  const [rows, setRows] = useState(null);
  const [busy, setBusy] = useState(null);

  const load = () => api.get("/admin/orders").then(({ data }) => setRows(data)).catch(() => setRows([]));
  useEffect(() => { load(); }, []);

  const fulfill = async (o, confirm) => {
    if (confirm && !window.confirm(
      "Submit this order to Printful for real printing & shipping?\n\nThis will charge your Printful account and cannot be undone. Use 'Send draft' if you only want to review it first."
    )) return;
    setBusy(o.id);
    try {
      const { data } = await api.post(`/admin/orders/${o.id}/fulfill?confirm=${confirm}`);
      toast.success(confirm ? "Submitted to Printful for fulfillment" : `Draft created in Printful (#${data.printful_order_id})`);
      if (data.skipped?.length) toast.message(`Skipped (not Printful): ${data.skipped.join(", ")}`);
      load();
    } catch (e) { toast.error(e?.response?.data?.detail || "Fulfillment failed"); }
    finally { setBusy(null); }
  };

  const refresh = async (o) => {
    setBusy(o.id);
    try {
      await api.get(`/admin/orders/${o.id}/fulfillment`);
      toast.success("Tracking refreshed");
      load();
    } catch (e) { toast.error(e?.response?.data?.detail || "Could not fetch"); }
    finally { setBusy(null); }
  };

  if (rows === null) return <Spinner />;

  return (
    <div className="space-y-4" data-testid="orders-pane">
      <div className="rounded-2xl bg-white border border-[#E5E6DF] p-4">
        <div className="eyebrow flex items-center gap-2"><Truck className="h-3.5 w-3.5 text-[#B25A45]" /> Shop orders & Printful fulfillment</div>
        <p className="text-xs text-[#6B7269] mt-1">
          Paid orders with Printful products auto-submit for print & ship once live payments are on. In test mode they show
          <span className="font-semibold"> "test mode"</span> — use <b>Send draft</b> to create a reviewable Printful draft anytime.
        </p>
      </div>

      {rows.length === 0 ? (
        <p className="text-sm text-[#6B7269] rounded-2xl bg-[#F2F2EC] p-5">No shop orders yet.</p>
      ) : (
        <ul className="space-y-3" data-testid="orders-list">
          {rows.map((o) => (
            <li key={o.id} className="rounded-2xl bg-white border border-[#E5E6DF] p-4" data-testid={`order-row-${o.id}`}>
              <div className="flex items-start justify-between gap-3 flex-wrap">
                <div className="min-w-0">
                  <div className="text-sm font-semibold text-[#1C221F]">{o.user_email || o.user_id}</div>
                  <div className="text-xs text-[#9AA096] mt-0.5">
                    {(o.items || []).map((i) => `${i.title || i.product_id}×${i.quantity || 1}`).join(", ") || "—"}
                  </div>
                  <div className="text-xs text-[#6B7269] mt-1">{fmtMoney(o.total, o.currency)} · {new Date(o.created_at).toLocaleDateString()}</div>
                </div>
                <div className="flex flex-col items-end gap-1.5">
                  <span className={`text-[10px] uppercase tracking-widest font-bold rounded-full px-2.5 py-1 ${STATUS_STYLE[o.status] || STATUS_STYLE.pending}`}>{o.status || "pending"}</span>
                  {o.printful_status && (
                    <span className={`text-[10px] uppercase tracking-widest font-bold rounded-full px-2.5 py-1 ${STATUS_STYLE[o.printful_status] || STATUS_STYLE.draft}`}>
                      <Package className="inline h-3 w-3 mr-1" />Printful: {o.printful_status.replace(/_/g, " ")}
                    </span>
                  )}
                </div>
              </div>

              {o.tracking_number && (
                <div className="mt-2 text-xs text-[#2C4A6E]">
                  Tracking: <span className="font-mono">{o.tracking_number}</span>
                  {o.tracking_url && <a href={o.tracking_url} target="_blank" rel="noreferrer" className="ml-2 inline-flex items-center gap-1 text-[#B25A45] underline">track <ExternalLink className="h-3 w-3" /></a>}
                </div>
              )}
              {o.fulfillment_error && <div className="mt-2 text-xs text-[#B25A45]">Error: {o.fulfillment_error}</div>}

              <div className="mt-3 flex items-center gap-2 flex-wrap">
                <button onClick={() => fulfill(o, false)} disabled={busy === o.id} data-testid={`order-draft-${o.id}`} className="pill pill-ghost !py-1.5 !px-3 !text-xs">
                  <Send className="h-3.5 w-3.5" /> Send draft
                </button>
                <button onClick={() => fulfill(o, true)} disabled={busy === o.id} data-testid={`order-fulfill-${o.id}`} className="pill pill-primary !py-1.5 !px-3 !text-xs">
                  <Truck className="h-3.5 w-3.5" /> Fulfill now
                </button>
                {o.printful_order_id && (
                  <button onClick={() => refresh(o)} disabled={busy === o.id} data-testid={`order-refresh-${o.id}`} className="pill pill-ghost !py-1.5 !px-3 !text-xs">
                    <RefreshCw className={`h-3.5 w-3.5 ${busy === o.id ? "animate-spin" : ""}`} /> Refresh tracking
                  </button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
