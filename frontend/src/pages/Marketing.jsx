import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { Link } from "react-router-dom";
import { ArrowRight, Play, Download, Menu, X, Check, Compass, Wind, Moon, GraduationCap, Flame, User, Flower2, BookOpen, ExternalLink, Star, Truck, Sparkles, Video, Clock, CalendarCheck } from "lucide-react";
import { useTranslation } from "react-i18next";
import { api } from "@/lib/api";
import InstagramReels from "@/components/InstagramReels";
import FreeClassRibbon from "@/components/FreeClassRibbon";
import Logo from "@/components/Logo";
import LanguageToggle from "@/components/LanguageToggle";
import InlineSignup from "@/components/InlineSignup";
import { FeatureStrip, StatsBar, ValueProps, FAQ } from "@/components/MarketingSections";
import HeroTestimonial from "@/components/HeroTestimonial";
import { StudentTestimonials } from "@/components/StudentTestimonials";
import { contentImageUrl } from "@/components/ContentImageInput";

const HERO = "https://images.unsplash.com/photo-1767611127093-8ed12ce7789d?crop=entropy&cs=srgb&fm=jpg&q=85&w=1000";
const TT_IMG = "https://images.unsplash.com/photo-1683056255281-e52a141924f0?crop=entropy&cs=srgb&fm=jpg&q=85&w=1200";
const PRIVATE_ZOOM_IMG = "/brand/seed/private-zoom.jpeg";
const TONY_IMG = "/brand/seed/tony.jpeg";

function isStandalone() {
  return typeof window !== "undefined" && (window.matchMedia("(display-mode: standalone)").matches || window.navigator.standalone === true);
}

function Nav({ onOpenApp }) {
  const [open, setOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const { t } = useTranslation();
  useEffect(() => {
    const on = () => setScrolled(window.scrollY > 24);
    on();
    window.addEventListener("scroll", on, { passive: true });
    return () => window.removeEventListener("scroll", on);
  }, []);
  const items = [
    { href: "#story", label: t("marketing.nav_story") },
    { href: "#programs", label: t("marketing.nav_programs") },
    { href: "#retreats", label: t("marketing.nav_retreats") },
    { href: "#faq", label: t("marketing.nav_faq") },
    { href: "#join", label: t("marketing.nav_join") },
  ];
  return (
    <header
      data-testid="marketing-nav"
      className={`fixed inset-x-0 z-50 transition top-10 ${scrolled ? "bg-[#FAFAF7]/90 backdrop-blur-xl border-b border-[#E5E6DF]" : ""}`}
    >
      <div className="mx-auto max-w-6xl px-4 sm:px-6 py-3 sm:py-4 flex items-center justify-between">
        <a href="#top" className="flex items-center" data-testid="marketing-logo">
          <Logo className="h-[60px] w-[60px] sm:h-[79px] sm:w-[79px]" />
        </a>
        <nav className="hidden lg:flex items-center gap-8" data-testid="marketing-nav-links">
          {items.map((i) => (
            <a key={i.href} href={i.href} data-testid={`marketing-nav-${i.href.slice(1)}`} className="text-sm text-[#545E56] hover:text-[#B25A45] transition">{i.label}</a>
          ))}
        </nav>
        <div className="hidden lg:flex items-center gap-3">
          <Link to="/teacher-training" data-testid="nav-teacher-training" className="text-sm text-[#545E56] hover:text-[#B25A45] transition">Teacher Training</Link>
          <LanguageToggle />
          <Link to="/login" data-testid="nav-signin" className="text-sm text-[#545E56] hover:text-[#B25A45] transition">{t("common.signIn")}</Link>
          <button onClick={onOpenApp} data-testid="nav-open-app" className="pill pill-primary !py-2 !px-4 !text-[13px]">
            {t("marketing.open_app")} <ArrowRight className="h-3.5 w-3.5" />
          </button>
        </div>
        <button onClick={() => setOpen((o) => !o)} data-testid="nav-menu-toggle" aria-label={open ? 'Close menu' : 'Open menu'} aria-expanded={open} className="lg:hidden h-11 w-11 rounded-full border border-[#E5E6DF] flex items-center justify-center">
          {open ? <X className="h-4 w-4" /> : <Menu className="h-4 w-4" />}
        </button>
      </div>
      {open && (
        <div className="lg:hidden bg-[#FAFAF7] border-b border-[#E5E6DF] px-4 sm:px-6 py-4" data-testid="mobile-menu">
          <ul className="space-y-3">
            {items.map((i) => (
              <li key={i.href}><a href={i.href} data-testid={`mobile-marketing-nav-${i.href.slice(1)}`} onClick={() => setOpen(false)} className="block py-2 text-[#1C221F] font-medium">{i.label}</a></li>
            ))}
            <li className="pt-2 border-t border-[#E5E6DF]">
              <Link to="/teacher-training" onClick={() => setOpen(false)} data-testid="mobile-nav-teacher-training" className="block py-2 text-[#1C221F] font-medium">Teacher Training</Link>
              <Link to="/login" data-testid="mobile-nav-signin" className="block py-2 text-[#1C221F] font-medium">{t("common.signIn")}</Link>
            </li>
            <li className="pt-1"><LanguageToggle /></li>
            <li><button onClick={() => { setOpen(false); onOpenApp(); }} data-testid="mobile-nav-open-app" className="pill pill-primary w-full mt-2">{t("marketing.open_app")} <ArrowRight className="h-4 w-4" /></button></li>
          </ul>
        </div>
      )}
    </header>
  );
}

function Hero({ onOpenApp, heroImg }) {
  const { t } = useTranslation();
  return (
    <section id="top" className="relative overflow-hidden pt-24 sm:pt-28 lg:pt-32">
      <div className="mx-auto max-w-6xl px-4 sm:px-6 grid lg:grid-cols-2 gap-8 lg:gap-16 items-center lg:min-h-[80vh]">
        <div className="animate-fade-up order-2 lg:order-1">
          <div className="eyebrow mb-3 sm:mb-4">{t("mkt.hero_eyebrow")}</div>
          <h1 className="serif text-4xl sm:text-5xl lg:text-7xl leading-[1.02] font-medium mb-4 sm:mb-6" data-testid="hero-title">
            {t("mkt.hero_t1")}<br/>{t("mkt.hero_t2")}<br/><span className="text-[#B25A45]">{t("mkt.hero_t3")}</span>
          </h1>
          <p className="text-base sm:text-lg text-[#545E56] leading-relaxed mb-6 sm:mb-8 max-w-md">
            {t("mkt.hero_sub")}
          </p>
          <div className="flex flex-wrap gap-2 sm:gap-3">
            <a href="#join" data-testid="hero-cta-signup" className="pill pill-primary">
              {t("mkt.create_account")} <ArrowRight className="h-4 w-4" />
            </a>
            <button onClick={onOpenApp} data-testid="hero-cta-open-app" className="pill pill-ghost">
              <Download className="h-4 w-4" /> {t("marketing.open_app")}
            </button>
          </div>
          <div className="mt-8 sm:mt-10 flex items-center gap-6 sm:gap-8">
            {[["50+", t("mkt.stat_years")], ["3", t("mkt.stat_programs")], ["4", t("mkt.stat_retreats")]].map(([n, l]) => (
              <div key={l}>
                <div className="serif text-2xl sm:text-3xl leading-none">{n}</div>
                <div className="eyebrow mt-1 !text-[10px]">{l}</div>
              </div>
            ))}
          </div>
        </div>
        <div className="relative animate-fade-up animate-delay-2 order-1 lg:order-2 max-w-md mx-auto lg:max-w-none w-full">
          <div className="relative aspect-[3/4] rounded-2xl sm:rounded-3xl overflow-hidden bg-[#F2F2EC]">
            <img data-cms="site_images:hero" data-testid="hero-image" src={contentImageUrl(heroImg) || HERO} alt="Yoga practice" className="absolute inset-0 h-full w-full object-cover" />
            <div className="absolute inset-0 grain"></div>
          </div>
          <div className="hidden lg:block absolute -left-6 -bottom-6 w-52 rounded-2xl bg-[#1C221F] text-[#FAFAF7] p-5 shadow-2xl">
            <div className="eyebrow !text-[#B25A45]">{t("mkt.live_now")}</div>
            <div className="text-sm mt-1 font-semibold">{t("mkt.hero_card_title")}</div>
            <div className="text-xs text-white/60 mt-1">{t("mkt.hero_card_time")}</div>
          </div>
        </div>
      </div>
    </section>
  );
}

function Story({ img }) {
  const { t } = useTranslation();
  return (
    <section id="story" className="mx-auto max-w-6xl px-4 sm:px-6 py-14 sm:py-20 lg:py-24 grid md:grid-cols-3 gap-8 md:gap-12">
      <div className="md:col-span-1">
        <div className="eyebrow mb-3">{t("mkt.story_eyebrow")}</div>
        <h2 className="serif text-3xl sm:text-4xl leading-tight">{t("mkt.story_t1")}<br/>{t("mkt.story_t2")}</h2>
        {img && (
          <div className="mt-6 rounded-2xl overflow-hidden aspect-[4/5] bg-[#F2F2EC]">
            <img data-cms="site_images:story" src={contentImageUrl(img)} alt="Story" className="h-full w-full object-cover" data-testid="story-image" />
          </div>
        )}
      </div>
      <div className="md:col-span-2 space-y-5 sm:space-y-6 text-[#545E56] leading-relaxed">
        <p className="text-base sm:text-lg">{t("mkt.story_p1")}</p>
        <p>{t("mkt.story_p2")}</p>
        <p className="italic serif text-lg sm:text-xl text-[#1C221F]">{t("mkt.story_quote")}</p>
      </div>
    </section>
  );
}

function Programs() {
  const { t } = useTranslation();
  const [rows, setRows] = useState([]);
  useEffect(() => {
    api.get("/programs")
      .then(({ data }) => {
        const programs = Array.isArray(data)
          ? data
          : Array.isArray(data?.programs)
            ? data.programs
            : Array.isArray(data?.data)
              ? data.data
              : Array.isArray(data?.items)
                ? data.items
                : [];
        setRows(programs);
      })
      .catch(() => setRows([]));
  }, []);
  return (
    <section id="programs" className="bg-[#1C221F] text-[#FAFAF7] py-14 sm:py-20 lg:py-24">
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <div className="max-w-lg mb-8 sm:mb-12">
          <div className="eyebrow !text-[#B25A45] mb-3">{t("mkt.programs_eyebrow")}</div>
          <h2 className="serif text-3xl sm:text-4xl leading-tight mb-4">{t("mkt.programs_title")}</h2>
          <p className="text-white/70 leading-relaxed text-sm sm:text-base">{t("mkt.programs_sub")}</p>
        </div>
        <ul className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6" data-testid="marketing-programs">
          {rows.map((p) => (
            <li key={p.id}>
              <Link
                to={`/programs/${p.id}`}
                data-testid={`marketing-program-${p.id}`}
                className="group block h-full rounded-3xl overflow-hidden bg-[#0F1211] border border-white/10 transition-all duration-300 hover:border-[#B25A45] hover:-translate-y-1"
              >
                {p.cover_image && (
                  <div className="aspect-[4/5] overflow-hidden">
                    <img src={p.cover_image} alt="" className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105" />
                  </div>
                )}
                <div className="p-6">
                  <div className="eyebrow !text-[#B25A45]">{p.level}</div>
                  <div className="serif text-2xl mt-1">{p.title}</div>
                  <div className="text-xs text-white/60 mt-2">{p.duration_weeks} {t("mkt.weeks")} · €{Math.round(p.price)}</div>
                  <p className="text-sm text-white/70 mt-4 clamp-3 leading-relaxed">{p.description}</p>
                  <span className="mt-4 inline-flex items-center gap-1 text-sm font-semibold text-[#B25A45]">
                    {t("mkt.view_program")} <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
                  </span>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

function Retreats() {
  const { t } = useTranslation();
  const [rows, setRows] = useState([]);
  useEffect(() => { api.get("/workshops").then(({ data }) => setRows((data || []).slice(0, 2))).catch(() => {}); }, []);
  return (
    <section id="retreats" className="mx-auto max-w-6xl px-4 sm:px-6 py-14 sm:py-20 lg:py-24">
      <div className="grid md:grid-cols-2 gap-6 md:gap-10 items-end mb-8 sm:mb-12">
        <div>
          <div className="eyebrow mb-3">{t("mkt.retreats_eyebrow")}</div>
          <h2 className="serif text-3xl sm:text-4xl leading-tight">{t("mkt.retreats_t1")}<br/>{t("mkt.retreats_t2")}</h2>
        </div>
        <p className="text-[#545E56] leading-relaxed text-sm sm:text-base">{t("mkt.retreats_sub")}</p>
      </div>
      <ul className="grid md:grid-cols-2 gap-4 sm:gap-6" data-testid="marketing-retreats">
        {rows.map((w) => (
          <li key={w.id}>
            <Link
              to={`/workshops/${w.id}`}
              data-testid={`marketing-retreat-${w.id}`}
              className="group block h-full rounded-3xl overflow-hidden bg-white border border-[#E5E6DF] transition-all duration-300 hover:border-[#B25A45] hover:-translate-y-1"
            >
              {w.cover_image && (
                <div className="aspect-[16/10] overflow-hidden bg-[#F2F2EC]">
                  <img src={w.cover_image} alt="" className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105" />
                </div>
              )}
              <div className="p-6">
                <div className="eyebrow">{w.system}</div>
                <div className="serif text-2xl mt-1 leading-tight">{w.title}</div>
                <p className="text-sm text-[#6B7269] mt-2 leading-relaxed clamp-2">{w.description}</p>
                <div className="mt-4 flex items-center justify-between">
                  <div className="text-sm text-[#545E56]">{new Date(w.start_date).toLocaleDateString(undefined, { month: "long", year: "numeric" })}</div>
                  <div className="text-right">
                    <div className="text-[#B25A45] font-semibold">€{Math.round(w.price_eur ?? 1600)}</div>
                    <div className="text-[10px] text-[#9AA096]">€{w.deposit_eur ?? 500} {t("mkt.deposit")}</div>
                  </div>
                </div>
              </div>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}

function AppCTA({ onOpenApp, img }) {
  const { t } = useTranslation();
  const features = [t("appf.1"), t("appf.2"), t("appf.3"), t("appf.4"), t("appf.5"), t("appf.6")];
  return (
    <section className="mx-auto max-w-6xl px-4 sm:px-6 py-14 sm:py-20 lg:py-24">
      <div className="rounded-2xl sm:rounded-3xl bg-[#1C221F] text-[#FAFAF7] p-6 sm:p-10 lg:p-16 grid md:grid-cols-2 gap-8 md:gap-10 items-center">
        <div>
          <div className="eyebrow !text-[#B25A45] mb-3">{t("mkt.appcta_eyebrow")}</div>
          <h2 className="serif text-3xl sm:text-4xl lg:text-5xl leading-tight mb-4">{t("mkt.appcta_t1")}<br/>{t("mkt.appcta_t2")}</h2>
          <p className="text-white/70 leading-relaxed mb-6 max-w-md text-sm sm:text-base">{t("mkt.appcta_sub")}</p>
          <div className="flex flex-wrap gap-3">
            <button onClick={onOpenApp} data-testid="cta-open-app-primary" className="pill !bg-[#B25A45] !text-white">
              <Download className="h-4 w-4" /> {t("marketing.open_app")}
            </button>
            <span className="text-xs text-white/50 self-center">iOS · Android · Desktop</span>
          </div>
        </div>
        {img ? (
          <div className="rounded-2xl overflow-hidden aspect-[4/3] bg-white/5">
            <img data-cms="site_images:app_cta" src={contentImageUrl(img)} alt="Get the app" className="h-full w-full object-cover" data-testid="appcta-image" />
          </div>
        ) : (
          <ul className="space-y-3" data-testid="app-features">
            {features.map((f) => (
              <li key={f} className="flex items-start gap-3">
                <div className="mt-0.5 h-5 w-5 rounded-full bg-[#B25A45] flex items-center justify-center shrink-0">
                  <Check className="h-3 w-3 text-white" />
                </div>
                <span className="text-white/85">{f}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}

function Footer() {
  const { t } = useTranslation();
  const [email, setEmail] = useState("");
  const [subbed, setSubbed] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [subscribeError, setSubscribeError] = useState('');
  const subscribe = async (e) => {
    e.preventDefault();
    if (submitting) return;
    setSubmitting(true); setSubscribeError('');
    try {
      await api.post("/submissions/newsletter", { email });
      setSubbed(true);
    } catch { setSubscribeError('Could not save your email. Please try again.'); }
    finally { setSubmitting(false); }
  };
  return (
    <footer className="bg-[#1C221F] text-[#FAFAF7] py-12 sm:py-16">
      <div className="mx-auto max-w-6xl px-4 sm:px-6 grid md:grid-cols-2 gap-8 md:gap-10">
        <div>
          <div className="mb-4">
            <Logo className="h-20 w-20 sm:h-24 sm:w-24" />
          </div>
          <p className="text-white/60 text-sm leading-relaxed max-w-sm">{t("mkt.footer_tagline")}</p>
          <a href="mailto:tony@tonysanchezyoga.com" className="text-sm text-[#B25A45] hover:underline mt-4 inline-block">tony@tonysanchezyoga.com</a>
        </div>
        <div>
          <div className="eyebrow !text-[#B25A45] mb-3">{t("mkt.stay_in_touch")}</div>
          <p className="text-sm text-white/60 mb-4">{t("mkt.newsletter_sub")}</p>
          {subbed ? (
            <div className="rounded-2xl bg-white/5 border border-white/10 p-4 text-sm text-white/80" data-testid="footer-newsletter-thanks">
              {t("mkt.newsletter_thanks")}
            </div>
          ) : (
            <form onSubmit={subscribe} className="flex flex-col sm:flex-row gap-2 min-w-0" data-testid="footer-newsletter-form">
              <input
                required type="email" value={email} onChange={(e) => setEmail(e.target.value)}
                data-testid="footer-newsletter-email"
                placeholder="you@example.com"
                className="flex-1 min-w-0 w-full rounded-full bg-white/10 border border-white/10 px-4 py-2.5 text-sm text-white placeholder:text-white/40 focus:outline-none focus:border-[#B25A45]"
              />
              <button type="submit" disabled={submitting} data-testid="footer-newsletter-submit" className="pill !bg-[#B25A45] !text-white !py-2 !px-4 !text-[13px]">{submitting ? 'Saving…' : t("mkt.subscribe")}</button>
            </form>
          )}
          {subscribeError && <p role="alert" className="mt-2 text-sm text-[#efb9a8]" data-testid="footer-newsletter-error">{subscribeError}</p>}
        </div>
      </div>
      <div className="mx-auto max-w-6xl px-4 sm:px-6 mt-8 sm:mt-12 pt-6 border-t border-white/10 flex flex-wrap items-center justify-between gap-4">
        <div className="dev-credit" data-testid="footer-dev-credit">
          <span>© {new Date().getFullYear()} Tony Yoga. {t("mkt.rights")}</span>
          <span className="text-white/25">·</span>
          <span>Developed by</span>
          <a
            href="https://rajeevfreelancer.com"
            target="_blank"
            rel="noopener noreferrer"
            className="dev-credit-link"
            data-testid="footer-dev-credit-link"
          >
            <Sparkles size={13} className="dev-sparkle" strokeWidth={2.5} />
            Rajeev
            <Sparkles size={11} className="dev-sparkle two" strokeWidth={2.5} />
          </a>
        </div>
        <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-xs">
          <Link to="/privacy" data-testid="footer-privacy" className="text-white/60 hover:text-white transition">Privacy</Link>
          <Link to="/terms" data-testid="footer-terms" className="text-white/60 hover:text-white transition">Terms</Link>
          <Link to="/account-deletion" data-testid="footer-account-deletion" className="text-white/60 hover:text-white transition">Delete account</Link>
          <Link to="/support" data-testid="footer-support" className="text-white/60 hover:text-white transition">Support</Link>
          <Link to="/home" className="text-white/60 hover:text-white transition">{t("mkt.student_signin")}</Link>
          <Link to="/login?admin=1" data-testid="footer-admin-signin" className="text-white/60 hover:text-[#B25A45] transition">{t("mkt.admin_signin")}</Link>
        </div>
      </div>
    </footer>
  );
}

function BestSellers() {
  const [items, setItems] = useState([]);
  useEffect(() => { api.get("/products/best-sellers?limit=8").then(({ data }) => setItems(data || [])).catch(() => setItems([])); }, []);
  if (!items.length) return null;
  return (
    <section className="px-5 py-14 sm:py-16" data-testid="home-best-sellers">
      <div className="mx-auto max-w-6xl">
        <div className="flex items-end justify-between gap-3 mb-6">
          <div>
            <div className="eyebrow">The shop</div>
            <h2 className="serif text-3xl sm:text-4xl mt-1">Best sellers</h2>
          </div>
          <Link to="/shop" data-testid="home-best-sellers-all" className="text-sm font-semibold text-[#B25A45] hover:opacity-70 shrink-0">Shop all →</Link>
        </div>
        <div className="flex gap-4 overflow-x-auto no-scrollbar pb-2 snap-x">
          {items.map((p) => (
            <Link key={p.id} to={`/shop/${p.id}`} data-testid={`best-seller-${p.id}`} className="shrink-0 w-44 sm:w-52 snap-start group">
              <div className="relative aspect-square rounded-2xl overflow-hidden bg-[#F2F2EC]">
                {p.compare_at_price > p.price && (
                  <span className="absolute top-2 right-2 z-10 rounded-full bg-[#B25A45] px-2 py-0.5 text-[9px] uppercase tracking-widest font-bold text-white">Sale</span>
                )}
                {p.images?.[0]
                  ? <img src={p.images[0]} alt="" className="h-full w-full object-cover group-hover:scale-105 transition-transform duration-500" />
                  : <div className="h-full w-full flex items-center justify-center"><Flower2 className="h-8 w-8 text-[#B25A45]/60" /></div>}
              </div>
              <div className="mt-2 text-[13px] font-semibold text-[#1C221F] leading-tight line-clamp-2">{p.title}</div>
              <div className="mt-0.5 flex items-baseline gap-1.5">
                <span className="text-sm text-[#B25A45] font-semibold">€{p.price}</span>
                {p.compare_at_price > p.price && <span className="text-xs text-[#9AA096] line-through">€{p.compare_at_price}</span>}
              </div>
            </Link>
          ))}
        </div>
      </div>
    </section>
  );
}

function BooksSection() {
  const [items, setItems] = useState([]);
  useEffect(() => { api.get("/products?category=books").then(({ data }) => setItems((data || []).slice(0, 4))).catch(() => setItems([])); }, []);
  if (!items.length) return null;
  return (
    <section className="relative overflow-hidden px-5 py-16 sm:py-24 bg-[#141815] text-[#FAFAF7]" data-testid="home-books">
      {/* warm glow */}
      <div className="pointer-events-none absolute -top-24 right-0 h-[420px] w-[420px] rounded-full bg-[#B25A45]/20 blur-[120px]" />
      <div className="pointer-events-none absolute bottom-0 left-1/4 h-[300px] w-[300px] rounded-full bg-[#839682]/10 blur-[120px]" />
      <div className="relative mx-auto max-w-5xl">
        <div className="text-center max-w-2xl mx-auto mb-12 sm:mb-16">
          <div className="inline-flex items-center gap-2 eyebrow !text-[#E0A38F]"><BookOpen className="h-3.5 w-3.5" /> Written by Tony Sanchez</div>
          <h2 className="serif text-3xl sm:text-5xl mt-3 leading-[1.05]">Read the method</h2>
          <p className="text-[15px] sm:text-base text-[#B7BEB4] mt-4">
            Five decades on the mat, distilled into practice manuals used by students and teachers worldwide.
            Take the work off the screen and onto your shelf.
          </p>
        </div>

        <div className="grid gap-6 sm:gap-8 sm:grid-cols-2 max-w-3xl mx-auto">
          {items.map((p, i) => {
            const buy = p.external_amazon_link || `/shop/${p.id}`;
            return (
              <div key={p.id} data-testid={`home-book-${p.id}`} className="group relative rounded-3xl bg-white/[0.04] ring-1 ring-white/10 p-5 sm:p-6 backdrop-blur-sm transition-all duration-300 hover:bg-white/[0.07] hover:ring-white/20">
                <div className="flex gap-5">
                  <Link to={`/shop/${p.id}`} className="shrink-0" data-testid={`home-book-cover-${p.id}`}>
                    <div className="relative w-28 sm:w-32">
                      {/* shelf shadow */}
                      <div className="absolute -bottom-2 left-1/2 h-4 w-[85%] -translate-x-1/2 rounded-full bg-black/50 blur-md" />
                      <div className="relative aspect-[2/3] rounded-lg overflow-hidden shadow-2xl shadow-black/60 ring-1 ring-white/10 transition-transform duration-500 group-hover:-translate-y-1 group-hover:-rotate-1">
                        {p.type === "ebook" && (
                          <span className="absolute top-1.5 left-1.5 z-10 rounded-full bg-[#B25A45] px-2 py-0.5 text-[8px] uppercase tracking-widest font-bold text-white">eBook</span>
                        )}
                        {p.images?.[0]
                          ? <img src={p.images[0]} alt={p.title} className="h-full w-full object-cover" loading="lazy" />
                          : <div className="h-full w-full flex items-center justify-center bg-white/5"><BookOpen className="h-8 w-8 text-[#E0A38F]/60" /></div>}
                      </div>
                    </div>
                  </Link>

                  <div className="min-w-0 flex-1 flex flex-col">
                    <div className="flex items-center gap-1 text-[#E7B84B]">
                      {[0, 1, 2, 3, 4].map((s) => <Star key={s} className="h-3 w-3 fill-current" />)}
                      <span className="ml-1 text-[10px] text-[#8A928A]">Reader favourite</span>
                    </div>
                    <Link to={`/shop/${p.id}`} className="serif text-lg sm:text-xl leading-tight mt-1.5 hover:text-[#E0A38F] transition-colors">{p.title}</Link>
                    {p.author && <div className="text-[11px] text-[#8A928A] mt-0.5">by {p.author}</div>}
                    <p className="text-[12px] text-[#B7BEB4] mt-2 line-clamp-3 leading-relaxed">{p.description}</p>
                    <div className="mt-auto pt-4 flex items-center gap-3">
                      {p.price > 0 && <span className="serif text-xl text-[#FAFAF7]">€{p.price}</span>}
                      <a
                        href={buy} target={p.external_amazon_link ? "_blank" : undefined} rel="noopener noreferrer"
                        data-testid={`home-book-buy-${p.id}`}
                        className="ml-auto inline-flex items-center gap-1.5 rounded-full bg-[#E0A38F] px-4 py-2 text-[12px] font-bold text-[#141815] hover:bg-white transition-colors"
                      >
                        {p.type === "ebook" ? "Get the eBook" : "Buy on Amazon"} <ExternalLink className="h-3 w-3" />
                      </a>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        <div className="mt-10 flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-[11px] text-[#8A928A]">
          <span className="inline-flex items-center gap-1.5"><Truck className="h-3.5 w-3.5 text-[#839682]" /> Ships worldwide via Amazon</span>
          <span className="inline-flex items-center gap-1.5"><BookOpen className="h-3.5 w-3.5 text-[#839682]" /> Kindle &amp; paperback editions</span>
          <Link to="/shop" data-testid="home-books-all" className="inline-flex items-center gap-1 font-semibold text-[#E0A38F] hover:text-white transition-colors">Browse the shop <ArrowRight className="h-3 w-3" /></Link>
        </div>
      </div>
    </section>
  );
}


function QuizBanner() {
  return (
    <section className="px-5 py-14 sm:py-20" data-testid="home-quiz-banner">
      <div className="mx-auto max-w-5xl rounded-[2rem] bg-[#1C221F] text-[#FAFAF7] px-6 sm:px-12 py-12 sm:py-16 relative overflow-hidden">
        <div className="relative">
          <div className="inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-1.5 text-[11px] uppercase tracking-widest font-bold text-[#E0A38F]">
            <Compass className="h-3.5 w-3.5" /> Not sure where to start?
          </div>
          <h2 className="serif text-4xl sm:text-5xl leading-[1.05] mt-4 max-w-2xl">
            Find your path in <span className="text-[#E0A38F]">60 seconds</span>.
          </h2>
          <p className="text-[15px] sm:text-lg text-[#B7BEB4] mt-4 max-w-xl leading-relaxed">
            Answer five quick questions and we'll match you with the right Core program and membership — built around your goals, level and schedule.
          </p>
          <Link
            to="/find-your-path"
            data-testid="home-quiz-banner-cta"
            className="pill mt-7 !bg-[#B25A45] !text-white hover:!bg-[#9c4c39] !py-3.5 !px-7 text-base"
          >
            Take the quiz <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      </div>
    </section>
  );
}

function DiscoverStrip() {
  return (
    <section id="discover" className="mx-auto max-w-6xl px-4 sm:px-6 py-14 sm:py-20">
      <div className="rounded-3xl bg-[#1C221F] text-[#FAFAF7] p-8 sm:p-12 grid lg:grid-cols-[1.3fr,1fr] gap-8 items-center overflow-hidden relative">
        <div>
          <div className="eyebrow !text-[#B25A45] mb-3">Explore</div>
          <h2 className="serif text-3xl sm:text-4xl lg:text-5xl leading-tight mb-4">Find the right practice for today.</h2>
          <p className="text-white/70 leading-relaxed max-w-md text-sm sm:text-base mb-6">
            Filter the whole library by focus, level, style and the minutes you have — from a 5-minute reset to a full Core sequence.
          </p>
          <div className="flex flex-wrap gap-2 mb-7">
            {["Back care", "Flexibility", "Stress relief", "5-15 min", "Beginner"].map((x) => (
              <span key={x} className="text-xs rounded-full bg-white/10 px-3 py-1.5 text-white/80">{x}</span>
            ))}
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <Link to="/discover" data-testid="home-discover-cta" className="pill pill-primary">
              <Compass className="h-4 w-4" /> Explore the library
            </Link>
            <Link to="/meditations" data-testid="home-meditations-cta" className="pill pill-ghost !bg-white/10 !text-white !border-white/20 hover:!bg-white/20">
              <Moon className="h-4 w-4" /> Meditation &amp; Breathwork
            </Link>
            <Link to="/find-your-path" data-testid="home-quiz-cta" className="pill pill-ghost !bg-white/10 !text-white !border-white/20 hover:!bg-white/20">
              <Compass className="h-4 w-4" /> Find your path
            </Link>
          </div>
        </div>
        <div className="hidden lg:grid grid-cols-2 gap-3">
          {["https://images.unsplash.com/photo-1506126279646-a697353d3166?w=400&q=80",
            "https://images.unsplash.com/photo-1544367567-0f2fcb009e0b?w=400&q=80",
            "https://images.unsplash.com/photo-1518611012118-696072aa579a?w=400&q=80",
            "https://images.unsplash.com/photo-1545205597-3d9d02c29597?w=400&q=80"].map((src, i) => (
            <div key={i} className={`rounded-2xl overflow-hidden aspect-square ${i % 2 ? "translate-y-4" : ""}`}>
              <img src={src} alt="" className="h-full w-full object-cover" loading="lazy" />
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

const COMING_SOON = [
  { icon: Flame, title: "Challenges", desc: "30-day practice streaks" },
];

function PrivateSessionsBanner({ img, price, durationMin }) {
  const priceLabel = price ? `€${Math.round(price)}` : "€120";
  const dur = durationMin || 60;
  const perks = [
    { icon: User, label: "Sequence built around your body & goals" },
    { icon: Video, label: "Live, face-to-face over Zoom" },
    { icon: Play, label: "Recording sent after every session" },
    { icon: CalendarCheck, label: "Flexible times — Tony arranges with you" },
  ];
  return (
    <section id="private-sessions" className="mx-auto max-w-6xl px-4 sm:px-6 py-14 sm:py-20 lg:py-24" data-testid="home-private-sessions">
      <motion.div
        initial={{ opacity: 0, y: 40 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, amount: 0.2 }}
        transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
        className="relative overflow-hidden rounded-[28px] sm:rounded-[36px] bg-[#1C221F] text-[#FAFAF7] grid lg:grid-cols-2 gap-0"
      >
        {/* soft glow accents */}
        <div className="pointer-events-none absolute -top-24 -right-24 h-72 w-72 rounded-full bg-[#B25A45]/25 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-24 -left-20 h-64 w-64 rounded-full bg-[#E8B04B]/15 blur-3xl" />

        {/* Left: copy */}
        <div className="relative z-10 p-7 sm:p-10 lg:p-14 flex flex-col justify-center">
          <div className="flex items-center gap-2 mb-4">
            <span className="ps-live-dot" />
            <span className="eyebrow !text-[#E8B04B] !mb-0">1:1 with Tony · Live on Zoom</span>
            <Sparkles size={15} className="ps-sparkle text-[#E8B04B]" />
          </div>
          <h2 className="serif text-3xl sm:text-4xl lg:text-[2.9rem] leading-[1.08]">
            Private sessions,<br />
            <span className="ps-shimmer-text">one-to-one with Tony.</span>
          </h2>
          <p className="text-white/70 leading-relaxed mt-4 max-w-md text-sm sm:text-base">
            Personal guidance built entirely around your body and your goals — face-to-face over Zoom, from anywhere in the world.
          </p>

          <ul className="mt-6 grid sm:grid-cols-2 gap-x-6 gap-y-3">
            {perks.map((p) => (
              <li key={p.label} className="flex items-start gap-3 text-white/85 text-sm">
                <span className="mt-0.5 h-6 w-6 rounded-full bg-[#B25A45] flex items-center justify-center shrink-0">
                  <p.icon className="h-3.5 w-3.5 text-white" />
                </span>
                {p.label}
              </li>
            ))}
          </ul>

          <div className="mt-7 flex flex-wrap items-center gap-4">
            <Link to="/private-sessions" data-testid="home-private-cta" className="pill !bg-[#B25A45] !text-white !py-3.5 !px-6 justify-center whitespace-nowrap ps-cta">
              Book a private session <ArrowRight className="h-4 w-4" />
            </Link>
            <div className="text-sm text-white/70">
              <span className="serif text-2xl text-white">{priceLabel}</span> / session
              <span className="mx-2 text-white/25">·</span>
              <span className="inline-flex items-center gap-1"><Clock className="h-3.5 w-3.5" /> {dur} min</span>
            </div>
          </div>
        </div>

        {/* Right: creative Zoom-call visual */}
        <div className="relative min-h-[320px] sm:min-h-[420px] lg:min-h-full p-6 sm:p-10 flex items-center justify-center">
          <motion.div
            className="ps-float relative w-full max-w-md"
            initial={{ opacity: 0, scale: 0.92 }}
            whileInView={{ opacity: 1, scale: 1 }}
            viewport={{ once: true, amount: 0.3 }}
            transition={{ duration: 0.8, delay: 0.15, ease: [0.22, 1, 0.36, 1] }}
          >
            {/* Zoom-window frame */}
            <div className="ps-window rounded-2xl overflow-hidden border border-white/15 bg-[#0F1211] shadow-2xl">
              <div className="flex items-center gap-2 px-4 py-2.5 bg-[#151A18] border-b border-white/10">
                <span className="h-2.5 w-2.5 rounded-full bg-[#ff5f57]" />
                <span className="h-2.5 w-2.5 rounded-full bg-[#febc2e]" />
                <span className="h-2.5 w-2.5 rounded-full bg-[#28c840]" />
                <span className="ml-2 text-[11px] font-medium text-white/50">Zoom · Private session</span>
                <span className="ml-auto ps-rec inline-flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-[#ff6b6b]">
                  <span className="ps-rec-dot" /> Live
                </span>
              </div>
              <div className="relative aspect-[4/3]">
                <img
                  data-cms="site_images:private_session"
                  data-testid="home-private-image"
                  src={contentImageUrl(img) || PRIVATE_ZOOM_IMG}
                  alt="Private 1-on-1 Zoom yoga session with Tony"
                  className="absolute inset-0 h-full w-full object-cover"
                  loading="lazy"
                />
                <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/40 to-transparent" />
                {/* participant tile: Tony */}
                <div className="absolute bottom-3 right-3 h-20 w-16 sm:h-24 sm:w-20 rounded-lg overflow-hidden border-2 border-[#E8B04B] shadow-lg">
                  <img src={TONY_IMG} alt="Tony" className="h-full w-full object-cover" loading="lazy" />
                  <span className="absolute bottom-0 inset-x-0 bg-black/60 text-[8px] text-center text-white py-0.5">Tony</span>
                </div>
              </div>
            </div>
            {/* floating sparkle accents */}
            <Sparkles size={22} className="ps-sparkle absolute -top-3 -left-3 text-[#E8B04B]" />
            <Sparkles size={16} className="ps-sparkle two absolute top-1/3 -right-4 text-[#B25A45]" />
          </motion.div>
        </div>
      </motion.div>
    </section>
  );
}

function ComingSoon() {
  return (
    <section id="coming-soon" className="mx-auto max-w-6xl px-4 sm:px-6 pb-14 sm:pb-20">
      <div className="mb-6">
        <div className="eyebrow mb-2">On the way</div>
        <h2 className="serif text-2xl sm:text-3xl leading-tight">More practice, coming soon.</h2>
      </div>
      <ul className="grid grid-cols-1 sm:grid-cols-3 gap-3 max-w-3xl" data-testid="home-coming-soon">
        {COMING_SOON.map((c) => (
          <li key={c.title} className="rounded-2xl bg-[#F2F2EC] border border-[#E5E6DF] p-4 flex flex-col gap-2">
            <div className="h-9 w-9 rounded-full bg-white flex items-center justify-center text-[#B25A45] shrink-0">
              <c.icon className="h-4 w-4" />
            </div>
            <div className="text-sm font-semibold text-[#1C221F] leading-tight">{c.title}</div>
            <div className="text-[11px] text-[#6B7269] leading-snug flex-1">{c.desc}</div>
            <span className="text-[9px] uppercase tracking-widest font-bold text-[#B25A45]">Coming soon</span>
          </li>
        ))}
      </ul>
    </section>
  );
}


function TeacherTrainingBanner({ img }) {
  const paths = ["200-hour foundation", "300-hour advanced", "500-hour mastery"];
  return (
    <section className="mx-auto max-w-6xl px-4 sm:px-6 py-14 sm:py-20" data-testid="home-teacher-training">
      <div className="rounded-2xl sm:rounded-3xl overflow-hidden bg-[#1C221F] text-[#FAFAF7] grid md:grid-cols-2">
        <div className="relative min-h-[240px] md:min-h-full">
          <img data-cms="site_images:teacher_training" data-testid="teacher-training-image" src={contentImageUrl(img) || TT_IMG} alt="Teacher training" className="absolute inset-0 h-full w-full object-cover" loading="lazy" />
          <div className="pointer-events-none absolute inset-0 bg-gradient-to-t md:bg-gradient-to-r from-[#1C221F] via-[#1C221F]/30 to-transparent" />
        </div>
        <div className="p-6 sm:p-10 lg:p-14">
          <div className="eyebrow !text-[#E0A38F] mb-3">Go deeper · Ghosh lineage since 1986</div>
          <h2 className="serif text-3xl sm:text-4xl lg:text-5xl leading-tight">Become a certified<br/>yoga teacher</h2>
          <p className="text-white/70 leading-relaxed mt-4 max-w-md text-sm sm:text-base">
            Philosophy, anatomy, principles of practice and supervised teaching hours — live in Málaga, Spain.
            Choose the path that matches where you are.
          </p>
          <ul className="mt-5 space-y-2">
            {paths.map((p) => (
              <li key={p} className="flex items-center gap-3 text-white/85 text-sm">
                <span className="h-5 w-5 rounded-full bg-[#B25A45] flex items-center justify-center shrink-0">
                  <GraduationCap className="h-3 w-3 text-white" />
                </span>
                {p}
              </li>
            ))}
          </ul>
          <Link to="/teacher-training" data-testid="home-tt-cta" className="pill !bg-[#B25A45] !text-white mt-7">
            Explore teacher training <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      </div>
    </section>
  );
}

export default function Marketing() {
  const [siteImages, setSiteImages] = useState({});
  const [pub, setPub] = useState({});
  const openApp = () => {
    if (isStandalone()) window.location.href = "/home";
    else window.dispatchEvent(new Event('tony-open-downloads'));
  };
  useEffect(() => {
    document.title = "Tony Yoga — Slow down. Breathe in. Begin again.";
    api.get("/settings/public").then(({ data }) => {
      setSiteImages(data?.site_images || {});
      setPub(data || {});
    }).catch(() => {});
  }, []);
  return (
    <div data-testid="marketing-site" className="min-h-screen bg-[#FAFAF7]">
      <FreeClassRibbon />
      <Nav onOpenApp={openApp} />
      <Hero onOpenApp={openApp} heroImg={siteImages.hero} />
      <FeatureStrip />
      <StatsBar />
      <Story img={siteImages.story} />
      <ValueProps />
      <Programs />
      <PrivateSessionsBanner img={pub.private_session_image || siteImages.private_session} price={pub.private_session_price} durationMin={pub.private_session_duration_min} />
      <TeacherTrainingBanner img={siteImages.teacher_training} />
      <QuizBanner />
      <BestSellers />
      <BooksSection />
      <ComingSoon />
      <Retreats />
      <HeroTestimonial />
      <StudentTestimonials />
      <InlineSignup />
      <FAQ />
      <AppCTA onOpenApp={openApp} img={siteImages.app_cta} />
      <InstagramReels />
      <Footer />
    </div>
  );
}
