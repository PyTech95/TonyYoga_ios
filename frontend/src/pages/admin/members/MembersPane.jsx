import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Search, UserPlus, Download, RefreshCw, Award, Users, CreditCard, Upload, AlertTriangle, CheckCircle2, X } from "lucide-react";
import { api } from "@/lib/api";
import MemberDrawer from "./MemberDrawer";
import ImportTab from "./ImportTab";
import {
  fmtDate, fmtDateTime, money, errText, StateChip, inputCls, smallBtn, primaryBtn,
  DurationPicker, defaultDuration, durationPayload, useCatalog,
} from "./memberShared";

const SEGMENTS = [
  ["students", "All students"], ["members", "Members"], ["courses", "With courses"], ["no_access", "Nothing yet"],
  ["imported", "Imported"], ["issues", "Payment waiting"], ["staff", "Team"],
];

async function download(path, filename) {
  try {
    const res = await api.get(path, { responseType: "blob" });
    const href = URL.createObjectURL(new Blob([res.data], { type: "text/csv" }));
    const a = document.createElement("a"); a.href = href; a.download = filename; a.click(); URL.revokeObjectURL(href);
  } catch { toast.error("Export failed"); }
}

export default function MembersPane() {
  const [tab, setTab] = useState(() => new URLSearchParams(window.location.search).get("view") || "students");
  const [open, setOpen] = useState(null);
  return (
    <div className="space-y-4" data-testid="students-pane">
      <div className="flex flex-wrap items-center gap-2">
        {[["students", "Students", Users], ["payments", "Payments", CreditCard], ["import", "Import members", Upload]].map(([k, label, Icon]) => (
          <button key={k} onClick={() => setTab(k)} data-testid={`members-tab-${k}`}
            className={`inline-flex items-center gap-1.5 rounded-full px-4 py-2 text-[13px] font-semibold border ${tab === k ? "bg-[#1C221F] text-white border-[#1C221F]" : "bg-white border-[#E5E6DF]"}`}>
            <Icon className="h-4 w-4" />{label}
          </button>
        ))}
      </div>
      {tab === "students" && <StudentsList onOpen={setOpen} />}
      {tab === "payments" && <PaymentsList onOpen={setOpen} />}
      {tab === "import" && <ImportTab onOpen={setOpen} />}
      {open && <MemberDrawer userId={open} onClose={() => setOpen(null)} onChanged={() => window.dispatchEvent(new Event("ty-members-changed"))} />}
    </div>
  );
}

// ---------------------------------------------------------------------------
function StudentsList({ onOpen }) {
  const [q, setQ] = useState("");
  const [query, setQuery] = useState("");
  const [segment, setSegment] = useState("students");
  const [page, setPage] = useState(1);
  const [data, setData] = useState(null);
  const [selected, setSelected] = useState(new Set());
  const [adding, setAdding] = useState(false);
  const [bulk, setBulk] = useState(false);

  const load = useCallback(() => {
    api.get("/admin/members", { params: { q: query, segment, page, limit: 50 } })
      .then(({ data }) => setData(data)).catch((e) => { toast.error(errText(e, "Could not load students")); setData({ rows: [], total: 0, counts: {} }); });
  }, [query, segment, page]);
  useEffect(() => { load(); }, [load]);
  useEffect(() => { const h = () => load(); window.addEventListener("ty-members-changed", h); return () => window.removeEventListener("ty-members-changed", h); }, [load]);
  useEffect(() => { const id = setTimeout(() => { setQuery(q.trim()); setPage(1); }, 300); return () => clearTimeout(id); }, [q]);

  const toggle = (id) => setSelected((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const pages = data ? Math.max(1, Math.ceil(data.total / (data.limit || 50))) : 1;

  return (
    <div className="space-y-3">
      {data?.counts?.unconfirmed_payments > 0 && segment !== "issues" && (
        <button onClick={() => setSegment("issues")} className="w-full text-left rounded-2xl bg-[#FBF6EC] border border-[#E0D3B8] p-3 flex items-center gap-2 text-[13px]" data-testid="members-issues-banner">
          <AlertTriangle className="h-4 w-4 text-[#B25A45]" />
          <span><span className="font-semibold">{data.counts.unconfirmed_payments} student(s)</span> started paying in the last 3 days without confirmation. The website checks these every 5 minutes — open them to check now.</span>
        </button>
      )}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[220px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[#9AA096]" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search name, email or phone" className={`${inputCls} pl-9`} data-testid="members-search" />
        </div>
        <button className={primaryBtn} onClick={() => setAdding(true)} data-testid="members-add"><UserPlus className="h-4 w-4" />Add student</button>
        <button className={smallBtn} onClick={() => download(`/admin/members/export.csv?segment=${segment}`, "tony-yoga-students.csv")}><Download className="h-3.5 w-3.5" />Export</button>
        <button className={smallBtn} onClick={() => download("/admin/certificates/export.csv", "certificates.csv")}><Award className="h-3.5 w-3.5" />Certificates</button>
      </div>
      <div className="flex flex-wrap gap-1.5">
        {SEGMENTS.map(([k, label]) => (
          <button key={k} onClick={() => { setSegment(k); setPage(1); setSelected(new Set()); }} data-testid={`members-seg-${k}`}
            className={`rounded-full px-3 py-1.5 text-[12px] font-semibold border ${segment === k ? "bg-[#B25A45] text-white border-[#B25A45]" : "bg-white border-[#E5E6DF] text-[#545E56]"}`}>{label}</button>
        ))}
      </div>

      {selected.size > 0 && (
        <div className="sticky top-2 z-10 rounded-2xl bg-[#1C221F] text-white p-3 flex flex-wrap items-center justify-between gap-2">
          <span className="text-[13px]"><span className="font-semibold">{selected.size}</span> selected</span>
          <div className="flex gap-2">
            <button className="rounded-full bg-white text-[#1C221F] px-3 py-1.5 text-[12px] font-semibold" onClick={() => setBulk(true)} data-testid="members-bulk">Give access / message…</button>
            <button className="rounded-full border border-white/40 px-3 py-1.5 text-[12px]" onClick={() => setSelected(new Set())}>Clear</button>
          </div>
        </div>
      )}

      {!data ? <div className="space-y-2">{[0, 1, 2, 3].map((i) => <div key={i} className="h-16 rounded-2xl bg-[#F2F2EC] animate-pulse" />)}</div> : data.rows.length === 0 ? (
        <p className="text-sm text-[#6B7269] py-8 text-center">No students here.</p>
      ) : (
        <ul className="space-y-2" data-testid="students-list">
          {data.rows.map((r) => (
            <li key={r.id} className="rounded-2xl bg-white border border-[#E5E6DF] hover:border-[#B25A45] transition flex items-stretch" data-testid={`student-row-${r.id}`}>
              <label className="flex items-center px-3 cursor-pointer" onClick={(e) => e.stopPropagation()}>
                <input type="checkbox" className="h-4 w-4 accent-[#B25A45]" checked={selected.has(r.id)} onChange={() => toggle(r.id)} aria-label="Select" />
              </label>
              <button className="flex-1 min-w-0 text-left py-3 pr-4" onClick={() => onOpen(r.id)} data-testid={`student-open-${r.id}`}>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="min-w-0">
                    <div className="text-[15px] font-semibold truncate">{r.name || r.email} {!r.active && <StateChip state="revoked">Blocked</StateChip>} {r.role !== "student" && <StateChip state="upcoming">{r.role}</StateChip>}</div>
                    <div className="text-xs text-[#6B7269] truncate">{r.email}{r.phone ? ` · ${r.phone}` : ""} · joined {fmtDate(r.created_at)}</div>
                  </div>
                  <div className="flex flex-wrap items-center gap-1.5">
                    {r.unconfirmed_payment && <StateChip state="unconfirmed">Payment waiting</StateChip>}
                    {r.membership ? <StateChip state="active">{r.membership.plan_name} · {fmtDate(r.membership.ends_at)}</StateChip> : null}
                    {r.courses > 0 && <StateChip state="upcoming">{r.courses} course{r.courses > 1 ? "s" : ""}</StateChip>}
                    {r.credits > 0 && <StateChip state="none">{r.credits} credit{r.credits > 1 ? "s" : ""}</StateChip>}
                    {!r.membership && !r.courses && !r.credits && <span className="text-[11px] text-[#9AA096]">No access</span>}
                  </div>
                </div>
              </button>
            </li>
          ))}
        </ul>
      )}
      {data && pages > 1 && (
        <div className="flex items-center justify-center gap-2 text-[13px]">
          <button className={smallBtn} disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>Previous</button>
          <span>Page {page} of {pages} · {data.total} students</span>
          <button className={smallBtn} disabled={page >= pages} onClick={() => setPage((p) => p + 1)}>Next</button>
        </div>
      )}
      {data && pages <= 1 && <p className="text-center text-[12px] text-[#9AA096]">{data.total} student(s)</p>}

      {adding && <AddStudent onClose={() => setAdding(false)} onDone={(id) => { setAdding(false); load(); onOpen(id); }} />}
      {bulk && <BulkDialog ids={[...selected]} onClose={() => setBulk(false)} onDone={() => { setBulk(false); setSelected(new Set()); load(); }} />}
    </div>
  );
}

function Modal({ title, onClose, children }) {
  return (
    <div className="fixed inset-0 z-[70] flex items-end sm:items-center justify-center p-0 sm:p-4">
      <button className="absolute inset-0 bg-black/40" onClick={onClose} aria-label="Close" />
      <div className="relative w-full sm:max-w-lg max-h-[92vh] overflow-y-auto rounded-t-3xl sm:rounded-3xl bg-[#FAFAF7] p-5 space-y-4">
        <div className="flex items-center justify-between"><h3 className="serif text-xl">{title}</h3><button onClick={onClose} aria-label="Close"><X className="h-5 w-5" /></button></div>
        {children}
      </div>
    </div>
  );
}

function AddStudent({ onClose, onDone }) {
  const [f, setF] = useState({ name: "", email: "", phone: "", send_invite: true, password: "" });
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(null);
  const save = async () => {
    setBusy(true);
    try {
      const body = { name: f.name.trim(), email: f.email.trim(), phone: f.phone.trim() || null, send_invite: f.send_invite, password: f.password || null };
      const { data } = await api.post("/admin/members", body);
      toast.success("Student added");
      setResult(data);
    } catch (e) { toast.error(errText(e)); } finally { setBusy(false); }
  };
  if (result) {
    return (
      <Modal title="Student added" onClose={() => onDone(result.user.id)}>
        <p className="text-[13px] text-[#545E56]">{result.invite_url ? (f.send_invite ? "We emailed them a link to choose a password. You can also share this link (valid 3 days):" : "Share this link so they can choose a password (valid 3 days):") : "They can sign in with the password you set."}</p>
        {result.invite_url && (
          <div className="flex gap-2"><input readOnly className={inputCls} value={result.invite_url} onFocus={(e) => e.target.select()} />
            <button className={smallBtn} onClick={() => navigator.clipboard?.writeText(result.invite_url).then(() => toast.success("Copied"))}>Copy</button></div>
        )}
        <button className={primaryBtn} onClick={() => onDone(result.user.id)} data-testid="members-add-continue">Give membership or courses →</button>
      </Modal>
    );
  }
  return (
    <Modal title="Add a student" onClose={onClose}>
      <div className="space-y-2">
        <input className={inputCls} placeholder="Full name" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} data-testid="members-add-name" />
        <input className={inputCls} placeholder="Email" type="email" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} data-testid="members-add-email" />
        <input className={inputCls} placeholder="Phone / WhatsApp (optional)" value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} />
        <input className={inputCls} placeholder="Password (optional — leave empty to send a link)" type="text" value={f.password} onChange={(e) => setF({ ...f, password: e.target.value })} />
        {!f.password && <label className="flex items-center gap-2 text-[12px] text-[#545E56]"><input type="checkbox" className="h-4 w-4 accent-[#B25A45]" checked={f.send_invite} onChange={(e) => setF({ ...f, send_invite: e.target.checked })} />Email them a link to choose their password</label>}
      </div>
      <button className={primaryBtn} disabled={busy || !f.name.trim() || !f.email.trim()} onClick={save} data-testid="members-add-save">{busy ? "Adding…" : "Add student"}</button>
    </Modal>
  );
}

function BulkDialog({ ids, onClose, onDone }) {
  const cat = useCatalog();
  const [action, setAction] = useState("membership");
  const [planId, setPlanId] = useState("");
  const [programId, setProgramId] = useState("");
  const [credits, setCredits] = useState(5);
  const [days, setDays] = useState(30);
  const [dur, setDur] = useState(defaultDuration());
  const [msg, setMsg] = useState({ title: "", body: "" });
  const [notify, setNotify] = useState(true);
  const [busy, setBusy] = useState(false);
  const go = async () => {
    setBusy(true);
    try {
      const body = { user_ids: ids, action, notify };
      if (action === "membership") Object.assign(body, { plan_id: planId }, durationPayload(dur));
      if (action === "course") Object.assign(body, { program_id: programId }, durationPayload(dur));
      if (action === "credits") body.credits = parseInt(credits, 10) || 1;
      if (action === "extend") body.days = parseInt(days, 10) || 1;
      if (action === "message") Object.assign(body, msg);
      const { data } = await api.post("/admin/members/bulk", body);
      toast.success(`Done for ${data.done} student(s)`);
      onDone();
    } catch (e) { toast.error(e?.message && !e.response ? e.message : errText(e)); } finally { setBusy(false); }
  };
  return (
    <Modal title={`${ids.length} student(s)`} onClose={onClose}>
      <select className={inputCls} value={action} onChange={(e) => setAction(e.target.value)}>
        <option value="membership">Give a membership</option>
        <option value="course">Give a course</option>
        <option value="credits">Add class credits</option>
        <option value="extend">Extend their current membership</option>
        <option value="message">Send a message</option>
      </select>
      {action === "membership" && (<><select className={inputCls} value={planId} onChange={(e) => setPlanId(e.target.value)}><option value="">Choose a membership…</option>{cat?.plans.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}</select><DurationPicker value={dur} onChange={setDur} /></>)}
      {action === "course" && (<><select className={inputCls} value={programId} onChange={(e) => setProgramId(e.target.value)}><option value="">Choose a course…</option>{cat?.programs.map((p) => <option key={p.id} value={p.id}>{p.title}</option>)}</select><DurationPicker value={dur} onChange={setDur} /></>)}
      {action === "credits" && <input type="number" min="1" className={inputCls} value={credits} onChange={(e) => setCredits(e.target.value)} />}
      {action === "extend" && <label className="text-[12px] text-[#6B7269]">Days to add<input type="number" min="1" className={inputCls} value={days} onChange={(e) => setDays(e.target.value)} /></label>}
      {action === "message" && (<><input className={inputCls} placeholder="Title" value={msg.title} onChange={(e) => setMsg({ ...msg, title: e.target.value })} /><textarea rows={3} className={inputCls} placeholder="Message" value={msg.body} onChange={(e) => setMsg({ ...msg, body: e.target.value })} /></>)}
      {action !== "message" && action !== "extend" && <label className="flex items-center gap-2 text-[12px] text-[#545E56]"><input type="checkbox" className="h-4 w-4 accent-[#B25A45]" checked={notify} onChange={(e) => setNotify(e.target.checked)} />Tell them (bell, phone and email)</label>}
      <button className={primaryBtn} disabled={busy} onClick={go}>{busy ? "Working…" : "Apply"}</button>
    </Modal>
  );
}

// ---------------------------------------------------------------------------
function PaymentsList({ onOpen }) {
  const [status, setStatus] = useState("unconfirmed");
  const [q, setQ] = useState("");
  const [rows, setRows] = useState(null);
  const [busy, setBusy] = useState(null);
  const load = useCallback(() => {
    api.get("/admin/payments", { params: { status, q: q.trim(), days: 365 } }).then(({ data }) => setRows(data.rows)).catch(() => setRows([]));
  }, [status, q]);
  useEffect(() => { const id = setTimeout(load, 250); return () => clearTimeout(id); }, [load]);
  const act = async (p, kind) => {
    setBusy(p.id);
    try {
      if (kind === "recheck") { const { data } = await api.post(`/admin/payments/${p.id}/recheck`); toast[data.result === "paid" ? "success" : "info"](data.detail); }
      if (kind === "paid") {
        const note = window.prompt("Why are you confirming this by hand? (e.g. 'Seen in PayPal', 'bank transfer')");
        if (!note || note.trim().length < 3) { setBusy(null); return; }
        await api.post(`/admin/payments/${p.id}/mark-paid`, { note: note.trim() }); toast.success("Confirmed and delivered");
      }
      load();
    } catch (e) { toast.error(errText(e)); } finally { setBusy(null); }
  };
  const total = useMemo(() => (rows || []).reduce((acc, r) => { acc[r.currency] = (acc[r.currency] || 0) + Number(r.amount || 0); return acc; }, {}), [rows]);
  return (
    <div className="space-y-3">
      <p className="text-[12px] text-[#6B7269]">Payments started on the website or app. "Waiting" means the customer opened Stripe/PayPal but the website hasn't received the confirmation. The website re-checks these automatically every 5 minutes; use <span className="font-semibold">Check</span> to do it now.</p>
      <div className="flex flex-wrap items-center gap-2">
        {[["unconfirmed", "Waiting"], ["paid", "Paid"], ["abandoned", "Not paid"], ["all", "All"]].map(([k, l]) => (
          <button key={k} onClick={() => setStatus(k)} data-testid={`payments-filter-${k}`} className={`rounded-full px-3 py-1.5 text-[12px] font-semibold border ${status === k ? "bg-[#B25A45] text-white border-[#B25A45]" : "bg-white border-[#E5E6DF]"}`}>{l}</button>
        ))}
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Email or PayPal/Stripe reference" className={`${inputCls} max-w-xs`} />
      </div>
      {rows && rows.length > 0 && <p className="text-[12px] text-[#545E56]">{rows.length} payment(s) · {Object.entries(total).map(([c, v]) => money(v, c)).join(" + ")}</p>}
      {!rows ? <div className="h-24 rounded-2xl bg-[#F2F2EC] animate-pulse" /> : rows.length === 0 ? <p className="text-sm text-[#6B7269] py-6 text-center">{status === "unconfirmed" ? <><CheckCircle2 className="inline h-4 w-4 text-[#3E7C57]" /> No payments waiting.</> : "No payments."}</p> : (
        <ul className="space-y-2" data-testid="payments-list">
          {rows.map((p) => {
            const state = p.confirmed ? "paid" : ["expired", "cancelled", "failed"].includes(p.status) ? "abandoned" : "unconfirmed";
            return (
              <li key={p.id} className="rounded-2xl bg-white border border-[#E5E6DF] p-3 flex flex-wrap items-center justify-between gap-2">
                <div className="min-w-0">
                  <div className="text-[14px] font-semibold">{p.description} · {money(p.amount, p.currency)} <StateChip state={state}>{state === "paid" ? "Paid" : state === "abandoned" ? "Not paid" : "Waiting"}</StateChip></div>
                  <div className="text-[12px] text-[#6B7269] truncate">{p.user_email} · {fmtDateTime(p.created_at)} · {p.provider}</div>
                  {p.last_check_result && <div className="text-[11px] text-[#839682]">{p.last_check_result}</div>}
                </div>
                <div className="flex gap-1.5">
                  {!p.confirmed && <button className={smallBtn} disabled={busy === p.id} onClick={() => act(p, "recheck")}><RefreshCw className="h-3.5 w-3.5" />Check</button>}
                  {!p.confirmed && <button className={smallBtn} disabled={busy === p.id} onClick={() => act(p, "paid")}>Confirm by hand</button>}
                  {p.user_id && <button className={smallBtn} onClick={() => onOpen(p.user_id)}>Open student</button>}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
