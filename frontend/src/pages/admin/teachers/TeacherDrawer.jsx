import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { X, BadgeCheck, CreditCard, GraduationCap, Landmark, CalendarDays, Users, Mail, ExternalLink, Check } from "lucide-react";
import { api } from "@/lib/api";
import { Field, inputCls, Toggle } from "../shared";

const STATUS_STYLE = {
  applied: "bg-[#F3E7C9] text-[#8A6D3B]", approved: "bg-[#E4F0E8] text-[#3E7C57]", paused: "bg-[#F2F2EC] text-[#6B7269]",
  removed: "bg-[#FBEFEA] text-[#B25A45]", declined: "bg-[#FBEFEA] text-[#B25A45]",
};

export function StatusChip({ status }) {
  return <span className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-widest ${STATUS_STYLE[status] || STATUS_STYLE.paused}`}>{status}</span>;
}

export const fmtDate = (iso) => {
  if (!iso) return "—";
  const d = new Date(String(iso).length === 10 ? `${iso}T12:00:00` : iso);
  return Number.isNaN(d.getTime()) ? String(iso).slice(0, 10) : d.toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
};

export const moneyMap = (m) => {
  const e = Object.entries(m || {});
  if (!e.length) return "—";
  return e.map(([c, v]) => { try { return new Intl.NumberFormat(undefined, { style: "currency", currency: c.toUpperCase() }).format(v); } catch { return `${v} ${c}`; } }).join(" · ");
};

const errText = (e) => {
  const d = e?.response?.data?.detail;
  return Array.isArray(d) ? d.map((x) => x.msg).join(", ") : d || "Something went wrong";
};

function Block({ icon: Icon, title, children }) {
  return (
    <section className="rounded-2xl bg-white border border-[#E5E6DF] p-4 space-y-3">
      <div className="flex items-center gap-2"><Icon className="h-4 w-4 text-[#B25A45]" /><h3 className="text-[13px] font-bold uppercase tracking-widest">{title}</h3></div>
      {children}
    </section>
  );
}

const btn = "inline-flex items-center gap-1.5 rounded-full border border-[#E5E6DF] bg-white px-3 py-1.5 text-[12px] font-semibold hover:border-[#B25A45] disabled:opacity-50";
const primary = "inline-flex items-center gap-1.5 rounded-full bg-[#B25A45] px-4 py-2 text-[13px] font-semibold text-white disabled:opacity-50";

export default function TeacherDrawer({ teacherId, tiers, onClose, onChanged }) {
  const [d, setD] = useState(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [form, setForm] = useState(null);
  const [comp, setComp] = useState("");
  const [verify, setVerify] = useState([]);

  const load = useCallback(() => {
    api.get(`/admin/teachers/${teacherId}`).then(({ data }) => {
      setD(data);
      setForm({ tier_id: data.tier_id || "", featured: !!data.featured, certificate_level: data.certificate?.level || "", certificate_renews_at: data.certificate?.renews_at || "", admin_note: data.admin_note || "" });
    }).catch((e) => { toast.error(errText(e)); onClose(); });
  }, [teacherId, onClose]);
  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    const onKey = (e) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const patch = async (body, ok) => {
    setBusy(true);
    try { await api.patch(`/admin/teachers/${teacherId}`, body); toast.success(ok || "Saved"); load(); onChanged?.(); return true; }
    catch (e) { toast.error(errText(e)); return false; }
    finally { setBusy(false); }
  };
  const setStatus = async (status) => {
    if (["removed", "declined"].includes(status) && !window.confirm(`Mark this teacher as ${status}?`)) return;
    if (await patch({ status, message: message.trim() || undefined }, `Teacher ${status}`)) setMessage("");
  };

  const b = d?.billing || {};
  const cert = d?.certificate || {};
  const tax = d?.tax;

  return (
    <div className="fixed inset-0 z-[60] flex justify-end" data-testid="teacher-drawer">
      <button aria-label="Close" className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative h-full w-full max-w-[720px] bg-[#FAFAF7] shadow-2xl flex flex-col">
        <div className="flex items-start justify-between gap-3 border-b border-[#E5E6DF] bg-white px-5 py-4">
          {d ? (
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="serif text-2xl leading-tight" data-testid="teacher-drawer-name">{d.display_name}</h2>
                <StatusChip status={d.status} />
                {d.listed && <span className="text-[10px] uppercase tracking-widest font-bold text-[#3E7C57]">Listed</span>}
              </div>
              <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-[12px] text-[#6B7269]">
                <a href={`mailto:${d.email}`} className="inline-flex items-center gap-1 hover:text-[#B25A45]"><Mail className="h-3.5 w-3.5" />{d.email}</a>
                <span>{[d.city, d.country].filter(Boolean).join(", ")}</span>
                <span>Applied {fmtDate(d.applied_at)}</span>
                <a href={`/teachers/${d.slug}`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-[#B25A45]"><ExternalLink className="h-3.5 w-3.5" />Profile</a>
              </div>
            </div>
          ) : <div className="h-14 w-64 rounded-xl bg-[#F2F2EC] animate-pulse" />}
          <button onClick={onClose} className="h-9 w-9 rounded-full hover:bg-[#F2F2EC] flex items-center justify-center shrink-0" aria-label="Close" data-testid="teacher-drawer-close"><X className="h-5 w-5" /></button>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {!d || !form ? <div className="space-y-3">{[0, 1, 2].map((i) => <div key={i} className="h-28 rounded-2xl bg-[#F2F2EC] animate-pulse" />)}</div> : (
            <>
              <Block icon={BadgeCheck} title="Decision">
                <textarea rows={2} className={inputCls} placeholder="Optional message to the teacher (sent with the decision)" value={message} onChange={(e) => setMessage(e.target.value)} data-testid="teacher-message" />
                <div className="flex flex-wrap gap-2">
                  {d.status !== "approved" && <button className={primary} disabled={busy} onClick={() => setStatus("approved")} data-testid="teacher-approve">{d.status === "applied" ? "Approve" : "Restore"}</button>}
                  {d.status === "approved" && <button className={btn} disabled={busy} onClick={() => setStatus("paused")} data-testid="teacher-pause">Pause</button>}
                  {d.status === "applied" && <button className={btn} disabled={busy} onClick={() => setStatus("declined")} data-testid="teacher-decline">Decline</button>}
                  {!["removed", "declined"].includes(d.status) && <button className={btn} disabled={busy} onClick={() => setStatus("removed")} data-testid="teacher-remove">Remove</button>}
                </div>
                <div className="text-[13px] text-[#545E56] space-y-1.5 border-t border-[#F0F0EA] pt-3">
                  {d.headline && <div className="font-semibold">{d.headline}</div>}
                  <div className="whitespace-pre-line">{d.bio}</div>
                  <div><span className="text-[#9AA096]">Training with Tony:</span> {d.trainings || "—"}</div>
                  <div><span className="text-[#9AA096]">Experience:</span> {d.experience_years != null ? `${d.experience_years} years` : "—"} · <span className="text-[#9AA096]">Languages:</span> {(d.languages || []).join(", ") || "—"} · <span className="text-[#9AA096]">Styles:</span> {(d.styles || []).join(", ") || "—"}</div>
                  <div>{d.online ? "Online" : ""}{d.online && d.in_person ? " · " : ""}{d.in_person ? "In person" : ""}{d.website ? <> · <a href={d.website} target="_blank" rel="noreferrer" className="text-[#B25A45]">website</a></> : null}{d.instagram ? ` · ${d.instagram}` : ""}</div>
                </div>
              </Block>

              <Block icon={GraduationCap} title="Plan, badge & certificate">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <Field label="Tier">
                    <select className={inputCls} value={form.tier_id} onChange={(e) => setForm((f) => ({ ...f, tier_id: e.target.value }))} data-testid="teacher-tier">
                      {tiers.map((t) => <option key={t.id} value={t.id}>{t.name} · {t.price} {String(t.currency || "").toUpperCase()}</option>)}
                    </select>
                  </Field>
                  <Field label="Featured in the directory"><Toggle checked={form.featured} onChange={(v) => setForm((f) => ({ ...f, featured: v }))} tid="teacher-featured" /></Field>
                  <Field label="Certificate level"><input className={inputCls} value={form.certificate_level} onChange={(e) => setForm((f) => ({ ...f, certificate_level: e.target.value }))} placeholder="Core 26+ teacher" data-testid="teacher-cert-level" /></Field>
                  <Field label="Renews on" hint={cert.id ? `Certificate ${cert.id} · issued ${fmtDate(cert.issued_at)}` : "Issued automatically on approval"}>
                    <input type="date" className={inputCls} value={form.certificate_renews_at} onChange={(e) => setForm((f) => ({ ...f, certificate_renews_at: e.target.value }))} data-testid="teacher-cert-renews" />
                  </Field>
                </div>
                <Field label="Private note (admins only)"><textarea rows={2} className={inputCls} value={form.admin_note} onChange={(e) => setForm((f) => ({ ...f, admin_note: e.target.value }))} /></Field>
                <button className={primary} disabled={busy} data-testid="teacher-save"
                  onClick={() => patch({ tier_id: form.tier_id || undefined, featured: form.featured, certificate_level: form.certificate_level || undefined, certificate_renews_at: form.certificate_renews_at || undefined, admin_note: form.admin_note })}>Save</button>
              </Block>

              <Block icon={CreditCard} title="Monthly fee">
                <div className="text-[13px] text-[#545E56]" data-testid="teacher-billing-state">
                  {b.mode === "comped" ? `Waived ${b.paid_until ? `until ${fmtDate(b.paid_until)}` : "with no end date"}${b.comped_by ? ` by ${b.comped_by}` : ""}.`
                    : b.mode === "stripe" ? `Stripe subscription · ${b.status}${b.paid_until ? ` · paid until ${fmtDate(b.paid_until)}` : ""}`
                      : b.mode === "free" ? "Free tier." : "Not started."}
                  {" "}{d.listed ? "Listed in the directory." : "Not listed."}
                </div>
                <div className="flex flex-wrap items-end gap-2">
                  <Field label="Waive the fee until"><input type="date" className={inputCls} value={comp} onChange={(e) => setComp(e.target.value)} data-testid="teacher-comp-date" /></Field>
                  <button className={btn} disabled={busy || !comp} onClick={() => patch({ comp_until: comp }, "Fee waived").then((ok) => ok && setComp(""))} data-testid="teacher-comp">Waive until date</button>
                  <button className={btn} disabled={busy} onClick={() => patch({ comp_until: "forever" }, "Fee waived")} data-testid="teacher-comp-forever">Waive with no end</button>
                  {b.mode === "comped" && <button className={btn} disabled={busy} onClick={() => patch({ end_comp: true }, "Waiver ended")} data-testid="teacher-end-comp">End waiver</button>}
                </div>
                {d.fees?.length > 0 && (
                  <ul className="text-[12px] text-[#6B7269] space-y-1 border-t border-[#F0F0EA] pt-2">
                    {d.fees.slice(0, 12).map((f) => <li key={f.id}>{fmtDate(f.paid_at)} · {moneyMap({ [String(f.currency || "eur").toUpperCase()]: f.amount })}</li>)}
                  </ul>
                )}
              </Block>

              <Block icon={CalendarDays} title="Teaching">
                <div className="grid grid-cols-3 gap-2 text-center">
                  <div className="rounded-xl bg-[#FAFAF7] p-2"><div className="serif text-xl">{(d.offerings || []).filter((o) => o.active).length}</div><div className="text-[10px] uppercase tracking-widest text-[#839682]">Active</div></div>
                  <div className="rounded-xl bg-[#FAFAF7] p-2"><div className="serif text-xl inline-flex items-center gap-1"><Users className="h-4 w-4" />{(d.students || []).length}</div><div className="text-[10px] uppercase tracking-widest text-[#839682]">Students</div></div>
                  <div className="rounded-xl bg-[#FAFAF7] p-2"><div className="serif text-base">{moneyMap(d.income?.total)}</div><div className="text-[10px] uppercase tracking-widest text-[#839682]">This year</div></div>
                </div>
                {(d.offerings || []).length > 0 && (
                  <ul className="text-[13px] space-y-1">
                    {d.offerings.map((o) => <li key={o.id} className="flex justify-between gap-2"><span className={o.active ? "" : "text-[#9AA096]"}>{o.title} <span className="text-[#9AA096]">· {o.kind}</span></span><span className="text-[#6B7269]">{Number(o.price) > 0 ? `${o.price} ${String(o.currency || "").toUpperCase()}` : "free"}</span></li>)}
                  </ul>
                )}
                <div className="text-[12px] text-[#6B7269]">Payments: {d.payment_mode === "online" ? "online through their Stripe" : "in person"}{d.stripe_account_id ? ` · Stripe ${d.charges_enabled ? "ready" : "not finished"}` : " · Stripe not connected"}</div>
              </Block>

              <Block icon={GraduationCap} title="Continuing education">
                {(d.ce || []).length === 0 ? <p className="text-[13px] text-[#6B7269]">No hours logged.</p> : (
                  <>
                    <ul className="space-y-1.5">
                      {d.ce.map((x) => (
                        <li key={x.id} className="flex items-center gap-2 text-[13px]">
                          {x.status === "verified" ? <Check className="h-4 w-4 text-[#3E7C57]" /> : (
                            <input type="checkbox" className="h-4 w-4 accent-[#B25A45]" checked={verify.includes(x.id)} onChange={(e) => setVerify((v) => (e.target.checked ? [...v, x.id] : v.filter((y) => y !== x.id)))} data-testid={`teacher-ce-${x.id}`} />
                          )}
                          <span className="flex-1">{fmtDate(x.date)} · <span className="font-semibold">{x.title}</span> · {x.hours} h{x.provider ? ` · ${x.provider}` : ""}</span>
                          {x.certificate_url && <a href={x.certificate_url} target="_blank" rel="noreferrer" className="text-[#B25A45] text-[12px]">proof</a>}
                        </li>
                      ))}
                    </ul>
                    {verify.length > 0 && <button className={btn} disabled={busy} onClick={() => patch({ verify_ce_ids: verify }, "Hours verified").then((ok) => ok && setVerify([]))} data-testid="teacher-ce-verify">Verify {verify.length} entr{verify.length === 1 ? "y" : "ies"}</button>}
                  </>
                )}
              </Block>

              <Block icon={Landmark} title="Tax details (DAC7)">
                {tax ? (
                  <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-1 text-[13px]" data-testid="teacher-tax">
                    <div><dt className="text-[11px] text-[#9AA096]">Legal name</dt><dd>{tax.legal_name}</dd></div>
                    <div><dt className="text-[11px] text-[#9AA096]">Type</dt><dd>{tax.entity}</dd></div>
                    <div><dt className="text-[11px] text-[#9AA096]">Tax ID</dt><dd>{tax.tax_id}</dd></div>
                    <div><dt className="text-[11px] text-[#9AA096]">VAT</dt><dd>{tax.vat_number || "—"}</dd></div>
                    <div><dt className="text-[11px] text-[#9AA096]">Date of birth</dt><dd>{tax.date_of_birth || "—"}</dd></div>
                    <div><dt className="text-[11px] text-[#9AA096]">Residence</dt><dd>{tax.country_of_residence}</dd></div>
                    <div className="sm:col-span-2"><dt className="text-[11px] text-[#9AA096]">Address</dt><dd>{tax.address}</dd></div>
                  </dl>
                ) : <p className="text-[13px] text-[#8A6D3B]">Not provided yet. Needed before the yearly DAC7 report if they're paid online.</p>}
              </Block>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
