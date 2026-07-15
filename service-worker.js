// ============================================================
// Pass It On — Service Worker
// Caches the app shell and card artwork on first load so the
// game works offline afterward (Section 18 of the brief).
// Bump CACHE_NAME whenever you change any cached file so
// returning players get the update instead of a stale cache.
// ============================================================
const CACHE_NAME = "pass-it-on-v2";

const ASSETS = [
  "./",
  "index.html",
  "manifest.webmanifest",
  "css/style.css",
  "js/cards.js",
  "js/engine.js",
  "js/ui.js",
  "js/app.js",
  "icons/icon-192.png",
  "icons/icon-512.png",
  "cards/card-back.jpg",
  "cards/action-five-stones.jpg",
  "cards/action-living-water.jpg",
  "cards/action-loaves-and-fish.jpg",
  "cards/action-mustard-seed.jpg",
  "cards/action-the-big-fish.jpg",
  "cards/action-the-big-storm.jpg",
  "cards/action-the-empty-tomb.jpg",
  "cards/action-the-good-samaritan.jpg",
  "cards/action-the-good-shepherd.jpg",
  "cards/action-tree-climber.jpg",
  "cards/action-two-coins.jpg",
  "cards/action-walk-on-water.jpg",
  "cards/miracle-favor.jpg",
  "cards/miracle-overflow.jpg",
  "cards/miracle-peace.jpg",
  "cards/miracle-redeemed.jpg",
  "cards/miracle-strength.jpg",
  "cards/miracle-wisdom.jpg"
];

self.addEventListener("install", event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(ASSETS)).then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", event => {
  event.respondWith(
    caches.match(event.request).then(cached => {
      if (cached) return cached;
      return fetch(event.request).then(response => {
        // Cache new same-origin GET requests as they're seen (e.g. future card art)
        if (event.request.method === "GET" && response.ok && event.request.url.startsWith(self.location.origin)) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
        }
        return response;
      }).catch(() => cached);
    })
  );
});
