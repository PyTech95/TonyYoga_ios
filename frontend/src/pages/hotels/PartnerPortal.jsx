import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import {
  Hotel, CalendarDays, Plus, ChevronRight, FileText, Printer, Copy, Users, Star, ArrowLeft, Check, Clock,
  AlertTriangle, PenLine, Settings, Loader2, ExternalLink, X,
} from "lucide-react";
import { api, API_BASE } from "@/lib/api";
import { isIOSApp } from "@/lib/iosPlatform";
import { useCommerceRefresh } from "@/lib/useCommerceRefresh";
import { LANGUAGES } from "@/i18n";
import PageHeader from "@/components/PageHeader";
import PaymentButtons from "@/components/PaymentButtons";
import {
  fmtDate, fmtDateTime, fmtRange, money, errText, addDays, StatusChip, STAY_STEPS, STATUS, fieldCls, FormField,
} from "./hotelShared";

export default function PartnerPortal() {
  const { t } = useTranslation();
  const [params, setParams] = useSearchParams();
  const [data, setData] = useState(null);
  const [error, setError] = useState(false);
  const stayId = params.get("stay");
  const view = params.get("view") || "stays";

  const load = useCallback(() => {
    api.get("/partner/me").then(({ data }) => { setData(data); setError(false); }).catch(() => setError(true));
  }, []);
  useEffect(() => { load(); }, [load]);
  useCommerceRefresh(load);

  const partners = data?.partners || [];
  const partnerId = params.get("partner");
  const partner = partners.find((p) => p.id === partnerId) || partners[0];
  const go = (next) => setParams(Object.fromEntries(Object.entries({ partner: partnerId, ...next }).filter(([, v]) => v)));

  if (error) {
    return (
      <Shell t={t}>
        <div className="rounded-2xl bg-[#FBEFEA] border border-[#EED9D2] p-4 text-sm text-[#8A3B2A]">
          {t("partner.load_error", "We couldn't load the partner portal.")} <button onClick={load} className="underline font-semibold">{t("common.retry", "Try again")}</button>
        </div>
      </Shell>
    );
  }
  if (!data) {
    return <Shell t={t}><div className="space-y-3" aria-busy="true">{[0, 1, 2].map((i) => <div key={i} className="h-24 rounded-3xl bg-[#F2F2EC] animate-pulse" />)}</div></Shell>;
  }
  if (!partner) {
    return (
      <Shell t={t}>
        <div className="rounded-3xl bg-white border border-[#E5E6DF] p-6" data-testid="partner-none">
          <Hotel className="h-7 w-7 text-[#839682]" />
          {data.pending_application ? (
            <>
              <div className="serif text-2xl mt-3">{t("partner.pending_title", "Your application is being reviewed")}</div>
              <p className="text-[14px] text-[#6B7269] mt-2">{t("partner.pending_body", "We received the application for {{name}}. You'll get an email as soon as your partner portal is ready.", { name: data.pending_application.name })}</p>
            </>
          ) : (
            <>
              <div className="serif text-2xl mt-3">{t("partner.none_title", "No hotel is linked to this account")}</div>
              <p className="text-[14px] text-[#6B7269] mt-2">{t("partner.none_body", "Hotels and resorts can apply to host Yoga with Tony. If your hotel is already a partner, ask us to add this email address.")}</p>
              <Link to="/hotels#apply" className="pill pill-primary mt-5 inline-flex" data-testid="partner-apply-link">{t("partner.apply", "Apply as a hotel")}</Link>
            </>
          )}
        </div>
      </Shell>
    );
  }

  return (
    <Shell t={t} partner={partner}>
      {partners.length > 1 && (
        <select value={partner.id} onChange={(e) => go({ partner: e.target.value })} className={`${fieldCls} mb-4`} data-testid="partner-switch">
          {partners.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
      )}
      {partner.status === "paused" && (
        <div className="mb-4 rounded-2xl bg-[#FBF6EC] border border-[#E0D3B8] p-4 text-[13px] flex gap-2" data-testid="partner-paused">
          <AlertTriangle className="h-4 w-4 text-[#B25A45] shrink-0 mt-0.5" />{t("partner.paused", "Your partner account is paused. You can see your stays, but new requests are off. Please contact Tony Yoga.")}
        </div>
      )}
      {stayId ? (
        <StayDetail key={stayId} stayId={stayId} onBack={() => go({ view: "stays" })} onChanged={load} t={t} />
      ) : (
        <>
          <div className="flex flex-wrap gap-2 mb-5">
            {[["stays", t("partner.tab_stays", "Stays"), CalendarDays], ["request", t("partner.tab_request", "Request a programme"), Plus], ["profile", t("partner.tab_profile", "Hotel details"), Settings]].map(([k, label, Icon]) => (
              <button key={k} onClick={() => go({ view: k })} data-testid={`partner-tab-${k}`}
                className={`inline-flex items-center gap-1.5 rounded-full px-4 py-2 text-[13px] font-semibold border ${view === k ? "bg-[#1C221F] text-white border-[#1C221F]" : "bg-white border-[#E5E6DF]"}`}>
                <Icon className="h-4 w-4" />{label}
              </button>
            ))}
          </div>
          {view === "stays" && <StaysList partner={partner} onOpen={(id) => go({ stay: id })} onRequest={() => go({ view: "request" })} t={t} />}
          {view === "request" && <RequestForm partner={partner} t={t} onDone={(id) => { load(); go({ stay: id }); }} />}
          {view === "profile" && <ProfileForm partner={partner} t={t} onSaved={load} />}
        </>
      )}
    </Shell>
  );
}

function Shell({ t, partner, children }) {
  return (
    <div data-testid="partner-portal" className="pb-24">
      <PageHeader eyebrow={partner ? `${t("partner.eyebrow", "Partner portal")} · ${[partner.city, partner.country].filter(Boolean).join(", ")}` : t("partner.eyebrow", "Partner portal")}
        title={partner?.name || t("partner.title", "Hotel partners")} testId="partner-header" width="max-w-3xl" />
      <div className="mx-auto max-w-3xl px-5">{children}</div>
    </div>
  );
}

// ---------------------------------------------------------------------------
function StaysList({ partner, onOpen, onRequest, t }) {
  const stays = partner.stays || [];
  const upcoming = stays.filter((s) => !["completed", "cancelled"].includes(s.status));
  const past = stays.filter((s) => ["completed", "cancelled"].includes(s.status));
  if (!stays.length) {
    return (
      <div className="rounded-3xl bg-white border border-[#E5E6DF] p-6 text-center" data-testid="partner-no-stays">
        <CalendarDays className="h-8 w-8 text-[#839682] mx-auto" />
        <div className="serif text-2xl mt-3">{t("partner.no_stays", "Plan your first programme")}</div>
        <p className="text-[14px] text-[#6B7269] mt-2">{t("partner.no_stays_body", "Choose a programme and dates. We'll send you a quote to sign online.")}</p>
        {partner.status === "approved" && <button onClick={onRequest} className="pill pill-primary mt-5" data-testid="partner-first-request">{t("partner.request", "Request a programme")}</button>}
      </div>
    );
  }
  const row = (s) => (
    <li key={s.id}>
      <button onClick={() => onOpen(s.id)} data-testid={`partner-stay-${s.id}`} className="w-full text-left rounded-3xl bg-white border border-[#E5E6DF] p-4 sm:p-5 hover:border-[#B25A45] transition flex items-center gap-4">
        <div className="h-12 w-12 rounded-2xl bg-[#FBF1EE] flex flex-col items-center justify-center shrink-0 text-[#B25A45] leading-none">
          <span className="text-[10px] uppercase font-bold">{new Date(`${s.start_date}T12:00:00`).toLocaleDateString(undefined, { month: "short" })}</span>
          <span className="text-lg font-semibold">{s.start_date.slice(8, 10)}</span>
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-[15px] font-semibold truncate">{s.package_name}</div>
          <div className="text-[12px] text-[#6B7269] mt-0.5">{fmtRange(s.start_date, s.end_date)} · {t("partner.guests_n", "~{{n}} guests", { n: s.guests_expected })}{s.guests ? ` · ${t("partner.registered_n", "{{n}} registered", { n: s.guests })}` : ""}</div>
          <div className="mt-2"><StatusChip status={s.status} testId={`partner-stay-status-${s.id}`} /></div>
        </div>
        <ChevronRight className="h-5 w-5 text-[#C3C6BE] shrink-0" />
      </button>
    </li>
  );
  return (
    <div className="space-y-6">
      {upcoming.length > 0 && <ul className="space-y-3" data-testid="partner-stays-upcoming">{upcoming.map(row)}</ul>}
      {past.length > 0 && (
        <div>
          <div className="eyebrow !text-[#839682] mb-2">{t("partner.past", "Past and cancelled")}</div>
          <ul className="space-y-3">{past.map(row)}</ul>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
function RequestForm({ partner, t, onDone }) {
  const [info, setInfo] = useState(null);
  const [avail, setAvail] = useState(null);
  const [form, setForm] = useState({ package_id: "", start_date: "", guests_expected: 10, addons: {}, languages: ["en"], notes: "" });
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api.get("/hotels/info").then(({ data }) => {
      setInfo(data);
      setForm((f) => ({ ...f, package_id: f.package_id || data.packages?.[0]?.id || "custom" }));
    }).catch(() => setInfo({ packages: [], addons: [] }));
    api.get("/partner/availability", { params: { days: 400 } }).then(({ data }) => {
      setAvail(data);
      setForm((f) => ({ ...f, start_date: f.start_date || data.earliest }));
    }).catch(() => setAvail({ blocked: [], earliest: addDays(new Date().toISOString().slice(0, 10), 21) }));
  }, []);

  const pkg = info?.packages?.find((p) => p.id === form.package_id);
  const days = pkg?.days || 3;
  const end = form.start_date ? addDays(form.start_date, days - 1) : "";
  const clash = useMemo(() => (avail?.blocked || []).find((b) => form.start_date && b.start_date <= end && b.end_date >= form.start_date), [avail, form.start_date, end]);
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));
  const toggleLang = (code) => setForm((f) => ({ ...f, languages: f.languages.includes(code) ? f.languages.filter((c) => c !== code) : [...f.languages, code] }));

  if (partner.status !== "approved") {
    return <div className="rounded-3xl bg-white border border-[#E5E6DF] p-5 text-[14px] text-[#6B7269]">{t("partner.request_off", "New requests are off while your partner account is paused.")}</div>;
  }
  if (!info || !avail) return <div className="h-64 rounded-3xl bg-[#F2F2EC] animate-pulse" />;

  const submit = async (e) => {
    e.preventDefault();
    if (busy || clash) return;
    setBusy(true);
    try {
      const { data } = await api.post("/partner/stays", {
        partner_id: partner.id,
        package_id: form.package_id === "custom" ? null : form.package_id,
        start_date: form.start_date,
        guests_expected: Number(form.guests_expected),
        addons: Object.entries(form.addons).filter(([, q]) => Number(q) > 0).map(([id, qty]) => ({ id, qty: Number(qty) })),
        languages: form.languages,
        notes: form.notes || null,
      });
      toast.success(t("partner.requested", "Request sent. We'll prepare your quote."));
      onDone(data.id);
    } catch (err) { toast.error(errText(err)); }
    finally { setBusy(false); }
  };

  return (
    <form onSubmit={submit} className="space-y-5" data-testid="partner-request-form">
      <div className="rounded-3xl bg-white border border-[#E5E6DF] p-5 space-y-4">
        <FormField label={t("partner.f_programme", "Programme")}>
          <div className="grid gap-2 sm:grid-cols-2">
            {[...(info.packages || []), { id: "custom", name: t("partner.custom", "Custom programme"), summary: t("partner.custom_hint", "Tell us what you have in mind."), days: 3 }].map((p) => (
              <button type="button" key={p.id} onClick={() => set("package_id", p.id)} data-testid={`partner-pkg-${p.id}`}
                className={`text-left rounded-2xl border p-4 transition ${form.package_id === p.id ? "border-[#B25A45] bg-[#FBF1EE]" : "border-[#E5E6DF] bg-white"}`}>
                <div className="text-[11px] uppercase tracking-widest font-semibold text-[#839682]">{p.id === "custom" ? t("partner.any_length", "Any length") : t("hotels.days", "{{n}} days", { n: p.days })}</div>
                <div className="font-semibold mt-0.5">{p.name}</div>
                {p.summary && <div className="text-[12px] text-[#6B7269] mt-1">{p.summary}</div>}
                {p.min_guests && <div className="text-[12px] text-[#6B7269] mt-1">{t("hotels.guests_range", "{{a}}–{{b}} guests", { a: p.min_guests, b: p.max_guests })}</div>}
              </button>
            ))}
          </div>
        </FormField>
        <div className="grid gap-4 sm:grid-cols-2">
          <FormField label={t("partner.f_start", "First day")} hint={end ? t("partner.ends", "Ends {{date}} ({{n}} days)", { date: fmtDate(end), n: days }) : null}>
            <input type="date" required min={avail.earliest} value={form.start_date} onChange={(e) => set("start_date", e.target.value)} className={fieldCls} data-testid="partner-f-start" />
          </FormField>
          <FormField label={t("partner.f_guests", "Expected guests")}>
            <input type="number" required min={1} max={500} value={form.guests_expected} onChange={(e) => set("guests_expected", e.target.value)} className={fieldCls} data-testid="partner-f-guests" />
          </FormField>
        </div>
        {clash && (
          <div className="rounded-2xl bg-[#FBEFEA] border border-[#EED9D2] p-3 text-[13px] text-[#8A3B2A] flex gap-2" data-testid="partner-clash">
            <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />{t("partner.clash", "These dates overlap {{a}} – {{b}}, which isn't available. Please choose other dates.", { a: fmtDate(clash.start_date), b: fmtDate(clash.end_date) })}
          </div>
        )}
        {avail.blocked?.length > 0 && (
          <details className="text-[13px]">
            <summary className="cursor-pointer text-[#6B7269]">{t("partner.unavailable", "Dates that aren't available ({{n}})", { n: avail.blocked.length })}</summary>
            <ul className="mt-2 space-y-1">{avail.blocked.map((b, i) => <li key={i} className="text-[#545E56]">{fmtRange(b.start_date, b.end_date)} · {b.reason}</li>)}</ul>
          </details>
        )}
      </div>

      {info.addons?.length > 0 && (
        <div className="rounded-3xl bg-white border border-[#E5E6DF] p-5">
          <div className="eyebrow !text-[10px] mb-3">{t("partner.f_addons", "Add-ons (optional)")}</div>
          <ul className="space-y-2">
            {info.addons.map((a) => (
              <li key={a.id} className="flex items-center justify-between gap-3">
                <div className="min-w-0"><div className="text-[14px] font-medium">{a.name}</div><div className="text-[12px] text-[#6B7269]">{money(a.price, pkg?.currency || "eur")} · {a.unit}</div></div>
                <input type="number" min={0} max={50} value={form.addons[a.id] || 0} onChange={(e) => setForm((f) => ({ ...f, addons: { ...f.addons, [a.id]: e.target.value } }))}
                  className="w-20 rounded-xl border border-[#E5E6DF] px-3 py-2 text-[14px] text-center" data-testid={`partner-addon-${a.id}`} aria-label={a.name} />
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="rounded-3xl bg-white border border-[#E5E6DF] p-5 space-y-4">
        <FormField label={t("partner.f_languages", "Languages your guests speak")}>
          <div className="flex flex-wrap gap-2">
            {LANGUAGES.map((l) => (
              <button type="button" key={l.code} onClick={() => toggleLang(l.code)} data-testid={`partner-lang-${l.code}`}
                className={`rounded-full border px-3 py-1.5 text-[12px] font-semibold ${form.languages.includes(l.code) ? "bg-[#1C221F] text-white border-[#1C221F]" : "bg-white border-[#E5E6DF]"}`}>
                {l.native}
              </button>
            ))}
          </div>
        </FormField>
        <FormField label={t("partner.f_notes", "Notes (space, guests, timing)")}>
          <textarea rows={3} value={form.notes} onChange={(e) => set("notes", e.target.value)} className={fieldCls} data-testid="partner-f-notes" />
        </FormField>
      </div>

      <button disabled={busy || !!clash || !form.start_date} className="pill pill-primary w-full sm:w-auto !px-8" data-testid="partner-request-submit">
        {busy ? t("partner.sending", "Sending…") : t("partner.send_request", "Send request")}
      </button>
    </form>
  );
}

// ---------------------------------------------------------------------------
function StayDetail({ stayId, onBack, onChanged, t }) {
  const [stay, setStay] = useState(null);
  const [error, setError] = useState("");
  const [sign, setSign] = useState({ name: "", accept: false });
  const [busy, setBusy] = useState(false);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [poster, setPoster] = useState(false);

  const load = useCallback(() => {
    api.get(`/partner/stays/${stayId}`).then(({ data }) => { setStay(data); setError(""); }).catch((e) => setError(errText(e, t("partner.stay_error", "We couldn't load this stay."))));
  }, [stayId, t]);
  useEffect(() => { load(); }, [load]);
  useCommerceRefresh(load);

  // Just back from paying: the payment may take a moment to be confirmed.
  const status = stay?.status;
  useEffect(() => {
    if (!["signed", "deposit_paid"].includes(status)) return undefined;
    const id = setInterval(load, 15000);
    const stop = setTimeout(() => clearInterval(id), 4 * 60000);
    return () => { clearInterval(id); clearTimeout(stop); };
  }, [status, load]);

  if (error) return <div className="rounded-2xl bg-[#FBEFEA] border border-[#EED9D2] p-4 text-sm text-[#8A3B2A]">{error} <button onClick={onBack} className="underline font-semibold">{t("partner.back", "Back")}</button></div>;
  if (!stay) return <div className="h-64 rounded-3xl bg-[#F2F2EC] animate-pulse" />;

  const q = stay.quote;
  const cur = q?.currency || "eur";
  const stepIdx = STAY_STEPS.indexOf(stay.status);
  const cancelled = stay.status === "cancelled";
  const guestPageReady = ["deposit_paid", "confirmed", "completed"].includes(stay.status) && stay.guest_page;
  const qrSrc = stay.slug ? `${API_BASE}/stay/${stay.slug}/qr.svg` : "";

  const doSign = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      await api.post(`/partner/stays/${stayId}/sign`, { signed_name: sign.name.trim(), accept: sign.accept });
      toast.success(t("partner.signed", "Agreement signed. The deposit is next."));
      load(); onChanged();
    } catch (err) { toast.error(errText(err)); }
    finally { setBusy(false); }
  };
  const doCancel = async () => {
    setBusy(true);
    try {
      await api.post(`/partner/stays/${stayId}/cancel`, { reason });
      toast.success(t("partner.cancelled", "The stay was cancelled. We'll be in touch about any refund."));
      setCancelOpen(false); load(); onChanged();
    } catch (err) { toast.error(errText(err)); }
    finally { setBusy(false); }
  };
  const copy = async () => {
    try { await navigator.clipboard.writeText(stay.guest_page); toast.success(t("partner.copied", "Link copied")); }
    catch { toast(stay.guest_page); }
  };

  return (
    <div className="space-y-5" data-testid="partner-stay-detail">
      <button onClick={onBack} className="inline-flex items-center gap-1.5 text-[13px] font-semibold text-[#6B7269]" data-testid="partner-stay-back"><ArrowLeft className="h-4 w-4" />{t("partner.all_stays", "All stays")}</button>

      <div className="rounded-3xl bg-white border border-[#E5E6DF] p-5 sm:p-6">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="serif text-3xl leading-tight">{stay.package_name}</div>
            <div className="text-[13px] text-[#6B7269] mt-1">{fmtRange(stay.start_date, stay.end_date)} · {t("partner.guests_n", "~{{n}} guests", { n: stay.guests_expected })}</div>
            {stay.teacher_name && <div className="text-[13px] text-[#6B7269]">{t("partner.teacher", "Teacher")}: <span className="font-semibold text-[#1C221F]">{stay.teacher_name}</span></div>}
          </div>
          <StatusChip status={stay.status} testId="partner-stay-status" />
        </div>
        {!cancelled && (
          <ol className="mt-5 grid grid-cols-6 gap-1" aria-label={t("partner.progress", "Progress")}>
            {STAY_STEPS.map((s, i) => (
              <li key={s}>
                <div className={`h-1.5 rounded-full ${i <= stepIdx ? "bg-[#B25A45]" : "bg-[#EEF1EC]"}`} />
                <div className={`text-[9px] sm:text-[10px] mt-1 leading-tight ${i <= stepIdx ? "text-[#1C221F] font-semibold" : "text-[#9AA096]"}`}>{STATUS[s].label}</div>
              </li>
            ))}
          </ol>
        )}
        {cancelled && stay.cancel_reason && <p className="mt-3 text-[13px] text-[#6B7269]">{t("partner.cancel_reason", "Reason")}: {stay.cancel_reason}</p>}
      </div>

      {stay.status === "requested" && (
        <div className="rounded-3xl bg-[#FBF6EC] border border-[#E0D3B8] p-5 flex gap-3 text-[14px]" data-testid="partner-waiting-quote">
          <Clock className="h-5 w-5 text-[#B25A45] shrink-0" />
          <div>{t("partner.waiting_quote", "We're preparing your quote. You'll get an email when it's ready to sign.")}</div>
        </div>
      )}

      {q && (
        <section className="rounded-3xl bg-white border border-[#E5E6DF] p-5 sm:p-6" data-testid="partner-quote">
          <div className="flex items-center justify-between gap-3">
            <h2 className="eyebrow !text-[11px]">{t("partner.quote", "Quote")}</h2>
            <Link to={`/partner/invoice/${stay.id}/quote`} className="text-[12px] font-semibold text-[#B25A45] inline-flex items-center gap-1" data-testid="partner-quote-print"><FileText className="h-3.5 w-3.5" />{t("partner.print_quote", "Print quote")}</Link>
          </div>
          <table className="w-full mt-3 text-[14px]">
            <tbody className="divide-y divide-[#EFEFE9]">
              <Line label={t("partner.programme_fee", "{{name}} programme", { name: stay.package_name })} value={money(q.programme_fee, cur)} />
              {q.extra_guests > 0 && <Line label={t("partner.extra_guests", "{{n}} guests above the minimum × {{fee}}", { n: q.extra_guests, fee: money(q.per_guest_fee, cur) })} value={money(q.guest_fee, cur)} />}
              {(q.addons || []).map((a) => <Line key={a.id} label={`${a.name} × ${a.qty}`} value={money(a.total, cur)} />)}
              {(q.extras || []).map((x) => <Line key={x.label} label={x.label} value={money(x.amount, cur)} />)}
              <tr><td className="pt-3 font-semibold">{t("partner.total", "Total")}</td><td className="pt-3 text-right font-semibold text-lg" data-testid="partner-quote-total">{money(q.total, cur)}</td></tr>
            </tbody>
          </table>
          <div className="mt-4 grid gap-2 sm:grid-cols-2 text-[13px]">
            <div className="rounded-2xl bg-[#F7F6F1] p-3">{t("partner.deposit_line", "Deposit {{pct}}%", { pct: q.deposit_percent })}: <span className="font-semibold">{money(q.deposit, cur)}</span>{stay.deposit_paid_at && <span className="text-[#3E7C57] font-semibold"> · {t("partner.paid", "paid")}</span>}</div>
            <div className="rounded-2xl bg-[#F7F6F1] p-3">{t("partner.balance_line", "Balance by {{date}}", { date: fmtDate(q.balance_due) })}: <span className="font-semibold">{money(q.balance, cur)}</span>{stay.balance_paid_at && <span className="text-[#3E7C57] font-semibold"> · {t("partner.paid", "paid")}</span>}</div>
          </div>
          {stay.status === "quoted" && q.valid_until && <p className="text-[12px] text-[#6B7269] mt-3">{t("partner.valid_until", "This quote is valid until {{date}}.", { date: fmtDate(q.valid_until) })}</p>}
          {q.note && <p className="text-[13px] text-[#545E56] mt-3 whitespace-pre-wrap">{q.note}</p>}
          {stay.schedule?.length > 0 && (
            <div className="mt-4">
              <div className="text-[11px] uppercase tracking-widest font-semibold text-[#6B7269] mb-2">{t("partner.schedule", "Schedule")}</div>
              <ul className="space-y-1 text-[13px]">{stay.schedule.map((r, i) => <li key={i}><span className="font-semibold">{t("partner.day_n", "Day {{n}}", { n: r.day })}</span> · {r.time} · {r.title}</li>)}</ul>
            </div>
          )}
        </section>
      )}

      {stay.agreement_text && (
        <section className="rounded-3xl bg-white border border-[#E5E6DF] p-5 sm:p-6" data-testid="partner-agreement">
          <h2 className="eyebrow !text-[11px]">{t("partner.agreement", "Agreement")}</h2>
          <div className="mt-3 rounded-2xl bg-[#F7F6F1] p-4 text-[13px] leading-relaxed whitespace-pre-wrap max-h-80 overflow-auto text-[#2C332F]">{stay.agreement_text}</div>
          {stay.agreement ? (
            <div className="mt-3 flex items-center gap-2 text-[13px] text-[#3E7C57]" data-testid="partner-signed-by">
              <PenLine className="h-4 w-4" />{t("partner.signed_by", "Signed by {{name}} on {{date}}", { name: stay.agreement.signed_name, date: fmtDateTime(stay.agreement.signed_at) })}
            </div>
          ) : stay.status === "quoted" && (
            <form onSubmit={doSign} className="mt-4 space-y-3" data-testid="partner-sign-form">
              <FormField label={t("partner.sign_name", "Type your full name to sign")}>
                <input required minLength={3} value={sign.name} onChange={(e) => setSign((s) => ({ ...s, name: e.target.value }))} className={`${fieldCls} serif italic`} data-testid="partner-sign-name" />
              </FormField>
              <label className="flex items-start gap-3 text-[13px]">
                <input type="checkbox" checked={sign.accept} onChange={(e) => setSign((s) => ({ ...s, accept: e.target.checked }))} className="h-4 w-4 mt-0.5 accent-[#B25A45]" data-testid="partner-sign-accept" />
                <span>{t("partner.sign_accept", "I am authorised to sign for {{hotel}} and accept this agreement, the price and the cancellation terms.", { hotel: stay.partner_name })}</span>
              </label>
              <button disabled={busy || !sign.accept || sign.name.trim().length < 3} className="pill pill-primary" data-testid="partner-sign-submit">{busy ? "…" : t("partner.sign", "Sign agreement")}</button>
            </form>
          )}
          {q?.cancellation_terms && <p className="mt-3 text-[12px] text-[#6B7269] whitespace-pre-wrap">{q.cancellation_terms}</p>}
        </section>
      )}

      {(stay.status === "signed" || stay.status === "deposit_paid") && q && (
        <section className="rounded-3xl bg-[#1C221F] text-[#FAFAF7] p-5 sm:p-6" data-testid={stay.status === "signed" ? "partner-pay-deposit" : "partner-pay-balance"}>
          <div className="text-[11px] uppercase tracking-[0.2em] font-semibold text-[#E8B8A8]">{stay.status === "signed" ? t("partner.deposit_due", "Deposit due") : t("partner.balance_due", "Balance due by {{date}}", { date: fmtDate(q.balance_due) })}</div>
          <div className="serif text-3xl mt-1">{money(stay.status === "signed" ? q.deposit : q.balance, cur)}</div>
          <p className="text-[13px] text-white/70 mt-1">{stay.status === "signed" ? t("partner.deposit_hint", "Paying the deposit confirms your dates and opens the guest page.") : t("partner.balance_hint", "Pay the balance by card or PayPal, or by bank transfer as agreed with us.")}</p>
          <div className="mt-4 max-w-sm">
            {isIOSApp() ? (
              <p className="text-[13px] text-white/80">{t("partner.pay_web", "Please pay on the Tony Yoga website.")}</p>
            ) : (
              <PaymentButtons itemType={stay.status === "signed" ? "hotel_deposit" : "hotel_balance"} itemId={stay.id} allowCredit={false}
                stripeLabel={t("partner.pay_card", "Pay by card")} testIdPrefix={stay.status === "signed" ? "partner-deposit" : "partner-balance"} />
            )}
          </div>
        </section>
      )}

      {guestPageReady && (
        <section className="rounded-3xl bg-white border border-[#E5E6DF] p-5 sm:p-6" data-testid="partner-guest-page">
          <h2 className="eyebrow !text-[11px]">{t("partner.guest_page", "Guest page and QR code")}</h2>
          <div className="mt-3 flex flex-col sm:flex-row gap-5 items-start">
            <img src={qrSrc} alt={t("partner.qr_alt", "QR code for the guest page")} className="h-40 w-40 rounded-2xl border border-[#E5E6DF] bg-white p-2" data-testid="partner-qr" />
            <div className="min-w-0 flex-1 space-y-3">
              <p className="text-[13px] text-[#545E56]">{t("partner.guest_page_hint", "Guests scan the code or open the link to join the classes, accept the waiver and start their free online access.")}</p>
              <div className="rounded-2xl bg-[#F7F6F1] px-3 py-2 text-[12px] break-all" data-testid="partner-guest-link">{stay.guest_page}</div>
              <div className="flex flex-wrap gap-2">
                <button onClick={copy} className="pill pill-ghost !py-2 !px-4 !text-xs" data-testid="partner-copy-link"><Copy className="h-3.5 w-3.5" />{t("partner.copy", "Copy link")}</button>
                <a href={stay.guest_page} target="_blank" rel="noopener noreferrer" className="pill pill-ghost !py-2 !px-4 !text-xs"><ExternalLink className="h-3.5 w-3.5" />{t("partner.open", "Open")}</a>
                <button onClick={() => setPoster(true)} className="pill pill-primary !py-2 !px-4 !text-xs" data-testid="partner-print-poster"><Printer className="h-3.5 w-3.5" />{t("partner.poster", "Print QR poster")}</button>
              </div>
            </div>
          </div>
        </section>
      )}

      {["deposit_paid", "confirmed", "completed"].includes(stay.status) && (
        <section className="rounded-3xl bg-white border border-[#E5E6DF] p-5 sm:p-6" data-testid="partner-guests">
          <div className="flex items-center justify-between gap-3">
            <h2 className="eyebrow !text-[11px] flex items-center gap-1.5"><Users className="h-3.5 w-3.5" />{t("partner.guest_list", "Guest list")} ({stay.guests || 0})</h2>
            {stay.rating_avg && <span className="inline-flex items-center gap-1 text-[13px] font-semibold" data-testid="partner-rating"><Star className="h-4 w-4 fill-[#E0A93B] text-[#E0A93B]" />{stay.rating_avg} · {t("partner.ratings_n", "{{n}} ratings", { n: stay.ratings })}</span>}
          </div>
          {!stay.guest_list?.length ? (
            <p className="text-[13px] text-[#6B7269] mt-3">{t("partner.no_guests", "No guests have registered yet. Share the link or put the QR code in rooms and at reception.")}</p>
          ) : (
            <div className="mt-3 overflow-x-auto">
              <table className="w-full text-[13px] min-w-[520px]">
                <thead><tr className="text-left text-[11px] uppercase tracking-widest text-[#6B7269]"><th className="py-2 pr-3">{t("partner.g_name", "Name")}</th><th className="py-2 pr-3">{t("partner.g_email", "Email")}</th><th className="py-2 pr-3">{t("partner.g_lang", "Lang.")}</th><th className="py-2 pr-3">{t("partner.g_waiver", "Waiver")}</th><th className="py-2">{t("partner.g_rating", "Rating")}</th></tr></thead>
                <tbody className="divide-y divide-[#EFEFE9]">
                  {stay.guest_list.map((g) => (
                    <tr key={g.id} data-testid="partner-guest-row">
                      <td className="py-2 pr-3 font-medium">{g.name}{g.attended && <Check className="inline h-3.5 w-3.5 ml-1 text-[#3E7C57]" />}</td>
                      <td className="py-2 pr-3 text-[#545E56]">{g.email}</td>
                      <td className="py-2 pr-3 uppercase text-[#6B7269]">{g.language || "—"}</td>
                      <td className="py-2 pr-3 text-[#6B7269]">{fmtDateTime(g.waiver_accepted_at)}</td>
                      <td className="py-2">{g.rating ? <span title={g.comment || ""}>{"★".repeat(g.rating)}<span className="text-[#D8D9D1]">{"★".repeat(5 - g.rating)}</span></span> : "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {stay.guest_list?.some((g) => g.comment) && (
            <ul className="mt-4 space-y-2">
              {stay.guest_list.filter((g) => g.comment).map((g) => <li key={g.id} className="rounded-2xl bg-[#F7F6F1] p-3 text-[13px]"><span className="font-semibold">{g.name}:</span> “{g.comment}”</li>)}
            </ul>
          )}
        </section>
      )}

      {q && (stay.deposit_paid_at || stay.balance_paid_at) && (
        <section className="rounded-3xl bg-white border border-[#E5E6DF] p-5" data-testid="partner-invoices">
          <h2 className="eyebrow !text-[11px]">{t("partner.invoices", "Invoices")}</h2>
          <div className="mt-3 flex flex-wrap gap-2">
            {stay.deposit_paid_at && <Link to={`/partner/invoice/${stay.id}/deposit`} className="pill pill-ghost !py-2 !px-4 !text-xs" data-testid="partner-invoice-deposit"><FileText className="h-3.5 w-3.5" />{t("partner.inv_deposit", "Deposit invoice")}</Link>}
            {stay.balance_paid_at && <Link to={`/partner/invoice/${stay.id}/balance`} className="pill pill-ghost !py-2 !px-4 !text-xs" data-testid="partner-invoice-balance"><FileText className="h-3.5 w-3.5" />{t("partner.inv_balance", "Balance invoice")}</Link>}
          </div>
        </section>
      )}

      {stay.history?.length > 0 && (
        <details className="rounded-3xl bg-white border border-[#E5E6DF] p-5 text-[13px]">
          <summary className="font-semibold cursor-pointer">{t("partner.history", "History")}</summary>
          <ul className="mt-3 space-y-1.5">
            {[...stay.history].reverse().map((h, i) => <li key={i} className="text-[#545E56]"><span className="font-semibold text-[#1C221F]">{STATUS[h.status]?.label || h.status}</span> · {fmtDateTime(h.at)}{h.note ? ` · ${h.note}` : ""}</li>)}
          </ul>
        </details>
      )}

      {!["completed", "cancelled"].includes(stay.status) && (
        <div className="pt-2">
          {!cancelOpen ? (
            <button onClick={() => setCancelOpen(true)} className="text-[13px] text-[#B25A45] font-semibold" data-testid="partner-cancel-open">{t("partner.cancel_stay", "Cancel this stay")}</button>
          ) : (
            <div className="rounded-3xl bg-[#FBEFEA] border border-[#EED9D2] p-5 space-y-3" data-testid="partner-cancel-form">
              <div className="font-semibold text-[#8A3B2A]">{t("partner.cancel_title", "Cancel this stay?")}</div>
              {stay.deposit_paid_at && <p className="text-[13px] text-[#8A3B2A]">{t("partner.cancel_paid", "A deposit was paid. Any refund follows the cancellation terms in your agreement.")}</p>}
              <textarea rows={3} value={reason} onChange={(e) => setReason(e.target.value)} placeholder={t("partner.cancel_ph", "Tell us why")} className={fieldCls} data-testid="partner-cancel-reason" />
              <div className="flex gap-2">
                <button onClick={() => setCancelOpen(false)} className="pill pill-ghost !py-2 !px-4 !text-xs">{t("partner.keep", "Keep the stay")}</button>
                <button disabled={busy || reason.trim().length < 3} onClick={doCancel} className="pill !py-2 !px-4 !text-xs bg-[#B25A45] text-white" data-testid="partner-cancel-confirm">{t("partner.cancel_confirm", "Cancel stay")}</button>
              </div>
            </div>
          )}
        </div>
      )}

      {poster && guestPageReady && (
        <div className="fixed inset-0 z-[80] bg-white overflow-auto" data-testid="partner-poster">
          <style>{`@media print { body * { visibility: hidden !important; } .ty-poster, .ty-poster * { visibility: visible !important; } .ty-poster { position: fixed; inset: 0; } .ty-no-print { display: none !important; } }`}</style>
          <div className="ty-no-print flex justify-end gap-2 p-4">
            <button onClick={() => window.print()} className="pill pill-primary !py-2 !px-4 !text-xs" data-testid="partner-poster-print"><Printer className="h-3.5 w-3.5" />{t("partner.print", "Print")}</button>
            <button onClick={() => setPoster(false)} className="pill pill-ghost !py-2 !px-4 !text-xs" data-testid="partner-poster-close"><X className="h-3.5 w-3.5" />{t("partner.close", "Close")}</button>
          </div>
          <div className="ty-poster mx-auto max-w-xl px-8 py-10 text-center text-[#1C221F]">
            <div className="text-[12px] uppercase tracking-[0.3em] text-[#839682] font-semibold">{stay.partner_name} × Tony Yoga</div>
            <h1 className="serif text-5xl mt-4 leading-tight">{t("partner.poster_title", "Yoga with Tony")}</h1>
            <p className="text-lg mt-3">{stay.package_name} · {fmtRange(stay.start_date, stay.end_date)}</p>
            <img src={qrSrc} alt="" className="mx-auto mt-8 h-72 w-72" />
            <p className="mt-6 text-[17px] font-semibold">{t("partner.poster_scan", "Scan to join the classes")}</p>
            <p className="mt-2 text-[14px] text-[#545E56]">{t("partner.poster_free", "Register in one minute and get free access to Tony Yoga online.")}</p>
            <p className="mt-6 text-[12px] text-[#6B7269] break-all">{stay.guest_page}</p>
          </div>
        </div>
      )}
    </div>
  );
}

function Line({ label, value }) {
  return <tr><td className="py-2 pr-3 text-[#545E56]">{label}</td><td className="py-2 text-right whitespace-nowrap">{value}</td></tr>;
}

// ---------------------------------------------------------------------------
function ProfileForm({ partner, t, onSaved }) {
  const fields = [
    ["description", t("partner.p_description", "About your hotel (shown on the guest page)"), "textarea"],
    ["logo", t("partner.p_logo", "Logo image link (https://)")],
    ["cover_image", t("partner.p_cover", "Cover photo link (https://)")],
    ["website", t("partner.p_website", "Website")],
    ["phone", t("partner.p_phone", "Phone")],
    ["address", t("partner.p_address", "Address")],
    ["billing_name", t("partner.p_billing_name", "Company name for invoices")],
    ["billing_address", t("partner.p_billing_address", "Billing address"), "textarea"],
    ["vat_number", t("partner.p_vat", "VAT number")],
  ];
  const [form, setForm] = useState(() => Object.fromEntries(fields.map(([k]) => [k, partner[k] || ""])));
  const [busy, setBusy] = useState(false);
  const save = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      await api.patch(`/partner/profile/${partner.id}`, form);
      toast.success(t("partner.saved", "Hotel details saved"));
      onSaved();
    } catch (err) { toast.error(errText(err)); }
    finally { setBusy(false); }
  };
  return (
    <form onSubmit={save} className="rounded-3xl bg-white border border-[#E5E6DF] p-5 space-y-4" data-testid="partner-profile-form">
      {fields.map(([k, label, kind]) => (
        <FormField key={k} label={label}>
          {kind === "textarea"
            ? <textarea rows={3} value={form[k]} onChange={(e) => setForm((f) => ({ ...f, [k]: e.target.value }))} className={fieldCls} data-testid={`partner-p-${k}`} />
            : <input value={form[k]} onChange={(e) => setForm((f) => ({ ...f, [k]: e.target.value }))} className={fieldCls} data-testid={`partner-p-${k}`} />}
        </FormField>
      ))}
      {form.logo && <img src={form.logo} alt="" className="h-16 w-auto rounded-xl border border-[#E5E6DF]" />}
      <button disabled={busy} className="pill pill-primary" data-testid="partner-profile-save">{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : t("partner.save", "Save details")}</button>
    </form>
  );
}
