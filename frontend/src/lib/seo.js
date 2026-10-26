import { useEffect, useRef } from "react";
import { useLocation } from "react-router-dom";
import { SITE, PAGES, NOINDEX_PREFIXES, pageMeta } from "@/seo/seoData.mjs";
import { isNativeApp } from "@/lib/platform";
import { useSeoConfig } from "@/lib/siteData";

// Public site address used for canonical links. Override at build time with
// REACT_APP_SITE_URL (e.g. a staging domain); defaults to the live domain.
export const SITE_URL = (process.env.REACT_APP_SITE_URL || SITE.url).replace(/\/$/, "");

const abs = (path) => (!path ? "" : /^https?:\/\//.test(path) ? path : `${SITE_URL}${path.startsWith("/") ? "" : "/"}${path}`);

function setMeta(attr, key, content) {
  let el = document.head.querySelector(`meta[${attr}="${key}"]`);
  if (!content) { if (el) el.remove(); return; }
  if (!el) {
    el = document.createElement("meta");
    el.setAttribute(attr, key);
    document.head.appendChild(el);
  }
  el.setAttribute("content", content);
}

function setLink(rel, href) {
  let el = document.head.querySelector(`link[rel="${rel}"]`);
  if (!href) { if (el) el.remove(); return; }
  if (!el) {
    el = document.createElement("link");
    el.setAttribute("rel", rel);
    document.head.appendChild(el);
  }
  el.setAttribute("href", href);
}

/** Apply title / description / canonical / social / robots / JSON-LD for the current screen. */
export function applySeo({ path, title, description, image, type = "website", noindex = false, jsonLd = null }) {
  if (typeof document === "undefined") return;
  const url = `${SITE_URL}${path === "/" ? "/" : path}`;
  if (title) document.title = title;
  setMeta("name", "description", description);
  setMeta("name", "robots", noindex ? "noindex, nofollow" : "index, follow, max-image-preview:large");
  setLink("canonical", noindex ? null : url);
  setMeta("property", "og:title", title);
  setMeta("property", "og:description", description);
  setMeta("property", "og:url", url);
  setMeta("property", "og:type", type);
  setMeta("property", "og:image", abs(image || SITE.image));
  setMeta("name", "twitter:title", title);
  setMeta("name", "twitter:description", description);
  setMeta("name", "twitter:image", abs(image || SITE.image));
  // Page-specific structured data lives in one script tag that is replaced per screen.
  document.head.querySelectorAll('script[data-seo="page"]').forEach((n) => n.remove());
  if (jsonLd) {
    const s = document.createElement("script");
    s.type = "application/ld+json";
    s.setAttribute("data-seo", "page");
    s.text = JSON.stringify(jsonLd);
    document.head.appendChild(s);
  }
}

/** Screen-level SEO. Pass `null` fields to keep route defaults. Skipped inside the native app. */
export function useSeo(opts) {
  const loc = useLocation();
  const key = JSON.stringify(opts || {});
  useEffect(() => {
    if (!opts || isNativeApp()) return;
    applySeo({ path: loc.pathname, ...opts });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, loc.pathname]);
}

/** Route defaults: static public pages get their entry from PAGES (with Admin → SEO
 *  edits applied); personal pages are noindex. Also adds Search Console / Bing codes. */
export function RouteSeo() {
  const { pathname } = useLocation();
  const config = useSeoConfig();
  const lastPath = useRef(null);
  useEffect(() => {
    if (isNativeApp()) return;
    const firstRunForPath = lastPath.current !== pathname;
    lastPath.current = pathname;
    const g = (config && config.global) || {};
    setMeta("name", "google-site-verification", g.google_verification || "");
    setMeta("name", "msvalidate.01", g.bing_verification || "");
    if (g.site_name) setMeta("property", "og:site_name", g.site_name);
    const clean = pathname.length > 1 ? pathname.replace(/\/+$/, "") : pathname;
    const noindex = NOINDEX_PREFIXES.some((p) => clean === p || clean.startsWith(`${p}/`));
    const meta = pageMeta(clean, config);
    if (PAGES[clean]) {
      // Screens that add their own structured data (e.g. schedule events) call
      // usePageSeo, which applies the same admin-edited title and description.
      if (firstRunForPath || !document.head.querySelector('script[data-seo="page"]')) {
        applySeo({ path: clean, title: meta.title, description: meta.description, image: meta.image, noindex: noindex || meta.noindex });
      }
    } else if (firstRunForPath) {
      // Detail screens (programs/123, shop/abc, locations/…, custom pages) set their own tags once data loads.
      applySeo({ path: clean, title: meta.title, description: meta.description, image: meta.image, noindex });
    }
  }, [pathname, config]);
  return null;
}

/** SEO for a built-in page (PAGES entry) with Admin → SEO edits applied, plus optional
 *  page-specific structured data. Pass `ready=false` to wait for data. */
export function usePageSeo(path, { jsonLd = null, ready = true } = {}) {
  const config = useSeoConfig();
  const meta = pageMeta(path, config);
  const noindex = meta.noindex || NOINDEX_PREFIXES.some((p) => path === p || path.startsWith(`${p}/`));
  useSeo(ready ? { title: meta.title, description: meta.description, image: meta.image, noindex, jsonLd } : null);
}

export { SITE };
