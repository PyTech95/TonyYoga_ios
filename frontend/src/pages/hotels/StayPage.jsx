import { useEffect, useState } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { Sun, Moon, CalendarDays, User, Sparkles, CheckCircle2, Mail, Star, Leaf, MapPin } from "lucide-react";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { LANGUAGES } from "@/i18n";
import Logo from "@/components/Logo";
import { fmtRange, errText, Ticks, fieldCls, FormField } from "./hotelShared";

/** Co-branded guest page for a hotel stay: programme, registration with waiver, feedback after the stay. */
export default function StayPage() {
  const { t, i18n } = useTranslation();
  const { slug } = useParams();
  const [params] = useSearchParams();
  const feedbackToken = params.get("feedback");
  const { user } = useAuth();
  const [page, setPage] = useState(null);
  const [missing, setMissing] = useState(false);
  const [form, setForm] = useState({ name: "", email: "", language: (i18n.resolvedLanguage || "en").split("-")[0], waiver: false, marketing: false });
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(null);

  useEffect(() => {
    api.get(`/stay/${slug}`).then(({ data }) => setPage(data)).catch(() => setMissing(true));
  }, [slug]);
  useEffect(() => {
    if (user) setForm((f) => ({ ...f, name: f.name || user.name || "", email: f.email || user.email || "" }));
  }, [user]);

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.type === "checkbox" ? e.target.checked : e.target.value }));

  const register = async (e) => {
    e.preventDefault();
    if (busy) return;
    if (!form.waiver) { toast.error(t("stay.waiver_needed", "Please accept the waiver to join the classes.")); return; }
    setBusy(true);
    try {
      const { data } = await api.post(`/stay/${slug}/register`, { ...form, name: form.name.trim(), email: form.email.trim() });
      setDone(data);
    } catch (err) { toast.error(errText(err)); }
    finally { setBusy(false); }
  };

  if (missing) {
    return (
      <div className="min-h-[70vh] flex items-center justify-center px-6" data-testid="stay-missing">
        <div className="text-center max-w-sm">
          <Leaf className="h-8 w-8 text-[#839682] mx-auto" />
          <div className="serif text-3xl mt-3">{t("stay.missing_title", "This page isn't available")}</div>
          <p className="text-[14px] text-[#6B7269] mt-2">{t("stay.missing_body", "The link may be old or the programme isn't confirmed yet. Please ask at the reception.")}</p>
          <Link to="/" className="pill pill-ghost mt-5 inline-flex">Tony Yoga</Link>
        </div>
      </div>
    );
  }
  if (!page) return <div className="h-[70vh] bg-[#F2F2EC] animate-pulse" />;

  const { hotel, programme } = page;

  return (
    <div data-testid="stay-page" className="pb-24">
      <section className="relative overflow-hidden bg-[#1C221F] text-[#FAFAF7]">
        {hotel.cover_image && <img src={hotel.cover_image} alt="" className="absolute inset-0 h-full w-full object-cover opacity-50" />}
        <div className="absolute inset-0 bg-gradient-to-b from-black/40 via-black/30 to-[#1C221F]" />
        <div className="relative mx-auto max-w-3xl px-5 pb-10" style={{ paddingTop: "calc(var(--page-top, 0px) + 24px)" }}>
          <div className="flex items-center gap-3" data-testid="stay-cobrand">
            {hotel.logo ? <img src={hotel.logo} alt={hotel.name} className="h-12 w-12 rounded-2xl object-cover bg-white" /> : <span className="h-12 w-12 rounded-2xl bg-white/15 flex items-center justify-center serif text-xl">{(hotel.name || "H").slice(0, 1)}</span>}
            <span className="text-white/60 text-xl">×</span>
            <Logo className="h-12 w-12 ring-2 ring-white/60" />
          </div>
          <p className="mt-6 text-[11px] uppercase tracking-[0.3em] text-[#F3C9BB] font-semibold">{hotel.name}{hotel.city ? ` · ${hotel.city}` : ""}</p>
          <h1 className="serif text-[38px] sm:text-5xl leading-[1.05] mt-2" data-testid="stay-title">{t("stay.title", "Yoga with Tony")}</h1>
          <p className="text-[16px] text-white/80 mt-3">{programme.name} · {fmtRange(programme.start_date, programme.end_date)}</p>
          <div className="mt-4 flex flex-wrap gap-2 text-[12px]">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-white/10 border border-white/20 px-3 py-1.5"><User className="h-3.5 w-3.5 text-[#E8B8A8]" />{programme.teacher}</span>
            <span className="inline-flex items-center gap-1.5 rounded-full bg-white/10 border border-white/20 px-3 py-1.5"><CalendarDays className="h-3.5 w-3.5 text-[#E8B8A8]" />{t("hotels.days", "{{n}} days", { n: programme.days })}</span>
            {page.free_days > 0 && <span className="inline-flex items-center gap-1.5 rounded-full bg-[#B25A45] px-3 py-1.5 font-semibold"><Sparkles className="h-3.5 w-3.5" />{t("stay.free_badge", "{{n}} days online free", { n: page.free_days })}</span>}
          </div>
        </div>
      </section>

      <div className="mx-auto max-w-3xl px-5 space-y-6 mt-6">
        {feedbackToken && <Feedback slug={slug} token={feedbackToken} hotel={hotel.name} t={t} />}

        {(programme.summary || hotel.description) && (
          <section className="rounded-3xl bg-white border border-[#E5E6DF] p-5 sm:p-6 text-[14px] text-[#545E56] leading-relaxed space-y-3">
            {programme.summary && <p className="text-[16px] text-[#1C221F]">{programme.summary}</p>}
            {hotel.description && <p className="whitespace-pre-wrap">{hotel.description}</p>}
            {hotel.city && <p className="flex items-center gap-1.5 text-[13px]"><MapPin className="h-4 w-4 text-[#839682]" />{[hotel.city, hotel.country].filter(Boolean).join(", ")}</p>}
          </section>
        )}

        <section className="rounded-3xl bg-white border border-[#E5E6DF] p-5 sm:p-6" data-testid="stay-programme">
          <h2 className="eyebrow !text-[11px]">{t("stay.programme", "The programme")}</h2>
          {programme.schedule?.length > 0 ? (
            <ul className="mt-3 divide-y divide-[#EFEFE9]" data-testid="stay-schedule">
              {programme.schedule.map((r, i) => (
                <li key={i} className="py-2.5 flex items-center gap-3 text-[14px]">
                  <span className="w-16 shrink-0 text-[11px] uppercase tracking-widest font-semibold text-[#839682]">{t("partner.day_n", "Day {{n}}", { n: r.day })}</span>
                  <span className="w-14 shrink-0 font-semibold">{r.time}</span>
                  <span className="min-w-0">{r.title}</span>
                </li>
              ))}
            </ul>
          ) : programme.daily?.length > 0 && (
            <ul className="mt-3 space-y-2">
              {programme.daily.map((d, i) => (
                <li key={d} className="flex items-start gap-2 text-[14px]">{i === 0 ? <Sun className="h-4 w-4 text-[#B25A45] mt-0.5" /> : <Moon className="h-4 w-4 text-[#839682] mt-0.5" />}{d}</li>
              ))}
            </ul>
          )}
          <Ticks items={programme.includes} className="mt-4" />
          <p className="text-[12px] text-[#6B7269] mt-4">{t("stay.all_levels", "All levels are welcome. Bring comfortable clothes and water; mats are provided when agreed with the hotel.")}</p>
        </section>

        {page.completed && !feedbackToken && (
          <div className="rounded-3xl bg-[#F7F6F1] border border-[#E5E6DF] p-5 text-[14px] text-[#545E56]">{t("stay.completed", "This programme has finished. Thank you for practising with us!")}</div>
        )}

        {!page.completed && (
          <section id="join" className="rounded-[2rem] bg-[#1C221F] text-[#FAFAF7] p-6 sm:p-8 scroll-mt-24" data-testid="stay-register">
            {done ? (
              <div data-testid="stay-register-done">
                <CheckCircle2 className="h-8 w-8 text-[#9FD0B0]" />
                <div className="serif text-3xl mt-3">{done.already ? t("stay.already", "You're already on the list") : t("stay.welcome", "You're in. Welcome!")}</div>
                <ul className="mt-4 space-y-2 text-[14px] text-white/80">
                  {done.free_access && <li className="flex gap-2"><Sparkles className="h-4 w-4 text-[#E8B8A8] shrink-0 mt-0.5" />{t("stay.free_active", "Your free {{n}} days of Tony Yoga online are active.", { n: page.free_days })}</li>}
                  {done.account_created && <li className="flex gap-2" data-testid="stay-check-email"><Mail className="h-4 w-4 text-[#E8B8A8] shrink-0 mt-0.5" />{t("stay.check_email", "Check your email to set your password and open the app.")}</li>}
                  <li className="flex gap-2"><CalendarDays className="h-4 w-4 text-[#E8B8A8] shrink-0 mt-0.5" />{t("stay.see_you", "See you on the mat — the times are above.")}</li>
                </ul>
                {(done.signed_in || user) && <Link to="/my-yoga" className="pill bg-white text-[#1C221F] mt-6 inline-flex" data-testid="stay-open-my-yoga">{t("stay.open", "Open My Yoga")}</Link>}
              </div>
            ) : !page.registration_open ? (
              <div className="text-[14px] text-white/80">{t("stay.closed", "Registration for this stay has closed.")}</div>
            ) : (
              <>
                <div className="eyebrow !text-[#E8B8A8]">{t("stay.join_eyebrow", "Join the classes")}</div>
                <h2 className="serif text-3xl mt-2">{t("stay.join_title", "Register in one minute")}</h2>
                {page.free_days > 0 && <p className="text-[14px] text-white/75 mt-2">{t("stay.join_body", "Guests practise free, and you get {{n}} days of Tony Yoga online to keep going at home.", { n: page.free_days })}</p>}
                <form onSubmit={register} className="mt-5 space-y-4 text-[#1C221F]" data-testid="stay-register-form">
                  <Label text={t("stay.name", "Your name")}><input required value={form.name} onChange={set("name")} className={fieldCls} data-testid="stay-name" autoComplete="name" /></Label>
                  <Label text={t("stay.email", "Email")}><input required type="email" value={form.email} onChange={set("email")} className={fieldCls} data-testid="stay-email" autoComplete="email" /></Label>
                  <Label text={t("stay.language", "Language")}>
                    <select value={form.language} onChange={set("language")} className={fieldCls} data-testid="stay-language">
                      {LANGUAGES.map((l) => <option key={l.code} value={l.code}>{l.native}</option>)}
                    </select>
                  </Label>
                  {page.waiver && (
                    <div className="rounded-2xl bg-white/10 border border-white/15 p-4 text-[13px] text-white/85 leading-relaxed" data-testid="stay-waiver-text">
                      <div className="text-[11px] uppercase tracking-[0.18em] font-semibold text-white/60 mb-1.5">{t("stay.waiver", "Waiver")}</div>
                      <p className="whitespace-pre-wrap">{page.waiver}</p>
                    </div>
                  )}
                  <label className="flex items-start gap-3 text-[13px] text-white/90">
                    <input type="checkbox" checked={form.waiver} onChange={set("waiver")} className="h-4 w-4 mt-0.5 accent-[#B25A45]" data-testid="stay-waiver" />
                    <span>{t("stay.accept", "I have read and accept the waiver.")}</span>
                  </label>
                  <label className="flex items-start gap-3 text-[13px] text-white/70">
                    <input type="checkbox" checked={form.marketing} onChange={set("marketing")} className="h-4 w-4 mt-0.5 accent-[#B25A45]" data-testid="stay-marketing" />
                    <span>{t("stay.marketing", "Send me Tony's monthly practice letter (optional).")}</span>
                  </label>
                  <button disabled={busy} className="pill bg-[#B25A45] text-white w-full sm:w-auto !px-8" data-testid="stay-submit">{busy ? "…" : t("stay.submit", "Join the classes")}</button>
                </form>
              </>
            )}
          </section>
        )}
      </div>
    </div>
  );
}

function Label({ text, children }) {
  return (
    <label className="block">
      <span className="text-[11px] uppercase tracking-[0.18em] font-semibold text-white/70">{text}</span>
      <div className="mt-1.5">{children}</div>
    </label>
  );
}

function Feedback({ slug, token, hotel, t }) {
  const [rating, setRating] = useState(0);
  const [comment, setComment] = useState("");
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const send = async (e) => {
    e.preventDefault();
    if (!rating) { toast.error(t("stay.pick_rating", "Tap the stars to rate the classes.")); return; }
    setBusy(true);
    try {
      await api.post(`/stay/${slug}/feedback`, { token, rating, comment: comment.trim() || null });
      setSent(true);
    } catch (err) { toast.error(errText(err)); }
    finally { setBusy(false); }
  };
  if (sent) {
    return (
      <div className="rounded-3xl bg-[#E4F0E8] border border-[#CFE3D6] p-5 text-[#2E6A47]" data-testid="stay-feedback-done">
        <CheckCircle2 className="h-6 w-6" />
        <div className="serif text-2xl mt-2">{t("stay.fb_thanks", "Thank you for your feedback")}</div>
      </div>
    );
  }
  return (
    <form onSubmit={send} className="rounded-3xl bg-white border border-[#E5E6DF] p-5 sm:p-6 space-y-4" data-testid="stay-feedback">
      <div>
        <div className="serif text-2xl">{t("stay.fb_title", "How were the classes at {{hotel}}?", { hotel })}</div>
        <p className="text-[13px] text-[#6B7269] mt-1">{t("stay.fb_hint", "Your rating helps Tony and the hotel.")}</p>
      </div>
      <div className="flex gap-1" role="radiogroup" aria-label={t("stay.rating", "Rating")}>
        {[1, 2, 3, 4, 5].map((n) => (
          <button type="button" key={n} onClick={() => setRating(n)} aria-label={`${n}`} role="radio" aria-checked={rating === n} data-testid={`stay-star-${n}`} className="p-1">
            <Star className={`h-9 w-9 ${n <= rating ? "fill-[#E0A93B] text-[#E0A93B]" : "text-[#D8D9D1]"}`} />
          </button>
        ))}
      </div>
      <FormField label={t("stay.fb_comment", "Anything you'd like to share? (optional)")}>
        <textarea rows={3} value={comment} onChange={(e) => setComment(e.target.value)} className={fieldCls} data-testid="stay-feedback-comment" />
      </FormField>
      <button disabled={busy} className="pill pill-primary" data-testid="stay-feedback-submit">{busy ? "…" : t("stay.fb_send", "Send feedback")}</button>
    </form>
  );
}
