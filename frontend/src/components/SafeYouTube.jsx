import { useCallback, useEffect, useRef, useState } from "react";
import { Play, Pause, Volume2, VolumeX, Maximize, Minimize, RotateCcw, AlertCircle } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { parseYouTubeId, secToMMSS } from "@/lib/youtube";
import { loadYT, LOCKED_PLAYER_VARS, ytErrorText } from "@/lib/ytApi";

/**
 * A YouTube video that plays inside our page and never sends people to YouTube.
 *
 * YouTube's own controls are off and a transparent layer sits over the video, so the title,
 * channel name, logo, "Watch on YouTube", "More videos" and the end screen can't be clicked.
 * Our own controls: play/pause (tap anywhere), seek bar, time, mute, fullscreen.
 *
 * iPhone Safari may refuse to start a YouTube video from our button (it wants a tap inside the
 * player). Then, and only until it plays, the middle of the video lets the tap through to
 * YouTube's own play button while the edges (title, logo, links) stay covered.
 */
export default function SafeYouTube({
  url, videoId, start = 0, end, title = "Video", poster, badge, testId = "safe-youtube",
  className = "", rounded = "rounded-3xl", autoStart = false, onEnded,
}) {
  const id = videoId || parseYouTubeId(url);
  const { user } = useAuth() || {};
  const isAdmin = user?.role === "admin";
  const wrapRef = useRef(null);
  const hostRef = useRef(null);
  const player = useRef(null);
  const timer = useRef(null);
  const blockTimer = useRef(null);
  const hideTimer = useRef(null);
  const [started, setStarted] = useState(false);   // player created
  const [playing, setPlaying] = useState(false);
  const [ended, setEnded] = useState(false);
  const [muted, setMuted] = useState(false);
  const [time, setTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [error, setError] = useState(null);
  const [blocked, setBlocked] = useState(false);   // browser refused our play(): let a tap through in the middle
  const [fs, setFs] = useState(false);
  const [pseudoFs, setPseudoFs] = useState(false);
  const [showBar, setShowBar] = useState(true);
  const segStart = Math.max(0, Math.floor(start || 0));
  const segEnd = end && end > segStart ? Math.floor(end) : undefined;
  const thumb = poster || (id ? `https://img.youtube.com/vi/${id}/hqdefault.jpg` : null);

  useEffect(() => {
    const onFs = () => setFs(!!(document.fullscreenElement || document.webkitFullscreenElement));
    document.addEventListener("fullscreenchange", onFs);
    document.addEventListener("webkitfullscreenchange", onFs);
    return () => { document.removeEventListener("fullscreenchange", onFs); document.removeEventListener("webkitfullscreenchange", onFs); };
  }, []);
  useEffect(() => {
    if (!pseudoFs) return undefined;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e) => { if (e.key === "Escape") setPseudoFs(false); };
    window.addEventListener("keydown", onKey);
    return () => { document.body.style.overflow = prev; window.removeEventListener("keydown", onKey); };
  }, [pseudoFs]);

  // Warm up the API so the first tap starts quickly.
  useEffect(() => { if (id) loadYT().catch(() => {}); }, [id]);

  useEffect(() => () => {
    clearInterval(timer.current); clearTimeout(blockTimer.current); clearTimeout(hideTimer.current);
    try { player.current?.destroy?.(); } catch { /* noop */ }
    player.current = null;
  }, []);

  const poll = useCallback(() => {
    clearInterval(timer.current);
    timer.current = setInterval(() => {
      const p = player.current; if (!p?.getCurrentTime) return;
      try {
        const t = p.getCurrentTime();
        const d = p.getDuration?.() || 0;
        if (segEnd && t >= segEnd - 0.25) {
          p.pauseVideo(); p.seekTo(segStart, true);
          clearInterval(timer.current); setPlaying(false); setEnded(true); setTime(segEnd); onEnded?.();
          return;
        }
        setTime(t); if (d) setDuration(d);
      } catch { /* noop */ }
    }, 500);
  }, [segEnd, segStart, onEnded]);

  const watchForBlock = useCallback(() => {
    clearTimeout(blockTimer.current);
    blockTimer.current = setTimeout(() => {
      try {
        const s = player.current?.getPlayerState?.();
        const P = window.YT?.PlayerState || {};
        if (s !== P.PLAYING && s !== P.BUFFERING) setBlocked(true);
      } catch { /* noop */ }
    }, 1800);
  }, []);

  const create = useCallback(() => {
    if (!id || player.current) return;
    setStarted(true);
    loadYT().then((YT) => {
      if (!hostRef.current || player.current) return;
      // Fresh mount inside our own element: YouTube replaces it with the iframe.
      hostRef.current.replaceChildren();
      const mount = document.createElement("div");
      hostRef.current.appendChild(mount);
      player.current = new YT.Player(mount, {
        host: "https://www.youtube-nocookie.com",
        videoId: id,
        playerVars: { ...LOCKED_PLAYER_VARS, autoplay: 1, start: segStart, ...(segEnd ? { end: segEnd } : {}),
                      origin: window.location.origin },
        events: {
          onReady: (e) => {
            try { setMuted(!!e.target.isMuted?.()); setDuration(e.target.getDuration?.() || 0); e.target.playVideo(); } catch { /* noop */ }
            watchForBlock();
          },
          onStateChange: (e) => {
            const P = window.YT.PlayerState;
            if (e.data === P.PLAYING) {
              setPlaying(true); setEnded(false); setBlocked(false); clearTimeout(blockTimer.current); poll();
              clearTimeout(hideTimer.current); hideTimer.current = setTimeout(() => setShowBar(false), 2500);
            } else if (e.data === P.PAUSED) {
              setPlaying(false); clearInterval(timer.current); setShowBar(true);
            } else if (e.data === P.ENDED) {
              // Back to the start and paused, so YouTube's end screen (other videos) never shows.
              clearInterval(timer.current); setPlaying(false); setEnded(true); setShowBar(true);
              try { e.target.seekTo(segStart, true); e.target.pauseVideo(); } catch { /* noop */ }
              onEnded?.();
            }
          },
          onError: (e) => { clearInterval(timer.current); setPlaying(false); setError(e?.data ?? -1); },
        },
      });
    }).catch(() => setError(-1));
  }, [id, segStart, segEnd, poll, watchForBlock, onEnded]);

  useEffect(() => { if (autoStart) create(); }, [autoStart, create]);

  const toggle = () => {
    setShowBar(true);
    if (!player.current) { create(); return; }
    try {
      if (playing) player.current.pauseVideo();
      else {
        if (ended) { player.current.seekTo(segStart, true); setEnded(false); }
        player.current.playVideo(); watchForBlock();
      }
    } catch { /* noop */ }
  };
  const toggleMute = (e) => {
    e.stopPropagation();
    try {
      if (player.current.isMuted()) { player.current.unMute(); setMuted(false); } else { player.current.mute(); setMuted(true); }
    } catch { /* noop */ }
  };
  const toggleFs = (e) => {
    e.stopPropagation();
    const el = wrapRef.current; if (!el) return;
    if (pseudoFs) { setPseudoFs(false); return; }
    try {
      if (document.fullscreenElement || document.webkitFullscreenElement) { (document.exitFullscreen || document.webkitExitFullscreen).call(document); return; }
      const req = el.requestFullscreen || el.webkitRequestFullscreen;
      if (req) { const p = req.call(el); if (p && p.catch) p.catch(() => setPseudoFs(true)); }
      else setPseudoFs(true);   // iPhone: no element fullscreen → fill the screen ourselves
    } catch { setPseudoFs(true); }
  };
  const lo = segStart, hi = segEnd || duration || 0;
  const seek = (e) => {
    e.stopPropagation();
    const v = Number(e.target.value);
    setTime(v);
    try { player.current?.seekTo(v, true); } catch { /* noop */ }
  };
  const onMove = () => {
    if (!playing) return;
    setShowBar(true); clearTimeout(hideTimer.current);
    hideTimer.current = setTimeout(() => setShowBar(false), 2500);
  };

  if (!id) return null;
  const full = fs || pseudoFs;
  return (
    <div
      ref={wrapRef}
      data-testid={testId}
      onMouseMove={onMove}
      className={`relative isolate overflow-hidden bg-black select-none ${pseudoFs ? "!fixed inset-0 z-[300] !rounded-none" : `aspect-video ${rounded}`} ${className}`}
      style={pseudoFs ? { paddingTop: "var(--sat, 0px)", paddingBottom: "var(--sab, 0px)" } : undefined}
    >
      {/* Isolated mount: YouTube replaces the inner div with its iframe, so it is the only child of
          a wrapper React never re-renders. pointer-events-none: the iframe never receives a click. */}
      <div className={`${blocked && !playing ? "" : "pointer-events-none "}absolute inset-0`} aria-hidden="true" data-testid={`${testId}-frame`}>
        <div ref={hostRef} className="h-full w-full [&>*]:h-full [&>*]:w-full" />
      </div>

      {(!started || ended) && !error && thumb && (
        <img src={thumb} alt="" className="absolute inset-0 z-[4] h-full w-full object-cover" data-testid={`${testId}-poster`}
          onError={(e) => { if (!e.currentTarget.src.includes("hqdefault")) e.currentTarget.src = `https://img.youtube.com/vi/${id}/hqdefault.jpg`; }} />
      )}
      {(!playing || !started) && !error && <div className="pointer-events-none absolute inset-0 z-[4] bg-gradient-to-t from-black/60 via-black/15 to-black/25" />}

      {/* Click layer. While the browser blocks our play button, only the middle lets a tap through
          to YouTube's own play button; the edges (title, logo, links) stay covered. */}
      {blocked && !playing ? (
        <>
          <div className="absolute inset-x-0 top-0 z-[5] h-[30%]" onClick={toggle} />
          <div className="absolute inset-x-0 bottom-0 z-[5] h-[28%]" onClick={toggle} />
          <div className="absolute left-0 top-[30%] bottom-[28%] z-[5] w-[30%]" onClick={toggle} />
          <div className="absolute right-0 top-[30%] bottom-[28%] z-[5] w-[30%]" onClick={toggle} />
          <div className="pointer-events-none absolute inset-x-0 bottom-[30%] z-[6] text-center text-[12px] font-semibold text-white drop-shadow" data-testid={`${testId}-tap-hint`}>Tap the play button to start</div>
        </>
      ) : (
        <button
          type="button" onClick={toggle} data-testid={`${testId}-toggle`} aria-label={playing ? `Pause ${title}` : `Play ${title}`}
          className="group absolute inset-0 z-[5] flex items-center justify-center focus:outline-none focus-visible:ring-2 focus-visible:ring-white/70"
        >
          {!error && (
            <span className={`flex h-16 w-16 items-center justify-center rounded-full bg-[#B25A45] text-white shadow-xl transition-all duration-200 ${
              playing ? "opacity-0 group-hover:opacity-100 scale-90 group-hover:scale-100" : "opacity-100"}`}>
              {ended ? <RotateCcw className="h-7 w-7" /> : playing ? <Pause className="h-7 w-7" fill="currentColor" /> : <Play className="h-7 w-7 translate-x-0.5" fill="currentColor" />}
            </span>
          )}
        </button>
      )}

      {badge && !started && (
        <div className="pointer-events-none absolute bottom-3 left-4 z-[6] rounded-full bg-black/45 px-3 py-1 text-xs font-bold uppercase tracking-widest text-white">{badge}</div>
      )}

      {started && !error && (
        <div className={`absolute inset-x-0 bottom-0 z-[7] flex items-center gap-2 bg-gradient-to-t from-black/70 to-transparent px-3 pb-2.5 pt-6 transition-opacity duration-300 ${
          showBar || !playing ? "opacity-100" : "opacity-0 hover:opacity-100"}`} data-testid={`${testId}-bar`}>
          <button type="button" onClick={(e) => { e.stopPropagation(); toggle(); }} aria-label={playing ? "Pause" : "Play"}
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-white hover:bg-white/15">
            {playing ? <Pause className="h-4 w-4" fill="currentColor" /> : <Play className="h-4 w-4" fill="currentColor" />}
          </button>
          <span className="shrink-0 text-[11px] tabular-nums text-white/85" data-testid={`${testId}-time`}>{secToMMSS(Math.max(0, time - lo))} / {secToMMSS(Math.max(0, hi - lo))}</span>
          <input type="range" min={lo} max={hi || 1} step="1" value={Math.min(Math.max(time, lo), hi || 1)} onChange={seek} onClick={(e) => e.stopPropagation()}
            aria-label="Seek" disabled={!hi} data-testid={`${testId}-seek`}
            className="h-1 min-w-0 flex-1 cursor-pointer accent-[#E4A788]" />
          <button type="button" onClick={toggleMute} aria-label={muted ? "Unmute" : "Mute"} data-testid={`${testId}-mute`}
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-white hover:bg-white/15">
            {muted ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
          </button>
          <button type="button" onClick={toggleFs} aria-label={full ? "Exit fullscreen" : "Fullscreen"} data-testid={`${testId}-fullscreen`}
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-white hover:bg-white/15">
            {full ? <Minimize className="h-4 w-4" /> : <Maximize className="h-4 w-4" />}
          </button>
        </div>
      )}

      {error != null && (
        <div className="absolute inset-0 z-[8] flex flex-col items-center justify-center gap-2 bg-[#1C221F] px-6 text-center text-white" role="alert" data-testid={`${testId}-error`}>
          <AlertCircle className="h-7 w-7 text-[#E4A788]" />
          <p className="text-sm max-w-sm">{ytErrorText(error, isAdmin)}</p>
        </div>
      )}
    </div>
  );
}
