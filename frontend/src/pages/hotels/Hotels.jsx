import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import {
  Hotel, Sun, Moon, Users, CalendarDays, QrCode, FileSignature, CreditCard, Star, Sparkles, ArrowRight, CheckCircle2, Leaf, Clock,
} from "lucide-react";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { useMyRoles } from "@/lib/features";
import { useSiteImagesState, siteImage } from "@/lib/siteData";
import PageHeader from "@/components/PageHeader";
import { money, errText, Ticks, fieldCls } from "./hotelShared";

const EMPTY = {
  hotel_name: "", contact_name: "", email: "", phone: "", website: "", country: "", city: "", rooms: "",
  has_studio: "", preferred_months: "", message: "", website_hp: "",
};

export default function Hotels() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const roles = useMyRoles(user);
  const { images, ready } = useSiteImagesState();
  const photo = siteImage(images, "hero");
  const [info, setInfo] = useState(null);
  const [closed, setClosed] = useState(false);
  const [form, setForm] = useState(EMPTY);
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const applyRef = useRef(null);

  useEffect(() => {
    api.get("/hotels/info")
      .then(({ data }) => setInfo(data))
      .catch((e) => { if (e?.response?.status === 404) setClosed(true); else setInfo({ packages: [], addons: [] }); });
  }, []);

  useEffect(() => {
    if (user) setForm((f) => ({ ...f, email: f.email || user.email || "", contact_name: f.contact_name || user.name || "" }));
  }, [user]);

  useEffect(() => {
    if (info && window.location.hash === "#apply") setTimeout(() => applyRef.current?.scrollIntoView({ behavior: "smooth" }), 200);
  }, [info]);

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.type === "checkbox" ? e.target.checked : e.target.value }));

  const submit = async (e) => {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    try {
      await api.post("/hotels/apply", {
        ...form,
        rooms: form.rooms ? Number(form.rooms) : null,
        has_studio: form.has_studio === "" ? null : form.has_studio === "yes",
        phone: form.phone || null, website: form.website || null, preferred_months: form.preferred_months || null, message: form.message || null,
      });
      setSent(true);
      toast.success(t("hotels.sent_toast", "Application sent. We'll reply within a few days."));
    } catch (err) {
      toast.error(errText(err, t("hotels.send_failed", "Could not send the application.")));
    } finally { setBusy(false); }
  };

  if (closed) {
    return (
      <div data-testid="hotels-closed" className="pb-24">
        <PageHeader eyebrow={t("hotels.eyebrow", "Hotels & resorts")} title={t("hotels.closed_title", "Opening soon")} testId="hotels-header" />
        <div className="mx-auto max-w-2xl px-5">
          <div className="rounded-3xl bg-white border border-[#E5E6DF] p-6 text-[15px] text-[#545E56] leading-relaxed">
            <Leaf className="h-6 w-6 text-[#839682] mb-3" />
            {t("hotels.closed_body", "The Yoga with Tony programme for hotels and resorts isn't open yet. Write to us through Help & contact and we'll tell you as soon as it opens.")}
            <div className="mt-5"><Link to="/support" className="pill pill-primary" data-testid="hotels-closed-contact">{t("hotels.contact", "Contact us")}</Link></div>
          </div>
        </div>
      </div>
    );
  }

  const packages = info?.packages || [];
  const addons = info?.addons || [];
  const freeDays = info?.guest_free_days ?? 30;
  const steps = [
    { icon: Hotel, title: t("hotels.s1", "Apply"), body: t("hotels.s1b", "Tell us about your hotel and your space. We reply within a few days with your partner login.") },
    { icon: CalendarDays, title: t("hotels.s2", "Choose a programme and dates"), body: t("hotels.s2b", "Pick a 3- or 4-day programme and dates that are free in the calendar.") },
    { icon: FileSignature, title: t("hotels.s3", "Quote and e-sign"), body: t("hotels.s3b", "You receive a clear quote. Sign the agreement online in a minute.") },
    { icon: CreditCard, title: t("hotels.s4", "Deposit"), body: t("hotels.s4b", "Pay the deposit by card or PayPal to confirm the dates.") },
    { icon: QrCode, title: t("hotels.s5", "Guest page and QR code"), body: t("hotels.s5b", "Guests register on your co-branded page with a QR code for rooms and reception.") },
    { icon: Star, title: t("hotels.s6", "Feedback and invoices"), body: t("hotels.s6b", "After the stay you see attendance, guest ratings and your invoices.") },
  ];

  return (
    <div data-testid="hotels-page" className="pb-24">
      <section className="relative overflow-hidden bg-[#1C221F] text-[#FAFAF7]">
        {ready && photo && <img src={photo} alt="" className="absolute inset-0 h-full w-full object-cover opacity-45" />}
        <div className="absolute inset-0 bg-gradient-to-b from-black/50 via-black/30 to-[#1C221F]" />
        <div className="relative mx-auto max-w-5xl px-5 pb-12" style={{ paddingTop: "calc(var(--page-top, 0px) + 28px)" }}>
          <Link to="/" className="text-xs font-semibold text-white/70">← Tony Yoga</Link>
          <p className="mt-8 text-[11px] uppercase tracking-[0.3em] text-[#F3C9BB] font-semibold">{t("hotels.eyebrow", "Hotels & resorts")}</p>
          <h1 className="serif text-[40px] sm:text-6xl leading-[1.05] mt-3 max-w-3xl" data-testid="hotels-title">{t("hotels.title", "Yoga with Tony, at your hotel.")}</h1>
          <p className="text-[16px] sm:text-lg text-white/80 mt-4 max-w-2xl leading-relaxed">
            {t("hotels.subtitle", "A ready-made 3- or 4-day programme for your guests, led by Tony Sanchez or a Tony-certified teacher. You sell the rooms; we bring the yoga.")}
          </p>
          <div className="mt-7 flex flex-wrap gap-3">
            {roles?.partner ? (
              <Link to="/partner" className="pill bg-white text-[#1C221F]" data-testid="hotels-portal">{t("hotels.portal", "Go to partner portal")} <ArrowRight className="h-4 w-4" /></Link>
            ) : (
              <button onClick={() => applyRef.current?.scrollIntoView({ behavior: "smooth" })} className="pill bg-[#B25A45] text-white" data-testid="hotels-apply-cta">
                {t("hotels.apply_cta", "Apply to host a programme")} <ArrowRight className="h-4 w-4" />
              </button>
            )}
            <a href="#programmes" className="pill border border-white/50 text-white">{t("hotels.see_programmes", "See the programmes")}</a>
          </div>
        </div>
      </section>

      <div className="mx-auto max-w-5xl px-5">
        <section className="grid grid-cols-1 sm:grid-cols-3 gap-3 -mt-6 relative z-10" data-testid="hotels-why">
          {[
            { icon: Sparkles, title: t("hotels.w1", "A free month for every guest"), body: t("hotels.w1b", "Each guest who registers gets {{n}} days of Tony Yoga online, so the practice continues at home.", { n: freeDays }) },
            { icon: Sun, title: t("hotels.w2", "Ready-made programme"), body: t("hotels.w2b", "Morning hot-yoga flow, evening yin and breath, workshops and circles — planned and taught for you.") },
            { icon: Hotel, title: t("hotels.w3", "You keep the rooms"), body: t("hotels.w3b", "The hotel sells rooms and meals as usual. Tony Yoga sells only the yoga programme to the hotel.") },
          ].map(({ icon: Icon, title, body }) => (
            <div key={title} className="rounded-3xl bg-white border border-[#E5E6DF] p-5 shadow-sm">
              <Icon className="h-5 w-5 text-[#B25A45]" />
              <div className="serif text-xl mt-3 leading-tight">{title}</div>
              <p className="text-[13px] text-[#6B7269] mt-2 leading-relaxed">{body}</p>
            </div>
          ))}
        </section>

        <section className="mt-14" data-testid="hotels-steps">
          <div className="eyebrow">{t("hotels.how", "How it works")}</div>
          <h2 className="serif text-3xl sm:text-4xl mt-2">{t("hotels.how_title", "From application to the first sun salutation")}</h2>
          <ol className="mt-6 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {steps.map(({ icon: Icon, title, body }, i) => (
              <li key={title} className="rounded-3xl bg-white border border-[#E5E6DF] p-5 flex gap-4">
                <span className="h-10 w-10 shrink-0 rounded-full bg-[#FBF1EE] text-[#B25A45] flex items-center justify-center font-semibold">{i + 1}</span>
                <div>
                  <div className="flex items-center gap-2 font-semibold text-[15px]"><Icon className="h-4 w-4 text-[#839682]" />{title}</div>
                  <p className="text-[13px] text-[#6B7269] mt-1 leading-relaxed">{body}</p>
                </div>
              </li>
            ))}
          </ol>
        </section>

        <section id="programmes" className="mt-14 scroll-mt-24" data-testid="hotels-programmes">
          <div className="eyebrow">{t("hotels.programmes", "Programmes")}</div>
          <h2 className="serif text-3xl sm:text-4xl mt-2">{t("hotels.programmes_title", "Choose the length that suits your guests")}</h2>
          {!info && <div className="mt-6 grid gap-3 sm:grid-cols-2">{[0, 1].map((i) => <div key={i} className="h-64 rounded-3xl bg-[#F2F2EC] animate-pulse" />)}</div>}
          {info && packages.length === 0 && (
            <div className="mt-6 rounded-3xl bg-white border border-[#E5E6DF] p-6 text-[14px] text-[#545E56]" data-testid="hotels-no-packages">
              {t("hotels.no_packages", "Programmes are being finalised. Apply below and we'll send you the details and a tailored quote.")}
            </div>
          )}
          <div className="mt-6 grid gap-4 sm:grid-cols-2">
            {packages.map((p) => (
              <article key={p.id} data-testid={`hotels-package-${p.id}`} className="rounded-3xl bg-white border border-[#E5E6DF] overflow-hidden flex flex-col">
                {p.image && <img src={p.image} alt="" className="aspect-[16/9] w-full object-cover" loading="lazy" />}
                <div className="p-5 sm:p-6 flex-1 flex flex-col">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="text-[11px] uppercase tracking-[0.2em] font-semibold text-[#839682]">{t("hotels.days", "{{n}} days", { n: p.days })}</div>
                      <h3 className="serif text-2xl mt-1">{p.name}</h3>
                    </div>
                    {!p.active && <span className="text-[10px] uppercase tracking-widest font-bold rounded-full bg-[#F3E7C9] text-[#8A6D3B] px-2 py-1">{t("hotels.draft", "Draft")}</span>}
                  </div>
                  {p.summary && <p className="text-[14px] text-[#545E56] mt-2">{p.summary}</p>}
                  {p.daily?.length > 0 && (
                    <div className="mt-4">
                      <div className="text-[11px] uppercase tracking-widest font-semibold text-[#6B7269] mb-2">{t("hotels.every_day", "Every day")}</div>
                      <ul className="space-y-1.5">
                        {p.daily.map((d, i) => (
                          <li key={d} className="flex items-start gap-2 text-[13px]">
                            {i === 0 ? <Sun className="h-4 w-4 text-[#B25A45] shrink-0 mt-0.5" /> : <Moon className="h-4 w-4 text-[#839682] shrink-0 mt-0.5" />}{d}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                  <Ticks items={p.includes} className="mt-4" />
                  <div className="mt-auto pt-5 flex items-end justify-between gap-3 border-t border-[#EFEFE9]">
                    <div className="flex items-center gap-1.5 text-[13px] text-[#6B7269]"><Users className="h-4 w-4" />{t("hotels.guests_range", "{{a}}–{{b}} guests", { a: p.min_guests, b: p.max_guests })}</div>
                    {Number(p.programme_fee) > 0 && (
                      <div className="text-right">
                        <div className="text-[11px] text-[#6B7269]">{t("hotels.from", "Programme from")}</div>
                        <div className="text-lg font-semibold" data-testid={`hotels-package-price-${p.id}`}>{money(p.programme_fee, p.currency)}</div>
                      </div>
                    )}
                  </div>
                </div>
              </article>
            ))}
          </div>
          {addons.length > 0 && (
            <div className="mt-6 rounded-3xl bg-[#F7F6F1] border border-[#E5E6DF] p-5" data-testid="hotels-addons">
              <div className="font-semibold text-[15px]">{t("hotels.addons", "Add-ons")}</div>
              <ul className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-2">
                {addons.map((a) => (
                  <li key={a.id} className="flex items-center justify-between gap-3 rounded-2xl bg-white border border-[#E5E6DF] px-4 py-3 text-[13px]">
                    <span className="font-medium">{a.name}</span>
                    <span className="text-[#6B7269] whitespace-nowrap">{money(a.price, packages[0]?.currency || "eur")} · {a.unit}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
          {info && (
            <div className="mt-6 grid grid-cols-1 sm:grid-cols-3 gap-3 text-[13px]" data-testid="hotels-terms">
              <div className="rounded-2xl bg-white border border-[#E5E6DF] p-4"><CreditCard className="h-4 w-4 text-[#B25A45] mb-2" /><span className="font-semibold">{t("hotels.deposit_pc", "{{n}}% deposit", { n: info.deposit_percent ?? 30 })}</span> {t("hotels.deposit_when", "when you sign, paid online.")}</div>
              <div className="rounded-2xl bg-white border border-[#E5E6DF] p-4"><Clock className="h-4 w-4 text-[#B25A45] mb-2" />{t("hotels.balance_when", "Balance due {{n}} days before the first day.", { n: info.balance_due_days ?? 30 })}</div>
              <div className="rounded-2xl bg-white border border-[#E5E6DF] p-4"><QrCode className="h-4 w-4 text-[#B25A45] mb-2" />{t("hotels.free_days", "{{n}} free days online for every registered guest.", { n: freeDays })}</div>
            </div>
          )}
          {info?.cancellation_terms && (
            <details className="mt-3 rounded-2xl bg-white border border-[#E5E6DF] p-4 text-[13px] text-[#545E56]">
              <summary className="font-semibold cursor-pointer text-[#1C221F]">{t("hotels.cancellation", "Cancellation terms")}</summary>
              <p className="mt-2 leading-relaxed whitespace-pre-wrap">{info.cancellation_terms}</p>
            </details>
          )}
        </section>

        <section id="apply" ref={applyRef} className="mt-14 scroll-mt-24" data-testid="hotels-apply">
          <div className="rounded-[2rem] bg-[#1C221F] text-[#FAFAF7] p-6 sm:p-10">
            <div className="eyebrow !text-[#E8B8A8]">{t("hotels.apply_eyebrow", "Partner with Tony Yoga")}</div>
            <h2 className="serif text-3xl sm:text-4xl mt-2">{t("hotels.apply_title", "Apply to host Yoga with Tony")}</h2>
            {roles?.partner_pending && !sent && (
              <p className="mt-3 text-[14px] text-white/80" data-testid="hotels-pending">{t("hotels.pending", "We already have your application and will reply soon.")}</p>
            )}
            {sent ? (
              <div className="mt-6 rounded-3xl bg-white/10 border border-white/15 p-6" data-testid="hotels-apply-done">
                <CheckCircle2 className="h-7 w-7 text-[#9FD0B0]" />
                <div className="serif text-2xl mt-3">{t("hotels.thanks", "Thank you — application received.")}</div>
                <p className="text-[14px] text-white/75 mt-2">{t("hotels.thanks_body", "We sent a confirmation to {{email}}. Tony's team will reply within a few days with your partner login.", { email: form.email })}</p>
              </div>
            ) : (
              <form onSubmit={submit} className="mt-6 grid grid-cols-1 sm:grid-cols-2 gap-4 text-[#1C221F]" data-testid="hotels-apply-form">
                <Dark label={t("hotels.f_hotel", "Hotel or resort name")}><input required minLength={2} value={form.hotel_name} onChange={set("hotel_name")} className={fieldCls} data-testid="hotels-f-hotel" /></Dark>
                <Dark label={t("hotels.f_contact", "Your name")}><input required value={form.contact_name} onChange={set("contact_name")} className={fieldCls} data-testid="hotels-f-contact" /></Dark>
                <Dark label={t("hotels.f_email", "Email")}><input required type="email" value={form.email} onChange={set("email")} className={fieldCls} data-testid="hotels-f-email" /></Dark>
                <Dark label={t("hotels.f_phone", "Phone (optional)")}><input value={form.phone} onChange={set("phone")} className={fieldCls} data-testid="hotels-f-phone" /></Dark>
                <Dark label={t("hotels.f_city", "City")}><input required value={form.city} onChange={set("city")} className={fieldCls} data-testid="hotels-f-city" /></Dark>
                <Dark label={t("hotels.f_country", "Country")}><input required minLength={2} value={form.country} onChange={set("country")} className={fieldCls} data-testid="hotels-f-country" /></Dark>
                <Dark label={t("hotels.f_website", "Website (optional)")}><input value={form.website} onChange={set("website")} placeholder="https://" className={fieldCls} data-testid="hotels-f-website" /></Dark>
                <Dark label={t("hotels.f_rooms", "Number of rooms")}><input type="number" min={1} max={5000} value={form.rooms} onChange={set("rooms")} className={fieldCls} data-testid="hotels-f-rooms" /></Dark>
                <Dark label={t("hotels.f_studio", "Do you have a space for yoga?")}>
                  <select value={form.has_studio} onChange={set("has_studio")} className={fieldCls} data-testid="hotels-f-studio">
                    <option value="">{t("hotels.choose", "Choose…")}</option>
                    <option value="yes">{t("hotels.studio_yes", "Yes — studio, terrace or garden")}</option>
                    <option value="no">{t("hotels.studio_no", "Not yet")}</option>
                  </select>
                </Dark>
                <Dark label={t("hotels.f_months", "Preferred months (optional)")}><input value={form.preferred_months} onChange={set("preferred_months")} placeholder={t("hotels.months_ph", "e.g. April, May, October")} className={fieldCls} data-testid="hotels-f-months" /></Dark>
                <Dark label={t("hotels.f_message", "Anything else we should know?")} className="sm:col-span-2">
                  <textarea rows={4} value={form.message} onChange={set("message")} className={fieldCls} data-testid="hotels-f-message" />
                </Dark>
                <input type="text" tabIndex={-1} autoComplete="off" value={form.website_hp} onChange={set("website_hp")} className="hidden" aria-hidden="true" />
                <div className="sm:col-span-2 flex flex-wrap items-center gap-3">
                  <button disabled={busy} className="pill bg-[#B25A45] text-white !px-7" data-testid="hotels-apply-submit">{busy ? t("hotels.sending", "Sending…") : t("hotels.send", "Send application")}</button>
                  <span className="text-[12px] text-white/60">{t("hotels.privacy", "We only use these details to reply about the programme.")}</span>
                </div>
              </form>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}

function Dark({ label, children, className = "" }) {
  return (
    <label className={`block ${className}`}>
      <span className="text-[11px] uppercase tracking-[0.18em] font-semibold text-white/70">{label}</span>
      <div className="mt-1.5">{children}</div>
    </label>
  );
}

