/**
 * IronLog — service worker.
 *
 * Makes the app genuinely work offline after a single visit (plus a warm-up
 * of the lazily-loaded catalogue data), matching the "offline-first" claim in
 * the manifest and README.
 *
 * Strategy:
 *  - PRECACHE the app shell and the core static JS/CSS/fonts. These are
 *    needed for any page to boot.
 *  - STALE-WHILE-REVALIDATE every same-origin GET request. For the two large
 *    catalogue indexes and the per-language step packs, the response is served
 *    from cache instantly and refreshed in the background, so a first visit
 *    with no cache simply fetches and stores.
 *  - Navigation requests fall back to the cached app shell so the SPA keeps
 *    working with no network.
 *
 * The cache is versioned; an older cache is discarded on activate. This file is
 * plain ES-agnostic worker code (no imports), so it needs no build step.
 */

// The deploy workflow rewrites this value with the commit SHA, so every
// published build gets a fresh cache and waiting updates can be detected. When
// editing locally, bump the suffix if an old shell keeps winning during tests.
const CACHE = "ironlog-shell-v14";

/** Everything needed to boot the app offline, resolved relative to app/. */
const PRECACHE = [
  "./",
  "./index.html",
  "./manifest.json",
  "./css/app.css",
  "../assets/css/tailwind.css",
  "./js/main.js",
  "./js/store.js",
  "./js/version.js",
  "./js/timer.js",
  "./js/router.js",
  "./js/exercises.js",
  "./js/catalogue.js",
  "./js/stats.js",
  "./js/ui.js",
  "./js/motion.js",
  "./js/diagrams.js",
  "./js/views/home.js",
  "./js/views/heatmap.js",
  "./js/views/workout.js",
  "./js/views/history.js",
  "./js/views/stats.js",
  "./js/views/library.js",
  "./js/views/settings.js",
  "./js/views/routines.js",
  "../assets/img/logo.svg",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
  "./icons/apple-touch-icon.png",
  // The library index is fetched after first paint; precaching it means the
  // offline library is complete after the first visit, not just the shell.
  "./data/exercises-index.json",
  "./data/catalogue-meta.json",
  "../fonts/Figtree-Variable.woff2",
  "../fonts/Figtree-Variable-latinext.woff2",
  "../fonts/Geist-Variable.woff2",
  "../fonts/GeistMono-Variable.woff2",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE);
      // cache: "reload" bypasses the HTTP cache. Without it, an update can
      // precache yesterday's JavaScript because the CDN cached it for minutes.
      await Promise.all(
        PRECACHE.map(async (url) => {
          try {
            // Resolve against the worker's own URL so the request construction
            // cannot fail on a relative path, then bypass the HTTP cache so an
            // update never precaches yesterday's JavaScript.
            const absolute = new URL(url, self.location.href).href;
            await cache.add(new Request(absolute, { cache: "reload" }));
          } catch {
            // One missing optional asset must not abort the whole install; the
            // fetch handler still fills it in on first use.
          }
        }),
      );
      // First install claims immediately so the first visit already works
      // offline. Updates wait for the page to ask: swapping modules under a
      // live workout is worse than showing "reload to update".
      if (!self.registration.active) await self.skipWaiting();
    })(),
  );
});

self.addEventListener("message", (event) => {
  if (event.data === "SKIP_WAITING") self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  // Only handle same-origin GET requests; leave everything else untouched.
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  // Navigations: network first, fall back to the cached app shell offline.
  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request, { cache: "no-cache" })
        .then((response) => {
          if (response.ok) {
            const copy = response.clone();
            caches.open(CACHE).then((cache) => cache.put("./", copy));
          }
          return response;
        })
        .catch(() => caches.match("./")),
    );
    return;
  }

  // Static assets: serve from cache if present, but always refresh in the
  // background so a second offline visit has the newest version.
  event.respondWith(
    caches.match(request).then((cached) => {
      const network = fetch(request)
        .then((response) => {
          if (response && response.ok) {
            const copy = response.clone();
            caches.open(CACHE).then((cache) => cache.put(request, copy));
          }
          return response;
        })
        .catch(() => cached);
      return cached || network;
    }),
  );
});
