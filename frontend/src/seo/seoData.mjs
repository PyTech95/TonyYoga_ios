// Single source of truth for search (SEO) and AI-answer (GEO) content.
// Used by the React app at runtime (lib/seo.js, Locations pages) and by
// scripts/prerender.mjs at build time, which writes real HTML for every public
// page so Google, Bing and AI crawlers (ChatGPT, Perplexity, Claude, Gemini) can
// read it without running JavaScript.
//
// To add a city: append an entry to LOCATIONS below and rebuild. Nothing else.
// This file must stay dependency-free (no imports) so Node can load it directly.

export const SITE = {
  name: "Tony Yoga",
  alternateName: "TonYoga",
  url: "https://tonyoga.com",
  email: "tonyoga.online@gmail.com",
  logo: "/brand/logo.png",
  image: "/brand/tony/og-tony.jpg",
  portrait: "/brand/tony/tony-portrait.jpg",
  founded: "1986",
  baseCity: "Málaga",
  baseRegion: "Andalusia",
  baseCountry: "Spain",
  baseCountryCode: "ES",
  baseTimeZone: "Europe/Madrid",
  baseLat: 36.7213,
  baseLon: -4.4214,
  tagline: "Slow down. Breathe in. Begin again.",
  description:
    "Live online yoga classes on Zoom, on-demand Core Series programs and small-group retreats in Málaga, Spain with Tony Sanchez — Ghosh lineage hatha yoga, taught since 1986.",
  sameAs: [
    "https://www.instagram.com/tonyoga_school/",
    "https://www.facebook.com/TonYoga.online/",
    "https://www.youtube.com/channel/UCrOeMWIAVwYhPwwF5cQZk3g",
    "https://www.linkedin.com/in/tonysanchezyoga/",
    "https://play.google.com/store/apps/details?id=com.tonyoga.app",
  ],
  languages: ["English", "Spanish"],
};

export const FOUNDER = {
  name: "Tony Sanchez",
  jobTitle: "Founder & lead instructor",
  description:
    "Tony Sanchez has practised yoga for over five decades. A direct student of Bikram Choudhury in the 1970s and a keeper of the Ghosh lineage from Kolkata, he trained at Ghosh's College of Physical Education in Kolkata (1983) and created The Ideal Yoga Practice — Core 26+, Core 40 and Core 84 — refined over thousands of teaching hours in California, Mexico and Spain.",
  knowsAbout: ["Hatha yoga", "Ghosh lineage yoga", "Core 26+", "Core 40", "Core 84", "84 asanas", "Pranayama", "Yoga teacher training"],
};

// The same answers students see on the home page (Marketing → FAQ).
export const SITE_FAQ = [
  {
    q: "I'm a total beginner — is Tony Yoga for me?",
    a: "Yes. The beginner has an advantage — no habits to unlearn. Start with Core 26+ and come to a live class; Tony meets you where you are and gives you the modifications you need.",
  },
  {
    q: "Do I need to attend the Zoom classes live?",
    a: "No. Live is warmer — you can ask questions and be corrected — but every class is added to your library within a day, so you can practise it as often as you like.",
  },
  {
    q: "What's the difference between Core 26+, Core 40 and Core 84?",
    a: "Core 26+ is the foundation Bikram gave the world, with the two postures he later removed. Core 40 refines what 26+ builds — deeper breath, slower entry, more precise alignment. Core 84 is the full Ghosh system, for practitioners with at least three years on the mat.",
  },
  {
    q: "Can I cancel my membership at any time?",
    a: "Yes. One tap in your profile. Your access continues until the paid period ends.",
  },
  {
    q: "Where are the retreats?",
    a: "In Málaga, Spain. The house holds sixteen students so Tony can watch every student every day. A €500 deposit reserves a seat and is fully refundable up to sixty days before the retreat.",
  },
];

// Static public pages. `h1` + `intro` + `links` become the pre-rendered HTML body.
export const PAGES = {
  "/": {
    title: "Tony Yoga — Online Yoga Classes with Tony Sanchez | Ghosh Lineage",
    description: SITE.description,
    h1: "Tony Yoga — live online yoga, on-demand programs and retreats with Tony Sanchez",
    intro: [
      "Fifty years on the mat with Tony Sanchez. Live classes on Zoom, the on-demand Core Series (Core 26+, Core 40 and Core 84), private one-to-one sessions and small-group retreats in Málaga, Spain.",
      "Tony teaches hatha yoga as it was taught to him in the Ghosh lineage of Kolkata: slowly, precisely, and with reverence for the breath. Classes are open to complete beginners and experienced teachers alike.",
    ],
    faq: true,
    priority: 1.0,
    changefreq: "weekly",
  },
  "/programs": {
    title: "The Core Series — On-Demand Yoga Programs | Tony Yoga",
    description: "Core 26+, Core 40 and Core 84 — Tony Sanchez's on-demand hatha yoga programs from the Ghosh lineage. Step-by-step video lessons you can follow at home, anywhere.",
    h1: "The Core Series — three on-demand yoga programs, one lineage",
    intro: [
      "Core 26+ is the beginner-friendly foundation. Core 40 deepens breath and alignment. Core 84 is the complete Ghosh system of 84 classical asanas for experienced practitioners.",
      "Every program is taught by Tony Sanchez in detailed video lessons you can watch on the website or in the Tony Yoga app for iPhone and Android.",
    ],
    priority: 0.9,
    changefreq: "weekly",
  },
  "/schedule": {
    title: "Live Online Yoga Class Schedule (Zoom) | Tony Yoga",
    description: "Book live yoga classes with Tony Sanchez on Zoom, streamed from Málaga, Spain. See this week's schedule in your own time zone and practise from anywhere.",
    h1: "Live yoga class schedule",
    intro: [
      "Live classes stream on Zoom from Málaga, Spain (Central European Time). Book a single class, use a class pass or join with a membership.",
      "Every live class is added to your library within a day, so you can practise it again whenever suits you.",
    ],
    priority: 0.9,
    changefreq: "daily",
  },
  "/memberships": {
    title: "Yoga Membership — Live Classes & On-Demand Library | Tony Yoga",
    description: "One membership for live Zoom classes, the full on-demand library and the Core Series programs. Cancel anytime from your profile.",
    h1: "One membership. Every practice.",
    intro: ["Live classes, the full on-demand library and workshops with Tony Sanchez — cancel anytime."],
    priority: 0.8,
    changefreq: "monthly",
  },
  "/passes": {
    title: "Yoga Class Passes — Drop-in & 5-Class Packs | Tony Yoga",
    description: "Pay per class with no commitment: a drop-in class or a 5-class pack for Tony Sanchez's live online yoga classes.",
    h1: "Class passes — pay as you go",
    intro: ["Buy a single drop-in class or a 5-class pack. Credits are used when you join a live class."],
    priority: 0.6,
    changefreq: "monthly",
  },
  "/workshops": {
    title: "Yoga Retreats in Málaga, Spain | Tony Yoga",
    description: "Small-group yoga retreats with Tony Sanchez in Málaga, Andalusia — sixteen students, twice-daily practice and deep instruction in the Ghosh 84.",
    h1: "Yoga retreats in Málaga, Spain",
    intro: ["Small-group retreats in Andalusia: sixteen students, two practices a day and deep instruction in the Ghosh 84. Reserve a seat with a deposit."],
    priority: 0.8,
    changefreq: "weekly",
  },
  "/teacher-training": {
    title: "Yoga Teacher Training (200 · 300 · 500 hour) | Tony Yoga",
    description: "Yoga teacher training with Tony Sanchez in Málaga, Spain — yoga philosophy, history, principles of practice and movement in the planes. 200, 300 and 500-hour paths.",
    h1: "Yoga teacher training with Tony Sanchez",
    intro: ["For advanced students and teachers: yoga philosophy, history, principles of practice and movement in the planes, taught live in Málaga, Spain. 200, 300 and 500-hour certified paths."],
    priority: 0.8,
    changefreq: "monthly",
  },
  "/private-sessions": {
    title: "Private Yoga Sessions with Tony Sanchez on Zoom | Tony Yoga",
    description: "One-to-one yoga with Tony Sanchez over Zoom — posture refinement, breath and a plan for your body. Book single sessions or packages from Tony's openings.",
    h1: "Private yoga sessions with Tony Sanchez",
    intro: ["Work directly with Tony over Zoom — posture refinement, breath and a plan for your body. Choose a single session or a package, with times reserved from Tony's available openings."],
    priority: 0.8,
    changefreq: "weekly",
  },
  "/meditations": {
    title: "Guided Meditation, Breathwork & Yoga Nidra | Tony Yoga",
    description: "Guided meditations, breathwork and yoga nidra to steady the mind, calm the nervous system and rest deeply — free to explore with Tony Yoga.",
    h1: "Meditation & breathwork",
    intro: ["Guided meditations, breathwork and yoga nidra to steady the mind, calm the nervous system and rest deeply."],
    priority: 0.7,
    changefreq: "weekly",
  },
  "/asanas": {
    title: "Asana Index — Yoga Poses, Sanskrit Names & Benefits | Tony Yoga",
    description: "Every posture across the Core programs — English name, Sanskrit, benefits and a short video clip. Search a pose or browse by family.",
    h1: "Asana index — yoga poses with Sanskrit names and benefits",
    intro: ["Every posture across the Core programs with its English and Sanskrit name, benefits and a short clip."],
    priority: 0.7,
    changefreq: "weekly",
  },
  "/discover": {
    title: "Discover Online Yoga Classes & Programs | Tony Yoga",
    description: "Browse every Tony Yoga program and on-demand class. Filter by focus, level, style or the minutes you have today.",
    h1: "Discover classes and programs",
    intro: ["Browse every program and on-demand class. Filter by what you need today — a focus, a level, or the minutes you have."],
    priority: 0.6,
    changefreq: "weekly",
  },
  "/shop": {
    title: "Yoga Shop — Books, Mats & Props | Tony Yoga",
    description: "Books by Tony Sanchez, cork mats, blocks and apparel — objects for practice from Tony Yoga.",
    h1: "Shop — objects for practice",
    intro: ["Books by Tony Sanchez, cork mats, blocks and apparel."],
    priority: 0.6,
    changefreq: "weekly",
  },
  "/news": {
    title: "Journal — Writing on Yoga Practice | Tony Yoga",
    description: "Notes from Tony Sanchez on practice, breath and the Ghosh lineage.",
    h1: "Journal",
    intro: ["Notes on practice, breath and the Ghosh lineage."],
    priority: 0.5,
    changefreq: "weekly",
  },
  "/broadcasts": {
    title: "Podcast & Talks with Tony Sanchez | Tony Yoga",
    description: "Audio and video talks with Tony Sanchez on pranayama, the Ghosh lineage and the 84-asana system.",
    h1: "Podcast & talks",
    intro: ["Audio and video talks on pranayama, the Ghosh lineage and the 84-asana system."],
    priority: 0.5,
    changefreq: "weekly",
  },
  "/find-your-path": {
    title: "Find Your Yoga Path — 1-Minute Quiz | Tony Yoga",
    description: "Answer five quick questions and get a personal recommendation: the right Core Series program and membership for your goal and level.",
    h1: "Find your yoga path",
    intro: ["Five quick questions about your goal, level and time — and a personal recommendation for where to begin."],
    priority: 0.6,
    changefreq: "monthly",
  },
  "/challenges": {
    title: "30-Day Yoga Practice Challenge | Tony Yoga",
    description: "Thirty days of showing up: a short daily practice with Tony Yoga. A little practice, a little more presence.",
    h1: "30-day practice challenge",
    intro: ["A little practice. A little more presence. Your next thirty days start here."],
    priority: 0.5,
    changefreq: "monthly",
  },
  "/support": {
    title: "Support & Contact | Tony Yoga",
    description: "Questions about classes, memberships or your account? Contact the Tony Yoga team.",
    h1: "Support & contact",
    intro: [`Email ${SITE.email} — we reply within 1–2 business days.`],
    priority: 0.3,
    changefreq: "yearly",
  },
  "/privacy": { title: "Privacy Policy | Tony Yoga", description: "How Tony Yoga collects, uses and protects your personal data.", h1: "Privacy policy", intro: [], priority: 0.2, changefreq: "yearly" },
  "/terms": { title: "Terms of Service | Tony Yoga", description: "The terms for using Tony Yoga classes, programs, memberships and the app.", h1: "Terms of service", intro: [], priority: 0.2, changefreq: "yearly" },
  "/account-deletion": { title: "Delete Your Account | Tony Yoga", description: "How to delete your Tony Yoga account and personal data.", h1: "Delete your account", intro: [], priority: 0.1, changefreq: "yearly" },
  "/locations": {
    title: "Online Yoga Classes in Europe & the USA — Locations | Tony Yoga",
    description: "Join Tony Sanchez's live online yoga classes from cities across Europe and the United States. Pick your city to see class times in your local time zone.",
    h1: "Online yoga classes in Europe and the United States",
    intro: [
      "Tony Sanchez teaches live from Málaga, Spain, and students join from all over Europe and the United States. Choose your city to see what time the live classes are where you live, and how to start.",
    ],
    priority: 0.8,
    changefreq: "weekly",
  },
};

// Signed-in, transactional or personal pages — kept out of search results.
export const NOINDEX_PREFIXES = [
  "/home", "/welcome", "/login", "/register", "/reset-password", "/magic-link", "/profile", "/cart", "/checkout",
  "/menu", "/streak", "/wishlist", "/referrals", "/library", "/instructor", "/admin", "/certificate", "/leaderboard", "/quiz", "/breathwork",
];

export const REGIONS = [
  { key: "europe", label: "Europe" },
  { key: "usa", label: "United States" },
  { key: "world", label: "Rest of the world" },
];

const COUNTRY = {
  ES: { name: "Spain", lang: "Español" },
  GB: { name: "United Kingdom", lang: null },
  IE: { name: "Ireland", lang: null },
  FR: { name: "France", lang: "Français" },
  DE: { name: "Germany", lang: "Deutsch" },
  NL: { name: "Netherlands", lang: "Nederlands" },
  BE: { name: "Belgium", lang: "Nederlands and Français" },
  IT: { name: "Italy", lang: "Italiano" },
  PT: { name: "Portugal", lang: "Português" },
  CH: { name: "Switzerland", lang: "Deutsch, Français and Italiano" },
  AT: { name: "Austria", lang: "Deutsch" },
  DK: { name: "Denmark", lang: null },
  SE: { name: "Sweden", lang: null },
  NO: { name: "Norway", lang: null },
  PL: { name: "Poland", lang: "Polski" },
  CZ: { name: "Czech Republic", lang: null },
  US: { name: "United States", lang: null },
};

// slug, city, country code, region, IANA time zone, lat, lon (+ US state).
const RAW = [
  ["malaga", "Málaga", "ES", "europe", "Europe/Madrid", 36.7213, -4.4214],
  ["marbella", "Marbella", "ES", "europe", "Europe/Madrid", 36.5101, -4.8825],
  ["madrid", "Madrid", "ES", "europe", "Europe/Madrid", 40.4168, -3.7038],
  ["barcelona", "Barcelona", "ES", "europe", "Europe/Madrid", 41.3874, 2.1686],
  ["valencia", "Valencia", "ES", "europe", "Europe/Madrid", 39.4699, -0.3763],
  ["seville", "Seville", "ES", "europe", "Europe/Madrid", 37.3891, -5.9845],
  ["london", "London", "GB", "europe", "Europe/London", 51.5072, -0.1276],
  ["manchester", "Manchester", "GB", "europe", "Europe/London", 53.4808, -2.2426],
  ["edinburgh", "Edinburgh", "GB", "europe", "Europe/London", 55.9533, -3.1883],
  ["dublin", "Dublin", "IE", "europe", "Europe/Dublin", 53.3498, -6.2603],
  ["paris", "Paris", "FR", "europe", "Europe/Paris", 48.8566, 2.3522],
  ["berlin", "Berlin", "DE", "europe", "Europe/Berlin", 52.52, 13.405],
  ["munich", "Munich", "DE", "europe", "Europe/Berlin", 48.1351, 11.582],
  ["hamburg", "Hamburg", "DE", "europe", "Europe/Berlin", 53.5511, 9.9937],
  ["amsterdam", "Amsterdam", "NL", "europe", "Europe/Amsterdam", 52.3676, 4.9041],
  ["brussels", "Brussels", "BE", "europe", "Europe/Brussels", 50.8503, 4.3517],
  ["rome", "Rome", "IT", "europe", "Europe/Rome", 41.9028, 12.4964],
  ["milan", "Milan", "IT", "europe", "Europe/Rome", 45.4642, 9.19],
  ["lisbon", "Lisbon", "PT", "europe", "Europe/Lisbon", 38.7223, -9.1393],
  ["zurich", "Zurich", "CH", "europe", "Europe/Zurich", 47.3769, 8.5417],
  ["vienna", "Vienna", "AT", "europe", "Europe/Vienna", 48.2082, 16.3738],
  ["copenhagen", "Copenhagen", "DK", "europe", "Europe/Copenhagen", 55.6761, 12.5683],
  ["stockholm", "Stockholm", "SE", "europe", "Europe/Stockholm", 59.3293, 18.0686],
  ["oslo", "Oslo", "NO", "europe", "Europe/Oslo", 59.9139, 10.7522],
  ["warsaw", "Warsaw", "PL", "europe", "Europe/Warsaw", 52.2297, 21.0122],
  ["prague", "Prague", "CZ", "europe", "Europe/Prague", 50.0755, 14.4378],
  ["new-york", "New York", "US", "usa", "America/New_York", 40.7128, -74.006, "New York"],
  ["los-angeles", "Los Angeles", "US", "usa", "America/Los_Angeles", 34.0522, -118.2437, "California"],
  ["san-francisco", "San Francisco", "US", "usa", "America/Los_Angeles", 37.7749, -122.4194, "California"],
  ["san-diego", "San Diego", "US", "usa", "America/Los_Angeles", 32.7157, -117.1611, "California"],
  ["seattle", "Seattle", "US", "usa", "America/Los_Angeles", 47.6062, -122.3321, "Washington"],
  ["portland", "Portland", "US", "usa", "America/Los_Angeles", 45.5152, -122.6784, "Oregon"],
  ["las-vegas", "Las Vegas", "US", "usa", "America/Los_Angeles", 36.1699, -115.1398, "Nevada"],
  ["phoenix", "Phoenix", "US", "usa", "America/Phoenix", 33.4484, -112.074, "Arizona"],
  ["denver", "Denver", "US", "usa", "America/Denver", 39.7392, -104.9903, "Colorado"],
  ["austin", "Austin", "US", "usa", "America/Chicago", 30.2672, -97.7431, "Texas"],
  ["dallas", "Dallas", "US", "usa", "America/Chicago", 32.7767, -96.797, "Texas"],
  ["houston", "Houston", "US", "usa", "America/Chicago", 29.7604, -95.3698, "Texas"],
  ["chicago", "Chicago", "US", "usa", "America/Chicago", 41.8781, -87.6298, "Illinois"],
  ["minneapolis", "Minneapolis", "US", "usa", "America/Chicago", 44.9778, -93.265, "Minnesota"],
  ["nashville", "Nashville", "US", "usa", "America/Chicago", 36.1627, -86.7816, "Tennessee"],
  ["atlanta", "Atlanta", "US", "usa", "America/New_York", 33.749, -84.388, "Georgia"],
  ["miami", "Miami", "US", "usa", "America/New_York", 25.7617, -80.1918, "Florida"],
  ["orlando", "Orlando", "US", "usa", "America/New_York", 28.5383, -81.3792, "Florida"],
  ["washington-dc", "Washington, D.C.", "US", "usa", "America/New_York", 38.9072, -77.0369, "District of Columbia"],
  ["philadelphia", "Philadelphia", "US", "usa", "America/New_York", 39.9526, -75.1652, "Pennsylvania"],
  ["boston", "Boston", "US", "usa", "America/New_York", 42.3601, -71.0589, "Massachusetts"],
  ["honolulu", "Honolulu", "US", "usa", "Pacific/Honolulu", 21.3069, -157.8583, "Hawaii"],
];

export const LOCATIONS = RAW.map(([slug, city, cc, region, tz, lat, lon, state]) => ({
  slug, city, countryCode: cc, country: COUNTRY[cc].name, appLanguage: COUNTRY[cc].lang,
  region, timeZone: tz, lat, lon, state: state || null,
}));

export const locationPath = (slug) => `/locations/${slug}`;

/** Built-in cities + cities added in Admin → SEO, minus the ones switched off there.
 *  `config` is the /api/seo/config response (or null while loading). */
export function mergeLocations(config) {
  const loc = (config && config.locations) || {};
  const disabled = new Set(loc.disabled || []);
  const notes = loc.notes || {};
  const custom = (loc.custom || []).map((c) => ({ appLanguage: null, state: null, ...c, custom: true }));
  return [...LOCATIONS, ...custom]
    .filter((l) => !disabled.has(l.slug))
    .map((l) => (notes[l.slug] ? { ...l, note: notes[l.slug] } : l));
}

export const findLocation = (slug, list = LOCATIONS) => list.find((l) => l.slug === slug) || null;

/** Title / description / share image for a static page, with Admin → SEO edits applied. */
export function pageMeta(path, config) {
  const def = PAGES[path] || {};
  const o = (config && config.pages && config.pages[path]) || {};
  const g = (config && config.global) || {};
  return {
    title: o.title || def.title || `${g.site_name || SITE.name} — ${SITE.tagline}`,
    description: o.description || def.description || g.default_description || SITE.description,
    image: o.image || g.default_image || "",
    noindex: !!o.noindex,
  };
}

// ---------------------------------------------------------------------------
// Time-zone helpers (Intl only — works in browsers and Node).

/** Minutes the zone is ahead of UTC at the given instant. */
export function utcOffsetMinutes(timeZone, date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit",
  }).formatToParts(date);
  const v = Object.fromEntries(parts.filter((p) => p.type !== "literal").map((p) => [p.type, Number(p.value)]));
  const asUtc = Date.UTC(v.year, v.month - 1, v.day, v.hour % 24, v.minute, v.second);
  return Math.round((asUtc - Math.floor(date.getTime() / 1000) * 1000) / 60000);
}

/** Hours the city is ahead (+) / behind (−) Málaga at an instant. */
export function hoursFromBase(timeZone, date = new Date()) {
  return (utcOffsetMinutes(timeZone, date) - utcOffsetMinutes(SITE.baseTimeZone, date)) / 60;
}

function hoursText(h) {
  const a = Math.abs(h);
  const n = Number.isInteger(a) ? String(a) : a.toFixed(1);
  return `${n} hour${a === 1 ? "" : "s"}`;
}

/** Plain-English description of the time difference with Málaga. */
export function offsetSentence(loc, ref = new Date()) {
  const year = ref.getUTCFullYear();
  const winter = hoursFromBase(loc.timeZone, new Date(Date.UTC(year, 0, 15, 12)));
  const summer = hoursFromBase(loc.timeZone, new Date(Date.UTC(year, 6, 15, 12)));
  if (winter === 0 && summer === 0) {
    return loc.slug === "malaga"
      ? "Tony teaches from Málaga, so live class times are in Málaga time (Central European Time)."
      : `${loc.city} is on the same time as Málaga, so live class times are the same as Tony's local time.`;
  }
  const dir = (h) => (h > 0 ? "ahead of" : "behind");
  let s;
  if (winter === summer) {
    s = `${loc.city} is ${hoursText(winter)} ${dir(winter)} Málaga.`;
  } else {
    s = `${loc.city} is ${hoursText(winter)} ${dir(winter)} Málaga in winter and ${hoursText(summer)} ${dir(summer)} in summer.`;
  }
  if (loc.region === "usa" && loc.timeZone !== "America/Phoenix" && loc.timeZone !== "Pacific/Honolulu") {
    s += " For a few weeks in March and late October the gap is one hour smaller, because the US and Europe change their clocks on different dates.";
  }
  return s;
}

/** Local clock time in `timeZone` for a Málaga wall-clock time on a reference date. */
export function baseTimeInZone(hour, minute, timeZone, ref = new Date()) {
  const y = ref.getUTCFullYear(), m = ref.getUTCMonth(), d = ref.getUTCDate();
  const guess = new Date(Date.UTC(y, m, d, hour, minute));
  const instant = new Date(guess.getTime() - utcOffsetMinutes(SITE.baseTimeZone, guess) * 60000);
  return new Intl.DateTimeFormat("en-US", { timeZone, hour: "numeric", minute: "2-digit", weekday: "short" }).format(instant);
}

/** Example conversions shown on a city page (clearly labelled as examples). */
export function exampleTimes(loc, ref = new Date()) {
  return [[8, 0], [13, 0], [19, 0]].map(([h, m]) => ({
    base: `${((h + 11) % 12) + 1}:${String(m).padStart(2, "0")} ${h < 12 ? "am" : "pm"}`,
    local: baseTimeInZone(h, m, loc.timeZone, ref).replace(/^\w+,?\s*/, "").replace(/\s?AM$/, " am").replace(/\s?PM$/, " pm"),
  }));
}

/** Great-circle distance to Málaga in km (null when the city has no coordinates). */
export function distanceFromBaseKm(loc) {
  if (typeof loc.lat !== "number" || typeof loc.lon !== "number") return null;
  const R = 6371, rad = (x) => (x * Math.PI) / 180;
  const dLat = rad(loc.lat - SITE.baseLat), dLon = rad(loc.lon - SITE.baseLon);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(rad(SITE.baseLat)) * Math.cos(rad(loc.lat)) * Math.sin(dLon / 2) ** 2;
  return Math.round(2 * R * Math.asin(Math.sqrt(a)));
}

export function timeZoneLabel(loc, ref = new Date()) {
  try {
    let p;
    try { p = new Intl.DateTimeFormat("en-US", { timeZone: loc.timeZone, timeZoneName: "longGeneric" }).formatToParts(ref); }
    catch { p = new Intl.DateTimeFormat("en-US", { timeZone: loc.timeZone, timeZoneName: "long" }).formatToParts(ref); }
    return p.find((x) => x.type === "timeZoneName")?.value || loc.timeZone;
  } catch {
    return loc.timeZone;
  }
}

export function nearbyLocations(loc, count = 6, list = LOCATIONS) {
  const hasXY = (x) => typeof x.lat === "number" && typeof x.lon === "number";
  return list.filter((l) => l.slug !== loc.slug && l.region === loc.region)
    .map((l) => ({ l, d: hasXY(l) && hasXY(loc) ? Math.hypot(l.lat - loc.lat, (l.lon - loc.lon) * Math.cos((loc.lat * Math.PI) / 180)) : (l.countryCode === loc.countryCode ? 1000 : 2000) }))
    .sort((a, b) => a.d - b.d)
    .slice(0, count)
    .map((x) => x.l);
}

// ---------------------------------------------------------------------------
// City page copy. Every paragraph is built from facts about that city (time zone,
// distance to Málaga, app language, local history) so pages are genuinely useful
// rather than near-duplicates.

export function locationMeta(loc) {
  const where = loc.state && loc.state !== loc.city ? `${loc.city}, ${loc.state}` : `${loc.city}, ${loc.country}`;
  return {
    title: `Online Yoga Classes in ${loc.city} — Live with Tony Sanchez | Tony Yoga`,
    description: `Join Tony Sanchez's live online yoga classes from ${where}. See class times in ${loc.city} time, practise the on-demand Core Series and book private Zoom sessions.`,
    h1: `Online yoga classes in ${loc.city}`,
  };
}

export function locationIntro(loc) {
  const km = distanceFromBaseKm(loc);
  const out = [];
  if (loc.slug === "malaga") {
    out.push("Málaga is Tony Sanchez's home base. Join the live classes online from anywhere in the city, come to a small-group retreat on the Costa del Sol, or book a private session over Zoom.");
  } else {
    out.push(`Practise with Tony Sanchez from ${loc.city}. Live classes stream on Zoom from Málaga, Spain, and every class is added to your library within a day, so you can follow along live or at a time that suits ${loc.city}.`);
  }
  // Local note written by the admin (Admin → SEO & Google → Locations).
  if (loc.note) out.push(loc.note);
  if (km === null) {
    out.push(`Most students in ${loc.city} practise online — live when the time works, on demand when it doesn't — and some travel to Spain for a retreat.`);
  } else if (loc.countryCode === "ES" && loc.slug !== "malaga") {
    out.push(`${loc.city} is about ${km} km from Málaga — close enough to join one of Tony's retreats in person, with the online classes keeping your practice going in between.`);
  } else if (loc.region === "europe" && loc.slug !== "malaga") {
    out.push(`${loc.city} is about ${km.toLocaleString("en-US")} km from Málaga. Many students practise online through the year and travel to Andalusia for a retreat.`);
  } else if (loc.region !== "europe") {
    out.push(`Málaga is about ${km.toLocaleString("en-US")} km from ${loc.city}, so most students here practise online — live when the time works, on demand when it doesn't — and some travel to Spain for a retreat.`);
  }
  if (loc.state === "California") {
    out.push("Tony refined the Core Series over thousands of teaching hours in California and Mexico before moving to Spain — the practice comes back to California online.");
  }
  if (loc.appLanguage) {
    out.push(`The Tony Yoga website and app are available in ${loc.appLanguage} as well as English.`);
  }
  return out;
}

export function locationFaq(loc) {
  const faqs = [
    {
      q: `Can I take Tony Sanchez's yoga classes online from ${loc.city}?`,
      a: `Yes. Live classes stream on Zoom from Málaga, Spain, and you can join from ${loc.city} on a laptop, tablet or phone. Every class is added to your library within a day, so you can also practise on demand.`,
    },
    {
      q: `What time are the live yoga classes in ${loc.city}?`,
      a: `${offsetSentence(loc)} The schedule on this page converts each upcoming class to ${loc.city} time automatically. If a live time doesn't suit you, practise the recording later.`,
    },
    {
      q: "Is it suitable for beginners?",
      a: "Yes. Start with Core 26+ and come to a live class — Tony gives you the modifications you need. Core 40 and Core 84 are there when you are ready to go deeper.",
    },
    {
      q: `What do I need to practise at home in ${loc.city}?`,
      a: "A yoga mat, a quiet space and a device for Zoom or the Tony Yoga app (iPhone and Android). Blocks help but are optional.",
    },
  ];
  if (loc.countryCode === "ES") {
    faqs.push({ q: "Is Tony Yoga available in Spanish?", a: "Yes. The website and app are fully available in Spanish (Español), alongside English and other languages." });
  }
  faqs.push({
    q: "Can I practise with Tony in person?",
    a: loc.slug === "malaga"
      ? "Yes. Tony leads small-group retreats of up to sixteen students in Málaga, and offers private one-to-one sessions on Zoom."
      : `Tony leads small-group retreats of up to sixteen students in Málaga, Spain${distanceFromBaseKm(loc) !== null ? ` — about ${distanceFromBaseKm(loc).toLocaleString("en-US")} km from ${loc.city}` : ""}. Private one-to-one sessions are available on Zoom.`,
  });
  return faqs;
}

// ---------------------------------------------------------------------------
// Structured data (schema.org JSON-LD).

const abs = (base, path) => (/^https?:\/\//.test(path) ? path : `${base}${path}`);

export function orgJsonLd(base = SITE.url) {
  return {
    "@type": "Organization",
    "@id": `${base}/#organization`,
    name: SITE.name,
    alternateName: SITE.alternateName,
    url: `${base}/`,
    logo: abs(base, SITE.logo),
    image: abs(base, SITE.image),
    email: SITE.email,
    description: SITE.description,
    foundingDate: SITE.founded,
    founder: { "@id": `${base}/#founder` },
    address: { "@type": "PostalAddress", addressLocality: SITE.baseCity, addressRegion: SITE.baseRegion, addressCountry: SITE.baseCountryCode },
    areaServed: [{ "@type": "Place", name: "Europe" }, { "@type": "Country", name: "United States" }, { "@type": "Place", name: "Worldwide (online)" }],
    knowsLanguage: SITE.languages,
    sameAs: SITE.sameAs,
  };
}

export function founderJsonLd(base = SITE.url) {
  return {
    "@type": "Person",
    "@id": `${base}/#founder`,
    name: FOUNDER.name,
    jobTitle: FOUNDER.jobTitle,
    description: FOUNDER.description,
    worksFor: { "@id": `${base}/#organization` },
    knowsAbout: FOUNDER.knowsAbout,
    image: abs(base, SITE.portrait),
  };
}

export function websiteJsonLd(base = SITE.url) {
  return { "@type": "WebSite", "@id": `${base}/#website`, url: `${base}/`, name: SITE.name, publisher: { "@id": `${base}/#organization` }, inLanguage: "en" };
}

export function faqJsonLd(faqs) {
  return {
    "@type": "FAQPage",
    mainEntity: faqs.map((f) => ({ "@type": "Question", name: f.q, acceptedAnswer: { "@type": "Answer", text: f.a } })),
  };
}

export function breadcrumbJsonLd(base, items) {
  return {
    "@type": "BreadcrumbList",
    itemListElement: items.map((it, i) => ({ "@type": "ListItem", position: i + 1, name: it.name, item: abs(base, it.path) })),
  };
}

export function locationJsonLd(loc, base = SITE.url) {
  const url = `${base}${locationPath(loc.slug)}`;
  const meta = locationMeta(loc);
  const country = { "@type": "Country", name: loc.country };
  const area = loc.state && loc.state !== loc.city
    ? { "@type": "City", name: loc.city, containedInPlace: { "@type": "State", name: loc.state, containedInPlace: country } }
    : { "@type": "City", name: loc.city, containedInPlace: country };
  return {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "WebPage", "@id": url, url, name: meta.title, description: meta.description,
        isPartOf: { "@id": `${base}/#website` }, about: { "@id": `${url}#service` }, inLanguage: "en",
      },
      {
        "@type": "Service", "@id": `${url}#service`, name: `Online yoga classes in ${loc.city}`,
        serviceType: "Online yoga classes", category: "Yoga", provider: { "@id": `${base}/#organization` },
        areaServed: area, availableLanguage: SITE.languages,
        availableChannel: { "@type": "ServiceChannel", serviceUrl: url, name: "Live classes on Zoom and on-demand video" },
        description: meta.description,
      },
      breadcrumbJsonLd(base, [{ name: "Home", path: "/" }, { name: "Locations", path: "/locations" }, { name: loc.city, path: locationPath(loc.slug) }]),
      faqJsonLd(locationFaq(loc)),
    ],
  };
}

export function courseJsonLd(p, base = SITE.url) {
  const url = `${base}/programs/${p.id}`;
  const offer = p.price != null && p.price_model !== "membership"
    ? { "@type": "Offer", price: Number(p.price).toFixed(2), priceCurrency: String(p.currency || "eur").toUpperCase(), availability: "https://schema.org/InStock", url, category: p.price_model === "free" ? "Free" : "Paid" }
    : undefined;
  return {
    "@context": "https://schema.org",
    "@type": "Course",
    "@id": `${url}#course`,
    name: p.title,
    description: p.description || `${p.title} — an on-demand yoga program by Tony Sanchez.`,
    url,
    image: p.cover_image ? abs(base, p.cover_image) : abs(base, SITE.image),
    provider: { "@type": "Organization", "@id": `${base}/#organization`, name: SITE.name, sameAs: `${base}/` },
    instructor: { "@type": "Person", name: FOUNDER.name },
    educationalLevel: p.level || undefined,
    inLanguage: "en",
    ...(offer ? { offers: offer } : {}),
    hasCourseInstance: {
      "@type": "CourseInstance", courseMode: "online",
      ...(p.duration_weeks ? { courseWorkload: `P${Number(p.duration_weeks)}W` } : {}),
      instructor: { "@type": "Person", name: FOUNDER.name },
    },
  };
}

export function productJsonLd(p, base = SITE.url) {
  const url = `${base}/shop/${p.id}`;
  return {
    "@context": "https://schema.org",
    "@type": p.type === "book" ? ["Product", "Book"] : "Product",
    name: p.title,
    description: p.description || p.title,
    url,
    image: (p.images || []).slice(0, 3).map((i) => abs(base, i)),
    brand: { "@type": "Brand", name: SITE.name },
    ...(p.author ? { author: { "@type": "Person", name: p.author } } : {}),
    ...(p.price > 0 && !p.external_amazon_link
      ? { offers: { "@type": "Offer", price: Number(p.price).toFixed(2), priceCurrency: String(p.currency || "eur").toUpperCase(), availability: "https://schema.org/InStock", url } }
      : {}),
  };
}

export function eventJsonLd(c, base = SITE.url) {
  const online = c.location_type === "online";
  return {
    "@context": "https://schema.org",
    "@type": "Event",
    name: c.title,
    description: `${c.title} — ${c.style || "yoga"} class (${c.level || "all levels"}) with Tony Yoga, ${c.duration_minutes || 60} minutes.`,
    startDate: c.start_time,
    ...(c.end_time ? { endDate: c.end_time } : {}),
    eventStatus: c.status === "cancelled" ? "https://schema.org/EventCancelled" : "https://schema.org/EventScheduled",
    eventAttendanceMode: online ? "https://schema.org/OnlineEventAttendanceMode" : "https://schema.org/OfflineEventAttendanceMode",
    location: online
      ? { "@type": "VirtualLocation", url: `${base}/schedule/${c.id}` }
      : { "@type": "Place", name: c.location_detail || "Tony Yoga studio", address: { "@type": "PostalAddress", addressLocality: SITE.baseCity, addressCountry: SITE.baseCountryCode } },
    organizer: { "@type": "Organization", name: SITE.name, url: `${base}/` },
    performer: { "@type": "Person", name: c.instructor?.name || FOUNDER.name },
    url: `${base}/schedule/${c.id}`,
    image: abs(base, SITE.image),
  };
}

export function retreatJsonLd(w, base = SITE.url) {
  const url = `${base}/workshops/${w.id}`;
  return {
    "@context": "https://schema.org",
    "@type": "Event",
    name: w.title,
    description: [w.subtitle, w.description].filter(Boolean).join(" "),
    startDate: w.start_date,
    ...(w.end_date ? { endDate: w.end_date } : {}),
    eventStatus: "https://schema.org/EventScheduled",
    eventAttendanceMode: "https://schema.org/OfflineEventAttendanceMode",
    location: {
      "@type": "Place",
      name: w.location || `${SITE.baseCity}, ${SITE.baseCountry}`,
      address: { "@type": "PostalAddress", addressLocality: SITE.baseCity, addressRegion: SITE.baseRegion, addressCountry: SITE.baseCountryCode },
    },
    image: w.cover_image ? abs(base, w.cover_image) : abs(base, SITE.image),
    organizer: { "@type": "Organization", name: SITE.name, url: `${base}/` },
    performer: { "@type": "Person", name: FOUNDER.name },
    ...(w.price_eur ? { offers: { "@type": "Offer", price: Number(w.price_eur).toFixed(2), priceCurrency: "EUR", availability: "https://schema.org/InStock", url } } : {}),
    ...(w.capacity ? { maximumAttendeeCapacity: w.capacity } : {}),
    url,
  };
}
