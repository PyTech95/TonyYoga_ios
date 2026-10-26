import { useState } from "react";
import { Link } from "react-router-dom";
import { Sparkles, MapPin, ArrowRight } from "lucide-react";
import { useTranslation } from "react-i18next";
import { api } from "@/lib/api";
import Logo from "@/components/Logo";
import { locationPath, mergeLocations } from "@/seo/seoData.mjs";
import { useCmsPages, useSeoConfig } from "@/lib/siteData";

// Popular cities linked from every website footer (helps people and search engines
// find the city pages). The full list lives on /locations.
const FOOTER_CITIES = {
  europe: ["london", "madrid", "barcelona", "paris", "berlin", "amsterdam", "dublin", "malaga"],
  usa: ["new-york", "los-angeles", "san-francisco", "chicago", "miami", "austin", "seattle", "boston"],
};
export default function SiteFooter() {
  const { t } = useTranslation();
  const config = useSeoConfig();
  const pages = useCmsPages().filter((p) => p.show_in_footer);
  // Cities switched off in Admin → SEO & Google are left out.
  const bySlug = Object.fromEntries(mergeLocations(config).map((l) => [l.slug, l]));
  const contactEmail = config?.global?.organization_email || "tony@tonysanchezyoga.com";
  const [email, setEmail] = useState("");
  const [subbed, setSubbed] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [subscribeError, setSubscribeError] = useState("");
  const subscribe = async (e) => {
    e.preventDefault();
    if (submitting) return;
    setSubmitting(true); setSubscribeError("");
    try {
      await api.post("/submissions/newsletter", { email });
      setSubbed(true);
    } catch { setSubscribeError("Could not save your email. Please try again."); }
    finally { setSubmitting(false); }
  };
  return (
    <footer className="bg-[#1C221F] text-[#FAFAF7] py-12 sm:py-16" data-testid="site-footer" style={{ paddingBottom: "calc(3rem + var(--sab, 0px))" }}>
      <div className="mx-auto max-w-6xl px-4 sm:px-6 grid md:grid-cols-2 gap-8 md:gap-10">
        <div>
          <div className="mb-4">
            <Logo className="h-20 w-20 sm:h-24 sm:w-24" />
          </div>
          <p className="text-white/60 text-sm leading-relaxed max-w-sm">{t("mkt.footer_tagline")}</p>
          <a href={`mailto:${contactEmail}`} className="text-sm text-[#B25A45] hover:underline mt-4 inline-block break-all">{contactEmail}</a>
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
                aria-label="Email address"
                className="flex-1 min-w-0 w-full rounded-full bg-white/10 border border-white/10 px-4 py-2.5 text-sm text-white placeholder:text-white/40 focus:outline-none focus:border-[#B25A45]"
              />
              <button type="submit" disabled={submitting} data-testid="footer-newsletter-submit" className="pill !bg-[#B25A45] !text-white !py-2 !px-4 !text-[13px]">{submitting ? "Saving…" : t("mkt.subscribe")}</button>
            </form>
          )}
          {subscribeError && <p role="alert" className="mt-2 text-sm text-[#efb9a8]" data-testid="footer-newsletter-error">{subscribeError}</p>}
        </div>
      </div>

      {/* Locations — online classes by city */}
      <nav aria-label="Online yoga classes by location" className="mx-auto max-w-6xl px-4 sm:px-6 mt-10 sm:mt-12 pt-8 border-t border-white/10" data-testid="footer-locations">
        <div className="flex flex-wrap items-end justify-between gap-3 mb-5">
          <div>
            <div className="eyebrow !text-[#B25A45] mb-1.5">Locations</div>
            <h2 className="serif text-xl sm:text-2xl text-white">Online classes available in Europe &amp; the US</h2>
          </div>
          <Link to="/locations" data-testid="footer-locations-all" className="inline-flex items-center gap-1.5 rounded-full border border-white/15 px-4 py-2 text-[13px] font-semibold text-white hover:border-[#B25A45] hover:text-[#F2C1B3] transition-colors">
            <MapPin className="h-3.5 w-3.5" /> All locations <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        </div>
        <div className="grid sm:grid-cols-2 gap-6">
          {[["europe", "Europe"], ["usa", "United States"]].map(([key, label]) => (
            <div key={key}>
              <Link to={`/locations?region=${key}`} className="text-xs font-semibold uppercase tracking-[0.18em] text-white/50 hover:text-white transition-colors">{label}</Link>
              <ul className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
                {FOOTER_CITIES[key].map((slug) => bySlug[slug] && (
                  <li key={slug}>
                    <Link to={locationPath(slug)} data-testid={`footer-location-${slug}`} className="text-white/70 hover:text-white transition-colors">
                      Yoga in {bySlug[slug].city}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </nav>

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
          {pages.map((p) => (
            <Link key={p.slug} to={`/${p.slug}`} data-testid={`footer-page-${p.slug}`} className="text-white/60 hover:text-white transition">{p.menu_label || p.title}</Link>
          ))}
          <Link to="/locations" data-testid="footer-locations-link" className="text-white/60 hover:text-white transition">Locations</Link>
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
