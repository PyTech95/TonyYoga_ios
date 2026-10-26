#!/usr/bin/env node
/**
 * Post-build SEO / GEO step (runs automatically after `yarn build`).
 *
 * The site is a single-page React app, so without this step every URL returns the
 * same empty HTML shell. Social previews (WhatsApp, Facebook, LinkedIn) and AI
 * crawlers (ChatGPT, Perplexity, Claude, Gemini) do not run JavaScript, and Google
 * indexes JS pages slower. This script writes, for every public page:
 *
 *   build/<path>/index.html   real title, description, canonical, Open Graph,
 *                             structured data (JSON-LD) and readable page text
 *   build/sitemap.xml         every public URL (incl. programs, shop, retreats if the
 *                             API is reachable at build time)
 *   build/robots.txt          crawl rules + sitemap location
 *   build/llms.txt            plain-text summary for AI assistants (llmstxt.org)
 *
 * The readable text sits inside #root and is hidden as soon as JavaScript runs,
 * then React renders the normal page — visitors see no difference.
 *
 * Config (read from env or frontend/.env*):
 *   REACT_APP_SITE_URL     public site, default https://tonyoga.com
 *   REACT_APP_BACKEND_URL  API origin used to list programs / products / retreats
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import * as S from "../src/seo/seoData.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "..");
// --- env (same files CRA reads for a production build) ---------------------
for (const f of [".env", ".env.production", ".env.local", ".env.production.local"]) {
  const p = path.join(root, f);
  if (!fs.existsSync(p)) continue;
  for (const line of fs.readFileSync(p, "utf8").split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2].replace(/^['"]|['"]$/g, "");
  }
}
// BUILD_PATH (same variable Create React App uses) lets the deploy script build into a
// staging folder and swap it in, so the live site never serves a half-written build.
const build = path.resolve(root, process.env.BUILD_PATH || "build");
const SITE_URL = (process.env.REACT_APP_SITE_URL || S.SITE.url).replace(/\/$/, "");
const API = process.env.REACT_APP_BACKEND_URL ? `${process.env.REACT_APP_BACKEND_URL.replace(/\/$/, "")}/api` : null;
// Where to read data from while pre-rendering. On the server the deploy script points this at
// the local backend (http://127.0.0.1:8001/api); public links still use REACT_APP_BACKEND_URL.
const API_FETCH = (process.env.PRERENDER_API_URL || API || "").replace(/\/$/, "") || null;
const today = new Date().toISOString().slice(0, 10);

if (!fs.existsSync(path.join(build, "index.html"))) {
  console.error("[prerender] build/index.html not found — run the React build first.");
  process.exit(1);
}
// Strip anything a previous run injected, so `yarn prerender` can be re-run safely.
const template = fs.readFileSync(path.join(build, "index.html"), "utf8")
  .replace(/<!--ty-seo-->[\s\S]*?<!--\/ty-seo-->\s*/g, "")
  .replace(/<div id="root"><!--ty-root-->[\s\S]*?<!--\/ty-root--><\/div>/, '<div id="root"></div>');

// --- helpers ---------------------------------------------------------------
const esc = (s) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const abs = (p) => (!p ? "" : /^https?:\/\//.test(p) ? p : `${SITE_URL}${p.startsWith("/") ? "" : "/"}${p}`);
const ld = (obj, page = false) => `<script type="application/ld+json"${page ? ' data-seo="page"' : ""}>${JSON.stringify(obj).replace(/</g, "\\u003c")}</script>`;
const strip = (o) => { const c = { ...o }; delete c["@context"]; return c; };
// Merge any mix of JSON-LD objects (with or without their own @graph) into one graph.
function graphOf(items) {
  const nodes = (items || []).filter(Boolean).flatMap((o) => (Array.isArray(o["@graph"]) ? o["@graph"] : [strip(o)]));
  return nodes.length ? { "@context": "https://schema.org", "@graph": nodes } : null;
}

async function getJson(p) {
  if (!API_FETCH) return null;
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 8000);
    const r = await fetch(`${API_FETCH}${p}`, { signal: ctrl.signal, headers: { accept: "application/json" } });
    clearTimeout(t);
    return r.ok ? await r.json() : null;
  } catch {
    return null;
  }
}

// --- admin-managed content (Admin → SEO & Google, Custom pages, Journal) ------------
const list = (x) => (Array.isArray(x) ? x : Array.isArray(x?.items) ? x.items : []);
const SEO = (await getJson("/seo/config")) || {};
const G = SEO.global || {};
const LOCS = S.mergeLocations(SEO); // built-in cities minus switched-off ones, plus added ones
const CMS = [];
for (const row of list(await getJson("/pages"))) {
  const full = await getJson(`/pages/${encodeURIComponent(row.slug)}`);
  if (full && full.slug) CMS.push(full);
}
const NEWS = list(await getJson("/news")).filter((n) => n.slug);
const CONTACT = G.organization_email || S.SITE.email;
const DEFAULT_IMAGE = G.default_image || S.SITE.image;

const ORG = S.orgJsonLd(SITE_URL);
if (G.organization_email) ORG.email = G.organization_email;
if (G.same_as?.length) ORG.sameAs = G.same_as;
if (G.default_description) ORG.description = G.default_description;
const SITE_GRAPH = { "@context": "https://schema.org", "@graph": [ORG, S.founderJsonLd(SITE_URL), S.websiteJsonLd(SITE_URL)] };

const NAV = [
  ["/", "Home"], ["/schedule", "Live class schedule"], ["/programs", "The Core Series"], ["/private-sessions", "Private sessions"],
  ["/workshops", "Retreats in Málaga"], ["/teacher-training", "Teacher training"], ["/memberships", "Membership"], ["/passes", "Class passes"],
  ["/meditations", "Meditation & breathwork"], ["/asanas", "Asana index"], ["/discover", "Discover"], ["/shop", "Shop"],
  ["/find-your-path", "Find your path quiz"], ["/locations", "Locations"], ["/support", "Support"],
];

function chrome(inner) {
  const pageLinks = CMS.filter((p) => p.show_in_header || p.show_in_footer).map((p) => [`/${p.slug}`, p.menu_label || p.title]);
  const nav = [...NAV, ...pageLinks, ["/news", "Journal"]].map(([href, label]) => `<a href="${href}">${esc(label)}</a>`).join(" · ");
  const cities = S.REGIONS.map((r) => {
    const here = LOCS.filter((l) => l.region === r.key);
    if (!here.length) return "";
    const items = here.map((l) => `<a href="${S.locationPath(l.slug)}">Yoga in ${esc(l.city)}</a>`).join(" · ");
    return `<p><strong>${esc(r.label)}:</strong> ${items}</p>`;
  }).join("");
  return `<header><a href="/"><strong>${esc(G.site_name || S.SITE.name)}</strong></a><nav aria-label="Main">${nav}</nav></header>
<main>${inner}</main>
<footer><h2>Online classes available in Europe &amp; the US</h2>${cities}
<p>${esc(G.site_name || S.SITE.name)} · ${esc(S.SITE.baseCity)}, ${esc(S.SITE.baseCountry)} · <a href="mailto:${esc(CONTACT)}">${esc(CONTACT)}</a> · <a href="/privacy">Privacy</a> · <a href="/terms">Terms</a></p></footer>`;
}

// Admin text → safe HTML: blank line = paragraph, "- " lines = list, **bold**, [text](link).
const safeHref = (h) => { const v = String(h || "").trim(); return (v.startsWith("/") && !v.startsWith("//")) || /^(https?:|mailto:|tel:)/i.test(v) ? v : null; };
const inline = (t) => esc(t)
  .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
  .replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (m, label, href) => { const h = safeHref(href.replace(/&amp;/g, "&")); return h ? `<a href="${esc(h)}">${label}</a>` : label; })
  .replace(/\n/g, "<br>");
const BULLET = /^\s*[-•*]\s+/;
const rich = (t) => String(t || "").replace(/\r\n/g, "\n").split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean).map((p) => {
  const runs = [];
  for (const line of p.split("\n")) {
    const list = BULLET.test(line);
    const last = runs[runs.length - 1];
    if (last && last.list === list) last.lines.push(line); else runs.push({ list, lines: [line] });
  }
  return runs.map((r) => (r.list ? `<ul>${r.lines.map((l) => `<li>${inline(l.replace(BULLET, ""))}</li>`).join("")}</ul>` : `<p>${inline(r.lines.join("\n"))}</p>`)).join("");
}).join("");
const plain = (t, max = 158) => { const v = String(t || "").replace(/\*\*([^*]+)\*\*/g, "$1").replace(/\[([^\]]+)\]\([^)]+\)/g, "$1").replace(/\s+/g, " ").trim(); return v.length > max ? `${v.slice(0, max - 1).replace(/\s+\S*$/, "")}…` : v; };
const imgUrl = (u) => (!u ? "" : u.startsWith("/api/") && API ? `${API.replace(/\/api$/, "")}${u}` : abs(u));

function blocksHtml(blocks) {
  return (blocks || []).map((b) => {
    switch (b.type) {
      case "heading": return b.level === 3 ? `<h3>${esc(b.text)}</h3>` : `<h2>${esc(b.text)}</h2>`;
      case "text": return rich(b.text);
      case "image": return `<figure><img src="${esc(imgUrl(b.src))}" alt="${esc(b.alt || "")}" loading="lazy" width="760">${b.caption ? `<figcaption>${esc(b.caption)}</figcaption>` : ""}</figure>`;
      case "button": { const h = safeHref(b.href); return h ? `<p><a href="${esc(h)}">${esc(b.label)}</a></p>` : ""; }
      case "list": return `<ul>${(b.items || []).map((x) => `<li>${inline(x)}</li>`).join("")}</ul>`;
      case "quote": return `<blockquote><p>${esc(b.text)}</p>${b.author ? `<footer>— ${esc(b.author)}</footer>` : ""}</blockquote>`;
      case "faq": return faqHtml(b.items || [], "Questions and answers");
      case "cards": return `<ul>${(b.items || []).map((c) => { const h = safeHref(c.href); return `<li>${h ? `<a href="${esc(h)}"><strong>${esc(c.title)}</strong></a>` : `<strong>${esc(c.title)}</strong>`}${c.text ? ` — ${esc(c.text)}` : ""}</li>`; }).join("")}</ul>`;
      case "video": return `<p><a href="${esc(imgUrl(b.url))}">${esc(b.caption || "Watch the video")}</a></p>`;
      default: return "";
    }
  }).join("\n");
}

const faqHtml = (faqs, heading = "Frequently asked questions") =>
  `<section><h2>${esc(heading)}</h2><dl>${faqs.map((f) => `<dt>${esc(f.q)}</dt><dd>${esc(f.a)}</dd>`).join("")}</dl></section>`;

const PRERENDER_CSS = `<style>.js .ty-prerender{display:none}.ty-prerender{max-width:760px;margin:0 auto;padding:24px 20px 48px;font:16px/1.6 Inter,system-ui,sans-serif;color:#1C221F}.ty-prerender h1{font:500 2rem/1.15 Fraunces,Georgia,serif}.ty-prerender h2{font:500 1.35rem/1.25 Fraunces,Georgia,serif;margin-top:2rem}.ty-prerender a{color:#8F4535}.ty-prerender nav,.ty-prerender footer{font-size:14px;color:#545E56;margin:12px 0}.ty-prerender dt{font-weight:600;margin-top:12px}.ty-prerender table{border-collapse:collapse}.ty-prerender td{padding:4px 12px 4px 0}</style>`;

function renderHtml({ route, title, description, image, type = "website", jsonLd = [], body, canonical = true, noindex = false }) {
  const url = `${SITE_URL}${route === "/" ? "/" : route}`;
  const img = imgUrl(image || DEFAULT_IMAGE);
  const head = [
    `<script>document.documentElement.className+=" js"</script>`,
    PRERENDER_CSS,
    `<meta name="description" content="${esc(description)}" data-seo="1" />`,
    noindex ? `<meta name="robots" content="noindex, nofollow" />` : "",
    canonical && !noindex ? `<link rel="canonical" href="${esc(url)}" />` : "",
    G.google_verification ? `<meta name="google-site-verification" content="${esc(G.google_verification)}" />` : "",
    G.bing_verification ? `<meta name="msvalidate.01" content="${esc(G.bing_verification)}" />` : "",
    `<meta property="og:site_name" content="${esc(G.site_name || S.SITE.name)}" />`,
    `<meta property="og:type" content="${type}" />`,
    `<meta property="og:title" content="${esc(title)}" />`,
    `<meta property="og:description" content="${esc(description)}" />`,
    `<meta property="og:url" content="${esc(url)}" />`,
    `<meta property="og:image" content="${esc(img)}" />`,
    `<meta property="og:locale" content="en_GB" />`,
    `<meta name="twitter:card" content="summary_large_image" />`,
    `<meta name="twitter:title" content="${esc(title)}" />`,
    `<meta name="twitter:description" content="${esc(description)}" />`,
    `<meta name="twitter:image" content="${esc(img)}" />`,
    ld(SITE_GRAPH),
    // Page-level data is tagged so the app replaces it when the visitor moves on.
    ...(graphOf(jsonLd) ? [ld(graphOf(jsonLd), true)] : []),
  ].filter(Boolean).join("\n        ");

  let html = template
    .replace(/<title>[\s\S]*?<\/title>/, `<title>${esc(title)}</title>`)
    .replace(/<meta name="description"[^>]*>\s*/i, "")
    .replace("</head>", `<!--ty-seo-->\n        ${head}\n<!--/ty-seo--></head>`)
    .replace(/<div id="root"><\/div>/, `<div id="root"><!--ty-root--><div class="ty-prerender">${chrome(body)}</div><!--/ty-root--></div>`);
  return html;
}

const written = [];
function write(route, html) {
  const file = route === "/" ? path.join(build, "index.html") : path.join(build, route.replace(/^\//, ""), "index.html");
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, html);
  written.push(route);
}

// --- data from the API (optional) -------------------------------------------
const [programs, products, workshops] = await Promise.all([getJson("/programs"), getJson("/products"), getJson("/workshops")]);
const PROGRAMS = list(programs), PRODUCTS = list(products).filter((p) => p.visible !== false), RETREATS = list(workshops);
console.log(`[prerender] site ${SITE_URL} · API ${API_FETCH || "(not set)"} · programs ${PROGRAMS.length}, products ${PRODUCTS.length}, retreats ${RETREATS.length}, pages ${CMS.length}, journal ${NEWS.length}, cities ${LOCS.length}`);

const programsHtml = PROGRAMS.length
  ? `<section><h2>Programs</h2><ul>${PROGRAMS.map((p) => `<li><a href="/programs/${p.id}">${esc(p.title)}</a> — ${esc(p.level || "")}${p.duration_weeks ? `, ${p.duration_weeks} weeks` : ""}. ${esc(p.description || "")}</li>`).join("")}</ul></section>`
  : "";

// --- static pages -------------------------------------------------------------
for (const [route, page] of Object.entries(S.PAGES)) {
  if (route === "/locations") continue; // rendered below with the city list
  let body = `<h1>${esc(page.h1)}</h1>${(page.intro || []).map((p) => `<p>${esc(p)}</p>`).join("")}`;
  const jsonLd = [];
  if (route === "/") {
    body += `<section><h2>About Tony Sanchez</h2><p>${esc(S.FOUNDER.description)}</p></section>`;
    body += programsHtml;
    body += faqHtml(S.SITE_FAQ);
    jsonLd.push(S.faqJsonLd(S.SITE_FAQ));
  }
  if (route === "/programs" && PROGRAMS.length) {
    body += programsHtml;
    jsonLd.push({ "@context": "https://schema.org", "@type": "ItemList", itemListElement: PROGRAMS.map((p, i) => ({ "@type": "ListItem", position: i + 1, item: strip(S.courseJsonLd(p, SITE_URL)) })) });
  }
  if (route === "/workshops" && RETREATS.length) {
    body += `<section><h2>Upcoming retreats</h2><ul>${RETREATS.map((w) => `<li><a href="/workshops/${w.id}">${esc(w.title)}</a> — ${esc(w.location || "")}${w.start_date ? `, ${new Date(w.start_date).toLocaleDateString("en-GB", { month: "long", year: "numeric" })}` : ""}</li>`).join("")}</ul></section>`;
  }
  if (route === "/news" && NEWS.length) {
    body += `<section><h2>Latest posts</h2><ul>${NEWS.map((n) => `<li><a href="/news/${esc(n.slug)}">${esc(n.title)}</a>${n.excerpt ? ` — ${esc(n.excerpt)}` : ""}</li>`).join("")}</ul></section>`;
  }
  if (route === "/shop" && PRODUCTS.length) {
    body += `<section><h2>Products</h2><ul>${PRODUCTS.map((p) => `<li><a href="/shop/${p.id}">${esc(p.title)}</a>${p.author ? ` by ${esc(p.author)}` : ""}</li>`).join("")}</ul></section>`;
  }
  if (route !== "/") jsonLd.push(S.breadcrumbJsonLd(SITE_URL, [{ name: "Home", path: "/" }, { name: page.h1, path: route }]));
  // Title, description and share image can be edited in Admin → SEO & Google.
  const meta = S.pageMeta(route, SEO);
  // The home page is index.html, which is also the fallback for app-only routes,
  // so it carries no canonical (each screen sets its own once it renders).
  write(route, renderHtml({ route, title: meta.title, description: meta.description, image: meta.image, jsonLd, body, canonical: route !== "/", noindex: meta.noindex }));
}

// --- locations hub ------------------------------------------------------------
{
  const page = S.PAGES["/locations"];
  const meta = S.pageMeta("/locations", SEO);
  const ref = new Date();
  let body = `<h1>${esc(page.h1)}</h1>${page.intro.map((p) => `<p>${esc(p)}</p>`).join("")}`;
  for (const r of S.REGIONS) {
    const here = LOCS.filter((x) => x.region === r.key);
    if (!here.length) continue;
    body += `<section><h2>${r.key === "usa" ? "Online yoga classes in the United States" : r.key === "europe" ? "Online yoga classes in Europe" : "Online yoga classes around the world"}</h2><ul>`;
    for (const l of here) {
      const h = S.hoursFromBase(l.timeZone, ref);
      const diff = h === 0 ? "same time as Málaga" : `${Math.abs(h)} h ${h > 0 ? "ahead of" : "behind"} Málaga`;
      body += `<li><a href="${S.locationPath(l.slug)}">Online yoga classes in ${esc(l.city)}</a> — ${esc(l.state || l.country)}, ${diff}</li>`;
    }
    body += `</ul></section>`;
  }
  const jsonLd = [
    { "@context": "https://schema.org", "@type": "CollectionPage", url: `${SITE_URL}/locations`, name: meta.title, description: meta.description,
      mainEntity: { "@type": "ItemList", itemListElement: LOCS.map((l, i) => ({ "@type": "ListItem", position: i + 1, name: `Online yoga classes in ${l.city}`, url: `${SITE_URL}${S.locationPath(l.slug)}` })) } },
    S.breadcrumbJsonLd(SITE_URL, [{ name: "Home", path: "/" }, { name: "Locations", path: "/locations" }]),
  ];
  write("/locations", renderHtml({ route: "/locations", title: meta.title, description: meta.description, image: meta.image, jsonLd, body, noindex: meta.noindex }));
}

// --- city pages -----------------------------------------------------------------
for (const l of LOCS) {
  const meta = S.locationMeta(l);
  const ref = new Date();
  const ex = S.exampleTimes(l, ref);
  let body = `<p><a href="/">Home</a> › <a href="/locations">Locations</a> › ${esc(l.city)}</p>`;
  body += `<h1>${esc(meta.h1)}</h1>${S.locationIntro(l).map((p) => `<p>${esc(p)}</p>`).join("")}`;
  body += `<section><h2>Class times in ${esc(l.city)}</h2><p>${esc(S.offsetSentence(l, ref))} Time zone: ${esc(S.timeZoneLabel(l, ref))}.</p>`;
  if (l.slug !== "malaga") body += `<table><caption>For example</caption><tbody>${ex.map((e) => `<tr><td>${e.base} in Málaga</td><td>${e.local} in ${esc(l.city)}</td></tr>`).join("")}</tbody></table>`;
  body += `<p>See the <a href="/schedule">live class schedule</a> — on this page every upcoming class is shown in ${esc(l.city)} time.</p></section>`;
  body += `<section><h2>Ways to practise with Tony from ${esc(l.city)}</h2><ul>
<li><a href="/schedule">Live classes on Zoom</a> — recordings are in your library within a day.</li>
<li><a href="/programs">The Core Series</a> — Core 26+, Core 40 and Core 84 on demand.</li>
<li><a href="/private-sessions">Private sessions</a> — one-to-one with Tony over Zoom.</li>
<li><a href="/workshops">Retreats in Málaga</a> — small groups of up to sixteen students.</li></ul></section>`;
  body += faqHtml(S.locationFaq(l), `Questions from students in ${l.city}`);
  body += `<section><h2>Online yoga classes near ${esc(l.city)}</h2><p>${S.nearbyLocations(l, 6, LOCS).map((n) => `<a href="${S.locationPath(n.slug)}">Yoga in ${esc(n.city)}</a>`).join(" · ")}</p></section>`;
  const jsonLd = [S.locationJsonLd(l, SITE_URL)];
  write(S.locationPath(l.slug), renderHtml({ route: S.locationPath(l.slug), title: meta.title, description: meta.description, jsonLd, body }));
}

// --- custom pages (Admin → Custom pages) -------------------------------------------
for (const p of CMS) {
  const route = `/${p.slug}`;
  const title = p.seo_title || `${p.title} | ${G.site_name || S.SITE.name}`;
  const firstText = (p.blocks || []).find((b) => b.type === "text")?.text || "";
  const description = plain(p.seo_description || p.intro || firstText, 300);
  const image = p.seo_image || p.cover_image;
  const faqs = (p.blocks || []).filter((b) => b.type === "faq").flatMap((b) => b.items || []).filter((x) => x.q && x.a);
  let body = `<p><a href="/">Home</a> › ${esc(p.menu_label || p.title)}</p>`;
  if (p.eyebrow) body += `<p><em>${esc(p.eyebrow)}</em></p>`;
  body += `<h1>${esc(p.title)}</h1>${p.intro ? `<p>${esc(p.intro)}</p>` : ""}`;
  if (p.cover_image) body += `<figure><img src="${esc(imgUrl(p.cover_image))}" alt="${esc(p.title)}" width="760"></figure>`;
  body += blocksHtml(p.blocks);
  const url = `${SITE_URL}${route}`;
  const jsonLd = [
    { "@context": "https://schema.org", "@type": p.slug.startsWith("about") ? "AboutPage" : "WebPage", "@id": url, url, name: title, description,
      isPartOf: { "@id": `${SITE_URL}/#website` }, ...(p.slug.startsWith("about") ? { about: { "@id": `${SITE_URL}/#organization` } } : {}),
      ...(image ? { primaryImageOfPage: { "@type": "ImageObject", url: imgUrl(image) } } : {}), ...(p.updated_at ? { dateModified: p.updated_at } : {}) },
    S.breadcrumbJsonLd(SITE_URL, [{ name: "Home", path: "/" }, { name: p.menu_label || p.title, path: route }]),
    ...(faqs.length ? [S.faqJsonLd(faqs)] : []),
  ];
  write(route, renderHtml({ route, title, description, image, jsonLd, body, noindex: !!p.noindex }));
}

// --- Journal posts (Admin → Journal & news) ------------------------------------------
for (const n of NEWS) {
  const post = (await getJson(`/news/${encodeURIComponent(n.slug)}`)) || n;
  const route = `/news/${post.slug}`;
  const url = `${SITE_URL}${route}`;
  const description = plain(post.excerpt || post.body, 300);
  const date = post.published_at || post.created_at;
  let body = `<p><a href="/">Home</a> › <a href="/news">Journal</a> › ${esc(post.title)}</p><h1>${esc(post.title)}</h1>`;
  if (date) body += `<p><time datetime="${esc(date)}">${new Date(date).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" })}</time> · ${esc(post.author_name || S.FOUNDER.name)}</p>`;
  if (post.cover_image) body += `<figure><img src="${esc(imgUrl(post.cover_image))}" alt="" width="760"></figure>`;
  if (post.excerpt) body += `<p><strong>${esc(post.excerpt)}</strong></p>`;
  body += rich(post.body);
  const jsonLd = [
    { "@context": "https://schema.org", "@type": post.category === "news" ? "NewsArticle" : "BlogPosting", "@id": url, url, mainEntityOfPage: url,
      headline: post.title.slice(0, 110), description, ...(post.cover_image ? { image: [imgUrl(post.cover_image)] } : {}),
      datePublished: date, dateModified: post.updated_at || date, author: { "@id": `${SITE_URL}/#founder` }, publisher: { "@id": `${SITE_URL}/#organization` },
      ...(post.tags?.length ? { keywords: post.tags.join(", ") } : {}), inLanguage: "en" },
    S.breadcrumbJsonLd(SITE_URL, [{ name: "Home", path: "/" }, { name: "Journal", path: "/news" }, { name: post.title, path: route }]),
  ];
  write(route, renderHtml({ route, title: `${post.title} | Tony Yoga Journal`, description, image: post.cover_image, type: "article", jsonLd, body }));
}

// --- programs / products / retreats (when the API was reachable) ----------------
for (const p of PROGRAMS) {
  const detail = (await getJson(`/programs/${p.id}`)) || p;
  const lessons = (detail.lessons || []).map((x) => x.video?.title).filter(Boolean);
  let body = `<p><a href="/programs">The Core Series</a> › ${esc(p.title)}</p><h1>${esc(p.title)}</h1><p>${esc(p.description || "")}</p>`;
  body += `<p>Level: ${esc(p.level || "all levels")}${p.duration_weeks ? ` · ${p.duration_weeks} weeks` : ""} · taught by ${esc(S.FOUNDER.name)} · on demand, online.</p>`;
  if (detail.benefits?.length) body += `<ul>${detail.benefits.map((b) => `<li>${esc(b)}</li>`).join("")}</ul>`;
  if (lessons.length) body += `<section><h2>${lessons.length} lessons</h2><ol>${lessons.map((t) => `<li>${esc(t)}</li>`).join("")}</ol></section>`;
  write(`/programs/${p.id}`, renderHtml({
    route: `/programs/${p.id}`, title: `${p.title} — Online Yoga Program with Tony Sanchez | Tony Yoga`,
    description: (p.description || p.title).slice(0, 158), image: p.cover_image, jsonLd: [S.courseJsonLd(detail, SITE_URL)], body,
  }));
}
for (const p of PRODUCTS) {
  const body = `<p><a href="/shop">Shop</a> › ${esc(p.title)}</p><h1>${esc(p.title)}</h1>${p.author ? `<p>by ${esc(p.author)}</p>` : ""}<p>${esc(p.description || "")}</p>`;
  write(`/shop/${p.id}`, renderHtml({ route: `/shop/${p.id}`, title: `${p.title} | Tony Yoga Shop`, description: (p.description || p.title).slice(0, 158), image: p.images?.[0], type: "product", jsonLd: [S.productJsonLd(p, SITE_URL)], body }));
}
for (const w of RETREATS) {
  const when = w.start_date ? new Date(w.start_date).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" }) : "";
  const body = `<p><a href="/workshops">Retreats</a> › ${esc(w.title)}</p><h1>${esc(w.title)}</h1>${w.subtitle ? `<p><em>${esc(w.subtitle)}</em></p>` : ""}<p>${esc(w.description || "")}</p><p>${esc(w.location || "")}${when ? ` · from ${when}` : ""}${w.capacity ? ` · ${w.capacity} places` : ""}</p>`;
  write(`/workshops/${w.id}`, renderHtml({ route: `/workshops/${w.id}`, title: `${w.title} — Yoga Retreat in Málaga, Spain | Tony Yoga`, description: ([w.subtitle, w.description].filter(Boolean).join(" ") || w.title).slice(0, 158), image: w.cover_image, jsonLd: [S.retreatJsonLd(w, SITE_URL)], body }));
}

// --- sitemap.xml ----------------------------------------------------------------
const urls = [];
const push = (loc, priority, changefreq) => urls.push(`  <url><loc>${esc(`${SITE_URL}${loc === "/" ? "/" : loc}`)}</loc><lastmod>${today}</lastmod><changefreq>${changefreq}</changefreq><priority>${priority.toFixed(1)}</priority></url>`);
const SITEMAP_SKIP = new Set(["/challenges", "/account-deletion"]);
for (const [route, page] of Object.entries(S.PAGES)) {
  if (SITEMAP_SKIP.has(route) || S.NOINDEX_PREFIXES.some((p) => route === p || route.startsWith(`${p}/`))) continue;
  if (S.pageMeta(route, SEO).noindex) continue;
  push(route, page.priority ?? 0.5, page.changefreq || "monthly");
}
for (const p of CMS) if (!p.noindex) push(`/${p.slug}`, 0.7, "monthly");
for (const n of NEWS) push(`/news/${n.slug}`, 0.6, "monthly");
for (const l of LOCS) push(S.locationPath(l.slug), 0.7, "weekly");
for (const p of PROGRAMS) push(`/programs/${p.id}`, 0.8, "weekly");
for (const w of RETREATS) push(`/workshops/${w.id}`, 0.7, "weekly");
for (const p of PRODUCTS) push(`/shop/${p.id}`, 0.5, "weekly");
fs.writeFileSync(path.join(build, "sitemap.xml"), `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.join("\n")}\n</urlset>\n`);

// --- robots.txt ---------------------------------------------------------------------
const disallow = ["/admin", "/instructor", "/profile", "/cart", "/checkout/", "/menu", "/streak", "/wishlist", "/referrals", "/library", "/magic-link", "/reset-password", "/certificate/", "/api/"];
const rules = disallow.map((d) => `Disallow: ${d}`).join("\n");
fs.writeFileSync(path.join(build, "robots.txt"), `# Tony Yoga — ${SITE_URL}
# Search engines and AI assistants are welcome to read the public pages.

User-agent: *
Allow: /
${rules}

# AI search & assistant crawlers (allowed, same rules)
User-agent: GPTBot
User-agent: OAI-SearchBot
User-agent: ChatGPT-User
User-agent: ClaudeBot
User-agent: Claude-SearchBot
User-agent: Claude-User
User-agent: PerplexityBot
User-agent: Perplexity-User
User-agent: Google-Extended
User-agent: Applebot-Extended
User-agent: Bingbot
Allow: /
${rules}

Sitemap: ${SITE_URL}/sitemap.xml
`);

// --- llms.txt (https://llmstxt.org) -------------------------------------------------
const L = [];
L.push(`# ${S.SITE.name}`, "", `> ${S.SITE.description}`, "");
L.push(
  `${S.SITE.name} (${SITE_URL}) is the online yoga school of ${S.FOUNDER.name}, based in ${S.SITE.baseCity}, ${S.SITE.baseCountry}. Classes are taught in English, streamed live on Zoom in Central European Time, and every live class is added to the student's on-demand library within a day. Students join from across Europe and the United States, on the website or the Tony Yoga app for iPhone and Android.`,
  "",
  "Key facts:",
  `- Teacher: ${S.FOUNDER.name} — ${S.FOUNDER.description}`,
  "- Lineage: Ghosh lineage hatha yoga (Kolkata), teaching since 1986.",
  "- Programs: Core 26+ (beginner foundation), Core 40 (intermediate), Core 84 (the full Ghosh system of 84 asanas, for practitioners with 3+ years).",
  "- Live classes: on Zoom from Málaga; book a single class, use a class pass or join with a membership (cancel anytime).",
  "- Private sessions: one-to-one with Tony on Zoom, single sessions or packages.",
  "- Retreats: small groups of up to sixteen students in Málaga, Spain; €500 deposit, refundable up to 60 days before.",
  "- Teacher training: 200, 300 and 500-hour paths in Málaga.",
  `- Contact: ${CONTACT}`,
  "",
  "## Main pages",
);
for (const [route, page] of Object.entries(S.PAGES)) {
  if (["/privacy", "/terms", "/account-deletion"].includes(route)) continue;
  L.push(`- [${page.h1}](${SITE_URL}${route === "/" ? "/" : route}): ${page.description}`);
}
if (CMS.length) {
  L.push("", "## About & services");
  for (const p of CMS.filter((x) => !x.noindex)) L.push(`- [${p.title}](${SITE_URL}/${p.slug}): ${plain(p.seo_description || p.intro || "", 300)}`);
}
if (PROGRAMS.length) {
  L.push("", "## Programs");
  for (const p of PROGRAMS) L.push(`- [${p.title}](${SITE_URL}/programs/${p.id}): ${(p.description || "").replace(/\s+/g, " ")}${p.duration_weeks ? ` (${p.level}, ${p.duration_weeks} weeks)` : ""}`);
}
if (RETREATS.length) {
  L.push("", "## Retreats");
  for (const w of RETREATS) L.push(`- [${w.title}](${SITE_URL}/workshops/${w.id}): ${w.location || ""}${w.start_date ? `, ${w.start_date.slice(0, 10)}` : ""}`);
}
if (NEWS.length) {
  L.push("", "## Journal");
  for (const n of NEWS.slice(0, 30)) L.push(`- [${n.title}](${SITE_URL}/news/${n.slug}): ${plain(n.excerpt || n.body, 200)}`);
}
L.push("", "## Online classes by location");
for (const r of S.REGIONS) {
  if (!LOCS.some((x) => x.region === r.key)) continue;
  L.push("", `### ${r.label}`);
  for (const l of LOCS.filter((x) => x.region === r.key)) L.push(`- [Online yoga classes in ${l.city}](${SITE_URL}${S.locationPath(l.slug)}): ${S.offsetSentence(l).split(". ")[0].replace(/\.$/, "")}.`);
}
L.push("", "## FAQ");
for (const f of S.SITE_FAQ) L.push(`- **${f.q}** ${f.a}`);
L.push("", "## Optional", `- [Privacy policy](${SITE_URL}/privacy)`, `- [Terms of service](${SITE_URL}/terms)`, `- [Sitemap](${SITE_URL}/sitemap.xml)`, "");
fs.writeFileSync(path.join(build, "llms.txt"), L.join("\n"));

// --- remove pages from an earlier run that no longer exist (deleted page, post or city) ---
{
  const manifestFile = path.join(build, ".prerender-manifest.json");
  let previous = [];
  try { previous = JSON.parse(fs.readFileSync(manifestFile, "utf8")); } catch { /* first run */ }
  const now = new Set(written);
  let removed = 0;
  for (const route of Array.isArray(previous) ? previous : []) {
    if (typeof route !== "string" || route === "/" || now.has(route) || route.includes("..")) continue;
    const file = path.join(build, route.replace(/^\//, ""), "index.html");
    if (!file.startsWith(build + path.sep)) continue;
    try { fs.unlinkSync(file); removed += 1; } catch { /* already gone */ }
    try { fs.rmdirSync(path.dirname(file)); } catch { /* not empty */ }
  }
  fs.writeFileSync(manifestFile, JSON.stringify(written));
  if (removed) console.log(`[prerender] removed ${removed} page(s) that no longer exist`);
}

console.log(`[prerender] wrote ${written.length} HTML pages, sitemap.xml (${urls.length} URLs), robots.txt, llms.txt`);
