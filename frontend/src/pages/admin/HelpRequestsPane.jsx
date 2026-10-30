import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { LifeBuoy, Search, Mail, MessageSquare, CheckCircle2, Clock, ArrowLeft, Send, UserRound, Bot } from "lucide-react";
import { toast } from "sonner";
import { api } from "@/lib/api";
import Spinner from "@/components/Spinner";

const STATUS = {
  new: { label: "New", cls: "bg-[#FBF1EE] text-[#B25A45]" },
  in_progress: { label: "In progress", cls: "bg-[#F3E7C9] text-[#7A5A1E]" },
  resolved: { label: "Resolved", cls: "bg-[#E4F0E8] text-[#2F6B45]" },
};
const when = (iso) => {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "" : d.toLocaleString(undefined, { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" });
};
const Badge = ({ status, tid }) => <span data-testid={tid} className={`text-[10px] uppercase tracking-widest font-bold rounded-full px-2 py-0.5 ${STATUS[status]?.cls || ""}`}>{STATUS[status]?.label || status}</span>;

/** Admin → Help requests: problems students sent through Tony's assistant. */
export default function HelpRequestsPane() {
  const [filter, setFilter] = useState("open");
  const [q, setQ] = useState("");
  const [data, setData] = useState(null);
  const [openId, setOpenId] = useState(() => new URLSearchParams(window.location.search).get("id"));

  const load = useCallback(async () => {
    try {
      const { data: d } = await api.get("/admin/help-requests", { params: { status: filter, q } });
      setData(d);
    } catch { setData({ requests: [], counts: {} }); }
  }, [filter, q]);
  useEffect(() => { load(); }, [load]);

  if (openId) return <HelpDetail id={openId} onBack={() => { setOpenId(null); load(); }} />;
  if (!data) return <Spinner />;
  const c = data.counts || {};
  return (
    <div className="space-y-4" data-testid="help-pane">
      <div className="rounded-2xl bg-white border border-[#E5E6DF] p-4">
        <div className="eyebrow flex items-center gap-2"><LifeBuoy className="h-3.5 w-3.5 text-[#B25A45]" /> Help requests</div>
        <p className="text-xs text-[#6B7269] mt-1">When a student tells Tony’s assistant about a problem it can’t solve (paid but no access, payment, sign-in, orders, classes), the assistant sends it here. You get a notification, an email and — when WhatsApp is set up in Settings — a WhatsApp message. Your reply goes to the student by email and shows in their My Yoga.</p>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {[["open", `Open (${(c.new || 0) + (c.in_progress || 0)})`], ["new", `New (${c.new || 0})`], ["in_progress", `In progress (${c.in_progress || 0})`], ["resolved", `Resolved (${c.resolved || 0})`], ["all", "All"]].map(([k, label]) => (
          <button key={k} onClick={() => setFilter(k)} data-testid={`help-filter-${k}`} className={`pill !py-1.5 !px-3 !text-xs ${filter === k ? "pill-primary" : "pill-ghost"}`}>{label}</button>
        ))}
        <label className="ml-auto flex items-center gap-2 rounded-full border border-[#E5E6DF] bg-white px-3 py-1.5 min-w-[220px]">
          <Search className="h-3.5 w-3.5 text-[#9AA096]" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search name, email, ref…" className="flex-1 text-[13px] outline-none bg-transparent" data-testid="help-search" aria-label="Search help requests" />
        </label>
      </div>
      {data.requests.length === 0 ? (
        <p className="text-sm text-[#6B7269] rounded-2xl bg-[#F2F2EC] p-5" data-testid="help-empty">{filter === "open" ? "No open help requests. All caught up." : "Nothing here."}</p>
      ) : (
        <ul className="space-y-2" data-testid="help-list">
          {data.requests.map((r) => (
            <li key={r.id}>
              <button onClick={() => setOpenId(r.id)} data-testid={`help-row-${r.ref}`} className="w-full text-left rounded-2xl bg-white border border-[#E5E6DF] p-4 hover:border-[#B25A45] transition-colors">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-mono text-[12px] font-bold text-[#1C221F]">{r.ref}</span>
                  <Badge status={r.status} />
                  <span className="text-[11px] text-[#6B7269]">{r.category_label}</span>
                  <span className="ml-auto text-[11px] text-[#9AA096]">{when(r.created_at)}</span>
                </div>
                <p className="text-[14px] text-[#1C221F] mt-1.5">{r.summary}</p>
                <p className="text-[12px] text-[#6B7269] mt-1">{r.name || "Visitor"} · {r.email}{r.user_id ? "" : " · not signed in"}{r.replies ? ` · ${r.replies} repl${r.replies === 1 ? "y" : "ies"}` : ""}{r.updates ? ` · +${r.updates} update${r.updates === 1 ? "" : "s"}` : ""}</p>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function HelpDetail({ id, onBack }) {
  const [d, setD] = useState(null);
  const [reply, setReply] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const load = useCallback(() => api.get(`/admin/help-requests/${id}`).then(({ data }) => setD(data)).catch(() => setD(false)), [id]);
  useEffect(() => { load(); }, [load]);

  const patch = async (body, okText) => {
    setBusy(true);
    try { const { data } = await api.patch(`/admin/help-requests/${id}`, body); setD(data); toast.success(okText); setNote(""); }
    catch (e) { toast.error(e?.response?.data?.detail || "Could not save"); }
    finally { setBusy(false); }
  };
  const send = async (resolve) => {
    if (reply.trim().length < 2) { toast.error("Write a reply first."); return; }
    setBusy(true);
    try {
      const { data } = await api.post(`/admin/help-requests/${id}/reply`, { message: reply.trim(), resolve });
      setD(data.request); setReply("");
      toast.success(data.delivered ? "Reply sent to the student." : "Reply saved. Email is not set up, so the student will see it in My Yoga.");
    } catch (e) { toast.error(e?.response?.data?.detail || "Could not send"); }
    finally { setBusy(false); }
  };

  if (d === null) return <Spinner />;
  if (d === false) return <div className="space-y-3"><button onClick={onBack} className="pill pill-ghost !text-xs"><ArrowLeft className="h-3.5 w-3.5" /> Back</button><p className="text-sm">This help request was not found.</p></div>;
  return (
    <div className="space-y-4" data-testid="help-detail">
      <button onClick={onBack} className="pill pill-ghost !py-1.5 !px-3 !text-xs" data-testid="help-back"><ArrowLeft className="h-3.5 w-3.5" /> All help requests</button>
      <div className="rounded-2xl bg-white border border-[#E5E6DF] p-5 space-y-3">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="font-mono text-[14px] font-bold" data-testid="help-detail-ref">{d.ref}</span>
          <Badge status={d.status} tid="help-detail-status" />
          <span className="text-[12px] text-[#6B7269]">{d.category_label} · {when(d.created_at)}</span>
        </div>
        <p className="text-[15px] text-[#1C221F]" data-testid="help-detail-summary">{d.summary}</p>
        {(d.updates || []).map((u, i) => <p key={i} className="text-[13px] text-[#545E56] border-l-2 border-[#E5E6DF] pl-3">Later: {u.text} <span className="text-[#9AA096]">({when(u.at)})</span></p>)}
        <div className="flex flex-wrap gap-3 text-[13px] text-[#545E56]">
          <span className="inline-flex items-center gap-1.5"><UserRound className="h-3.5 w-3.5" />{d.name || "Visitor"}</span>
          <a href={`mailto:${encodeURIComponent(d.email || "")}?subject=${encodeURIComponent(`Tony Yoga — ${d.ref}`)}`} className="inline-flex items-center gap-1.5 text-[#B25A45] hover:underline"><Mail className="h-3.5 w-3.5" />{d.email}</a>
          {d.member?.id ? <Link to={`/admin?tab=students&member=${d.member.id}`} data-testid="help-open-student" className="inline-flex items-center gap-1.5 font-semibold text-[#B25A45] hover:underline">Open student (access, payments, give course) →</Link>
            : <span className="text-[#9AA096]">Not signed in</span>}
        </div>
        <div className="flex flex-wrap gap-2 pt-1">
          {d.status !== "in_progress" && d.status !== "resolved" && <button disabled={busy} onClick={() => patch({ status: "in_progress" }, "Marked in progress.")} data-testid="help-mark-progress" className="pill pill-ghost !py-1.5 !px-3 !text-xs"><Clock className="h-3.5 w-3.5" /> Mark in progress</button>}
          {d.status !== "resolved" ? <button disabled={busy} onClick={() => patch({ status: "resolved" }, "Marked resolved.")} data-testid="help-mark-resolved" className="pill pill-ghost !py-1.5 !px-3 !text-xs"><CheckCircle2 className="h-3.5 w-3.5" /> Resolved (no reply)</button>
            : <button disabled={busy} onClick={() => patch({ status: "in_progress" }, "Reopened.")} data-testid="help-reopen" className="pill pill-ghost !py-1.5 !px-3 !text-xs">Reopen</button>}
        </div>
      </div>

      <div className="rounded-2xl bg-white border border-[#E5E6DF] p-5 space-y-3" data-testid="help-reply-box">
        <div className="eyebrow !text-[11px] flex items-center gap-2"><Send className="h-3.5 w-3.5 text-[#B25A45]" /> Reply to the student</div>
        {(d.replies || []).map((r) => (
          <div key={r.id} className="rounded-xl bg-[#F2F7F3] border border-[#DCEBDF] p-3 text-[13px]" data-testid="help-reply">
            <div className="text-[11px] text-[#5B7A63] mb-1">{r.by} · {when(r.at)}</div>
            <p className="whitespace-pre-line">{r.text}</p>
          </div>
        ))}
        <textarea value={reply} onChange={(e) => setReply(e.target.value)} rows={4} maxLength={5000} data-testid="help-reply-text"
          placeholder="Hi! I’ve checked your account…" className="w-full rounded-xl border border-[#E5E6DF] p-3 text-[14px] outline-none focus:border-[#B25A45]" aria-label="Reply" />
        <div className="flex flex-wrap gap-2">
          <button disabled={busy} onClick={() => send(true)} data-testid="help-send-resolve" className="pill pill-primary !py-2 !px-4 !text-[13px]">Send and mark resolved</button>
          <button disabled={busy} onClick={() => send(false)} data-testid="help-send" className="pill pill-ghost !py-2 !px-4 !text-[13px]">Send, keep open</button>
        </div>
        <p className="text-[11px] text-[#6B7269]">The student gets it by email{d.user_id ? ", as a notification in the app and in My Yoga" : ""}.</p>
      </div>

      <div className="rounded-2xl bg-white border border-[#E5E6DF] p-5 space-y-2">
        <div className="eyebrow !text-[11px] flex items-center gap-2"><MessageSquare className="h-3.5 w-3.5 text-[#B25A45]" /> Conversation with the assistant</div>
        <ul className="space-y-2" data-testid="help-transcript">
          {(d.transcript || []).map((m, i) => (
            <li key={i} className={`rounded-xl p-3 text-[13px] ${m.role === "assistant" ? "bg-[#FAFAF7] border border-[#E5E6DF]" : "bg-[#EEE5DF] ml-8"}`}>
              <div className="text-[10px] uppercase tracking-widest font-bold text-[#9AA096] mb-1 flex items-center gap-1">{m.role === "assistant" ? <><Bot className="h-3 w-3" /> Assistant</> : "Student"}</div>
              <p className="whitespace-pre-line">{m.text}</p>
            </li>
          ))}
        </ul>
      </div>

      <div className="rounded-2xl bg-white border border-[#E5E6DF] p-5 space-y-2">
        <div className="eyebrow !text-[11px]">Private notes (only admins see these)</div>
        {(d.notes || []).map((n, i) => <p key={i} className="text-[13px]"><span className="text-[#9AA096]">{n.by} · {when(n.at)}:</span> {n.text}</p>)}
        <div className="flex gap-2">
          <input value={note} onChange={(e) => setNote(e.target.value)} maxLength={2000} placeholder="e.g. Checked PayPal — payment arrived" data-testid="help-note-text" className="flex-1 rounded-full border border-[#E5E6DF] px-3 py-2 text-[13px] outline-none focus:border-[#B25A45]" aria-label="Private note" />
          <button disabled={busy || !note.trim()} onClick={() => patch({ note }, "Note saved.")} data-testid="help-note-save" className="pill pill-ghost !py-2 !px-4 !text-[13px]">Save note</button>
        </div>
      </div>
    </div>
  );
}
