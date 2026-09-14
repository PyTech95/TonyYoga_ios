// YouTube helpers — parse ids, build timestamped embeds, mm:ss <-> seconds.

export function parseYouTubeId(url) {
  if (!url) return null;
  const s = String(url).trim();
  const patterns = [
    /youtube\.com\/watch\?v=([\w-]{11})/,
    /youtu\.be\/([\w-]{11})/,
    /youtube\.com\/embed\/([\w-]{11})/,
    /youtube\.com\/shorts\/([\w-]{11})/,
    /youtube\.com\/live\/([\w-]{11})/,
  ];
  for (const p of patterns) {
    const m = s.match(p);
    if (m) return m[1];
  }
  if (/^[\w-]{11}$/.test(s)) return s;
  return null;
}

export function isYouTube(url) {
  return !!parseYouTubeId(url);
}

// Build an embed URL that starts (and optionally ends) at the given seconds.
// Uses the privacy-enhanced (no-cookie) domain — better for unlisted/paid content.
export function youTubeEmbed(url, start, end) {
  const id = parseYouTubeId(url);
  if (!id) return null;
  const params = new URLSearchParams({ rel: "0", modestbranding: "1", playsinline: "1" });
  if (start) params.set("start", Math.floor(start));
  if (end) params.set("end", Math.floor(end));
  return `https://www.youtube-nocookie.com/embed/${id}?${params.toString()}`;
}

export function youTubeThumb(url) {
  const id = parseYouTubeId(url);
  return id ? `https://img.youtube.com/vi/${id}/hqdefault.jpg` : null;
}

export function secToMMSS(s) {
  s = Math.max(0, Math.floor(s || 0));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (h) return `${h}:${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
  return `${m}:${String(sec).padStart(2, "0")}`;
}

export function mmssToSec(str) {
  if (str == null || str === "") return null;
  const parts = String(str).split(":").map((x) => parseInt(x, 10) || 0);
  let s = 0;
  for (const p of parts) s = s * 60 + p;
  return s;
}
