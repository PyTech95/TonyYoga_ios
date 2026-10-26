import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Save, Search, ChevronDown, Globe, MapPin, Plus, Trash2, ExternalLink, FileText, RefreshCw } from "lucide-react";
import { api } from "@/lib/api";
import Spinner from "@/components/Spinner";
import { ContentImageInput } from "@/components/ContentImageInput";
import { Field, inputCls, Toggle } from "./shared";
import { PAGES, SITE, LOCATIONS, REGIONS } from "@/seo/seoData.mjs";
import { SITE_URL } from "@/lib/seo";
import { invalidateSiteData } from "@/lib/siteData";

const PAGE_LABELS = {
  "/": "Homepage", "/programs": "Programs (Core Series)", "/schedule": "Live class schedule", "/memberships": "Memberships",
  "/passes": "Class passes", "/workshops": "Retreats", "/teacher-training": "Teacher training", "/private-sessions": "Private sessions",
  "/meditations": "Meditation & breath", "/asanas": "Asana index", "/discover": "Discover", "/shop": "Shop", "/news": "Journal",
  "/broadcasts": "Podcast", "/find-your-path": "Find your path quiz", "/challenges": "30-day challenge", "/support": "Support",
  "/privacy": "Privacy policy", "/terms": "Terms", "/account-deletion": "Delete account", "/locations": "Locations",
};

// Status of the pre-built copy of every page that search engines and link previews read.
function SearchCopyStatus() {
  const [st, setSt] = useState(null);
  const load = () => api.get("/admin/seo/refresh").then(({ data }) => setSt(data)).catch(() => setSt(null));
  useEffect(() => { load(); }, []);
  useEffect(() => {
    if (st?.state !== "running" && st?.state !== "queued") return undefined;
    const id = setTimeout(load, 4000);
    return () => clearTimeout(id);
  }, [st]);
  const run = async () => {
    try { const { data } = await api.post("/admin/seo/refresh"); setSt((x) => ({ ...x, ...data })); setTimeout(load, 1500); }
    catch { toast.error("Could not start the update"); }
  };
  if (!st) return null;
  if (!st.configured) {
    return <p className="text-white/60 text-[12px]" data-testid="seo-refresh-off">Changes show on the live site straight away. The pre-built copy that link previews (WhatsApp, Facebook) and some AI tools read is refreshed with the next website build — your developer can switch on automatic refresh (PRERENDER_COMMAND, see VPS_DEPLOYMENT.md).</p>;
  }
  const when = st.finished_at ? new Date(st.finished_at).toLocaleString() : "";
  const label = st.state === "running" || st.state === "queued" ? "Updating…" : st.state === "ok" ? `Up to date · ${when}` : st.state === "failed" ? `Last update failed · ${when}` : "Not updated yet";
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 pt-1" data-testid="seo-refresh">
      <p className="text-white/70 text-[12.5px]">Search-engine copy: <span className="font-semibold text-white">{label}</span>. It refreshes by itself a few seconds after you save SEO, pages or Journal posts.</p>
      <button onClick={run} disabled={st.state === "running" || st.state === "queued"} className="pill !bg-white/10 !text-white !border-white/20 !py-1.5 !px-3 !text-[12px] disabled:opacity-60" data-testid="seo-refresh-now">
        <RefreshCw className={`h-3.5 w-3.5 ${st.state === "running" ? "animate-spin" : ""}`} /> Update now
      </button>
    </div>
  );
}

function Counter({ value, ideal }) {
  const n = (value || "").length;
  return <span className={`text-[11px] ${n > ideal ? "text-[#B25A45] font-semibold" : "text-[#9AA096]"}`}>{n}/{ideal}</span>;
}

function GooglePreview({ title, description, path }) {
  return (
    <div className="rounded-xl border border-[#E5E6DF] bg-white p-3 text-left" aria-label="Google preview">
      <div className="text-[11px] text-[#5f6368] truncate">{SITE_URL.replace(/^https?:\/\//, "")}{path === "/" ? "" : path}</div>
      <div className="text-[16px] leading-snug text-[#1a0dab] line-clamp-2">{title || "(no title)"}</div>
      <div className="text-[12.5px] leading-snug text-[#4d5156] line-clamp-2 mt-0.5">{description || "(no description)"}</div>
    </div>
  );
}

let TIME_ZONES = [];
try { TIME_ZONES = Intl.supportedValuesOf("timeZone"); } catch { TIME_ZONES = []; }

export default function SeoPane() {
  const [data, setData] = useState(null);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [open, setOpen] = useState(null);
  const [q, setQ] = useState("");
  const [newCity, setNewCity] = useState({ city: "", country: "", countryCode: "", region: "europe", timeZone: "", lat: "", lon: "", state: "" });

  useEffect(() => {
    api.get("/admin/seo").then(({ data }) => setData(data)).catch(() => setData({ global: {}, pages: {}, locations: { disabled: [], notes: {}, custom: [] } }));
  }, []);

  const change = (fn) => { setData((d) => fn(structuredCloneSafe(d))); setDirty(true); };
  const setGlobal = (k, v) => change((d) => { d.global = { ...d.global, [k]: v }; return d; });
  const setPage = (path, k, v) => change((d) => { d.pages = { ...d.pages, [path]: { ...(d.pages[path] || {}), [k]: v } }; return d; });
  const toggleCity = (slug, on) => change((d) => {
    const set = new Set(d.locations.disabled || []);
    if (on) set.delete(slug); else set.add(slug);
    d.locations = { ...d.locations, disabled: [...set] };
    return d;
  });
  const setNote = (slug, v) => change((d) => { d.locations = { ...d.locations, notes: { ...(d.locations.notes || {}), [slug]: v } }; return d; });
  const removeCustom = (slug) => change((d) => { d.locations = { ...d.locations, custom: (d.locations.custom || []).filter((c) => c.slug !== slug) }; return d; });

  const addCity = () => {
    const c = newCity;
    if (!c.city.trim() || !c.country.trim() || !c.timeZone.trim()) return toast.error("City, country and time zone are required.");
    const slug = c.city.trim().toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
    const all = [...LOCATIONS, ...(data.locations.custom || [])];
    if (all.some((l) => l.slug === slug)) return toast.error(`${c.city} is already in the list.`);
    change((d) => {
      d.locations = { ...d.locations, custom: [...(d.locations.custom || []), {
        slug, city: c.city.trim(), country: c.country.trim(), countryCode: c.countryCode.trim().toUpperCase().slice(0, 2),
        region: c.region, timeZone: c.timeZone.trim(), state: c.state.trim() || null,
        ...(c.lat !== "" ? { lat: Number(c.lat) } : {}), ...(c.lon !== "" ? { lon: Number(c.lon) } : {}),
      }] };
      return d;
    });
    setNewCity({ city: "", country: "", countryCode: "", region: c.region, timeZone: "", lat: "", lon: "", state: "" });
    toast.success(`${c.city} added — remember to Save`);
  };

  const save = async () => {
    setSaving(true);
    try {
      const { data: saved } = await api.put("/admin/seo", {
        ...data,
        global: { ...data.global, same_as: String(data.global.same_as_text ?? (data.global.same_as || []).join("\n")).split(/\s+/).filter(Boolean) },
      });
      setData(saved); setDirty(false);
      invalidateSiteData("seo_config");
      toast.success("SEO saved. Google sees it on the next crawl.");
    } catch (e) {
      toast.error(typeof e?.response?.data?.detail === "string" ? e.response.data.detail : "Could not save SEO settings.");
    } finally { setSaving(false); }
  };

  const pageRows = useMemo(() => Object.entries(PAGES)
    .map(([path, p]) => ({ path, label: PAGE_LABELS[path] || path, def: p }))
    .filter((r) => !q || `${r.label} ${r.path}`.toLowerCase().includes(q.toLowerCase())), [q]);

  if (!data) return <Spinner />;
  const g = data.global || {};
  const allCities = [...LOCATIONS.map((l) => ({ ...l, builtIn: true })), ...(data.locations.custom || [])];
  const disabled = new Set(data.locations.disabled || []);

  return (
    <div className="space-y-6 min-w-0" data-testid="seo-pane">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="eyebrow mb-1">Search &amp; AI visibility</div>
          <h2 className="serif text-2xl sm:text-3xl">SEO &amp; Google</h2>
          <p className="text-[13px] text-[#6B7269] mt-1 max-w-2xl">Titles and descriptions Google shows for each page, the image used when a link is shared, your Search Console codes and the city pages under Locations.</p>
        </div>
        <button onClick={save} disabled={saving || !dirty} data-testid="seo-save" className="pill pill-primary disabled:opacity-50"><Save className="h-4 w-4" /> {saving ? "Saving…" : dirty ? "Save changes" : "Saved"}</button>
      </div>

      {/* Global */}
      <section className="rounded-2xl bg-white border border-[#E5E6DF] p-5 space-y-4" data-testid="seo-global">
        <div className="flex items-center gap-2"><Globe className="h-4 w-4 text-[#B25A45]" /><h3 className="font-semibold">Whole website</h3></div>
        <div className="grid md:grid-cols-2 gap-4">
          <Field label="Website name" hint={`Default: ${SITE.name}`}>
            <input className={inputCls} value={g.site_name || ""} placeholder={SITE.name} onChange={(e) => setGlobal("site_name", e.target.value)} data-testid="seo-site-name" />
          </Field>
          <Field label="Contact email (shown to Google)">
            <input className={inputCls} value={g.organization_email || ""} placeholder={SITE.email} onChange={(e) => setGlobal("organization_email", e.target.value)} />
          </Field>
        </div>
        <Field label={<span className="flex justify-between gap-2"><span>Default description</span><Counter value={g.default_description} ideal={160} /></span>} hint="Used when a page has no description of its own.">
          <textarea rows={2} className={inputCls} value={g.default_description || ""} placeholder={SITE.description} onChange={(e) => setGlobal("default_description", e.target.value)} data-testid="seo-default-description" />
        </Field>
        <ContentImageInput absolute label="Default share image (WhatsApp, Facebook, LinkedIn previews)" tid="seo-default-image" value={g.default_image || ""} onChange={(v) => setGlobal("default_image", v)} hint="Best size 1200 × 630 px." />
        <div className="grid md:grid-cols-2 gap-4">
          <Field label="Google Search Console code" hint="Search Console → Settings → Ownership verification → HTML tag. Paste the tag or just the code.">
            <input className={inputCls} value={g.google_verification || ""} onChange={(e) => setGlobal("google_verification", e.target.value)} data-testid="seo-google-code" />
          </Field>
          <Field label="Bing Webmaster code" hint="Bing Webmaster Tools → Add site → HTML meta tag.">
            <input className={inputCls} value={g.bing_verification || ""} onChange={(e) => setGlobal("bing_verification", e.target.value)} data-testid="seo-bing-code" />
          </Field>
        </div>
        <Field label="Social profiles (one link per line)" hint="Helps Google connect Instagram, Facebook, YouTube… to Tony Yoga.">
          <textarea rows={3} className={inputCls} value={g.same_as_text ?? (g.same_as?.length ? g.same_as : SITE.sameAs).join("\n")} onChange={(e) => setGlobal("same_as_text", e.target.value)} />
        </Field>
      </section>

      {/* Pages */}
      <section className="rounded-2xl bg-white border border-[#E5E6DF] p-5 space-y-4" data-testid="seo-pages">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2"><FileText className="h-4 w-4 text-[#B25A45]" /><h3 className="font-semibold">Pages</h3></div>
          <div className="relative w-full sm:w-64">
            <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[#9AA096]" />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Find a page" className={`${inputCls} !pl-9 !py-2`} />
          </div>
        </div>
        <p className="text-[12px] text-[#6B7269]">Programs, products, retreats and your own pages (Admin → Custom pages) use their own title and description automatically.</p>
        <ul className="divide-y divide-[#EFEFE9] rounded-xl border border-[#E5E6DF]">
          {pageRows.map(({ path, label, def }) => {
            const o = data.pages[path] || {};
            const isOpen = open === path;
            const title = o.title || def.title, description = o.description || def.description;
            return (
              <li key={path} data-testid={`seo-page-${path === "/" ? "home" : path.slice(1)}`}>
                <button type="button" onClick={() => setOpen(isOpen ? null : path)} className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-[#FAFAF7]">
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-semibold text-[#1C221F]">{label} {o.noindex && <span className="ml-1 rounded-full bg-[#F7ECE8] px-2 py-0.5 text-[10px] text-[#8A4433]">hidden from Google</span>}{(o.title || o.description) && <span className="ml-1 rounded-full bg-[#EEF1EC] px-2 py-0.5 text-[10px] text-[#5C7355]">edited</span>}</span>
                    <span className="block text-[12px] text-[#6B7269] truncate">{title}</span>
                  </span>
                  <ChevronDown className={`h-4 w-4 shrink-0 text-[#9AA096] transition-transform ${isOpen ? "rotate-180" : ""}`} />
                </button>
                {isOpen && (
                  <div className="px-4 pb-4 space-y-3">
                    <Field label={<span className="flex justify-between gap-2"><span>Title in Google</span><Counter value={o.title || def.title} ideal={60} /></span>}>
                      <input className={inputCls} value={o.title ?? ""} placeholder={def.title} onChange={(e) => setPage(path, "title", e.target.value)} data-testid="seo-page-title" />
                    </Field>
                    <Field label={<span className="flex justify-between gap-2"><span>Description in Google</span><Counter value={o.description || def.description} ideal={160} /></span>}>
                      <textarea rows={3} className={inputCls} value={o.description ?? ""} placeholder={def.description} onChange={(e) => setPage(path, "description", e.target.value)} data-testid="seo-page-description" />
                    </Field>
                    <ContentImageInput absolute label="Share image (optional)" tid={`seo-image-${path.slice(1) || "home"}`} value={o.image || ""} onChange={(v) => setPage(path, "image", v)} />
                    <label className="flex items-center justify-between gap-3 text-sm">
                      <span>Hide this page from Google</span>
                      <Toggle checked={!!o.noindex} onChange={(v) => setPage(path, "noindex", v)} />
                    </label>
                    <GooglePreview title={title} description={description} path={path} />
                    <a href={path} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-xs font-semibold text-[#B25A45]">Open page <ExternalLink className="h-3 w-3" /></a>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      </section>

      {/* Locations */}
      <section className="rounded-2xl bg-white border border-[#E5E6DF] p-5 space-y-4" data-testid="seo-locations">
        <div className="flex items-center gap-2"><MapPin className="h-4 w-4 text-[#B25A45]" /><h3 className="font-semibold">Locations (online classes by city)</h3></div>
        <p className="text-[12px] text-[#6B7269]">Each city has its own page at <code>/locations/city</code>, linked from the website footer. Switch off cities you don't market to, and add a local note (students, offers, events) — unique local text helps those pages rank.</p>
        {REGIONS.concat([{ key: "world", label: "Rest of the world" }]).map((r) => {
          const list = allCities.filter((c) => c.region === r.key);
          if (!list.length) return null;
          return (
            <div key={r.key}>
              <div className="text-[11px] uppercase tracking-widest font-semibold text-[#839682] mb-2">{r.label}</div>
              <ul className="divide-y divide-[#EFEFE9] rounded-xl border border-[#E5E6DF]">
                {list.map((c) => {
                  const on = !disabled.has(c.slug);
                  return (
                    <li key={c.slug} className="px-4 py-3 space-y-2" data-testid={`seo-city-${c.slug}`}>
                      <div className="flex items-center gap-3">
                        <Toggle checked={on} onChange={(v) => toggleCity(c.slug, v)} tid={`seo-city-toggle-${c.slug}`} />
                        <span className="min-w-0 flex-1">
                          <span className="block text-sm font-semibold">{c.city}</span>
                          <span className="block text-[11px] text-[#6B7269]">{c.state || c.country} · {c.timeZone}{!c.builtIn && " · added by you"}</span>
                        </span>
                        <a href={`/locations/${c.slug}`} target="_blank" rel="noreferrer" className="text-[#9AA096] hover:text-[#B25A45]" aria-label={`Open ${c.city} page`}><ExternalLink className="h-4 w-4" /></a>
                        {!c.builtIn && <button type="button" onClick={() => removeCustom(c.slug)} className="text-[#B25A45]" aria-label={`Remove ${c.city}`}><Trash2 className="h-4 w-4" /></button>}
                      </div>
                      {on && (
                        <textarea rows={2} className={`${inputCls} !text-[13px]`} placeholder={`Local note for ${c.city} (optional) — e.g. “Join 40+ students in ${c.city} who practise with Tony every week.”`}
                          value={data.locations.notes?.[c.slug] || ""} onChange={(e) => setNote(c.slug, e.target.value)} />
                      )}
                    </li>
                  );
                })}
              </ul>
            </div>
          );
        })}
        <div className="rounded-xl bg-[#FAFAF7] border border-[#E5E6DF] p-4 space-y-3" data-testid="seo-add-city">
          <div className="text-sm font-semibold">Add a city</div>
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
            <input className={inputCls} placeholder="City" value={newCity.city} onChange={(e) => setNewCity({ ...newCity, city: e.target.value })} data-testid="seo-new-city" />
            <input className={inputCls} placeholder="Country" value={newCity.country} onChange={(e) => setNewCity({ ...newCity, country: e.target.value })} data-testid="seo-new-country" />
            <input className={inputCls} placeholder="Country code (e.g. GB)" maxLength={2} value={newCity.countryCode} onChange={(e) => setNewCity({ ...newCity, countryCode: e.target.value })} />
            <select className={inputCls} value={newCity.region} onChange={(e) => setNewCity({ ...newCity, region: e.target.value })} data-testid="seo-new-region">
              <option value="europe">Europe</option><option value="usa">United States</option><option value="world">Rest of the world</option>
            </select>
            <input className={inputCls} placeholder="Time zone (e.g. Europe/London)" list="seo-tz-list" value={newCity.timeZone} onChange={(e) => setNewCity({ ...newCity, timeZone: e.target.value })} data-testid="seo-new-tz" />
            <datalist id="seo-tz-list">{TIME_ZONES.map((t) => <option key={t} value={t} />)}</datalist>
            <input className={inputCls} placeholder="State (US only)" value={newCity.state} onChange={(e) => setNewCity({ ...newCity, state: e.target.value })} />
            <input className={inputCls} placeholder="Latitude (optional)" inputMode="decimal" value={newCity.lat} onChange={(e) => setNewCity({ ...newCity, lat: e.target.value })} />
            <input className={inputCls} placeholder="Longitude (optional)" inputMode="decimal" value={newCity.lon} onChange={(e) => setNewCity({ ...newCity, lon: e.target.value })} />
          </div>
          <button type="button" onClick={addCity} className="pill pill-ghost !py-2 !text-[13px]" data-testid="seo-add-city-btn"><Plus className="h-4 w-4" /> Add city</button>
        </div>
      </section>

      <section className="rounded-2xl bg-[#1C221F] text-[#FAFAF7] p-5 space-y-2 text-sm">
        <div className="font-semibold">Files for Google and AI search</div>
        <p className="text-white/70 text-[13px]">Generated with every website build: <a className="underline" href="/sitemap.xml" target="_blank" rel="noreferrer">sitemap.xml</a> · <a className="underline" href="/robots.txt" target="_blank" rel="noreferrer">robots.txt</a> · <a className="underline" href="/llms.txt" target="_blank" rel="noreferrer">llms.txt</a>. Submit the sitemap once in Google Search Console.</p>
        <SearchCopyStatus />
      </section>

      {dirty && (
        <div className="sticky bottom-3 z-10 flex justify-end">
          <button onClick={save} disabled={saving} className="pill pill-primary shadow-lg"><Save className="h-4 w-4" /> {saving ? "Saving…" : "Save changes"}</button>
        </div>
      )}
    </div>
  );
}

function structuredCloneSafe(o) {
  try { return structuredClone(o); } catch { return JSON.parse(JSON.stringify(o)); }
}
