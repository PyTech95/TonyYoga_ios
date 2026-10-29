import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Undo2, XCircle, CheckCircle2 } from "lucide-react";
import { api } from "@/lib/api";
import { fmtDateTime, money, errText, StateChip, inputCls, smallBtn, primaryBtn } from "./memberShared";

const STATUS = { received: ["unconfirmed", "New"], refunded: ["paid", "Refunded"], declined: ["revoked", "Declined"], closed: ["none", "Closed"] };

/** EU "withdraw from contract" requests (must be answered within 14 days). */
export default function WithdrawalsTab({ onOpen }) {
  const [status, setStatus] = useState("open");
  const [rows, setRows] = useState(null);
  const [open, setOpen] = useState(null); // {id, action}
  const [note, setNote] = useState("");
  const [revoke, setRevoke] = useState(true);
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    api.get("/admin/withdrawals", { params: { status } }).then(({ data }) => setRows(data || [])).catch((e) => { toast.error(errText(e)); setRows([]); });
  }, [status]);
  useEffect(() => { load(); }, [load]);

  const decide = async (w) => {
    setBusy(true);
    try {
      await api.post(`/admin/withdrawals/${w.id}`, { action: open.action, note: note.trim(), revoke_access: revoke });
      toast.success(open.action === "refund" ? "Refunded and closed" : open.action === "decline" ? "Declined — the customer was emailed" : "Closed");
      setOpen(null); setNote("");
      load();
    } catch (e) { toast.error(errText(e)); } finally { setBusy(false); }
  };

  const age = (iso) => Math.floor((Date.now() - new Date(iso).getTime()) / 86400000);

  return (
    <div className="space-y-3" data-testid="withdrawals-tab">
      <p className="text-[12px] text-[#6B7269]">Customers in the EU can withdraw from an online purchase within 14 days using the "Withdraw from a purchase" page. Reply within 14 days of receiving the request; a refund goes back the way they paid.</p>
      <div className="flex gap-2">
        {[["open", "Waiting for an answer"], ["all", "All"]].map(([k, l]) => (
          <button key={k} onClick={() => setStatus(k)} data-testid={`withdrawals-filter-${k}`} className={`rounded-full px-3 py-1.5 text-[12px] font-semibold border ${status === k ? "bg-[#B25A45] text-white border-[#B25A45]" : "bg-white border-[#E5E6DF]"}`}>{l}</button>
        ))}
      </div>
      {!rows ? <div className="h-24 rounded-2xl bg-[#F2F2EC] animate-pulse" /> : rows.length === 0 ? (
        <p className="text-sm text-[#6B7269] py-6 text-center" data-testid="withdrawals-empty"><CheckCircle2 className="inline h-4 w-4 text-[#3E7C57]" /> No withdrawal requests{status === "open" ? " waiting" : ""}.</p>
      ) : (
        <ul className="space-y-2" data-testid="withdrawals-list">
          {rows.map((w) => {
            const [chip, label] = STATUS[w.status] || ["none", w.status];
            const days = age(w.created_at);
            return (
              <li key={w.id} className="rounded-2xl bg-white border border-[#E5E6DF] p-3 space-y-2" data-testid={`withdrawal-${w.id}`}>
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="text-[14px] font-semibold">{w.name} · <span className="font-normal text-[#6B7269]">{w.email}</span> <StateChip state={chip}>{label}</StateChip></div>
                    <div className="text-[12px] text-[#545E56]">{w.description || w.order_reference || "No purchase chosen"}{w.amount != null ? ` · ${money(w.amount, w.currency)}` : ""}{w.paid_at ? ` · paid ${fmtDateTime(w.paid_at)}` : ""}</div>
                    <div className="text-[11px] text-[#9AA096]">Ref {String(w.id).slice(0, 8).toUpperCase()} · received {fmtDateTime(w.created_at)}{w.status === "received" ? ` · ${days} day(s) ago${days >= 10 ? " — reply soon" : ""}` : ""}</div>
                    {w.details && <div className="mt-1 text-[13px] text-[#1C221F]">“{w.details}”</div>}
                    {w.decision_note && <div className="mt-1 text-[12px] text-[#6B7269]">Answer: {w.decision_note} ({w.decided_by})</div>}
                  </div>
                  {w.status === "received" && (
                    <div className="flex flex-wrap gap-1.5">
                      {w.transaction_id && <button className={smallBtn} onClick={() => { setOpen({ id: w.id, action: "refund" }); setNote(""); }} data-testid={`withdrawal-refund-${w.id}`}><Undo2 className="h-3.5 w-3.5" />Refund</button>}
                      <button className={smallBtn} onClick={() => { setOpen({ id: w.id, action: "decline" }); setNote(""); }} data-testid={`withdrawal-decline-${w.id}`}><XCircle className="h-3.5 w-3.5" />Decline</button>
                      <button className={smallBtn} onClick={() => { setOpen({ id: w.id, action: "close" }); setNote(""); }} data-testid={`withdrawal-close-${w.id}`}>Close</button>
                      {w.user_id && onOpen && <button className={smallBtn} onClick={() => onOpen(w.user_id)}>Open student</button>}
                    </div>
                  )}
                </div>
                {open?.id === w.id && (
                  <div className="rounded-xl bg-[#F7F2EC] border border-[#E7D9CB] p-3 space-y-2" data-testid={`withdrawal-form-${w.id}`}>
                    <div className="text-[12px] font-semibold">{open.action === "refund" ? "Refund the purchase" : open.action === "decline" ? "Decline (the customer receives your note by email)" : "Close without refund (e.g. handled another way)"}</div>
                    {open.action === "refund" && (
                      <label className="flex items-center gap-2 text-[12px]"><input type="checkbox" className="h-4 w-4 accent-[#B25A45]" checked={revoke} onChange={(e) => setRevoke(e.target.checked)} />Also remove what the purchase gave</label>
                    )}
                    <textarea rows={2} className={inputCls} value={note} onChange={(e) => setNote(e.target.value)} placeholder={open.action === "decline" ? "e.g. The course was fully watched, so the right of withdrawal no longer applies." : "Note"} data-testid={`withdrawal-note-${w.id}`} />
                    <div className="flex gap-2">
                      <button className={primaryBtn} disabled={busy || note.trim().length < 3} onClick={() => decide(w)} data-testid={`withdrawal-confirm-${w.id}`}>{busy ? "Saving…" : "Confirm"}</button>
                      <button className={smallBtn} onClick={() => setOpen(null)}>Cancel</button>
                    </div>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
