import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import {
  X, Mail, Phone, Link2, Copy, Send, Sparkles, GraduationCap, Ticket, CalendarDays, CreditCard, Package,
  History, RefreshCw, Plus, Minus, Trash2, CheckCircle2, ShieldOff, Shield, Bell, Smartphone, KeyRound, Wand2, Tag, Undo2,
} from "lucide-react";
import { api } from "@/lib/api";
import {
  fmtDate, fmtDateTime, money, errText, StateChip, inputCls, smallBtn, primaryBtn,
  DurationPicker, defaultDuration, durationPayload, useCatalog,
  CourseMultiSelect, coursePayload, emptyCourses, hasCourses, TagsEditor, genPassword, paymentState, copyText,
} from "./memberShared";
import RefundDialog from "./RefundDialog";
import MemberLearning from "@/pages/admin/members/MemberLearning";

function Block({ icon: Icon, title, children, action }) {
  return (
    <section className="rounded-2xl bg-white border border-[#E5E6DF] p-4 space-y-3">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2"><Icon className="h-4 w-4 text-[#B25A45]" /><h3 className="text-[13px] font-bold uppercase tracking-widest text-[#1C221F]">{title}</h3></div>
        {action}
      </div>
      {children}
    </section>
  );
}

function AddPanel({ label, children, testId }) {
  const [open, setOpen] = useState(false);
  return open ? (
    <div className="rounded-xl bg-[#F7F2EC] border border-[#E7D9CB] p-3 space-y-3" data-testid={testId}>
      {typeof children === "function" ? children(() => setOpen(false)) : children}
      <button type="button" onClick={() => setOpen(false)} className="text-[12px] text-[#6B7269]">Close</button>
    </div>
  ) : (
    <button type="button" onClick={() => setOpen(true)} className={smallBtn} data-testid={`${testId}-open`}><Plus className="h-3.5 w-3.5" />{label}</button>
  );
}

function NotifyBox({ value, onChange }) {
  return (
    <label className="flex items-center gap-2 text-[12px] text-[#545E56]">
      <input type="checkbox" checked={value} onChange={(e) => onChange(e.target.checked)} className="h-4 w-4 accent-[#B25A45]" />
      Tell the student (bell, phone and email)
    </label>
  );
}

export default function MemberDrawer({ userId, onClose, onChanged }) {
  const [d, setD] = useState(null);
  const [tab, setTab] = useState("access");
  const [busy, setBusy] = useState(false);
  const cat = useCatalog();

  const load = useCallback(() => {
    api.get(`/admin/members/${userId}`).then(({ data }) => setD(data)).catch((e) => { toast.error(errText(e, "Could not load student")); onClose(); });
  }, [userId, onClose]);
  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    const onKey = (e) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const run = async (fn, okMsg) => {
    setBusy(true);
    try {
      const res = await fn();
      if (okMsg) toast.success(typeof okMsg === "function" ? okMsg(res) : okMsg);
      load(); onChanged?.();
      return res;
    } catch (e) { toast.error(e?.message && !e.response ? e.message : errText(e)); return null; }
    finally { setBusy(false); }
  };

  const loginLink = async (send) => {
    const res = await run(() => api.post(`/admin/members/${userId}/login-link?send_email=${send}`));
    if (!res) return;
    if (send) toast.success("Sign-in link emailed.");
    else {
      try { await navigator.clipboard.writeText(res.data.url); toast.success("Sign-in link copied — paste it into WhatsApp or email."); }
      catch { window.prompt("Copy this sign-in link:", res.data.url); }
    }
  };

  const u = d?.user;

  return (
    <div className="fixed inset-0 z-[60] flex justify-end" data-testid="member-drawer">
      <button aria-label="Close" className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative h-full w-full max-w-[760px] bg-[#FAFAF7] shadow-2xl flex flex-col">
        <div className="flex items-start justify-between gap-3 border-b border-[#E5E6DF] bg-white px-5 py-4">
          {u ? (
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="serif text-2xl leading-tight truncate" data-testid="member-name">{u.name || u.email}</h2>
                {u.active === false && <StateChip state="revoked">Blocked</StateChip>}
                {u.role && u.role !== "student" && <StateChip state="upcoming">{u.role}</StateChip>}
              </div>
              <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-[12px] text-[#6B7269]">
                <a href={`mailto:${u.email}`} className="inline-flex items-center gap-1 hover:text-[#B25A45]"><Mail className="h-3.5 w-3.5" />{u.email}</a>
                {u.phone && <a href={`https://wa.me/${String(u.phone).replace(/\D/g, "")}`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 hover:text-[#B25A45]"><Phone className="h-3.5 w-3.5" />{u.phone}</a>}
                <span>Joined {fmtDate(u.created_at)}{u.source ? ` · ${u.source.replace(/_/g, " ")}` : ""}</span>
                {!u.has_password && <span className="text-[#8A6D3B]">No password yet</span>}
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                <button className={smallBtn} disabled={busy} onClick={() => loginLink(true)} data-testid="member-email-link"><Send className="h-3.5 w-3.5" />Email sign-in link</button>
                <button className={smallBtn} disabled={busy} onClick={() => loginLink(false)} data-testid="member-copy-link"><Copy className="h-3.5 w-3.5" />Copy sign-in link</button>
              </div>
            </div>
          ) : <div className="h-16 w-64 rounded-xl bg-[#F2F2EC] animate-pulse" />}
          <button onClick={onClose} className="h-9 w-9 rounded-full hover:bg-[#F2F2EC] flex items-center justify-center shrink-0" aria-label="Close" data-testid="member-close"><X className="h-5 w-5" /></button>
        </div>

        <div className="flex gap-1 border-b border-[#E5E6DF] bg-white px-3">
          {[["access", "Access"], ["money", "Payments & orders"], ["profile", "Profile & history"]].map(([k, label]) => (
            <button key={k} onClick={() => setTab(k)} data-testid={`member-tab-${k}`}
              className={`px-3 py-2.5 text-[13px] font-semibold border-b-2 ${tab === k ? "border-[#B25A45] text-[#1C221F]" : "border-transparent text-[#6B7269]"}`}>{label}</button>
          ))}
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {!d ? <div className="space-y-3">{[0, 1, 2].map((i) => <div key={i} className="h-28 rounded-2xl bg-[#F2F2EC] animate-pulse" />)}</div> : (
            <>
              {tab === "access" && <AccessTab d={d} cat={cat} run={run} busy={busy} userId={userId} />}
              {tab === "money" && <MoneyTab d={d} run={run} busy={busy} reload={() => { load(); onChanged?.(); }} />}
              {tab === "profile" && <ProfileTab d={d} run={run} busy={busy} userId={userId} />}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
function AccessTab({ d, cat, run, busy, userId }) {
  const [planId, setPlanId] = useState("");
  const [planDur, setPlanDur] = useState(defaultDuration());
  const [planNotify, setPlanNotify] = useState(true);
  const [courseSel, setCourseSel] = useState(emptyCourses());
  const [courseDur, setCourseDur] = useState(defaultDuration());
  const [courseNotify, setCourseNotify] = useState(true);
  const [credits, setCredits] = useState(5);
  const [seriesId, setSeriesId] = useState("");
  const [seriesDur, setSeriesDur] = useState(defaultDuration());
  const [classId, setClassId] = useState("");
  const [endEdit, setEndEdit] = useState({});
  const [pick, setPick] = useState({});

  const subPatch = (id, body, msg) => run(() => api.patch(`/admin/subscriptions/${id}`, body), (res) => res?.data?.warning || msg);

  return (
    <>
      <Block icon={Sparkles} title="Membership">
        {d.memberships.length === 0 && <p className="text-[13px] text-[#6B7269]">No membership.</p>}
        <ul className="space-y-2">
          {d.memberships.map((m) => (
            <li key={m.id} className="rounded-xl border border-[#E5E6DF] p-3" data-testid={`member-sub-${m.id}`}>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <div className="text-[14px] font-semibold">{m.plan_name} <StateChip state={m.state} /></div>
                  <div className="text-[12px] text-[#6B7269]">{fmtDate(m.start_date)} → {fmtDate(m.end_date)} · {m.source === "admin" ? `added by ${m.granted_by || "admin"}` : m.source === "import" ? "imported" : m.source === "apple_iap" ? "Apple" : m.stripe_subscription_id ? "Stripe (auto-renews)" : "paid"}</div>
                  {m.includes?.length > 0 && <div className="text-[11px] text-[#839682] mt-0.5">{m.includes.join(" · ")}</div>}
                </div>
                {m.state !== "cancelled" && (
                  <div className="flex flex-wrap gap-1.5">
                    <button className={smallBtn} disabled={busy} onClick={() => subPatch(m.id, { extend_days: 7, notify: true }, "Added 7 days")}>+7 days</button>
                    <button className={smallBtn} disabled={busy} onClick={() => subPatch(m.id, { extend_days: 30, notify: true }, "Added 30 days")}>+30 days</button>
                    <button className={smallBtn} disabled={busy} onClick={() => setEndEdit((x) => ({ ...x, [m.id]: x[m.id] === undefined ? "" : undefined }))}>Change dates</button>
                    <button className={smallBtn} disabled={busy} onClick={() => { if (window.confirm(`Cancel ${m.plan_name} for this student now?`)) subPatch(m.id, { status: "cancelled" }, "Membership cancelled"); }}><Trash2 className="h-3.5 w-3.5" />Cancel</button>
                  </div>
                )}
              </div>
              {endEdit[m.id] !== undefined && (
                <div className="mt-2 flex flex-wrap items-end gap-2">
                  <label className="text-[11px] text-[#6B7269]">Ends on<input type="date" className={inputCls} value={endEdit[m.id]} onChange={(e) => setEndEdit((x) => ({ ...x, [m.id]: e.target.value }))} /></label>
                  <button className={primaryBtn} disabled={busy || !endEdit[m.id]} onClick={() => subPatch(m.id, { end_date: new Date(`${endEdit[m.id]}T23:59:00`).toISOString(), notify: true }, "End date saved").then(() => setEndEdit((x) => ({ ...x, [m.id]: undefined })))}>Save</button>
                  <button className={smallBtn} disabled={busy} onClick={() => subPatch(m.id, { lifetime: true }, "Now lifetime")}>Make lifetime</button>
                </div>
              )}
              {m.choose_courses > 0 && (
                <div className="mt-2 rounded-lg bg-[#FAFAF7] p-2.5 text-[12px]">
                  <div className="font-semibold">Course of their choice ({m.picks.length}/{m.choose_courses})</div>
                  {m.picks.map((p) => {
                    const t = cat?.programs.find((x) => x.id === p.program_id);
                    return (
                      <div key={p.id} className="flex items-center justify-between gap-2 mt-1">
                        <span>{t?.title || p.program_id} <span className="text-[#9AA096]">· chosen by {p.picked_by === "member" ? "the student" : p.picked_by}</span></span>
                        <button className="text-[#B25A45] font-semibold" disabled={busy} onClick={() => { if (window.confirm("Remove this choice? The student can choose again.")) run(() => api.delete(`/admin/plan-picks/${p.id}`), "Choice removed"); }}>Remove</button>
                      </div>
                    );
                  })}
                  {m.state === "active" && m.picks.length < m.choose_courses && (
                    <div className="mt-2 flex gap-2">
                      <select className={inputCls} value={pick[m.id] || ""} onChange={(e) => setPick((x) => ({ ...x, [m.id]: e.target.value }))}>
                        <option value="">Choose for them…</option>
                        {cat?.programs.map((p) => <option key={p.id} value={p.id}>{p.title}</option>)}
                      </select>
                      <button className={primaryBtn} disabled={busy || !pick[m.id]} onClick={() => run(() => api.post(`/admin/members/${userId}/plan-picks`, { plan_id: m.plan_id, program_id: pick[m.id] }), "Course chosen")}>Choose</button>
                    </div>
                  )}
                </div>
              )}
            </li>
          ))}
        </ul>
        <AddPanel label="Add membership" testId="member-add-membership">
          {(close) => (
            <>
              <select className={inputCls} value={planId} onChange={(e) => setPlanId(e.target.value)} data-testid="member-plan-select">
                <option value="">Choose a membership…</option>
                {cat?.plans.map((p) => <option key={p.id} value={p.id}>{p.label}{p.is_active === false ? " (hidden)" : ""}</option>)}
              </select>
              <DurationPicker value={planDur} onChange={setPlanDur} />
              <NotifyBox value={planNotify} onChange={setPlanNotify} />
              <button className={primaryBtn} disabled={busy || !planId} data-testid="member-plan-save"
                onClick={async () => { const r = await run(() => api.post(`/admin/members/${userId}/memberships`, { plan_id: planId, notify: planNotify, ...durationPayload(planDur) }), "Membership added"); if (r) close(); }}>Add membership</button>
            </>
          )}
        </AddPanel>
      </Block>

      <Block icon={GraduationCap} title="Courses">
        {d.courses.length === 0 && <p className="text-[13px] text-[#6B7269]">No courses.</p>}
        <ul className="space-y-2">
          {d.courses.map((c) => {
            const grant = c.grants?.find((g) => g.state === "active") || c.grants?.[0];
            return (
              <li key={c.program_id} className="rounded-xl border border-[#E5E6DF] p-3 flex flex-wrap items-center justify-between gap-2" data-testid={`member-course-${c.program_id}`}>
                <div className="min-w-0">
                  <div className="text-[14px] font-semibold">{c.title} <StateChip state={c.has_access ? "active" : c.state} /></div>
                  <div className="text-[12px] text-[#6B7269]">{c.has_access ? `Until ${fmtDate(c.ends_at)}` : c.state === "upcoming" ? `Starts ${fmtDate(c.starts_at)}` : "No access now"}{c.sources?.length ? ` · ${c.sources.join(", ")}` : ""}</div>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {grant && grant.state !== "revoked" && <button className={smallBtn} disabled={busy} onClick={() => run(() => api.patch(`/admin/access-grants/${grant.id}`, { extend_days: 30 }), "Added 30 days")}>+30 days</button>}
                  {grant && grant.state === "revoked" && <button className={smallBtn} disabled={busy} onClick={() => run(() => api.patch(`/admin/access-grants/${grant.id}`, { restore: true }), "Access restored")}>Restore</button>}
                  {c.has_access && <button className={smallBtn} disabled={busy} data-testid={`member-course-remove-${c.program_id}`}
                    onClick={() => { if (window.confirm(`Remove ${c.title} from this student?`)) run(() => api.post(`/admin/members/${userId}/courses/${c.program_id}/remove`), (r) => r?.data?.reason || "Course removed"); }}><Trash2 className="h-3.5 w-3.5" />Remove</button>}
                </div>
              </li>
            );
          })}
        </ul>
        <AddPanel label="Give courses" testId="member-add-course">
          {(close) => (
            <>
              <CourseMultiSelect programs={cat?.programs} value={courseSel} onChange={setCourseSel} testId="member-course-multi" />
              <DurationPicker value={courseDur} onChange={setCourseDur} />
              <NotifyBox value={courseNotify} onChange={setCourseNotify} />
              <button className={primaryBtn} disabled={busy || !hasCourses(courseSel)} data-testid="member-course-save"
                onClick={async () => {
                  const single = !courseSel.all && courseSel.ids.length === 1;
                  const r = await run(() => api.post(`/admin/members/${userId}/courses`, {
                    ...(single ? { program_id: courseSel.ids[0] } : coursePayload(courseSel)), notify: courseNotify, ...durationPayload(courseDur),
                  }), (res) => (res?.data?.count ? `${res.data.count} course(s) added` : "Course added"));
                  if (r) { setCourseSel(emptyCourses()); close(); }
                }}>
                {courseSel.all ? "Give all courses" : courseSel.ids.length > 1 ? `Give ${courseSel.ids.length} courses` : "Give course"}
              </button>
            </>
          )}
        </AddPanel>
      </Block>

      <Block icon={CalendarDays} title="Live classes">
        <div className="space-y-2">
          {d.passes.filter((p) => p.active !== false).map((p) => (
            <div key={p.id} className="rounded-xl border border-[#E5E6DF] p-3 flex items-center justify-between gap-2">
              <div className="text-[13px]"><Ticket className="inline h-4 w-4 text-[#B25A45] mr-1" /><span className="font-semibold">{p.remaining}</span> class credit(s) left <span className="text-[#9AA096]">· {p.source === "admin" ? "added by admin" : p.source || "bought"} {fmtDate(p.created_at)}</span></div>
              <div className="flex gap-1">
                <button className={smallBtn} disabled={busy || p.remaining <= 0} onClick={() => run(() => api.patch(`/admin/class-passes/${p.id}`, { remaining: p.remaining - 1 }))}><Minus className="h-3.5 w-3.5" /></button>
                <button className={smallBtn} disabled={busy} onClick={() => run(() => api.patch(`/admin/class-passes/${p.id}`, { remaining: p.remaining + 1 }))}><Plus className="h-3.5 w-3.5" /></button>
              </div>
            </div>
          ))}
          {d.class_access.map((g) => (
            <div key={g.id} className="rounded-xl border border-[#E5E6DF] p-3 flex items-center justify-between gap-2">
              <div className="text-[13px]"><span className="font-semibold">{g.title}</span> <StateChip state={g.state} /> <span className="text-[#6B7269]">{fmtDate(g.starts_at)} → {fmtDate(g.ends_at)}</span></div>
              {g.state !== "revoked" && <button className={smallBtn} disabled={busy} onClick={() => { if (window.confirm(`Remove ${g.title}?`)) run(() => api.delete(`/admin/access-grants/${g.id}`), "Removed"); }}><Trash2 className="h-3.5 w-3.5" /></button>}
            </div>
          ))}
        </div>
        <div className="flex flex-wrap gap-2">
          <AddPanel label="Add class credits" testId="member-add-credits">
            {(close) => (
              <div className="flex items-end gap-2">
                <label className="text-[11px] text-[#6B7269]">Credits<input type="number" min="1" max="500" className={inputCls} value={credits} onChange={(e) => setCredits(e.target.value)} /></label>
                <button className={primaryBtn} disabled={busy} data-testid="member-credits-save" onClick={async () => { const r = await run(() => api.post(`/admin/members/${userId}/credits`, { credits: parseInt(credits, 10) || 1 }), "Credits added"); if (r) close(); }}>Add</button>
              </div>
            )}
          </AddPanel>
          {cat?.series?.length > 0 && (
            <AddPanel label="Give a live-class series" testId="member-add-series">
              {(close) => (
                <>
                  <select className={inputCls} value={seriesId} onChange={(e) => setSeriesId(e.target.value)}>
                    <option value="">Choose a Zoom class series…</option>
                    {cat.series.map((s) => <option key={s.id} value={s.id}>{s.title}</option>)}
                  </select>
                  <DurationPicker value={seriesDur} onChange={setSeriesDur} />
                  <button className={primaryBtn} disabled={busy || !seriesId} onClick={async () => { const r = await run(() => api.post(`/admin/members/${userId}/class-series`, { template_id: seriesId, ...durationPayload(seriesDur) }), "Class series added"); if (r) close(); }}>Give series</button>
                </>
              )}
            </AddPanel>
          )}
          <AddPanel label="Book into a class" testId="member-book">
            {(close) => (
              <>
                <select className={inputCls} value={classId} onChange={(e) => setClassId(e.target.value)} data-testid="member-class-select">
                  <option value="">Choose an upcoming class…</option>
                  {cat?.classes.map((c) => <option key={c.id} value={c.id}>{fmtDateTime(c.start_time)} · {c.title} ({c.location_type})</option>)}
                </select>
                <p className="text-[11px] text-[#6B7269]">Free booking — no payment or credit is used, and the seat is held even if the class is full.</p>
                <button className={primaryBtn} disabled={busy || !classId} data-testid="member-book-save" onClick={async () => { const r = await run(() => api.post(`/admin/members/${userId}/bookings`, { class_instance_id: classId }), "Booked"); if (r) close(); }}>Book</button>
              </>
            )}
          </AddPanel>
        </div>
        {d.bookings.length > 0 && (
          <ul className="divide-y divide-[#F0F0EA] rounded-xl border border-[#E5E6DF]">
            {d.bookings.slice(0, 12).map((b) => (
              <li key={b.id} className="flex items-center justify-between gap-2 px-3 py-2 text-[12px]">
                <span><span className="font-semibold">{b.title}</span> · {fmtDateTime(b.start_time)} · {b.status}{b.access_source ? ` (${b.access_source})` : ""}</span>
                {["confirmed", "waitlist"].includes(b.status) && new Date(b.start_time) > new Date() && (
                  <button className="text-[#B25A45] font-semibold" disabled={busy} onClick={() => { if (window.confirm("Cancel this booking?")) run(() => api.delete(`/admin/bookings/${b.id}`), "Booking cancelled"); }}>Cancel</button>
                )}
              </li>
            ))}
          </ul>
        )}
      </Block>
    </>
  );
}

// ---------------------------------------------------------------------------
function MoneyTab({ d, run, busy, reload }) {
  const [refund, setRefund] = useState(null);
  const confirmPaid = (p) => {
    const note = window.prompt("Why are you confirming this payment by hand? (e.g. 'Seen in PayPal 28 Oct', 'bank transfer')");
    if (!note || note.trim().length < 3) return;
    run(() => api.post(`/admin/payments/${p.id}/mark-paid`, { note: note.trim() }), "Payment confirmed and delivered");
  };
  return (
    <>
      <Block icon={CreditCard} title="Payments">
        {d.payments.length === 0 && <p className="text-[13px] text-[#6B7269]">No payments.</p>}
        <ul className="space-y-2">
          {d.payments.map((p) => {
            const st = paymentState(p);
            const state = st.state;
            return (
              <li key={p.id} className="rounded-xl border border-[#E5E6DF] p-3" data-testid={`member-payment-${p.id}`}>
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="text-[14px] font-semibold">{p.description} · {money(p.amount, p.currency)}</div>
                    <div className="text-[12px] text-[#6B7269]">{fmtDateTime(p.created_at)} · {p.provider}{p.reference ? ` · ${p.reference}` : ""}</div>
                    {p.last_check_result && <div className="text-[11px] text-[#839682] mt-0.5">Last check: {p.last_check_result}</div>}
                    {p.marked_paid_by && <div className="text-[11px] text-[#839682] mt-0.5">Confirmed by hand by {p.marked_paid_by}</div>}
                  </div>
                  <StateChip state={state}>{st.label}</StateChip>
                </div>
                {p.refunded_amount > 0 && <div className="text-[11px] text-[#B25A45] mt-1">Refunded {money(p.refunded_amount, p.currency)}</div>}
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {state === "unconfirmed" && <button className={smallBtn} disabled={busy} data-testid={`member-payment-recheck-${p.id}`} onClick={() => run(() => api.post(`/admin/payments/${p.id}/recheck`), (r) => r?.data?.detail || "Checked")}><RefreshCw className="h-3.5 w-3.5" />Check with {p.provider === "paypal" ? "PayPal" : "Stripe"}</button>}
                  {state === "unconfirmed" && <button className={smallBtn} disabled={busy} onClick={() => confirmPaid(p)}><CheckCircle2 className="h-3.5 w-3.5" />Confirm by hand</button>}
                  {p.confirmed && <button className={smallBtn} disabled={busy} onClick={() => run(() => api.post(`/admin/payments/${p.id}/redeliver`), "Delivered again (nothing is given twice)")}><RefreshCw className="h-3.5 w-3.5" />Deliver again</button>}
                  {st.refundable && <button className={smallBtn} disabled={busy} onClick={() => setRefund({ ...p, user_email: d.user.email })} data-testid={`member-payment-refund-${p.id}`}><Undo2 className="h-3.5 w-3.5" />Refund</button>}
                </div>
              </li>
            );
          })}
        </ul>
      </Block>
      <Block icon={Package} title="Orders">
        {d.orders.length === 0 && <p className="text-[13px] text-[#6B7269]">No shop orders.</p>}
        <ul className="space-y-2">
          {d.orders.map((o) => (
            <li key={o.id} className="rounded-xl border border-[#E5E6DF] p-3 text-[13px]">
              <div className="flex justify-between gap-2"><span className="font-semibold">{(o.items || []).map((i) => `${i.quantity}× ${i.title}`).join(", ")}</span><StateChip state={["delivered", "shipped", "paid"].includes(o.status) ? "active" : o.status === "pending" ? "upcoming" : "expired"}>{o.status}</StateChip></div>
              <div className="text-[12px] text-[#6B7269]">{fmtDate(o.created_at)} · {money(o.total, o.currency)}{o.tracking_number ? ` · tracking ${o.tracking_number}` : ""}</div>
            </li>
          ))}
        </ul>
      </Block>
      {(d.trainings.length > 0 || d.retreats.length > 0 || d.private_sessions.length > 0) && (
        <Block icon={GraduationCap} title="Trainings, retreats & private sessions">
          <ul className="text-[13px] space-y-1">
            {d.trainings.map((t) => <li key={t.id}>{t.training_name} · {t.dates} · <span className="text-[#3E7C57]">{t.status}</span></li>)}
            {d.retreats.map((r) => <li key={r.id}>{r.workshop_title} · {fmtDate(r.workshop_start_date)} · {String(r.status).replace(/_/g, " ")}</li>)}
            {d.private_sessions.map((p) => <li key={p.id}>Private session × {p.sessions_total || 1} · {p.status}</li>)}
          </ul>
        </Block>
      )}
      {refund && <RefundDialog payment={refund} onClose={() => setRefund(null)} onDone={reload} />}
    </>
  );
}

// ---------------------------------------------------------------------------
function ProfileTab({ d, run, busy, userId }) {
  const u = d.user;
  const [form, setForm] = useState({ name: u.name || "", email: u.email || "", phone: u.phone || "", role: u.role || "student", admin_note: u.admin_note || "", store_credit: d.store_credit || 0 });
  const [msg, setMsg] = useState({ title: "", body: "", email: true });
  const [pw, setPw] = useState({ value: "", send: true, saved: "" });
  const [tags, setTags] = useState(u.tags || []);
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));
  const tagsChanged = JSON.stringify([...(u.tags || [])].sort()) !== JSON.stringify([...tags].sort());
  const savePassword = async () => {
    const r = await run(() => api.patch(`/admin/members/${userId}`, { password: pw.value, send_login_details: pw.send }),
      pw.send ? "Password set and emailed to the student" : "Password set");
    if (r) setPw((x) => ({ ...x, saved: x.value, value: "" }));
  };
  return (
    <>
      <Block icon={Shield} title="Profile">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          <label className="text-[11px] text-[#6B7269]">Name<input className={inputCls} value={form.name} onChange={(e) => set("name", e.target.value)} /></label>
          <label className="text-[11px] text-[#6B7269]">Email<input className={inputCls} type="email" value={form.email} onChange={(e) => set("email", e.target.value)} /></label>
          <label className="text-[11px] text-[#6B7269]">Phone / WhatsApp<input className={inputCls} value={form.phone} onChange={(e) => set("phone", e.target.value)} /></label>
          <label className="text-[11px] text-[#6B7269]">Role
            <select className={inputCls} value={form.role} onChange={(e) => set("role", e.target.value)}>
              <option value="student">Student</option><option value="instructor">Teacher (instructor)</option><option value="support">Support</option><option value="admin">Admin</option>
            </select>
          </label>
          <label className="text-[11px] text-[#6B7269]">Store credit (€)<input className={inputCls} type="number" min="0" step="0.01" value={form.store_credit} onChange={(e) => set("store_credit", e.target.value)} /></label>
          <label className="text-[11px] text-[#6B7269] sm:col-span-2">Private note (only admins see this)<textarea rows={2} className={inputCls} value={form.admin_note} onChange={(e) => set("admin_note", e.target.value)} /></label>
        </div>
        <div className="flex flex-wrap gap-2">
          <button className={primaryBtn} disabled={busy} data-testid="member-profile-save"
            onClick={() => { if (form.role !== u.role && !window.confirm(`Change role to ${form.role}?`)) return; run(() => api.patch(`/admin/members/${userId}`, { ...form, store_credit: Number(form.store_credit) || 0 }), "Saved"); }}>Save profile</button>
          {u.active === false ? (
            <button className={smallBtn} disabled={busy} onClick={() => run(() => api.patch(`/admin/members/${userId}`, { active: true }), "Unblocked")}><Shield className="h-3.5 w-3.5" />Unblock</button>
          ) : (
            <button className={smallBtn} disabled={busy} onClick={() => { if (window.confirm("Block this account? They won't be able to sign in.")) run(() => api.patch(`/admin/members/${userId}`, { active: false }), "Blocked"); }}><ShieldOff className="h-3.5 w-3.5" />Block sign-in</button>
          )}
        </div>
        <div className="text-[12px] text-[#6B7269] flex items-center gap-3"><Smartphone className="h-4 w-4" />Phones with the app: {d.devices.phones} · Browsers with notifications: {d.devices.browsers}</div>
      </Block>

      <Block icon={KeyRound} title="Password & sign-in">
        <p className="text-[12px] text-[#6B7269]">Their login ID is <span className="font-semibold text-[#1C221F]">{u.email}</span>. {u.has_password ? "They have a password." : "They haven't set a password yet."} Send a sign-in link (top of this page), or set a password for them here.</p>
        <div className="flex gap-2">
          <input type="text" className={`${inputCls} font-mono`} placeholder="New password (at least 8 characters)" value={pw.value} onChange={(e) => setPw((x) => ({ ...x, value: e.target.value }))} data-testid="member-password-input" />
          <button type="button" className={smallBtn} onClick={() => setPw((x) => ({ ...x, value: genPassword() }))} data-testid="member-password-generate"><Wand2 className="h-3.5 w-3.5" />Generate</button>
        </div>
        <label className="flex items-center gap-2 text-[12px] text-[#545E56]"><input type="checkbox" className="h-4 w-4 accent-[#B25A45]" checked={pw.send} onChange={(e) => setPw((x) => ({ ...x, send: e.target.checked }))} data-testid="member-password-send" />Email the new sign-in details to the student</label>
        <div className="flex flex-wrap items-center gap-2">
          <button className={primaryBtn} disabled={busy || pw.value.length < 8} onClick={savePassword} data-testid="member-password-save"><KeyRound className="h-3.5 w-3.5" />Set password</button>
          {pw.saved && (
            <button className={smallBtn} onClick={() => copyText(`Tony Yoga sign-in\nEmail: ${u.email}\nPassword: ${pw.saved}\nSign in: ${window.location.origin}/login`).then((ok) => ok && toast.success("Copied"))} data-testid="member-password-copy">
              <Copy className="h-3.5 w-3.5" />Copy sign-in details
            </button>
          )}
        </div>
      </Block>

      <Block icon={Tag} title="Tags">
        <TagsEditor tags={tags} onChange={setTags} testId="member-tags" />
        <button className={primaryBtn} disabled={busy || !tagsChanged} onClick={() => run(() => api.patch(`/admin/members/${userId}`, { tags }), "Tags saved")} data-testid="member-tags-save">Save tags</button>
      </Block>

      <Block icon={GraduationCap} title="Learning & attendance">
        <MemberLearning userId={userId} />
      </Block>

      <Block icon={Bell} title="Send a message">
        <input className={inputCls} placeholder="Title (e.g. Your access is ready)" value={msg.title} onChange={(e) => setMsg((m) => ({ ...m, title: e.target.value }))} />
        <textarea rows={3} className={inputCls} placeholder="Message" value={msg.body} onChange={(e) => setMsg((m) => ({ ...m, body: e.target.value }))} />
        <label className="flex items-center gap-2 text-[12px] text-[#545E56]"><input type="checkbox" className="h-4 w-4 accent-[#B25A45]" checked={msg.email} onChange={(e) => setMsg((m) => ({ ...m, email: e.target.checked }))} />Also send by email</label>
        <button className={primaryBtn} disabled={busy || !msg.title || !msg.body} onClick={async () => { const r = await run(() => api.post(`/admin/members/${userId}/notify`, msg), "Message sent"); if (r) setMsg({ title: "", body: "", email: true }); }}><Send className="h-3.5 w-3.5" />Send</button>
        {d.notifications.length > 0 && (
          <ul className="text-[12px] text-[#6B7269] space-y-1 border-t border-[#F0F0EA] pt-2">
            {d.notifications.slice(0, 8).map((n) => <li key={n.id}>{fmtDateTime(n.created_at)} · <span className="text-[#1C221F]">{n.title}</span></li>)}
          </ul>
        )}
      </Block>

      <Block icon={History} title="History">
        {d.audit.length === 0 ? <p className="text-[13px] text-[#6B7269]">No changes yet.</p> : (
          <ul className="space-y-1.5 text-[12px]">
            {d.audit.map((a) => (
              <li key={a.id} className="flex gap-2"><span className="text-[#9AA096] shrink-0 w-36">{fmtDateTime(a.at)}</span><span><span className="font-semibold">{a.details}</span> <span className="text-[#9AA096]">· {a.admin_email || "student"}</span></span></li>
            ))}
          </ul>
        )}
        <p className="text-[11px] text-[#9AA096]"><Link2 className="inline h-3 w-3" /> Every change made here is recorded with the admin's email.</p>
      </Block>
    </>
  );
}
