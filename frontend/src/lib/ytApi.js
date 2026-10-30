// Loads the YouTube IFrame Player API once and shares it between players.
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
  if (code === 100 || code === 101 || code === 150 || code === 153)
    return `${base} On YouTube, set the video to Unlisted (not Private) and allow embedding (YouTube Studio → video → Visibility / Show more → Allow embedding).`;
  if (code === 2) return `${base} The YouTube link or video ID looks wrong.`;
  return `${base} YouTube reported error ${code}.`;
}
