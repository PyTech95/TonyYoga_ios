# Tony Yoga — mobile app fixes, service fixes, SEO/GEO, Locations, admin CMS and Tony's photos (Oct 2026)

## 1. iOS and Android app screens

| Problem | Fix |
| --- | --- |
| Language / bell buttons floated over every screen, covering the cart and wishlist buttons and sliding over text while scrolling | Moved into each screen's header row (`components/HeaderTools.jsx`, `PageHeader.jsx`). Screens without a header (Home hero) get them pinned to the top of the page, not the screen |
| Content under the notch / Dynamic Island / Android status bar, gaps at the bottom on iPhone | One set of safe-area variables (`--sat`, `--sab`, … in `index.css`) used by headers, tab bar, sheets, toasts, admin bar. `capacitor.config.json`: iOS `contentInset: "never"`, Android `adjustMarginsForEdgeToEdge: "auto"`. Cream backing fades in behind the status bar when scrolling |
| iPhone zooms in when tapping a field and stays zoomed | Form text is 16px on phones; the app disables pinch/double-tap zoom like a native app |
| Tab bar jumps up over the keyboard on Android | Tab bar and floating buttons hide while typing |
| "Ask Tony" button covered cards and buttons | Round icon button on phones; pages reserve space for it; sits above the tab bar only where one exists |
| Lesson titles cut to one word, gift-card "Redeem" pushed off-screen, referral tiles overflowing, cramped class times, quiz header overlap, Discover chips cut off | Fixed per screen (ProgramDetail, Profile, Referrals, ClassDetail, FindYourPath, Discover, PrivateSessions, Leaderboard) |
| "Back" did nothing on a freshly opened app; "← Tony Yoga home" link inside the app | Back goes to the member home when there is no history; app shows the logo instead |
| Web-push card said "not supported / install the app" inside the app | Hidden in the app |
| Service worker could keep serving old screens after an app update (Android) | Not registered inside the app; old caches cleared |
| A crash on one screen blanked the whole app | Error boundaries per screen and around floating widgets, with a "Try again" screen |
| `crypto.randomUUID()` missing on iOS < 15.4 / older Android WebViews blanked the app | Safe `uuid()` fallback (`lib/utils.js`) |
| Fonts loaded from Google at runtime (fallback fonts offline, layout jump) | Fraunces + Inter bundled in `public/fonts/` (OFL) |

## 2. Services

* Full API test: 177 checks across guest, member and admin flows, plus 69 checks of the admin content tools (pages, SEO, prices, instructors, Journal, site images, video upload, permissions) — 0 failures. Warnings are only for keys not set in a test setup (Stripe, PayPal, OpenAI, Printful).
* UI test in app mode: 28 click-through checks (sign-up, tabs, class, checkout message, wishlist, cart, gift card, streak, language, notifications, quiz, keyboard, sign-out) — all pass.
* **Fixed: payments started in the app returned to `https://localhost`.** The buyer landed on an error page and PayPal orders were never captured. Return pages now use the public site (`FRONTEND_URL`) and tell the buyer to go back to the app. The app refreshes when they do (`core.checkout_return_base`).
* **Fixed: drop-in class and 5-class pack were charged in USD** while shown as €22 / €99 (`routers/payments.py`).
* Quiz-result emails and shared certificate links used the app's internal address — now use the public site.
* Copy / share buttons work on WebViews without the Clipboard API.

## 3. SEO + GEO (AI answers)

* `yarn build` runs `scripts/prerender.mjs`. It writes real HTML for every public page, with title, description, canonical, Open Graph/Twitter and JSON-LD (Organization, Person, WebSite, Course, Event, Product, FAQPage, BreadcrumbList, Service). Google, social previews and AI crawlers that don't run JavaScript can all read it.
* Also generated: `sitemap.xml`, `robots.txt` (allows Googlebot, Bing, GPTBot, ClaudeBot, PerplexityBot and Google-Extended; blocks private pages) and `llms.txt` (plain-text site summary for AI assistants).
* In the browser, each screen updates its own tags (`lib/seo.js`). Member-only screens are `noindex`.
* All copy and data live in one file: `src/seo/seoData.mjs`.

## 4. Locations (website footer)

* Footer on the website: "Online classes available in Europe & the US", with popular cities and **All locations**.
* `/locations` has Europe / United States multi-select, country/state filters and city search, plus the local time in each city.
* 48 city pages, `/locations/<city>` (26 in Europe, 22 in the US). Each page has the live schedule converted to that city's time, the time difference with Málaga, distance, app language, a city FAQ and nearby cities.
* To switch a city off, add a local note, or add a new city: **Admin → SEO & Google → Locations** (no code). The built-in list lives in `LOCATIONS` in `src/seo/seoData.mjs`.
* Note: Google penalises city pages that are near-copies ("doorway pages"). Each page here carries real local facts, but add local testimonials or offers over time, and keep the list to places where you actually market.

## 5. Everything controlled from Admin

| Admin menu | What it controls |
| --- | --- |
| Custom pages (About, Services…) | Add/edit pages at `/{address}` with headings, text, photos, MP4/YouTube videos, buttons, cards, quotes and FAQs. Choose website menu / footer / app menu, publish or draft, and each page's Google title, description and share image. About and Services are created automatically (with Tony's photos and studio clips) and can be edited or deleted. |
| SEO & Google | Title, description, share image and "hide from Google" for every built-in page; site name, default description and share image; Google Search Console and Bing codes (paste the whole meta tag); contact email and social profiles; Locations: switch cities off, add a local note, add new cities. |
| Journal & news | Write, publish and delete posts. Each post has its own page `/news/{post}` with Article data for Google. |
| Packages & prices | Membership plans (price, billing, features, show/hide), class passes (price, credits, currency) and teacher-training tiers. Checkout always charges the admin price. |
| Instructors (photo & bio) | Name, photo, bio, years and styles shown on class pages. |
| Site images | Every photo of Tony on the website and app (hero, story, private sessions, teacher training, app home, library collage) and the homepage hero video (upload an MP4, paste a link, or switch it off). Empty slots show the built-in photos. |

Search engines read a pre-built HTML copy of each page. With `PRERENDER_COMMAND` set on the server (see VPS_DEPLOYMENT.md) it refreshes automatically a few seconds after each admin save; the status and an "Update now" button are at the bottom of Admin → SEO & Google.

## 6. Tony's real photos and videos

* The stock/AI pictures that were built into the site (hero, "Tony" portrait, private-session and teacher-training photos, library collage, default Google/WhatsApp share image) are replaced with the photos and videos Tony supplied, optimised for the web, in `frontend/public/brand/tony/`.
* Homepage hero: a 16-second silent loop of Tony on the mat (0.6 MB). Visitors who prefer reduced motion or are saving data see the still photo.
* About page: Tony's portrait, two short studio clips from live classes and the group photo after class.
* Each photo can be replaced in Admin → Site images without a developer.
* Not used: the AI clips with visible "Hailuo/MiniMax", "Veo" or "DeeVid" watermarks, the Instagram story clips with dated class announcements, and the AI-generated images that don't show Tony.

## 7. Security fix

* Public class pages and `/api/instructors` returned the teacher's whole account (email, IBAN, tax ID). They now return only name, photo, bio, years and styles.

## 8. Deploy checklist

1. Backend env: `FRONTEND_URL=https://tonyoga.com`; `CORS_ORIGINS` includes `https://tonyoga.com,https://www.tonyoga.com,https://localhost,capacitor://localhost`.
2. Frontend: `yarn install && yarn build` (`REACT_APP_BACKEND_URL` set; `REACT_APP_SITE_URL` defaults to https://tonyoga.com).
3. nginx: `try_files $uri $uri/index.html /index.html;` (Apache/Hostinger: the `.htaccess` in `build/` already does this).
4. Apps: `npx cap sync`, then build in Xcode / Android Studio and submit updates.
5. Google Search Console + Bing Webmaster Tools: verify `tonyoga.com` (paste the codes in Admin → SEO & Google), submit `https://tonyoga.com/sitemap.xml`.
6. Optional: set `PRERENDER_COMMAND` on the backend so admin edits reach the search-engine copy automatically.
