import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { MapPin, Video, Clock, GraduationCap, User, MountainSnow, ArrowRight, Smartphone, ChevronDown, CalendarDays } from "lucide-react";
import SiteHeader from "@/components/SiteHeader";
import SiteFooter from "@/components/SiteFooter";
import Spinner from "@/components/Spinner";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { useSeo, SITE_URL } from "@/lib/seo";
import { useSeoConfig } from "@/lib/siteData";
import {
  findLocation, locationMeta, locationIntro, locationFaq, locationJsonLd, offsetSentence, exampleTimes,
  timeZoneLabel, nearbyLocations, locationPath, mergeLocations,
} from "@/seo/seoData.mjs";

function fmt(iso, timeZone, opts) {
  try { return new Intl.DateTimeFormat(undefined, { timeZone, ...opts }).format(new Date(iso)); } catch { return ""; }
}

export default function LocationDetail() {
  const { slug } = useParams();
  const config = useSeoConfig();
  const list = useMemo(() => mergeLocations(config), [config]);
  const loc = findLocation(slug, list);
  const loadingConfig = config === undefined;
  const { user } = useAuth();
  const [classes, setClasses] = useState(null);
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 30000);
    return () => clearInterval(id);
  }, []);
  useEffect(() => {
    if (!loc) return;
    api.get("/class-instances?upcoming=true").then(({ data }) => setClasses(Array.isArray(data) ? data : [])).catch(() => setClasses([]));
  }, [loc]);

  const meta = loc ? locationMeta(loc) : null;
  useSeo(loc
    ? { title: meta.title, description: meta.description, jsonLd: locationJsonLd(loc, SITE_URL) }
    : loadingConfig ? null : { title: "Location not found | Tony Yoga", description: "This location page does not exist.", noindex: true });

  const upcoming = useMemo(() => {
    if (!classes || !loc) return [];
    return classes
      .filter((c) => c.status !== "cancelled")
      .filter((c) => loc.slug === "malaga" || c.location_type === "online")
      .slice(0, 8);
  }, [classes, loc]);

  if (!loc && loadingConfig) {
    return <div className="min-h-screen bg-[#FAFAF7]"><SiteHeader /><Spinner /></div>;
  }
  if (!loc) {
    return (
      <div className="min-h-screen bg-[#FAFAF7]">
        <SiteHeader />
        <main className="mx-auto max-w-2xl px-5 py-20 text-center">
          <MapPin className="mx-auto h-8 w-8 text-[#C9CBBF]" />
          <h1 className="serif text-3xl mt-4">We couldn't find that location.</h1>
          <p className="text-sm text-[#6B7269] mt-2">Classes are online, so you can join from anywhere.</p>
          <Link to="/locations" className="pill pill-primary mt-6 inline-flex">All locations <ArrowRight className="h-4 w-4" /></Link>
        </main>
        <SiteFooter />
      </div>
    );
  }

  const intro = locationIntro(loc);
  const faqs = locationFaq(loc);
  const examples = exampleTimes(loc, now);
  const near = nearbyLocations(loc, 6, list);
  const tzLabel = timeZoneLabel(loc, now);
  const place = loc.state && loc.state !== loc.city ? `${loc.state}, United States` : loc.country;
  const openApp = () => window.dispatchEvent(new Event("tony-open-downloads"));

  const ways = [
    { to: "/schedule", icon: Video, title: "Live classes on Zoom", text: `Join Tony live from ${loc.city}. Recordings land in your library within a day.` },
    { to: "/programs", icon: GraduationCap, title: "The Core Series", text: "Core 26+, Core 40 and Core 84 — step-by-step on-demand programs." },
    { to: "/private-sessions", icon: User, title: "Private sessions", text: "One-to-one with Tony over Zoom: posture, breath and a plan for your body." },
    { to: "/workshops", icon: MountainSnow, title: "Retreats in Málaga", text: "Small-group retreats of up to sixteen students in Andalusia." },
  ];

  return (
    <div className="min-h-screen bg-[#FAFAF7]" data-testid="location-detail" data-location={loc.slug}>
      <SiteHeader />
      <main>
        {/* Hero */}
        <section className="mx-auto max-w-6xl px-4 sm:px-6 pt-8 sm:pt-14 pb-8 grid lg:grid-cols-[1.3fr_1fr] gap-8 lg:gap-12 items-start">
          <div className="min-w-0">
            <nav aria-label="Breadcrumb" className="text-xs text-[#6B7269] mb-4">
              <Link to="/" className="hover:text-[#B25A45]">Home</Link> <span aria-hidden="true">›</span>{" "}
              <Link to="/locations" className="hover:text-[#B25A45]">Locations</Link> <span aria-hidden="true">›</span>{" "}
              <span className="text-[#1C221F]">{loc.city}</span>
            </nav>
            <div className="eyebrow mb-3">{place} · Online</div>
            <h1 className="serif text-[2.1rem] leading-[1.06] sm:text-5xl lg:text-6xl font-medium" data-testid="location-title">{meta.h1}</h1>
            <div className="mt-5 space-y-3 text-[15px] sm:text-base leading-relaxed text-[#545E56] max-w-2xl">
              {intro.map((p) => <p key={p}>{p}</p>)}
            </div>
            <div className="mt-6 flex flex-wrap gap-3">
              <a href="#schedule" className="pill pill-primary">Class times in {loc.city} <ArrowRight className="h-4 w-4" /></a>
              <Link to={user ? "/home" : "/register"} className="pill pill-ghost bg-white">{user ? "Open my practice" : "Start free"}</Link>
            </div>
          </div>

          {/* Time card */}
          <aside className="rounded-3xl bg-white border border-[#E5E6DF] p-5 sm:p-6" aria-label={`Time in ${loc.city}`}>
            <div className="flex items-center gap-2 text-[#B25A45]"><Clock className="h-4 w-4" /><span className="eyebrow !text-[#B25A45]">Time in {loc.city}</span></div>
            <div className="mt-2 flex items-baseline gap-2 flex-wrap">
              <span className="serif text-4xl" data-testid="location-local-time">{fmt(now, loc.timeZone, { hour: "numeric", minute: "2-digit" })}</span>
              <span className="text-sm text-[#6B7269]">{tzLabel}</span>
            </div>
            <p className="mt-3 text-sm leading-relaxed text-[#545E56]">{offsetSentence(loc, now)}</p>
            {loc.slug !== "malaga" && (
              <div className="mt-4 rounded-2xl bg-[#F7F6F1] p-3">
                <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[#839682] mb-2">For example</div>
                <table className="w-full text-sm">
                  <thead className="sr-only"><tr><th>Málaga</th><th>{loc.city}</th></tr></thead>
                  <tbody>
                    {examples.map((e) => (
                      <tr key={e.base} className="border-t border-[#E5E6DF] first:border-0">
                        <td className="py-1.5 text-[#6B7269]">{e.base} in Málaga</td>
                        <td className="py-1.5 text-right font-semibold text-[#1C221F]">{e.local} in {loc.city}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </aside>
        </section>

        {/* Upcoming live classes in local time */}
        <section id="schedule" className="mx-auto max-w-6xl px-4 sm:px-6 py-8 scroll-mt-28">
          <div className="flex flex-wrap items-end justify-between gap-3 mb-5">
            <div>
              <div className="eyebrow mb-1.5">Upcoming · {loc.city} time</div>
              <h2 className="serif text-2xl sm:text-3xl">Live yoga classes you can join from {loc.city}</h2>
            </div>
            <Link to="/schedule" className="text-sm font-semibold text-[#B25A45] hover:underline">Full schedule →</Link>
          </div>
          {classes === null ? <Spinner /> : upcoming.length === 0 ? (
            <div className="rounded-3xl border border-dashed border-[#D8D9D0] bg-white px-6 py-10 text-center text-sm text-[#6B7269]">
              New live classes are added every week. Meanwhile, practise any class on demand from the Core Series.
              <div className="mt-4"><Link to="/programs" className="pill pill-primary inline-flex">Explore the Core Series</Link></div>
            </div>
          ) : (
            <ul className="grid gap-3 md:grid-cols-2" data-testid="location-classes">
              {upcoming.map((c) => (
                <li key={c.id}>
                  <Link to={`/schedule/${c.id}`} className="flex gap-4 rounded-2xl bg-white border border-[#E5E6DF] p-4 hover:border-[#B25A45] transition-colors">
                    <div className="w-[5.5rem] shrink-0">
                      <div className="text-[11px] font-semibold uppercase tracking-wider text-[#B25A45]">{fmt(c.start_time, loc.timeZone, { weekday: "short", day: "numeric", month: "short" })}</div>
                      <div className="serif text-xl leading-tight mt-0.5">{fmt(c.start_time, loc.timeZone, { hour: "numeric", minute: "2-digit" })}</div>
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="font-semibold text-[15px] text-[#1C221F] leading-snug">{c.title}</div>
                      <div className="text-xs text-[#6B7269] mt-0.5"><span className="capitalize">{[c.style, c.level].filter(Boolean).join(" · ")}</span>{c.duration_minutes ? ` · ${c.duration_minutes} min` : ""}</div>
                      <div className="mt-1.5 inline-flex items-center gap-1 text-[11px] text-[#545E56]">
                        <CalendarDays className="h-3 w-3" /> {fmt(c.start_time, "Europe/Madrid", { hour: "numeric", minute: "2-digit" })} in Málaga · {c.location_type === "online" ? "Zoom" : "Studio"}
                      </div>
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* Ways to practise */}
        <section className="mx-auto max-w-6xl px-4 sm:px-6 py-8">
          <h2 className="serif text-2xl sm:text-3xl mb-5">Ways to practise with Tony from {loc.city}</h2>
          <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {ways.map((w) => (
              <li key={w.to}>
                <Link to={w.to} className="block h-full rounded-2xl bg-white border border-[#E5E6DF] p-5 hover:border-[#B25A45] transition-colors">
                  <w.icon className="h-5 w-5 text-[#B25A45]" />
                  <div className="serif text-lg mt-3 leading-tight">{w.title}</div>
                  <p className="text-sm text-[#6B7269] mt-1.5 leading-relaxed">{w.text}</p>
                </Link>
              </li>
            ))}
          </ul>
          <button type="button" onClick={openApp} className="mt-4 inline-flex items-center gap-2 text-sm font-semibold text-[#B25A45] hover:underline">
            <Smartphone className="h-4 w-4" /> Get the Tony Yoga app for iPhone and Android
          </button>
        </section>

        {/* FAQ */}
        <section className="mx-auto max-w-3xl px-4 sm:px-6 py-10" aria-labelledby="loc-faq">
          <h2 id="loc-faq" className="serif text-2xl sm:text-3xl mb-5">Questions from students in {loc.city}</h2>
          <div className="divide-y divide-[#E5E6DF] rounded-3xl border border-[#E5E6DF] bg-white">
            {faqs.map((f, i) => (
              <details key={f.q} className="group px-5 py-4" open={i === 0}>
                <summary className="flex cursor-pointer list-none items-start justify-between gap-4 font-semibold text-[15px] text-[#1C221F] [&::-webkit-details-marker]:hidden">
                  <span>{f.q}</span>
                  <ChevronDown className="h-4 w-4 mt-1 shrink-0 text-[#839682] transition-transform group-open:rotate-180" />
                </summary>
                <p className="mt-2 text-sm leading-relaxed text-[#545E56]">{f.a}</p>
              </details>
            ))}
          </div>
        </section>

        {/* Nearby */}
        <section className="mx-auto max-w-6xl px-4 sm:px-6 pb-14">
          <h2 className="eyebrow mb-3">Online yoga classes near {loc.city}</h2>
          <div className="flex flex-wrap gap-2">
            {near.map((n) => (
              <Link key={n.slug} to={locationPath(n.slug)} className="rounded-full border border-[#E5E6DF] bg-white px-3.5 py-2 text-[13px] text-[#545E56] hover:border-[#B25A45] hover:text-[#B25A45] transition-colors">
                Yoga in {n.city}
              </Link>
            ))}
            <Link to="/locations" className="rounded-full px-3.5 py-2 text-[13px] font-semibold text-[#B25A45] hover:underline">All locations →</Link>
          </div>
        </section>
      </main>
      <SiteFooter />
    </div>
  );
}
