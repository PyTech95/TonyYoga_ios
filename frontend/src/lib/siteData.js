// Admin-managed site data (site images, custom pages, SEO settings), fetched once and
// shared by every component that needs it. Components re-render when it arrives.
import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { contentImageUrl } from "@/components/ContentImageInput";

const cache = {};
const identity = (d) => d;
const inflight = {};
const listeners = {};

function load(key, path, pick = identity) {
  if (cache[key] !== undefined || inflight[key]) return;
  inflight[key] = api.get(path)
    .then(({ data }) => { cache[key] = pick(data); })
    .catch(() => { cache[key] = null; })
    .finally(() => {
      delete inflight[key];
      (listeners[key] || []).forEach((fn) => fn(cache[key]));
    });
}

function useShared(key, path, pick = identity) {
  const [value, setValue] = useState(cache[key]);
  useEffect(() => {
    const fn = (v) => setValue(v);
    listeners[key] = [...(listeners[key] || []), fn];
    if (cache[key] !== undefined) setValue(cache[key]); else load(key, path, pick);
    return () => { listeners[key] = (listeners[key] || []).filter((x) => x !== fn); };
  }, [key, path, pick]);
  return value;
}

/** Force a fresh fetch next time (used after admin saves). */
export function invalidateSiteData(key) {
  if (key) delete cache[key]; else Object.keys(cache).forEach((k) => delete cache[k]);
}

const pickImages = (d) => d?.site_images || {};
/** { slot: url } from Admin → Site images. */
export function useSiteImages() {
  return useShared("site_images", "/settings/public", pickImages) || {};
}

/** Admin photo for a slot, resolved to a full URL, or the built-in fallback. */
export function siteImage(images, slot, fallback) {
  return contentImageUrl(images?.[slot]) || fallback;
}

/** Published custom pages (About, Services, …) for menus. */
export function useCmsPages() {
  return useShared("cms_pages", "/pages") || [];
}

/** Admin SEO settings (page overrides, verification codes, locations). */
export function useSeoConfig() {
  return useShared("seo_config", "/seo/config");
}
