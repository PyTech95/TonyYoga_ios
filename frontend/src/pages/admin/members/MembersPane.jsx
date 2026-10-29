import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import {
  Search, UserPlus, Download, RefreshCw, Award, Users, CreditCard, Upload, AlertTriangle, CheckCircle2, Undo2, Gift,
  KeyRound, Mail, Link2, Copy, ArrowLeft, ArrowRight, Wand2, Eye, EyeOff,
} from "lucide-react";
import { api } from "@/lib/api";
import MemberDrawer from "./MemberDrawer";
import ImportTab from "./ImportTab";
import RefundDialog from "./RefundDialog";
import WithdrawalsTab from "./WithdrawalsTab";
import GiftsTab from "./GiftsTab";
import {
  fmtDate, fmtDateTime, money, errText, StateChip, inputCls, smallBtn, primaryBtn,
  DurationPicker, defaultDuration, durationPayload, useCatalog, Modal,
  CourseMultiSelect, coursePayload, emptyCourses, hasCourses, genPassword, paymentState, copyText,
} from "./memberShared";

const SEGMENTS = [
  ["students", "All students"], ["members", "Members"], ["courses", "With courses"], ["no_access", "Nothing yet"],
  ["imported", "Imported"], ["issues", "Payment waiting"], ["staff", "Team"],
];

const TABS = [
  ["students", "Students", Users], ["payments", "Payments", CreditCard], ["withdrawals", "Withdrawals", Undo2],
  ["gifts", "Gifts", Gift], ["import", "Import members", Upload],
];

async function download(path, filename) {
  try {
    const res = await api.get(path, { responseType: "blob" });
    const href = URL.createObjectURL(new Blob([res.data], { type: "text/csv" }));
    const a = document.createElement("a"); a.href = href; a.download = filename; a.click(); URL.revokeObjectURL(href);
  } catch { toast.error("Export failed"); }
}

const EMAIL_RX = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

export default function MembersPane() {
  // ?view=payments|withdrawals|gifts|import|list opens that view; ?member=<id> opens a student.
  const [tab, setTab] = useState(() => {
    const v = new URLSearchParams(window.location.search).get("view");
    return v === "list" ? "students" : TABS.some(([k]) => k === v) ? v : "students";
  });
  const [open, setOpen] = useState(() => new URLSearchParams(window.location.search).get("member") || null);
  return (
    <div className="space-y-4" data-testid="students-pane">
      <div className="flex flex-wrap items-center gap-2">
        {TABS.map(([k, label, Icon]) => (
          <button key={k} onClick={() => setTab(k)} data-testid={`members-tab-${k}`}
            className={`inline-flex items-center gap-1.5 rounded-full px-4 py-2 text-[13px] font-semibold border ${tab === k ? "bg-[#1C221F] text-white border-[#1C221F]" : "bg-white border-[#E5E6DF]"}`}>
            <Icon className="h-4 w-4" />{label}
          </button>
        ))}
      </div>
      {tab === "students" && <StudentsList onOpen={setOpen} />}
      {tab === "payments" && <PaymentsList onOpen={setOpen} />}
      {tab === "withdrawals" && <WithdrawalsTab onOpen={setOpen} />}
      {tab === "gifts" && <GiftsTab onOpen={setOpen} />}
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
  const allOnPage = data?.rows?.length > 0 && data.rows.every((r) => selected.has(r.id));
  const togglePage = () => setSelected((s) => {
    const n = new Set(s);
    if (allOnPage) data.rows.forEach((r) => n.delete(r.id)); else data.rows.forEach((r) => n.add(r.id));
    return n;
  });

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
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search name, email, phone or tag" className={`${inputCls} pl-9`} data-testid="members-search" />
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
        <div className="sticky top-2 z-10 rounded-2xl bg-[#1C221F] text-white p-3 flex flex-wrap items-center justify-between gap-2" data-testid="members-bulk-bar">
          <span className="text-[13px]"><span className="font-semibold">{selected.size}</span> selected</span>
          <div className="flex gap-2">
            <button className="rounded-full bg-white text-[#1C221F] px-3 py-1.5 text-[12px] font-semibold" onClick={() => setBulk(true)} data-testid="members-bulk">Actions for selected…</button>
            <button className="rounded-full border border-white/40 px-3 py-1.5 text-[12px]" onClick={() => setSelected(new Set())}>Clear</button>
          </div>
        </div>
      )}

      {!data ? <div className="space-y-2">{[0, 1, 2, 3].map((i) => <div key={i} className="h-16 rounded-2xl bg-[#F2F2EC] animate-pulse" />)}</div> : data.rows.length === 0 ? (
        <p className="text-sm text-[#6B7269] py-8 text-center">No students here.</p>
      ) : (
        <>
          <label className="flex items-center gap-2 px-3 text-[12px] text-[#6B7269] cursor-pointer">
            <input type="checkbox" className="h-4 w-4 accent-[#B25A45]" checked={allOnPage} onChange={togglePage} data-testid="members-select-page" />
            Select everyone on this page
          </label>
          <ul className="space-y-2" data-testid="students-list">
            {data.rows.map((r) => (
              <li key={r.id} className="rounded-2xl bg-white border border-[#E5E6DF] hover:border-[#B25A45] transition flex items-stretch" data-testid={`student-row-${r.id}`}>
                <label className="flex items-center px-3 cursor-pointer" onClick={(e) => e.stopPropagation()}>
                  <input type="checkbox" className="h-4 w-4 accent-[#B25A45]" checked={selected.has(r.id)} onChange={() => toggle(r.id)} aria-label="Select" data-testid={`student-select-${r.id}`} />
                </label>
                <button className="flex-1 min-w-0 text-left py-3 pr-4" onClick={() => onOpen(r.id)} data-testid={`student-open-${r.id}`}>
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="min-w-0">
                      <div className="text-[15px] font-semibold truncate">{r.name || r.email} {!r.active && <StateChip state="revoked">Blocked</StateChip>} {r.role !== "student" && <StateChip state="upcoming">{r.role}</StateChip>}</div>
                      <div className="text-xs text-[#6B7269] truncate">{r.email}{r.phone ? ` · ${r.phone}` : ""} · joined {fmtDate(r.created_at)}</div>
                      {r.tags?.length > 0 && (
                        <div className="mt-1 flex flex-wrap gap-1" data-testid={`student-tags-${r.id}`}>
                          {r.tags.map((t) => <span key={t} className="rounded-full bg-[#EEF1EC] px-2 py-0.5 text-[10px] font-semibold text-[#3E5A47]">{t}</span>)}
                        </div>
                      )}
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
        </>
      )}
      {data && pages > 1 && (
        <div className="flex items-center justify-center gap-2 text-[13px]">
          <button className={smallBtn} disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>Previous</button>
          <span>Page {page} of {pages} · {data.total} students</span>
          <button className={smallBtn} disabled={page >= pages} onClick={() => setPage((p) => p + 1)}>Next</button>
        </div>
      )}
      {data && pages <= 1 && <p className="text-center text-[12px] text-[#9AA096]">{data.total} student(s)</p>}

      {adding && <AddStudent onClose={() => setAdding(false)} onCreated={load} onOpen={(id) => { setAdding(false); onOpen(id); }} />}
      {bulk && <BulkDialog ids={[...selected]} onClose={() => setBulk(false)} onDone={() => { setBulk(false); setSelected(new Set()); load(); }} />}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Add student: details → sign-in → what they get → done

const STEP_TITLES = ["Student details", "How they sign in", "What they get now"];

function AddStudent({ onClose, onCreated, onOpen }) {
  const cat = useCatalog();
  const [step, setStep] = useState(0);
  const [f, setF] = useState({ name: "", email: "", phone: "", note: "" });
  const [login, setLogin] = useState("link_email"); // link_email | link_copy | password
  const [password, setPassword] = useState("");
  const [showPw, setShowPw] = useState(true);
  const [sendDetails, setSendDetails] = useState(true);
  const [planId, setPlanId] = useState("");
  const [courses, setCourses] = useState(emptyCourses());
  const [series, setSeries] = useState([]);
  const [credits, setCredits] = useState("");
  const [dur, setDur] = useState(defaultDuration());
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(null);
  const set = (k, v) => setF((x) => ({ ...x, [k]: v }));

  const detailsOk = f.name.trim() && EMAIL_RX.test(f.email.trim());
  const loginOk = login !== "password" || password.length >= 8;
  const givesTimed = !!planId || hasCourses(courses) || series.length > 0;

  const next = () => {
    if (step === 0 && !detailsOk) { toast.error("Enter the name and a valid email."); return; }
    if (step === 1 && !loginOk) { toast.error("The password needs at least 8 characters."); return; }
    setStep((s) => Math.min(2, s + 1));
  };

  const save = async () => {
    if (!detailsOk || !loginOk) { toast.error("Check the student details and sign-in step."); return; }
    let extra = {};
    try {
      if (givesTimed) extra = durationPayload(dur);
      if (hasCourses(courses)) Object.assign(extra, coursePayload(courses));
    } catch (e) { toast.error(e.message); return; }
    const body = {
      name: f.name.trim(), email: f.email.trim(), phone: f.phone.trim() || null, note: f.note.trim() || null,
      send_invite: login === "link_email",
      password: login === "password" ? password : null,
      send_login_details: login === "password" && sendDetails,
      plan_id: planId || null,
      class_template_ids: series.length ? series : null,
      credits: parseInt(credits, 10) > 0 ? parseInt(credits, 10) : null,
      ...extra,
    };
    setBusy(true);
    try {
      const { data } = await api.post("/admin/members", body);
      setResult({ ...data, password: body.password });
      toast.success("Student added");
      onCreated?.();
    } catch (e) { toast.error(errText(e)); } finally { setBusy(false); }
  };

  if (result) {
    const lines = [`Tony Yoga sign-in`, `Email: ${result.login?.email || result.user.email}`];
    if (result.password) lines.push(`Password: ${result.password}`);
    if (result.invite_url) lines.push(`Set your password: ${result.invite_url}`);
    lines.push(`Sign in: ${result.login?.sign_in_url || ""}`);
    const details = lines.join("\n");
    return (
      <Modal title="Student added" onClose={onClose} testId="members-add-result">
        <div className="rounded-2xl bg-[#E4F0E8] border border-[#CFE3D6] p-4 text-[13px] text-[#1C221F] space-y-1">
          <div className="flex items-center gap-2 font-semibold"><CheckCircle2 className="h-4 w-4 text-[#3E7C57]" />{result.user.name} · {result.user.email}</div>
          <div data-testid="members-add-given">{result.given?.length ? <>Given now: {result.given.join(", ")}.</> : "No access given yet."}</div>
          <div className="text-[#545E56]">
            {result.emailed
              ? (result.invite_url ? "We emailed them a link to choose their password (valid 3 days)." : "We emailed them their sign-in details.")
              : (result.invite_url ? "Nothing was emailed — share the link below." : "Nothing was emailed — share the details below.")}
          </div>
        </div>
        <div className="rounded-2xl bg-white border border-[#E5E6DF] p-4 space-y-1.5 text-[13px]" data-testid="members-add-login">
          <div className="text-[11px] uppercase tracking-widest font-semibold text-[#839682]">Sign-in details</div>
          <div>Email (login ID): <span className="font-semibold">{result.login?.email || result.user.email}</span></div>
          {result.password && <div>Password: <span className="font-mono font-semibold" data-testid="members-add-login-password">{result.password}</span> <span className="text-[11px] text-[#9AA096]">(shown only now)</span></div>}
          {result.invite_url && <div className="break-all">Set-password link: <span className="text-[#B25A45]">{result.invite_url}</span></div>}
          <div>Sign in at: <span className="text-[#B25A45]">{result.login?.sign_in_url}</span></div>
        </div>
        <div className="flex flex-wrap gap-2">
          <button className={smallBtn} onClick={() => copyText(details).then((ok) => ok && toast.success("Copied — paste it into WhatsApp or email"))} data-testid="members-add-copy-login"><Copy className="h-3.5 w-3.5" />Copy login details</button>
          <button className={primaryBtn} onClick={() => onOpen(result.user.id)} data-testid="members-add-open">Open student <ArrowRight className="h-4 w-4" /></button>
        </div>
      </Modal>
    );
  }

  return (
    <Modal title="Add a student" onClose={onClose} testId="members-add-wizard">
      <ol className="flex gap-1.5" aria-label="Steps">
        {STEP_TITLES.map((t, i) => (
          <li key={t} className="flex-1">
            <button type="button" onClick={() => (i < step || (i === 1 && detailsOk) || (i === 2 && detailsOk && loginOk)) && setStep(i)}
              className={`w-full text-left rounded-xl px-2.5 py-2 text-[11px] font-semibold border ${i === step ? "bg-[#1C221F] text-white border-[#1C221F]" : i < step ? "bg-[#E4F0E8] border-[#CFE3D6] text-[#3E7C57]" : "bg-white border-[#E5E6DF] text-[#9AA096]"}`}
              data-testid={`members-add-step-${i + 1}`}>
              {i + 1}. {t}
            </button>
          </li>
        ))}
      </ol>

      {step === 0 && (
        <div className="space-y-2">
          <input className={inputCls} placeholder="Full name" value={f.name} onChange={(e) => set("name", e.target.value)} data-testid="members-add-name" autoFocus />
          <label className="block text-[11px] text-[#6B7269]">Email — this is their login ID
            <input className={inputCls} placeholder="student@email.com" type="email" value={f.email} onChange={(e) => set("email", e.target.value)} data-testid="members-add-email" />
          </label>
          <input className={inputCls} placeholder="Phone / WhatsApp (optional)" value={f.phone} onChange={(e) => set("phone", e.target.value)} data-testid="members-add-phone" />
          <textarea rows={2} className={inputCls} placeholder="Private note (optional, only admins see it)" value={f.note} onChange={(e) => set("note", e.target.value)} data-testid="members-add-note" />
        </div>
      )}

      {step === 1 && (
        <div className="space-y-2">
          {[
            ["link_email", Mail, "Email them a link to set their own password", "Recommended. The link works for 3 days."],
            ["link_copy", Link2, "Give me the link — I'll send it myself", "Nothing is emailed; copy the link into WhatsApp."],
            ["password", KeyRound, "I'll set a password", "For students you sign up in person or by phone."],
          ].map(([k, Icon, label, hint]) => (
            <label key={k} className={`flex items-start gap-3 rounded-2xl border p-3 cursor-pointer ${login === k ? "border-[#B25A45] bg-[#FBF1EE]" : "border-[#E5E6DF] bg-white"}`}>
              <input type="radio" name="login" className="mt-1 accent-[#B25A45]" checked={login === k} onChange={() => setLogin(k)} data-testid={`members-add-login-${k}`} />
              <span><span className="flex items-center gap-1.5 text-[14px] font-semibold"><Icon className="h-4 w-4 text-[#B25A45]" />{label}</span><span className="block text-[12px] text-[#6B7269]">{hint}</span></span>
            </label>
          ))}
          {login === "password" && (
            <div className="rounded-2xl bg-white border border-[#E5E6DF] p-3 space-y-2">
              <div className="flex gap-2">
                <div className="relative flex-1">
                  <input type={showPw ? "text" : "password"} className={`${inputCls} pr-9 font-mono`} placeholder="At least 8 characters" value={password} onChange={(e) => setPassword(e.target.value)} data-testid="members-add-password" />
                  <button type="button" className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[#9AA096]" onClick={() => setShowPw((x) => !x)} aria-label={showPw ? "Hide password" : "Show password"}>{showPw ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}</button>
                </div>
                <button type="button" className={smallBtn} onClick={() => { setPassword(genPassword()); setShowPw(true); }} data-testid="members-add-generate"><Wand2 className="h-3.5 w-3.5" />Generate</button>
              </div>
              {password && password.length < 8 && <div className="text-[11px] text-[#B25A45]">{8 - password.length} more character(s) needed.</div>}
              <label className="flex items-center gap-2 text-[12px] text-[#545E56]">
                <input type="checkbox" className="h-4 w-4 accent-[#B25A45]" checked={sendDetails} onChange={(e) => setSendDetails(e.target.checked)} data-testid="members-add-send-details" />
                Email the sign-in details (email + this password) to the student
              </label>
            </div>
          )}
        </div>
      )}

      {step === 2 && (
        <div className="space-y-3">
          <p className="text-[12px] text-[#6B7269]">Optional — you can also add these later from the student's page.</p>
          <label className="block text-[11px] text-[#6B7269]">Membership
            <select className={inputCls} value={planId} onChange={(e) => setPlanId(e.target.value)} data-testid="members-add-plan">
              <option value="">No membership</option>
              {cat?.plans.map((p) => <option key={p.id} value={p.id}>{p.label}{p.is_active === false ? " (hidden)" : ""}</option>)}
            </select>
          </label>
          <div>
            <div className="text-[11px] text-[#6B7269] mb-1">Courses</div>
            <CourseMultiSelect programs={cat?.programs} value={courses} onChange={setCourses} testId="members-add-courses" />
          </div>
          {cat?.series?.length > 0 && (
            <div>
              <div className="text-[11px] text-[#6B7269] mb-1">Live-class series</div>
              <div className="rounded-xl border border-[#E5E6DF] bg-white p-2 max-h-40 overflow-y-auto">
                {cat.series.map((s) => (
                  <label key={s.id} className="flex items-center gap-2 py-1.5 px-1 text-[13px] cursor-pointer">
                    <input type="checkbox" className="h-4 w-4 accent-[#B25A45]" checked={series.includes(s.id)}
                      onChange={() => setSeries((x) => (x.includes(s.id) ? x.filter((y) => y !== s.id) : [...x, s.id]))} data-testid={`members-add-series-${s.id}`} />
                    {s.title}
                  </label>
                ))}
              </div>
            </div>
          )}
          <label className="block text-[11px] text-[#6B7269]">Class credits (drop-in classes)
            <input type="number" min="0" max="500" className={inputCls} value={credits} onChange={(e) => setCredits(e.target.value)} placeholder="0" data-testid="members-add-credits" />
          </label>
          {givesTimed && (
            <div className="rounded-2xl bg-white border border-[#E5E6DF] p-3 space-y-2">
              <div className="text-[11px] uppercase tracking-widest font-semibold text-[#839682]">For how long (membership, courses and series)</div>
              <DurationPicker value={dur} onChange={setDur} />
            </div>
          )}
        </div>
      )}

      <div className="flex items-center justify-between gap-2 pt-1">
        {step > 0 ? <button className={smallBtn} onClick={() => setStep((s) => s - 1)} data-testid="members-add-back"><ArrowLeft className="h-3.5 w-3.5" />Back</button> : <span />}
        {step < 2 ? (
          <div className="flex gap-2">
            {step === 1 && <button className={smallBtn} disabled={busy || !loginOk} onClick={save} data-testid="members-add-save-now">Add without access</button>}
            <button className={primaryBtn} onClick={next} disabled={step === 0 ? !detailsOk : !loginOk} data-testid="members-add-next">Next <ArrowRight className="h-4 w-4" /></button>
          </div>
        ) : (
          <button className={primaryBtn} disabled={busy || !detailsOk || !loginOk} onClick={save} data-testid="members-add-save">{busy ? "Adding…" : "Add student"}</button>
        )}
      </div>
    </Modal>
  );
}

// ---------------------------------------------------------------------------
const BULK_ACTIONS = [
  ["membership", "Give a membership"], ["course", "Give courses"], ["remove_course", "Remove courses"], ["credits", "Add class credits"],
  ["extend", "Extend their current membership"], ["end_membership", "End membership now"], ["tag", "Add a tag"], ["message", "Send a message"],
];

function BulkDialog({ ids, onClose, onDone }) {
  const cat = useCatalog();
  const [action, setAction] = useState("membership");
  const [planId, setPlanId] = useState("");
  const [courses, setCourses] = useState(emptyCourses());
  const [credits, setCredits] = useState(5);
  const [days, setDays] = useState(30);
  const [tag, setTag] = useState("");
  const [dur, setDur] = useState(defaultDuration());
  const [msg, setMsg] = useState({ title: "", body: "" });
  const [notify, setNotify] = useState(true);
  const [sure, setSure] = useState(false);
  const [busy, setBusy] = useState(false);

  const ready = action === "membership" ? !!planId
    : action === "course" || action === "remove_course" ? hasCourses(courses)
      : action === "end_membership" ? sure
        : action === "tag" ? !!tag.trim()
          : action === "message" ? !!(msg.title.trim() && msg.body.trim()) : true;

  const go = async () => {
    setBusy(true);
    try {
      const body = { user_ids: ids, action, notify };
      if (action === "membership") Object.assign(body, { plan_id: planId }, durationPayload(dur));
      if (action === "course") Object.assign(body, coursePayload(courses), durationPayload(dur));
      if (action === "remove_course") Object.assign(body, coursePayload(courses));
      if (action === "credits") body.credits = parseInt(credits, 10) || 1;
      if (action === "extend") body.days = parseInt(days, 10) || 1;
      if (action === "tag") body.tag = tag.trim();
      if (action === "message") Object.assign(body, msg);
      const { data } = await api.post("/admin/members/bulk", body);
      toast.success(`Done for ${data.done} student(s)`);
      onDone();
    } catch (e) { toast.error(e?.message && !e.response ? e.message : errText(e)); } finally { setBusy(false); }
  };
  return (
    <Modal title={`${ids.length} student(s)`} onClose={onClose} testId="members-bulk-dialog">
      <select className={inputCls} value={action} onChange={(e) => { setAction(e.target.value); setSure(false); }} data-testid="members-bulk-action">
        {BULK_ACTIONS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
      </select>
      {action === "membership" && (<><select className={inputCls} value={planId} onChange={(e) => setPlanId(e.target.value)} data-testid="members-bulk-plan"><option value="">Choose a membership…</option>{cat?.plans.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}</select><DurationPicker value={dur} onChange={setDur} /></>)}
      {(action === "course" || action === "remove_course") && (
        <>
          <CourseMultiSelect programs={cat?.programs} value={courses} onChange={setCourses} testId="members-bulk-courses" />
          {action === "course" ? <DurationPicker value={dur} onChange={setDur} /> : <p className="text-[12px] text-[#6B7269]">Access to these courses ends now for the selected students (including courses bought before). Courses inside their membership are removed from their picks.</p>}
        </>
      )}
      {action === "credits" && <input type="number" min="1" className={inputCls} value={credits} onChange={(e) => setCredits(e.target.value)} data-testid="members-bulk-credits" />}
      {action === "extend" && <label className="text-[12px] text-[#6B7269]">Days to add<input type="number" min="1" className={inputCls} value={days} onChange={(e) => setDays(e.target.value)} /></label>}
      {action === "end_membership" && (
        <label className="flex items-start gap-2 rounded-xl bg-[#FBEFEA] border border-[#EED9D2] p-3 text-[13px] text-[#8A3B2A]">
          <input type="checkbox" className="h-4 w-4 mt-0.5 accent-[#B25A45]" checked={sure} onChange={(e) => setSure(e.target.checked)} data-testid="members-bulk-sure" />
          End every active membership of these {ids.length} student(s) now. They lose membership access straight away. Card subscriptions in Stripe are not cancelled by this.
        </label>
      )}
      {action === "tag" && <input className={inputCls} value={tag} onChange={(e) => setTag(e.target.value)} placeholder="Tag, e.g. old website" maxLength={30} data-testid="members-bulk-tag" />}
      {action === "message" && (<><input className={inputCls} placeholder="Title" value={msg.title} onChange={(e) => setMsg({ ...msg, title: e.target.value })} /><textarea rows={3} className={inputCls} placeholder="Message" value={msg.body} onChange={(e) => setMsg({ ...msg, body: e.target.value })} /></>)}
      {["membership", "course", "credits"].includes(action) && <label className="flex items-center gap-2 text-[12px] text-[#545E56]"><input type="checkbox" className="h-4 w-4 accent-[#B25A45]" checked={notify} onChange={(e) => setNotify(e.target.checked)} />Tell them (bell, phone and email)</label>}
      <button className={primaryBtn} disabled={busy || !ready} onClick={go} data-testid="members-bulk-apply">{busy ? "Working…" : "Apply"}</button>
    </Modal>
  );
}

// ---------------------------------------------------------------------------
function PaymentsList({ onOpen }) {
  const [status, setStatus] = useState("unconfirmed");
  const [q, setQ] = useState("");
  const [rows, setRows] = useState(null);
  const [busy, setBusy] = useState(null);
  const [refund, setRefund] = useState(null);
  const load = useCallback(() => {
    api.get("/admin/payments", { params: { status, q: q.trim(), days: 365 } })
      .then(({ data }) => {
        let list = data.rows || [];
        // Refunded payments are settled, not "waiting".
        if (status === "unconfirmed") list = list.filter((r) => !["refunded", "partially_refunded"].includes(r.payment_status));
        setRows(list);
      })
      .catch(() => setRows([]));
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
      <p className="text-[12px] text-[#6B7269]">Payments started on the website or app. "Waiting" means the customer opened Stripe/PayPal but the website hasn't received the confirmation. The website re-checks these automatically every 5 minutes; use <span className="font-semibold">Check</span> to do it now. Paid payments can be refunded.</p>
      <div className="flex flex-wrap items-center gap-2">
        {[["unconfirmed", "Waiting"], ["paid", "Paid"], ["abandoned", "Not paid"], ["all", "All"]].map(([k, l]) => (
          <button key={k} onClick={() => setStatus(k)} data-testid={`payments-filter-${k}`} className={`rounded-full px-3 py-1.5 text-[12px] font-semibold border ${status === k ? "bg-[#B25A45] text-white border-[#B25A45]" : "bg-white border-[#E5E6DF]"}`}>{l}</button>
        ))}
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Email or PayPal/Stripe reference" className={`${inputCls} max-w-xs`} data-testid="payments-search" />
      </div>
      {rows && rows.length > 0 && <p className="text-[12px] text-[#545E56]">{rows.length} payment(s) · {Object.entries(total).map(([c, v]) => money(v, c)).join(" + ")}</p>}
      {!rows ? <div className="h-24 rounded-2xl bg-[#F2F2EC] animate-pulse" /> : rows.length === 0 ? <p className="text-sm text-[#6B7269] py-6 text-center">{status === "unconfirmed" ? <><CheckCircle2 className="inline h-4 w-4 text-[#3E7C57]" /> No payments waiting.</> : "No payments."}</p> : (
        <ul className="space-y-2" data-testid="payments-list">
          {rows.map((p) => {
            const st = paymentState(p);
            return (
              <li key={p.id} className="rounded-2xl bg-white border border-[#E5E6DF] p-3 flex flex-wrap items-center justify-between gap-2" data-testid={`payment-row-${p.id}`}>
                <div className="min-w-0">
                  <div className="text-[14px] font-semibold">{p.description} · {money(p.amount, p.currency)} <StateChip state={st.state}>{st.label}</StateChip></div>
                  <div className="text-[12px] text-[#6B7269] truncate">{p.user_email} · {fmtDateTime(p.created_at)} · {p.provider}</div>
                  {p.refunded_amount > 0 && <div className="text-[11px] text-[#B25A45]">Refunded {money(p.refunded_amount, p.currency)}</div>}
                  {p.last_check_result && <div className="text-[11px] text-[#839682]">{p.last_check_result}</div>}
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {st.state === "unconfirmed" && <button className={smallBtn} disabled={busy === p.id} onClick={() => act(p, "recheck")}><RefreshCw className="h-3.5 w-3.5" />Check</button>}
                  {st.state === "unconfirmed" && <button className={smallBtn} disabled={busy === p.id} onClick={() => act(p, "paid")}>Confirm by hand</button>}
                  {st.refundable && <button className={smallBtn} onClick={() => setRefund(p)} data-testid={`payment-refund-${p.id}`}><Undo2 className="h-3.5 w-3.5" />Refund</button>}
                  {p.user_id && <button className={smallBtn} onClick={() => onOpen(p.user_id)}>Open student</button>}
                </div>
              </li>
            );
          })}
        </ul>
      )}
      {refund && <RefundDialog payment={refund} onClose={() => setRefund(null)} onDone={() => { load(); window.dispatchEvent(new Event("ty-members-changed")); }} />}
    </div>
  );
}
