/* Tony Yoga service worker — network-first for app code + API, cache-first for media, web push handler */
const CACHE_VERSION = "tony-yoga-v3";
const STATIC_CACHE = `${CACHE_VERSION}-static`;
const RUNTIME_CACHE = `${CACHE_VERSION}-runtime`;
const OFFLINE_URL = "/offline.html";

const PRECACHE = ["/", "/offline.html", "/manifest.json"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(STATIC_CACHE).then((cache) => cache.addAll(PRECACHE)).catch(() => null),
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((k) => !k.startsWith(CACHE_VERSION))
            .map((k) => caches.delete(k)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;
  const url = new URL(request.url);

  if (url.pathname.startsWith("/api/")) return;

  // App code & markup (HTML/JS/CSS) — always network-first so new builds reach
  // users immediately. Cache-first here would pin a stale JS bundle forever.
  const dest = request.destination;
  const isAppCode =
    request.mode === "navigate" ||
    dest === "document" ||
    dest === "script" ||
    dest === "style" ||
    dest === "worker";

  if (isAppCode) {
    event.respondWith(
      fetch(request)
        .then((res) => {
          const clone = res.clone();
          caches.open(RUNTIME_CACHE).then((cache) => cache.put(request, clone)).catch(() => null);
          return res;
        })
        .catch(() =>
          caches.match(request).then((cached) =>
            cached || (request.mode === "navigate" ? caches.match(OFFLINE_URL) : undefined),
          ),
        ),
    );
    return;
  }

  // Media & other static assets (images, fonts) — cache-first with background fill.
  event.respondWith(
    caches.match(request).then(
      (cached) =>
        cached ||
        fetch(request)
          .then((res) => {
            if (res && res.status === 200 && res.type === "basic") {
              const clone = res.clone();
              caches.open(RUNTIME_CACHE).then((cache) => cache.put(request, clone)).catch(() => null);
            }
            return res;
          })
          .catch(() => cached),
    ),
  );
});

// -------- Web Push --------
self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = { title: "Tony Yoga", body: event.data ? event.data.text() : "" };
  }
  const title = data.title || "Tony Yoga";
  const options = {
    body: data.body || "",
    icon: "/icons/icon-192.png",
    badge: "/icons/icon-192.png",
    tag: data.tag || "tony-yoga",
    data: { url: data.url || "/" },
    vibrate: [80, 40, 80],
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = event.notification.data?.url || "/";
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((all) => {
      for (const c of all) {
        if (c.url.includes(url) && "focus" in c) return c.focus();
      }
      if (self.clients.openWindow) return self.clients.openWindow(url);
    }),
  );
});
