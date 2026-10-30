import { useState } from "react";
import { toast } from "sonner";
import { Undo2 } from "lucide-react";
import { api } from "@/lib/api";
import { Modal, money, errText, inputCls, primaryBtn } from "./memberShared";

/** Refund a confirmed card / PayPal / store-credit payment, and optionally take back what it gave. */
export default function RefundDialog({ payment, onClose, onDone }) {
  const [amount, setAmount] = useState("");
  const [revoke, setRevoke] = useState(true);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(null);
  const handBooked = !!payment.marked_paid_by && payment.provider !== "credit";

  const go = async () => {
    const value = amount.trim() ? Number(amount) : null;
    if (value !== null && (!(value > 0) || Number.isNaN(value))) { toast.error("Enter an amount above 0, or leave it empty for the full amount."); return; }
    setBusy(true);
    try {
      const { data } = await api.post(`/admin/payments/${payment.id}/refund`, { amount: value ?? undefined, revoke_access: revoke, note: note.trim() });
      setResult(data);
      toast.success("Refund done");
      onDone?.(data);
    } catch (e) { toast.error(errText(e, "Refund failed")); } finally { setBusy(false); }
  };

  return (
    <Modal title="Refund payment" onClose={onClose} testId="refund-dialog">
      <div className="rounded-xl bg-white border border-[#E5E6DF] p-3 text-[13px]">
        <div className="font-semibold">{payment.description}</div>
        <div className="text-[#6B7269]">{money(payment.amount, payment.currency)} · {payment.provider}{payment.user_email ? ` · ${payment.user_email}` : ""}</div>
        {payment.payment_status === "partially_refunded" && <div className="text-[12px] text-[#8A6D3B] mt-1">Part of this payment was already refunded.</div>}
      </div>
      {result ? (
        <div className="space-y-3" data-testid="refund-result">
          <p className="text-[14px]">Refunded <span className="font-semibold">{money(result.refunded, payment.currency)}</span>{result.provider_ref ? <> · <span className="text-[#6B7269]">{result.provider_ref}</span></> : null}.</p>
          {result.access_removed?.length > 0 && <p className="text-[13px] text-[#545E56]">Also removed: {result.access_removed.join(", ")}.</p>}
          <p className="text-[12px] text-[#6B7269]">The student was told. Card refunds take 5–10 days to appear on their statement.</p>
          <button className={primaryBtn} onClick={onClose} data-testid="refund-done">Done</button>
        </div>
      ) : (
        <>
          {handBooked && <p className="rounded-xl bg-[#FBF6EC] border border-[#E0D3B8] p-3 text-[12px] text-[#5C5346]">This payment was confirmed by hand, so no money moves automatically. Return it the way it was paid (bank transfer, PayPal…), then record it here.</p>}
          <label className="block text-[11px] text-[#6B7269]">Amount ({String(payment.currency || "").toUpperCase()})
            <input type="number" min="0" step="0.01" className={inputCls} value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="Leave empty to refund everything that's left" data-testid="refund-amount" />
          </label>
          <label className="flex items-start gap-2 text-[13px] text-[#1C221F]">
            <input type="checkbox" className="h-4 w-4 mt-0.5 accent-[#B25A45]" checked={revoke} onChange={(e) => setRevoke(e.target.checked)} data-testid="refund-revoke" />
            <span>Remove what this payment gave <span className="text-[#6B7269]">(course access, membership, class credits)</span></span>
          </label>
          <label className="block text-[11px] text-[#6B7269]">Reason (saved in the student's history)
            <textarea rows={2} className={inputCls} value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. Asked within 14 days, didn't start the course" data-testid="refund-note" />
          </label>
          <button className={primaryBtn} disabled={busy || note.trim().length < 3} onClick={go} data-testid="refund-confirm">
            <Undo2 className="h-4 w-4" />{busy ? "Refunding…" : amount.trim() ? `Refund ${money(Number(amount) || 0, payment.currency)}` : "Refund the full amount"}
          </button>
        </>
      )}
    </Modal>
  );
}
