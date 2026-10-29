import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Gift, Send, Copy } from "lucide-react";
import { api } from "@/lib/api";
import { fmtDate, fmtDateTime, errText, StateChip, inputCls, smallBtn, copyText } from "./memberShared";

/** Gift memberships bought on the website: codes, who bought them, who used them. */
export default function GiftsTab({ onOpen }) {
  const [rows, setRows] = useState(null);
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState(null);
  useEffect(() => { api.get("/admin/gifts").then(({ data }) => setRows(data || [])).catch((e) => { toast.error(errText(e)); setRows([]); }); }, []);

  const resend = async (g) => {
    setBusy(g.id);
    try { await api.post(`/admin/gifts/${g.id}/resend`); toast.success("Gift emails sent again"); }
    catch (e) { toast.error(errText(e)); } finally { setBusy(null); }
  };

  const needle = q.trim().toLowerCase();
  const list = (rows || []).filter((g) => !needle || [g.code, g.buyer_email, g.recipient_email, g.recipient_name, g.plan_name].some((x) => String(x || "").toLowerCase().includes(needle)));
  const unused = (rows || []).filter((g) => g.status === "unredeemed").length;

  return (
    <div className="space-y-3" data-testid="gifts-tab">
      <p className="text-[12px] text-[#6B7269]">Memberships bought as a gift. The buyer (and the recipient, if they gave an email) receive the code; the recipient opens it on the "Redeem a gift" page. Codes are valid for a year.</p>
      <div className="flex flex-wrap items-center gap-2">
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Code, buyer or recipient" className={`${inputCls} max-w-xs`} data-testid="gifts-search" />
        {rows && <span className="text-[12px] text-[#545E56]">{rows.length} gift(s) · {unused} not used yet</span>}
      </div>
      {!rows ? <div className="h-24 rounded-2xl bg-[#F2F2EC] animate-pulse" /> : list.length === 0 ? (
        <p className="text-sm text-[#6B7269] py-6 text-center" data-testid="gifts-empty"><Gift className="inline h-4 w-4 text-[#B25A45]" /> No gifts yet.</p>
      ) : (
        <ul className="space-y-2" data-testid="gifts-list">
          {list.map((g) => (
            <li key={g.id} className="rounded-2xl bg-white border border-[#E5E6DF] p-3 flex flex-wrap items-center justify-between gap-2" data-testid={`gift-${g.code}`}>
              <div className="min-w-0">
                <div className="text-[14px] font-semibold flex flex-wrap items-center gap-2">
                  <span className="font-mono tracking-wider">{g.code}</span>
                  <StateChip state={g.status === "redeemed" ? "paid" : String(g.expires_at) < new Date().toISOString() ? "expired" : "upcoming"}>
                    {g.status === "redeemed" ? "Used" : String(g.expires_at) < new Date().toISOString() ? "Expired" : "Not used"}
                  </StateChip>
                </div>
                <div className="text-[12px] text-[#545E56]">{g.plan_name} · {g.days} days · bought by {g.buyer_email} {fmtDate(g.created_at)}</div>
                <div className="text-[12px] text-[#6B7269]">For {g.recipient_name || "—"}{g.recipient_email ? ` (${g.recipient_email})` : ""}{g.redeemed_at ? ` · used ${fmtDateTime(g.redeemed_at)}` : ` · valid until ${fmtDate(g.expires_at)}`}</div>
              </div>
              <div className="flex flex-wrap gap-1.5">
                <button className={smallBtn} onClick={() => copyText(g.code).then((ok) => ok && toast.success("Code copied"))}><Copy className="h-3.5 w-3.5" />Copy</button>
                {g.status === "unredeemed" && <button className={smallBtn} disabled={busy === g.id} onClick={() => resend(g)} data-testid={`gift-resend-${g.code}`}><Send className="h-3.5 w-3.5" />Resend emails</button>}
                {g.redeemed_by && onOpen && <button className={smallBtn} onClick={() => onOpen(g.redeemed_by)}>Open recipient</button>}
                {g.buyer_id && onOpen && <button className={smallBtn} onClick={() => onOpen(g.buyer_id)}>Open buyer</button>}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
