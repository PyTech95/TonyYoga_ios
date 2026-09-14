import { useEffect, useRef, useState } from "react";
import { useParams, Link, useNavigate } from "react-router-dom";
import { Lock, CheckCircle2, Scissors, Play, Pause, Volume2, VolumeX, Maximize, Minimize, RotateCcw } from "lucide-react";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import PageHeader from "@/components/PageHeader";
import Spinner from "@/components/Spinner";
import RelatedProducts from "@/components/RelatedProducts";
import { isYouTube, parseYouTubeId, secToMMSS } from "@/lib/youtube";

// Lazy-load the YouTube IFrame Player API once.
let ytApiPromise = null;
function loadYT() {
  if (window.YT && window.YT.Player) return Promise.resolve(window.YT);
  if (ytApiPromise) return ytApiPromise;
  ytApiPromise = new Promise((resolve) => {
    const tag = document.createElement("script");
    tag.src = "https://www.youtube.com/iframe_api";
    document.head.appendChild(tag);
    const prev = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => { if (prev) prev(); resolve(window.YT); };
  });
  return ytApiPromise;
}

export default function VideoPlayer() {
  const { id } = useParams();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [v, setV] = useState(null);
  const [resume, setResume] = useState(0);
  const [done, setDone] = useState(false);
  const [ready, setReady] = useState(false); // resume-position fetched, safe to build player
  const [nextLesson, setNextLesson] = useState(null);
  const [clipPct, setClipPct] = useState(0);
  const [autoAdvance, setAutoAdvance] = useState(false);
  const [countdown, setCountdown] = useState(6);
  const [playing, setPlaying] = useState(false);
  const [muted, setMuted] = useState(false);
  const [isFs, setIsFs] = useState(false);
  const [resumeDismissed, setResumeDismissed] = useState(false);
  const [relatedProducts, setRelatedProducts] = useState([]);

  useEffect(() => {
    const onFs = () => setIsFs(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", onFs);
    return () => document.removeEventListener("fullscreenchange", onFs);
  }, []);

  const ytHostRef = useRef(null);
  const wrapRef = useRef(null);
  const playerRef = useRef(null);
  const videoRef = useRef(null);
  const timerRef = useRef(null);
  const lastSave = useRef(0);
  const completeRef = useRef(() => {});

  // Load video + existing progress + next lesson (for auto-advance)
  useEffect(() => {
    let mounted = true;
    setReady(false);
    setClipPct(0); setAutoAdvance(false); setCountdown(6); setNextLesson(null); setResumeDismissed(false); setRelatedProducts([]);
    (async () => {
      const res = await api.get(`/videos/${id}`).catch(() => ({ data: false }));
      if (!mounted) return;
      setV(res.data);
      if (res.data && res.data.is_unlocked && user) {
        try {
          const { data } = await api.get(`/progress/mine`);
          const rec = data.find((p) => p.video_id === id);
          if (rec) { if (!rec.completed) setResume(rec.seconds || 0); setDone(!!rec.completed); }
        } catch { /* noop */ }
      }
      if (res.data && res.data.program_id) {
        try {
          const { data: prog } = await api.get(`/programs/${res.data.program_id}`);
          const ls = prog.lessons || [];
          const idx = ls.findIndex((l) => l.video?.id === id);
          if (mounted && idx >= 0 && idx + 1 < ls.length) setNextLesson(ls[idx + 1]);
          if (mounted) setRelatedProducts(prog.related_products || []);
        } catch { /* noop */ }
      }
      if (mounted) setReady(true);
    })();
    return () => { mounted = false; };
  }, [id, user]);

  const goNext = () => { if (nextLesson?.video?.id) navigate(`/library/${nextLesson.video.id}`); };
  // Fresh closure each render so the player's poll callback sees the latest nextLesson.
  completeRef.current = () => {
    setDone(true);
    setClipPct(100);
    if (nextLesson && nextLesson.is_unlocked && nextLesson.video?.id) { setCountdown(6); setAutoAdvance(true); }
  };

  // Auto-advance countdown → next lesson
  useEffect(() => {
    if (!autoAdvance) return;
    if (countdown <= 0) { goNext(); return; }
    const t = setTimeout(() => setCountdown((c) => c - 1), 1000);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoAdvance, countdown]);

  const saveProgress = async (seconds, completed = false) => {
    if (!user) return;
    const now = Date.now();
    if (!completed && now - lastSave.current < 4000) return;
    lastSave.current = now;
    try { await api.post(`/progress`, { video_id: id, seconds: Math.floor(seconds), completed }); } catch { /* noop */ }
    if (completed) setDone(true);
  };

  // Build the YouTube player (with resume + progress + completion) once ready
  useEffect(() => {
    if (!ready || !v || !v.is_unlocked || !v.video_url || !isYouTube(v.video_url)) return;
    let cancelled = false;
    const start = v.start_seconds || 0;
    const end = v.end_seconds || undefined;
    const beginAt = (resume && resume > start + 2 && (!end || resume < end - 2)) ? Math.floor(resume) : start;

    loadYT().then((YT) => {
      if (cancelled || !ytHostRef.current) return;
      playerRef.current = new YT.Player(ytHostRef.current, {
        host: "https://www.youtube-nocookie.com",
        videoId: parseYouTubeId(v.video_url),
        playerVars: {
          start: Math.floor(beginAt),
          controls: 0, disablekb: 1, fs: 0, rel: 0,
          modestbranding: 1, playsinline: 1, iv_load_policy: 3, cc_load_policy: 1,
        },
        events: {
          onReady: () => {
            // Seek to the clip start and pause so the first visible frame IS the
            // clip's start frame (acts as the poster), then wait for the user.
            try { playerRef.current.seekTo(beginAt, true); } catch { /* noop */ }
            try { playerRef.current.pauseVideo(); } catch { /* noop */ }
            setPlaying(false);
            try { setMuted(!!playerRef.current.isMuted?.()); } catch { /* noop */ }
            if (end && end > start) setClipPct(Math.min(100, Math.max(0, ((beginAt - start) / (end - start)) * 100)));
          },
          onStateChange: (e) => {
            const P = window.YT.PlayerState;
            clearInterval(timerRef.current);
            if (e.data === P.PLAYING) {
              setPlaying(true);
              // Poll every 400ms to (a) save progress, (b) drive the clip bar, and
              // (c) hard-enforce the segment [start,end] — YouTube's own controls are
              // hidden and its `end` param is unreliable, so we lock playback here.
              timerRef.current = setInterval(() => {
                try {
                  const t = playerRef.current.getCurrentTime();
                  if (t < start - 1) { try { playerRef.current.seekTo(start, true); } catch { /* noop */ } }
                  if (end) {
                    setClipPct(Math.min(100, Math.max(0, ((t - start) / (end - start)) * 100)));
                  } else {
                    const d = playerRef.current.getDuration?.() || 0;
                    if (d) setClipPct(Math.min(100, (t / d) * 100));
                  }
                  if (end && t >= end - 0.25) {
                    try { playerRef.current.pauseVideo(); } catch { /* noop */ }
                    try { playerRef.current.seekTo(end, true); } catch { /* noop */ }
                    clearInterval(timerRef.current);
                    setPlaying(false);
                    saveProgress(end, true);
                    completeRef.current();
                    return;
                  }
                  saveProgress(t, false);
                } catch { /* noop */ }
              }, 400);
            } else if (e.data === P.PAUSED) {
              setPlaying(false);
              try { saveProgress(playerRef.current.getCurrentTime(), false); } catch { /* noop */ }
            } else if (e.data === P.ENDED) {
              setPlaying(false);
              try { saveProgress(end || playerRef.current.getCurrentTime(), true); } catch { /* noop */ }
              completeRef.current();
            }
          },
        },
      });
    });

    return () => {
      cancelled = true;
      clearInterval(timerRef.current);
      try { if (playerRef.current?.getCurrentTime) saveProgress(playerRef.current.getCurrentTime(), false); } catch { /* noop */ }
      try { playerRef.current?.destroy?.(); } catch { /* noop */ }
      playerRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, v]);

  if (v === null) return <><PageHeader back /><Spinner /></>;
  if (v === false) return <><PageHeader back title="Not found" /></>;

  const playable = v.is_unlocked && v.video_url;
  const youtube = playable && isYouTube(v.video_url);
  const segStart = v.start_seconds || 0;
  const segEnd = v.end_seconds || undefined;
  const clipLabel = segEnd && segEnd > segStart ? secToMMSS(segEnd - segStart) : null;

  const togglePlay = () => {
    if (youtube && playerRef.current) {
      try { playing ? playerRef.current.pauseVideo() : playerRef.current.playVideo(); } catch { /* noop */ }
    } else if (videoRef.current) {
      try {
        if (videoRef.current.paused) { const p = videoRef.current.play(); if (p && p.catch) p.catch(() => {}); }
        else { videoRef.current.pause(); }
      } catch { /* noop */ }
    }
  };

  const seekToPct = (pct) => {
    pct = Math.min(1, Math.max(0, pct));
    if (!segEnd || segEnd <= segStart) return; // clip seek only for segmented clips
    const target = segStart + (segEnd - segStart) * pct;
    if (youtube && playerRef.current) { try { playerRef.current.seekTo(target, true); } catch { /* noop */ } }
    else if (videoRef.current) { try { videoRef.current.currentTime = target; } catch { /* noop */ } }
    setClipPct(pct * 100);
  };

  const toggleMute = (e) => {
    e?.stopPropagation?.();
    if (youtube && playerRef.current) {
      try {
        if (playerRef.current.isMuted()) { playerRef.current.unMute(); setMuted(false); }
        else { playerRef.current.mute(); setMuted(true); }
      } catch { /* noop */ }
    } else if (videoRef.current) {
      videoRef.current.muted = !videoRef.current.muted;
      setMuted(videoRef.current.muted);
    }
  };

  const toggleFullscreen = (e) => {
    e?.stopPropagation?.();
    const el = wrapRef.current; if (!el) return;
    try {
      if (document.fullscreenElement) { (document.exitFullscreen || document.webkitExitFullscreen)?.call(document); }
      else { (el.requestFullscreen || el.webkitRequestFullscreen)?.call(el); }
    } catch { /* noop */ }
  };

  const restartClip = () => {
    setResumeDismissed(true); setClipPct(0);
    if (youtube && playerRef.current) { try { playerRef.current.seekTo(segStart, true); playerRef.current.playVideo(); } catch { /* noop */ } }
    else if (videoRef.current) { try { videoRef.current.currentTime = segStart; const p = videoRef.current.play(); if (p && p.catch) p.catch(() => {}); } catch { /* noop */ } }
  };

  const continueResume = () => {
    setResumeDismissed(true);
    if (youtube && playerRef.current) { try { playerRef.current.seekTo(resume, true); playerRef.current.playVideo(); } catch { /* noop */ } }
    else if (videoRef.current) { try { videoRef.current.currentTime = resume; const p = videoRef.current.play(); if (p && p.catch) p.catch(() => {}); } catch { /* noop */ } }
  };

  const BottomBar = () => (
    <div className="pointer-events-none absolute inset-x-0 bottom-0 z-[7] flex items-center justify-between px-3 pb-3">
      <button
        type="button" onClick={toggleMute} data-testid="player-mute"
        aria-label={muted ? "Unmute" : "Mute"}
        className="pointer-events-auto flex h-9 w-9 items-center justify-center rounded-full bg-black/55 text-white backdrop-blur-sm transition hover:bg-black/75"
      >
        {muted ? <VolumeX className="h-[18px] w-[18px]" /> : <Volume2 className="h-[18px] w-[18px]" />}
      </button>
      <button
        type="button" onClick={toggleFullscreen} data-testid="player-fullscreen"
        aria-label={isFs ? "Exit fullscreen" : "Fullscreen"}
        className="pointer-events-auto flex h-9 w-9 items-center justify-center rounded-full bg-black/55 text-white backdrop-blur-sm transition hover:bg-black/75"
      >
        {isFs ? <Minimize className="h-[18px] w-[18px]" /> : <Maximize className="h-[18px] w-[18px]" />}
      </button>
    </div>
  );

  const ClipChip = () => clipLabel ? (
    <div
      data-testid="clip-duration-chip"
      className="pointer-events-none absolute right-3 top-3 z-10 flex items-center gap-1.5 rounded-full bg-black/70 px-2.5 py-1 text-[11px] font-semibold text-white backdrop-blur-sm"
    >
      <Scissors className="h-3 w-3 text-[#E4A788]" />
      {clipLabel} clip
    </div>
  ) : null;

  return (
    <div data-testid="video-player-page" className="pb-8">
      <PageHeader eyebrow={v.style} title={v.title} back testId="video-header" />

      <div className="mx-auto max-w-3xl px-5 space-y-5">
        {playable && resume > 5 && !done && !resumeDismissed && (
          <div data-testid="resume-banner" className="flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-[#1C221F] px-4 py-3 text-white">
            <div className="flex items-center gap-2">
              <RotateCcw className="h-4 w-4 text-[#E4A788]" />
              <span className="text-sm">Resume at <span className="font-semibold text-[#E4A788]">{secToMMSS(resume)}</span>?</span>
            </div>
            <div className="flex items-center gap-2">
              <button data-testid="resume-restart" onClick={restartClip} className="rounded-full px-3 py-1.5 text-xs font-medium text-white/70 hover:text-white">Start over</button>
              <button data-testid="resume-continue" onClick={continueResume} className="rounded-full bg-[#B25A45] px-4 py-1.5 text-xs font-semibold hover:bg-[#9d4d3b] transition">Resume</button>
            </div>
          </div>
        )}
        {playable ? (
          youtube ? (
            <div ref={wrapRef} className="relative rounded-3xl overflow-hidden bg-black aspect-video" data-testid="video-youtube">
              {/* Isolated player mount: the YouTube IFrame API REPLACES the inner div
                  with its <iframe>, so it must be the lone child of a stable wrapper
                  that React never reorders. If overlays were siblings of this node,
                  overlay re-renders would crash with insertBefore on a detached node. */}
              <div className="pointer-events-none absolute inset-0">
                <div ref={ytHostRef} className="h-full w-full" />
              </div>
              <ClipChip />
              {/* Custom control layer: hides YouTube's native scrubber/branding and
                  locks interaction to our clip. Click toggles play/pause. */}
              <button
                type="button"
                onClick={togglePlay}
                data-testid="yt-toggle-play"
                aria-label={playing ? "Pause" : "Play"}
                className="group absolute inset-0 z-[5] flex items-center justify-center focus:outline-none"
              >
                <span
                  className={`flex h-16 w-16 items-center justify-center rounded-full bg-[#B25A45] text-white shadow-xl transition-all duration-200 ${
                    playing ? "opacity-0 group-hover:opacity-100 scale-90 group-hover:scale-100" : "opacity-100"
                  }`}
                >
                  {playing ? <Pause className="h-7 w-7" fill="currentColor" /> : <Play className="h-7 w-7 translate-x-0.5" fill="currentColor" />}
                </span>
              </button>
              <BottomBar />
            </div>
          ) : (
            <div ref={wrapRef} className="relative rounded-3xl overflow-hidden bg-black aspect-video" data-testid="video-native-wrap">
              <ClipChip />
              <video
                ref={videoRef}
                data-testid="video-el"
                playsInline
                className="h-full w-full"
                poster={v.cover_image}
                src={v.video_url}
                onPlay={() => setPlaying(true)}
                onPause={() => setPlaying(false)}
                onLoadedMetadata={() => {
                  const el = videoRef.current; if (!el) return;
                  const begin = (resume && resume > segStart + 2 && (!segEnd || resume < segEnd - 2)) ? resume : segStart;
                  if (begin > 0) el.currentTime = begin;
                  const e2 = segEnd || el.duration || 0;
                  if (e2 > segStart) setClipPct(Math.min(100, Math.max(0, ((begin - segStart) / (e2 - segStart)) * 100)));
                }}
                onTimeUpdate={() => {
                  const el = videoRef.current; if (!el) return;
                  if (el.currentTime < segStart - 1) el.currentTime = segStart;
                  const s = segStart; const e2 = segEnd || el.duration || 0;
                  if (e2 > s) setClipPct(Math.min(100, Math.max(0, ((el.currentTime - s) / (e2 - s)) * 100)));
                  if (segEnd && el.currentTime >= segEnd - 0.3) {
                    el.pause();
                    try { el.currentTime = segEnd; } catch { /* noop */ }
                    saveProgress(segEnd, true);
                    completeRef.current();
                    return;
                  }
                  saveProgress(el.currentTime, false);
                }}
                onEnded={() => { const el = videoRef.current; if (el) saveProgress(segEnd || el.duration || el.currentTime, true); completeRef.current(); }}
              />
              <button
                type="button"
                onClick={togglePlay}
                data-testid="native-toggle-play"
                aria-label={playing ? "Pause" : "Play"}
                className="group absolute inset-0 z-[5] flex items-center justify-center focus:outline-none"
              >
                <span
                  className={`flex h-16 w-16 items-center justify-center rounded-full bg-[#B25A45] text-white shadow-xl transition-all duration-200 ${
                    playing ? "opacity-0 group-hover:opacity-100 scale-90 group-hover:scale-100" : "opacity-100"
                  }`}
                >
                  {playing ? <Pause className="h-7 w-7" fill="currentColor" /> : <Play className="h-7 w-7 translate-x-0.5" fill="currentColor" />}
                </span>
              </button>
              <BottomBar />
            </div>
          )
        ) : (
          <div className="rounded-3xl relative aspect-video overflow-hidden bg-[#1C221F]" data-testid="video-locked">
            {v.cover_image && <img src={v.cover_image} alt="" className="absolute inset-0 h-full w-full object-cover opacity-40" />}
            <div className="absolute inset-0 flex flex-col items-center justify-center text-[#FAFAF7] gap-3 px-6 text-center">
              <div className="h-14 w-14 rounded-full bg-[#B25A45] flex items-center justify-center">
                <Lock className="h-5 w-5" />
              </div>
              <div className="serif text-2xl">Members-only practice</div>
              <p className="text-sm text-white/70 max-w-sm">Join Tony Yoga to unlock the full library and every practice.</p>
              <Link to="/memberships" data-testid="video-unlock-cta" className="pill pill-primary mt-2">See memberships</Link>
            </div>
          </div>
        )}

        {playable && (
          <div data-testid="clip-progress" className="-mt-2 space-y-1">
            <div
              role="slider"
              aria-label="Clip position"
              data-testid="clip-progress-track"
              onClick={(e) => { const r = e.currentTarget.getBoundingClientRect(); seekToPct((e.clientX - r.left) / r.width); }}
              className={`group relative h-1.5 w-full overflow-hidden rounded-full bg-[#E5E6DF] ${segEnd ? "cursor-pointer" : ""}`}
            >
              <div
                data-testid="clip-progress-fill"
                className="h-full rounded-full bg-[#B25A45] transition-[width] duration-300 ease-out"
                style={{ width: `${clipPct}%` }}
              />
            </div>
            {clipLabel && (
              <div className="flex justify-between text-[10px] font-medium text-[#9AA096]">
                <span data-testid="clip-elapsed">{secToMMSS((clipPct / 100) * (segEnd - segStart))}</span>
                <span>{clipLabel}</span>
              </div>
            )}
          </div>
        )}

        <div>
          <div className="text-xs text-[#6B7269] mb-2 flex items-center gap-2">
            <span>{v.duration_minutes} min · {v.level}</span>
            {done && (
              <span data-testid="video-completed" className="inline-flex items-center gap-1 text-[#839682] font-semibold">
                <CheckCircle2 className="h-4 w-4" /> Completed
              </span>
            )}
            {resume > 5 && !done && playable && (
              <span data-testid="video-resumed" className="text-[#B25A45] font-semibold">Resuming where you left off</span>
            )}
          </div>
          <p className="text-[15px] text-[#545E56] leading-relaxed">{v.description}</p>
        </div>

        <RelatedProducts products={relatedProducts} title="Shop this practice" />
      </div>

      {autoAdvance && nextLesson && (
        <div
          data-testid="autoadvance-overlay"
          className="fixed inset-x-0 bottom-20 z-50 mx-auto flex max-w-md items-center gap-3 rounded-2xl border border-[#2A312D] bg-[#1C221F] px-4 py-3 text-[#FAFAF7] shadow-2xl"
          style={{ width: "calc(100% - 2.5rem)" }}
        >
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#B25A45] text-sm font-bold">
            {countdown}
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-[10px] uppercase tracking-widest text-white/50">Up next</div>
            <div className="truncate text-sm font-semibold">{nextLesson.video?.title || "Next lesson"}</div>
          </div>
          <button
            data-testid="autoadvance-cancel"
            onClick={() => setAutoAdvance(false)}
            className="shrink-0 rounded-full px-3 py-1.5 text-xs font-medium text-white/60 hover:text-white"
          >
            Stay
          </button>
          <button
            data-testid="autoadvance-play-now"
            onClick={goNext}
            className="shrink-0 rounded-full bg-[#B25A45] px-3 py-1.5 text-xs font-semibold hover:bg-[#9d4d3b] transition"
          >
            Play now
          </button>
        </div>
      )}
    </div>
  );
}
