import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Truck, RefreshCw, Send, ExternalLink, Package, Search, ChevronDown, ChevronUp, MapPin, CreditCard, Webhook, History } from "lucide-react";
import { api } from "@/lib/api";
import Spinner from "@/components/Spinner";

const STATUS_STYLE = {
  paid: "bg-[#E7F0E7] text-[#3E5B3E]",
  processing: "bg-[#FBF1E9] text-[#B25A45]",
  fulfilled: "bg-[#FBF1E9] text-[#B25A45]",
  shipped: "bg-[#E3ECF7] text-[#2C4A6E]",
  delivered: "bg-[#E4F0E8] text-[#3E7C57]",
  completed: "bg-[#E4F0E8] text-[#3E7C57]",
  cancelled: "bg-[#F2F2EC] text-[#9AA096]",
  refunded: "bg-[#F2F2EC] text-[#9AA096]",
  pending: "bg-[#F2F2EC] text-[#6B7269]",
  draft: "bg-[#FBF1E9] text-[#B25A45]",
  skipped_test_mode: "bg-[#F2F2EC] text-[#9AA096]",
};
const STATUS_LABEL = { pending: "Not paid yet", paid: "Paid — to do", processing: "In production", fulfilled: "In production", shipped: "Shipped", delivered: "Delivered", completed: "Delivered", cancelled: "Cancelled", refunded: "Refunded" };
const FILTERS = [["open", "To do"], ["shipped", "Shipped"], ["delivered", "Delivered"], ["pending", "Not paid"], ["", "All"]];

function fmtMoney(v, c) {
  try { return new Intl.NumberFormat(undefined, { style: "currency", currency: (c || "eur").toUpperCase() }).format(Number(v || 0)); }
  catch { return `${Number(v || 0).toFixed(2)} ${(c || "").toUpperCase()}`; }
}
const fmt = (iso) => (iso ? new Date(iso).toLocaleString(undefined, { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" }) : "");
const errText = (e, f) => e?.response?.data?.detail || f;

function OrderDetail({ order, onChanged }) {
  const [d, setD] = useState(null);
  const [f, setF] = useState({ status: order.status === "paid" ? "processing" : order.status, tracking_number: order.tracking_number || "", tracking_url: order.tracking_url || "", carrier: order.carrier || "", notes: "", notify: true });
  const [busy, setBusy] = useState(false);
  useEffect(() => { api.get(`/admin/orders/${order.id}/detail`).then(({ data }) => setD(data)).catch(() => setD({})); }, [order.id]);
  const save = async () => {
    setBusy(true);
    try { await api.post("/admin/orders/status", { order_id: order.id, ...f }); toast.success(f.notify ? "Saved — customer notified" : "Saved"); onChanged(); }
    catch (e) { toast.error(errText(e, "Could not save")); } finally { setBusy(false); }
  };
  const a = order.shipping_address || {};
  const ic = "w-full rounded-xl border border-[#E5E6DF] bg-white px-3 py-2 text-[13px]";
  return (
    <div className="mt-3 grid gap-3 sm:grid-cols-2 border-t border-[#F0F0EA] pt-3" data-testid={`order-detail-${order.id}`}>
      <div className="space-y-3 text-[12px] text-[#545E56]">
        <div><div className="font-semibold text-[#1C221F] flex items-center gap-1"><MapPin className="h-3.5 w-3.5" />Ship to</div>
          {a.name}<br />{a.line1}{a.line2 ? `, ${a.line2}` : ""}<br />{a.postal_code} {a.city}{a.state ? `, ${a.state}` : ""} · {a.country}{a.phone ? <><br />{a.phone}</> : null}</div>
        <div><div className="font-semibold text-[#1C221F]">Items</div>
          {(order.items || []).map((i, k) => <div key={k}>{i.quantity}× {i.title}{i.variant ? ` (${i.variant})` : ""} · {fmtMoney(i.line_total || i.unit_price * i.quantity, order.currency)}</div>)}
          {order.discount > 0 && <div>Discount −{fmtMoney(order.discount, order.currency)}</div>}
          <div className="font-semibold">Total {fmtMoney(order.total, order.currency)}</div></div>
        <div><div className="font-semibold text-[#1C221F] flex items-center gap-1"><CreditCard className="h-3.5 w-3.5" />Payment</div>
          {d === null ? "…" : d.payment ? `${d.payment.provider || "stripe"} · ${d.payment.payment_status} · ${fmt(d.payment.completed_at || d.payment.created_at)}` : "No payment record"}</div>
        {order.notes && <div><div className="font-semibold text-[#1C221F]">Customer note</div>{order.notes}</div>}
        {(order.status_history || []).length > 0 && (
          <div><div className="font-semibold text-[#1C221F] flex items-center gap-1"><History className="h-3.5 w-3.5" />Timeline</div>
            {order.status_history.map((h, k) => <div key={k}>{fmt(h.at)} · {STATUS_LABEL[h.status] || h.status}{h.tracking_number ? ` · ${h.tracking_number}` : ""} <span className="text-[#9AA096]">({h.by})</span></div>)}</div>
        )}
      </div>
      <div className="space-y-2">
        <div className="text-[11px] uppercase tracking-widest font-bold text-[#B25A45]">Update status</div>
        <select className={ic} value={f.status} onChange={(e) => setF({ ...f, status: e.target.value })} data-testid={`order-status-${order.id}`}>
          {["pending", "paid", "processing", "shipped", "delivered", "cancelled", "refunded"].map((s) => <option key={s} value={s}>{STATUS_LABEL[s]}</option>)}
        </select>
        {["shipped", "delivered"].includes(f.status) && (
          <>
            <input className={ic} placeholder="Tracking number" value={f.tracking_number} onChange={(e) => setF({ ...f, tracking_number: e.target.value })} data-testid={`order-tracking-${order.id}`} />
            <input className={ic} placeholder="Tracking link (https://…)" value={f.tracking_url} onChange={(e) => setF({ ...f, tracking_url: e.target.value })} />
            <input className={ic} placeholder="Carrier (e.g. DHL, Correos)" value={f.carrier} onChange={(e) => setF({ ...f, carrier: e.target.value })} />
          </>
        )}
        <input className={ic} placeholder="Private note (optional)" value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value })} />
        <label className="flex items-center gap-2 text-[12px]"><input type="checkbox" className="h-4 w-4 accent-[#B25A45]" checked={f.notify} onChange={(e) => setF({ ...f, notify: e.target.checked })} />Tell the customer (bell, phone and email)</label>
        <button onClick={save} disabled={busy} className="pill pill-primary !py-2 !px-4 !text-xs" data-testid={`order-save-${order.id}`}>{busy ? "Saving…" : "Save"}</button>
      </div>
    </div>
  );
}

export default function OrdersPane() {
  const [rows, setRows] = useState(null);
  const [busy, setBusy] = useState(null);
  const [status, setStatus] = useState("open");
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(null);

  const load = useCallback(() => api.get("/admin/orders", { params: { status: status || undefined, q: q.trim() || undefined } }).then(({ data }) => setRows(data)).catch(() => setRows([])), [status, q]);
  useEffect(() => { const id = setTimeout(load, 250); return () => clearTimeout(id); }, [load]);

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
    } catch (e) { toast.error(errText(e, "Fulfillment failed")); }
    finally { setBusy(null); }
  };

  const refresh = async (o) => {
    setBusy(o.id);
    try { await api.get(`/admin/orders/${o.id}/fulfillment`); toast.success("Tracking refreshed"); load(); }
    catch (e) { toast.error(errText(e, "Could not fetch")); }
    finally { setBusy(null); }
  };

  const syncAll = async () => {
    setBusy("all");
    try { await api.post("/admin/printful/orders/sync"); toast.success("Printful statuses updated"); load(); }
    catch (e) { toast.error(errText(e, "Could not reach Printful")); } finally { setBusy(null); }
  };
  const registerWebhook = async () => {
    setBusy("hook");
    try { const { data } = await api.post("/admin/printful/webhook/register"); toast.success(`Printful will now send shipping updates to ${data.url}`); }
    catch (e) { toast.error(errText(e, "Could not register")); } finally { setBusy(null); }
  };

  return (
    <div className="space-y-4" data-testid="orders-pane">
      <div className="rounded-2xl bg-white border border-[#E5E6DF] p-4 space-y-2">
        <div className="eyebrow flex items-center gap-2"><Truck className="h-3.5 w-3.5 text-[#B25A45]" /> Shop orders & Printful fulfillment</div>
        <p className="text-xs text-[#6B7269]">
          Paid orders with Printful products go to Printful automatically once live payments are on, and their status and tracking update here by themselves.
          Customers see the status in My Yoga → Orders and get a message when it ships. For other products, set the status and tracking yourself.
        </p>
        <div className="flex flex-wrap gap-2">
          <button onClick={syncAll} disabled={!!busy} className="pill pill-ghost !py-1.5 !px-3 !text-xs"><RefreshCw className={`h-3.5 w-3.5 ${busy === "all" ? "animate-spin" : ""}`} /> Update from Printful now</button>
          <button onClick={registerWebhook} disabled={!!busy} className="pill pill-ghost !py-1.5 !px-3 !text-xs"><Webhook className="h-3.5 w-3.5" /> Connect Printful shipping updates</button>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {FILTERS.map(([k, l]) => (
          <button key={k || "all"} onClick={() => setStatus(k)} data-testid={`orders-filter-${k || "all"}`} className={`rounded-full px-3 py-1.5 text-[12px] font-semibold border ${status === k ? "bg-[#B25A45] text-white border-[#B25A45]" : "bg-white border-[#E5E6DF]"}`}>{l}</button>
        ))}
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[#9AA096]" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Customer, order or tracking number" className="w-full rounded-full border border-[#E5E6DF] bg-white pl-9 pr-3 py-2 text-[13px]" />
        </div>
      </div>

      {rows === null ? <Spinner /> : rows.length === 0 ? (
        <p className="text-sm text-[#6B7269] rounded-2xl bg-[#F2F2EC] p-5">No orders here.</p>
      ) : (
        <ul className="space-y-3" data-testid="orders-list">
          {rows.map((o) => (
            <li key={o.id} className="rounded-2xl bg-white border border-[#E5E6DF] p-4" data-testid={`order-row-${o.id}`}>
              <div className="flex items-start justify-between gap-3 flex-wrap">
                <button className="min-w-0 text-left" onClick={() => setOpen(open === o.id ? null : o.id)}>
                  <div className="text-sm font-semibold text-[#1C221F] flex items-center gap-1">{o.customer_name || o.user_email || o.user_id} {open === o.id ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}</div>
                  <div className="text-xs text-[#9AA096] mt-0.5">{o.user_email} · #{String(o.id).replace("payment:", "").slice(0, 8)}</div>
                  <div className="text-xs text-[#6B7269] mt-0.5">{(o.items || []).map((i) => `${i.title || i.product_id}×${i.quantity || 1}`).join(", ") || "—"}</div>
                  <div className="text-xs text-[#6B7269] mt-1">{fmtMoney(o.total, o.currency)} · {new Date(o.created_at).toLocaleDateString()}</div>
                </button>
                <div className="flex flex-col items-end gap-1.5">
                  <span className={`text-[10px] uppercase tracking-widest font-bold rounded-full px-2.5 py-1 ${STATUS_STYLE[o.status] || STATUS_STYLE.pending}`}>{STATUS_LABEL[o.status] || o.status || "pending"}</span>
                  {o.printful_status && (
                    <span className={`text-[10px] uppercase tracking-widest font-bold rounded-full px-2.5 py-1 ${STATUS_STYLE[o.printful_status] || STATUS_STYLE.draft}`}>
                      <Package className="inline h-3 w-3 mr-1" />Printful: {o.printful_status.replace(/_/g, " ")}
                    </span>
                  )}
                </div>
              </div>
              {o.tracking_number && (
                <div className="mt-2 text-xs text-[#2C4A6E]">
                  Tracking: <span className="font-mono">{o.tracking_number}</span>{o.carrier ? ` · ${o.carrier}` : ""}
                  {o.tracking_url && <a href={o.tracking_url} target="_blank" rel="noreferrer" className="ml-2 inline-flex items-center gap-1 text-[#B25A45] underline">track <ExternalLink className="h-3 w-3" /></a>}
                </div>
              )}
              {o.fulfillment_error && <div className="mt-2 text-xs text-[#B25A45]">Problem: {o.fulfillment_error}</div>}
              <div className="mt-3 flex items-center gap-2 flex-wrap">
                <button onClick={() => setOpen(open === o.id ? null : o.id)} className="pill pill-ghost !py-1.5 !px-3 !text-xs" data-testid={`order-open-${o.id}`}>Details & status</button>
                {o.status !== "pending" && !o.printful_order_id && (
                  <>
                    <button onClick={() => fulfill(o, false)} disabled={busy === o.id} data-testid={`order-draft-${o.id}`} className="pill pill-ghost !py-1.5 !px-3 !text-xs"><Send className="h-3.5 w-3.5" /> Printful draft</button>
                    <button onClick={() => fulfill(o, true)} disabled={busy === o.id} data-testid={`order-fulfill-${o.id}`} className="pill pill-primary !py-1.5 !px-3 !text-xs"><Truck className="h-3.5 w-3.5" /> Send to Printful</button>
                  </>
                )}
                {o.printful_order_id && (
                  <button onClick={() => refresh(o)} disabled={busy === o.id} data-testid={`order-refresh-${o.id}`} className="pill pill-ghost !py-1.5 !px-3 !text-xs">
                    <RefreshCw className={`h-3.5 w-3.5 ${busy === o.id ? "animate-spin" : ""}`} /> Refresh tracking
                  </button>
                )}
              </div>
              {open === o.id && <OrderDetail order={o} onChanged={() => { load(); }} />}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
