// Loads the YouTube IFrame Player API once and shares it between players.
import { isNativeApp, publicOrigin } from "@/lib/platform";

let ytApiPromise = null;

export function loadYT() {
  if (window.YT && window.YT.Player) return Promise.resolve(window.YT);
  if (ytApiPromise) return ytApiPromise;
  ytApiPromise = new Promise((resolve, reject) => {
    const tag = document.createElement("script");
    tag.src = "https://www.youtube.com/iframe_api";
    tag.async = true;
    tag.onerror = () => { ytApiPromise = null; reject(new Error("YouTube could not be loaded")); };
    document.head.appendChild(tag);
    const prev = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => { if (prev) prev(); resolve(window.YT); };
  });
  return ytApiPromise;
}

// YouTube's player states (same numbers as YT.PlayerState), usable before/without the API.
export const YT_STATE = { UNSTARTED: -1, ENDED: 0, PLAYING: 1, PAUSED: 2, BUFFERING: 3, CUED: 5 };

// Player settings that keep people on our page: no YouTube controls, keyboard, fullscreen,
// annotations or related videos from other channels. Clicks never reach the iframe (our
// overlay sits on top), so the title, logo and "Watch on YouTube" links can't be opened.
export const LOCKED_PLAYER_VARS = {
  controls: 0, disablekb: 1, fs: 0, rel: 0, modestbranding: 1, playsinline: 1, iv_load_policy: 3,
};

// YouTube error codes → what to tell people.
export function ytErrorText(code, isAdmin) {
  const base = "This video can't be played right now.";
  if (!isAdmin) return base;
  if (code === 100 || code === 101 || code === 150)
    return `${base} On YouTube, set the video to Unlisted (not Private) and allow embedding (YouTube Studio → video → Visibility / Show more → Allow embedding).`;
  if (code === 152 || code === 153)
    return `${base} YouTube refused the player here (error ${code}: it didn't see which website the video is on). Check that ${ytWrapperBase()}/yt-player.html opens.`;
  if (code === 2) return `${base} The YouTube link or video ID looks wrong.`;
  if (code === -1) return `${base} The YouTube player didn't load (connection?).`;
  return `${base} YouTube reported error ${code}.`;
}

// ---------------------------------------------------------------------------------------------
// Inside the mobile apps the page runs at capacitor://localhost (iPhone) or https://localhost
// (Android). WKWebView sends YouTube no Referer from capacitor://, and YouTube now refuses such
// embeds ("Error 153 — video player configuration error"). So in the apps every YouTube video is
// played through https://tonyoga.com/yt-player.html in an iframe: YouTube sees tonyoga.com, and
// the app drives that page with postMessage. On the website nothing changes.

/** Where the in-app player page lives: the public site (never the app's own localhost). */
export function ytWrapperBase() {
  const candidates = [process.env.REACT_APP_YT_WRAPPER_URL, publicOrigin(), process.env.REACT_APP_BACKEND_URL];
  for (const c of candidates) {
    const s = String(c || "").trim().replace(/\/$/, "");
    if (!s) continue;
    if (c === process.env.REACT_APP_YT_WRAPPER_URL && /^https?:\/\//.test(s)) return s;   // build-time override (tests)
    if (/^https:\/\//.test(s) && !/^https:\/\/(localhost|127\.0\.0\.1)([:/]|$)/.test(s)) return s;
  }
  return "https://tonyoga.com";
}

/** True when YouTube has to be played through the tonyoga.com page (the mobile apps). */
export function ytViaWrapper() {
  return isNativeApp();
}

/** Resolves when a player can be made with makeYTPlayer(). */
export function ytReady() {
  return ytViaWrapper() ? Promise.resolve(null) : loadYT();
}

/**
 * A YouTube player in place of `mount` — a real YT.Player on the website, a BridgePlayer (same
 * methods and events) in the apps. Call after ytReady() resolved.
 */
export function makeYTPlayer(mount, { videoId, playerVars = {}, events = {} }) {
  if (ytViaWrapper()) return new BridgePlayer(mount, { videoId, playerVars, events });
  return new window.YT.Player(mount, {
    host: "https://www.youtube-nocookie.com",
    videoId,
    playerVars: { ...playerVars, origin: window.location.origin },
    events,
  });
}

/** URL of the tonyoga.com player page (plain = YouTube's own controls, for simple embeds). */
export function ytWrapperUrl(videoId, { start, end, autoplay, plain, ccLoadPolicy } = {}) {
  const q = new URLSearchParams({ v: videoId, o: window.location.origin });
  if (start) q.set("start", String(Math.floor(start)));
  if (end) q.set("end", String(Math.floor(end)));
  if (autoplay) q.set("autoplay", "1");
  if (ccLoadPolicy) q.set("cc_load_policy", "1");
  if (plain) q.set("plain", "1");
  return `${ytWrapperBase()}/yt-player.html?${q.toString()}`;
}

const LOAD_TIMEOUT_MS = 20000;

/** The YT.Player methods our pages use, answered by the tonyoga.com player page. */
export class BridgePlayer {
  constructor(mount, { videoId, playerVars = {}, events = {} }) {
    this.events = events;
    this.state = YT_STATE.UNSTARTED;
    this.time = Number(playerVars.start) || 0;
    this.stamp = Date.now();
    this.duration = 0;
    this.muted = false;
    this.ready = false;
    this.queue = [];
    const src = ytWrapperUrl(videoId, {
      start: playerVars.start, end: playerVars.end, autoplay: playerVars.autoplay === 1, ccLoadPolicy: playerVars.cc_load_policy === 1,
    });
    this.origin = new URL(src).origin;
    const f = document.createElement("iframe");
    f.src = src;
    f.title = "Video";
    f.allow = "autoplay; encrypted-media; picture-in-picture; fullscreen";
    f.setAttribute("allowfullscreen", "");
    f.style.cssText = "border:0;display:block;width:100%;height:100%";
    mount.replaceWith(f);
    this.frame = f;
    this.onMessage = (ev) => this.handle(ev);
    window.addEventListener("message", this.onMessage);
    this.loadTimer = setTimeout(() => { if (!this.ready) this.emit("onError", { data: -1, target: this }); }, LOAD_TIMEOUT_MS);
  }

  handle(ev) {
    if (!this.frame || ev.source !== this.frame.contentWindow || ev.origin !== this.origin) return;
    const m = ev.data;
    if (!m || m.source !== "ty-yt") return;
    if (typeof m.time === "number") { this.time = m.time; this.stamp = Date.now(); }
    if (typeof m.duration === "number" && m.duration > 0) this.duration = m.duration;
    if (typeof m.muted === "boolean") this.muted = m.muted;
    if (m.type === "ready") {
      this.ready = true;
      clearTimeout(this.loadTimer);
      if (typeof m.state === "number") this.state = m.state;
      this.emit("onReady", { target: this });
      this.queue.splice(0).forEach((c) => this.post(c));
    } else if (m.type === "state" || m.type === "time") {
      // A state can arrive first in a time tick and then in its own message: report it once.
      if (typeof m.state === "number" && m.state !== this.state) {
        this.state = m.state;
        this.emit("onStateChange", { data: m.state, target: this });
      }
    } else if (m.type === "error") {
      clearTimeout(this.loadTimer);
      this.emit("onError", { data: typeof m.code === "number" ? m.code : -1, target: this });
    }
  }

  emit(name, arg) {
    try { this.events[name]?.(arg); } catch (e) { setTimeout(() => { throw e; }); }
  }

  post(cmd) {
    if (!this.frame) return;
    if (!this.ready) { this.queue.push(cmd); return; }
    try { this.frame.contentWindow.postMessage({ target: "ty-yt", ...cmd }, this.origin); } catch { /* noop */ }
  }

  playVideo() { this.post({ cmd: "play" }); }
  pauseVideo() { this.post({ cmd: "pause" }); }
  seekTo(t) {
    this.time = Math.max(0, Number(t) || 0);
    this.stamp = Date.now();
    this.post({ cmd: "seek", t: this.time });
  }
  mute() { this.muted = true; this.post({ cmd: "mute" }); }
  unMute() { this.muted = false; this.post({ cmd: "unmute" }); }
  isMuted() { return this.muted; }
  getPlayerState() { return this.state; }
  getDuration() { return this.duration; }
  getCurrentTime() {
    if (this.state !== YT_STATE.PLAYING) return this.time;
    const t = this.time + (Date.now() - this.stamp) / 1000;
    return this.duration ? Math.min(t, this.duration) : t;
  }
  destroy() {
    clearTimeout(this.loadTimer);
    window.removeEventListener("message", this.onMessage);
    try { this.frame?.remove(); } catch { /* noop */ }
    this.frame = null;
  }
}
