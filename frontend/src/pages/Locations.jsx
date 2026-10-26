import { useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { MapPin, Search, X, ArrowRight, Clock, Video, Check } from "lucide-react";
import SiteHeader from "@/components/SiteHeader";
import SiteFooter from "@/components/SiteFooter";
import { useSeo, SITE_URL } from "@/lib/seo";
import { useSeoConfig } from "@/lib/siteData";
import {
  REGIONS, PAGES, locationPath, hoursFromBase, breadcrumbJsonLd, mergeLocations, pageMeta,
} from "@/seo/seoData.mjs";

const page = PAGES["/locations"];

function diffBadge(tz, now) {
  const h = hoursFromBase(tz, now);
  if (h === 0) return "Same time as Málaga";
  const n = Math.abs(h);
  return `${n} h ${h > 0 ? "ahead of" : "behind"} Málaga`;
}

function localClock(tz, now) {
  try {
    return new Intl.DateTimeFormat(undefined, { timeZone: tz, hour: "numeric", minute: "2-digit" }).format(now);
  } catch { return ""; }
}

const parseList = (v) => (v ? v.split(",").map((s) => s.trim()).filter(Boolean) : []);

export default function Locations() {
  const config = useSeoConfig();
  // Built-in cities + cities added in Admin → SEO & Google (minus switched-off ones).
  const LOCATIONS = useMemo(() => mergeLocations(config), [config]);
  const AVAIL = useMemo(() => REGIONS.filter((r) => LOCATIONS.some((l) => l.region === r.key)), [LOCATIONS]);
  const meta = pageMeta("/locations", config);
  const [params, setParams] = useSearchParams();
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 30000);
    return () => clearInterval(id);
  }, []);

  const regionParam = parseList(params.get("region")).filter((r) => AVAIL.some((x) => x.key === r));
  const regions = regionParam.length ? regionParam : AVAIL.map((r) => r.key);
  const countries = parseList(params.get("country"));
  const q = params.get("q") || "";

  const update = (next) => {
    const p = new URLSearchParams(params);
    Object.entries(next).forEach(([k, v]) => {
      if (!v || (Array.isArray(v) && !v.length)) p.delete(k);
      else p.set(k, Array.isArray(v) ? v.join(",") : v);
    });
    setParams(p, { replace: true });
  };

  const toggleRegion = (key) => {
    const set = new Set(regions);
    if (set.has(key) && set.size > 1) set.delete(key); else set.add(key);
    const nextRegions = AVAIL.map((r) => r.key).filter((k) => set.has(k));
    // Drop country filters that no longer belong to a selected region.
    const keep = countries.filter((cc) => LOCATIONS.some((l) => (l.countryCode === cc || `US-${l.state}` === cc) && set.has(l.region)));
    update({ region: nextRegions.length === AVAIL.length ? null : nextRegions, country: keep });
  };
  const toggleCountry = (cc) => {
    const set = new Set(countries);
    if (set.has(cc)) set.delete(cc); else set.add(cc);
    update({ country: [...set] });
  };

  const countryOptions = useMemo(() => {
    const seen = new Map();
    LOCATIONS.filter((l) => regions.includes(l.region)).forEach((l) => {
      const key = l.region === "usa" ? `US-${l.state}` : l.countryCode;
      if (!seen.has(key)) seen.set(key, { key, cc: l.region === "usa" ? key : l.countryCode, label: l.region === "usa" ? l.state : l.country, region: l.region });
    });
    return [...seen.values()];
  }, [regions, LOCATIONS]);

  const results = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return LOCATIONS.filter((l) => regions.includes(l.region))
      .filter((l) => !countries.length || countries.includes(l.countryCode) || countries.includes(`US-${l.state}`))
      .filter((l) => !needle || `${l.city} ${l.country} ${l.state || ""}`.toLowerCase().includes(needle));
  }, [regions, countries, q, LOCATIONS]);

  const grouped = useMemo(() => {
    const out = [];
    AVAIL.forEach((r) => {
      const inRegion = results.filter((l) => l.region === r.key);
      if (!inRegion.length) return;
      const byGroup = new Map();
      inRegion.forEach((l) => {
        const g = r.key === "usa" ? (l.state || l.country) : l.country;
        if (!byGroup.has(g)) byGroup.set(g, []);
        byGroup.get(g).push(l);
      });
      out.push({ region: r, groups: [...byGroup.entries()] });
    });
    return out;
  }, [results, AVAIL]);

  useSeo({
    title: meta.title,
    description: meta.description,
    image: meta.image,
    noindex: meta.noindex,
    jsonLd: {
      "@context": "https://schema.org",
      "@graph": [
        {
          "@type": "CollectionPage", "@id": `${SITE_URL}/locations`, url: `${SITE_URL}/locations`, name: meta.title, description: meta.description,
          isPartOf: { "@id": `${SITE_URL}/#website` },
          mainEntity: {
            "@type": "ItemList",
            itemListElement: LOCATIONS.map((l, i) => ({ "@type": "ListItem", position: i + 1, name: `Online yoga classes in ${l.city}`, url: `${SITE_URL}${locationPath(l.slug)}` })),
          },
        },
        breadcrumbJsonLd(SITE_URL, [{ name: "Home", path: "/" }, { name: "Locations", path: "/locations" }]),
      ],
    },
  });

  const filtersActive = regionParam.length > 0 || countries.length > 0 || q;

  return (
    <div className="min-h-screen bg-[#FAFAF7]" data-testid="locations-page">
      <SiteHeader />
      <main>
        <section className="mx-auto max-w-6xl px-4 sm:px-6 pt-8 sm:pt-14 pb-6">
          <nav aria-label="Breadcrumb" className="text-xs text-[#6B7269] mb-4">
            <Link to="/" className="hover:text-[#B25A45]">Home</Link> <span aria-hidden="true">›</span> <span className="text-[#1C221F]">Locations</span>
          </nav>
          <div className="eyebrow mb-3">Locations · Online classes</div>
          <h1 className="serif text-[2.1rem] leading-[1.06] sm:text-5xl lg:text-6xl font-medium max-w-3xl">{page.h1}</h1>
          <p className="mt-5 max-w-2xl text-[15px] sm:text-base leading-relaxed text-[#545E56]">{page.intro[0]}</p>
          <div className="mt-6 flex flex-wrap gap-2 text-[13px] text-[#545E56]">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-white border border-[#E5E6DF] px-3 py-1.5"><Video className="h-3.5 w-3.5 text-[#B25A45]" /> Live on Zoom</span>
            <span className="inline-flex items-center gap-1.5 rounded-full bg-white border border-[#E5E6DF] px-3 py-1.5"><Check className="h-3.5 w-3.5 text-[#B25A45]" /> Recordings within a day</span>
            <span className="inline-flex items-center gap-1.5 rounded-full bg-white border border-[#E5E6DF] px-3 py-1.5"><Clock className="h-3.5 w-3.5 text-[#B25A45]" /> Now {localClock("Europe/Madrid", now)} in Málaga</span>
          </div>
        </section>

        {/* Filters */}
        <section aria-label="Choose locations" className="sticky z-30 top-[calc(var(--sat,0px)+72px)] sm:top-[calc(var(--sat,0px)+80px)] bg-[#FAFAF7]/95 backdrop-blur border-y border-[#E5E6DF]">
          <div className="mx-auto max-w-6xl px-4 sm:px-6 py-3 space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              {AVAIL.map((r) => {
                const on = regions.includes(r.key);
                return (
                  <button
                    key={r.key}
                    type="button"
                    onClick={() => toggleRegion(r.key)}
                    aria-pressed={on}
                    data-testid={`locations-region-${r.key}`}
                    className={`pill !py-2 !px-4 !text-[13px] ${on ? "pill-primary" : "pill-ghost bg-white"}`}
                  >
                    {on && <Check className="h-3.5 w-3.5" />}{r.label}
                  </button>
                );
              })}
              <div className="relative ml-auto w-full sm:w-64">
                <Search className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-[#9AA096]" />
                <input
                  value={q}
                  onChange={(e) => update({ q: e.target.value })}
                  placeholder="Search your city"
                  aria-label="Search your city"
                  data-testid="locations-search"
                  className="w-full rounded-full border border-[#E5E6DF] bg-white pl-10 pr-9 py-2.5 text-sm focus:outline-none focus:border-[#B25A45]"
                />
                {q && (
                  <button type="button" onClick={() => update({ q: null })} aria-label="Clear search" className="absolute right-2 top-1/2 -translate-y-1/2 h-7 w-7 flex items-center justify-center rounded-full text-[#9AA096] hover:text-[#B25A45]">
                    <X className="h-4 w-4" />
                  </button>
                )}
              </div>
            </div>
            <div className="flex gap-2 overflow-x-auto no-scrollbar -mx-4 px-4 sm:mx-0 sm:px-0 sm:flex-wrap" data-testid="locations-countries">
              {countryOptions.map((c) => {
                const on = countries.includes(c.cc);
                return (
                  <button
                    key={c.key}
                    type="button"
                    onClick={() => toggleCountry(c.cc)}
                    aria-pressed={on}
                    className={`shrink-0 rounded-full border px-3 py-1.5 text-[12px] font-medium transition-colors ${on ? "border-[#B25A45] bg-[#FBF1EE] text-[#8F4535]" : "border-[#E5E6DF] bg-white text-[#545E56] hover:border-[#B25A45]"}`}
                  >
                    {c.label}
                  </button>
                );
              })}
              {filtersActive && (
                <button type="button" onClick={() => setParams(new URLSearchParams(), { replace: true })} className="shrink-0 rounded-full px-3 py-1.5 text-[12px] font-semibold text-[#B25A45] hover:underline">
                  Show all
                </button>
              )}
            </div>
          </div>
        </section>

        {/* Results */}
        <section className="mx-auto max-w-6xl px-4 sm:px-6 py-8 sm:py-10" aria-live="polite">
          <p className="text-xs text-[#6B7269] mb-6" data-testid="locations-count">{results.length} {results.length === 1 ? "location" : "locations"} · classes are online, so you can join from anywhere</p>
          {grouped.length === 0 ? (
            <div className="rounded-3xl border border-dashed border-[#D8D9D0] bg-white px-6 py-12 text-center">
              <MapPin className="mx-auto h-7 w-7 text-[#C9CBBF]" />
              <p className="mt-3 font-semibold text-[#1C221F]">Your city isn't listed yet — you can still join.</p>
              <p className="mt-1 text-sm text-[#6B7269]">Every class is online. See the schedule in your own time zone.</p>
              <Link to="/schedule" className="pill pill-primary mt-5 inline-flex">See live classes <ArrowRight className="h-4 w-4" /></Link>
            </div>
          ) : (
            <div className="space-y-10">
              {grouped.map(({ region, groups }) => (
                <div key={region.key}>
                  <h2 className="serif text-2xl sm:text-3xl mb-5">{region.key === "usa" ? "Online yoga classes in the United States" : region.key === "europe" ? "Online yoga classes in Europe" : "Online yoga classes around the world"}</h2>
                  <div className="space-y-6">
                    {groups.map(([group, list]) => (
                      <div key={group}>
                        <h3 className="eyebrow mb-3">{group}</h3>
                        <ul className="grid grid-cols-1 min-[440px]:grid-cols-2 lg:grid-cols-3 gap-3">
                          {list.map((l) => (
                            <li key={l.slug}>
                              <Link
                                to={locationPath(l.slug)}
                                data-testid={`location-card-${l.slug}`}
                                className="group flex items-center gap-3 rounded-2xl bg-white border border-[#E5E6DF] p-4 hover:border-[#B25A45] transition-colors"
                              >
                                <span className="h-10 w-10 shrink-0 rounded-full bg-[#FBF1EE] flex items-center justify-center">
                                  <MapPin className="h-4 w-4 text-[#B25A45]" />
                                </span>
                                <span className="min-w-0 flex-1">
                                  <span className="block font-semibold text-[15px] text-[#1C221F] leading-tight">Yoga in {l.city}</span>
                                  <span className="block text-[12px] text-[#6B7269] mt-0.5 truncate">
                                    {diffBadge(l.timeZone, now)} · now {localClock(l.timeZone, now)}
                                  </span>
                                </span>
                                <ArrowRight className="h-4 w-4 shrink-0 text-[#C3C6BE] group-hover:text-[#B25A45] transition-colors" />
                              </Link>
                            </li>
                          ))}
                        </ul>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        <section className="mx-auto max-w-6xl px-4 sm:px-6 pb-14">
          <div className="rounded-3xl bg-[#1C221F] text-[#FAFAF7] p-6 sm:p-10 grid md:grid-cols-[1fr_auto] gap-6 items-center">
            <div>
              <div className="eyebrow !text-[#E7B9AC] mb-2">Wherever you are</div>
              <h2 className="serif text-2xl sm:text-3xl leading-tight">Live with Tony, or on demand when the time doesn't work.</h2>
              <p className="mt-3 text-sm text-white/70 max-w-xl leading-relaxed">Every live class is added to your library within a day. Start with Core 26+ if you are new — Tony meets you where you are.</p>
            </div>
            <div className="flex flex-wrap gap-3">
              <Link to="/schedule" className="pill pill-primary">Live schedule <ArrowRight className="h-4 w-4" /></Link>
              <Link to="/programs" className="pill !bg-white/10 !text-white hover:!bg-white/20">The Core Series</Link>
            </div>
          </div>
        </section>
      </main>
      <SiteFooter />
    </div>
  );
}
