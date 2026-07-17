// ============================================================
// Pass It On — Service Worker
// Caches the app shell and card artwork on first load so the
// game works offline afterward (Section 18 of the brief).
// Bump CACHE_NAME whenever you change any cached file so
// returning players get the update instead of a stale cache.
// ============================================================
const CACHE_NAME = "pass-it-on-v12";

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
  "cards/Pass It On - Back.jpg",
  "cards/Action - Five Stones.jpg",
  "cards/Action - Living Water.jpg",
  "cards/Action - Loaves and Fish.jpg",
  "cards/Action - Mustard Seed.jpg",
  "cards/Action - The Big Fish.jpg",
  "cards/Action - The Big Storm.jpg",
  "cards/Action - The Empty Tomb.jpg",
  "cards/Action - The Good Samaritan.jpg",
  "cards/Action - The Good Shepherd.jpg",
  "cards/Action - Tree Climber.jpg",
  "cards/Action - Two Coins.jpg",
  "cards/Action - Walk on Water.jpg",
  "cards/Miracle - Favor.jpg",
  "cards/Miracle - Overflow.jpg",
  "cards/Miracle - Peace.jpg",
  "cards/Miracle - Redeemed.jpg",
  "cards/Miracle - Strength.jpg",
  "cards/Miracle - Wisdom.jpg",
  "cards/Faith - 1.jpg", "cards/Faith - 2.jpg", "cards/Faith - 3.jpg",
  "cards/Faith - 4.jpg", "cards/Faith - 5.jpg", "cards/Faith - 6.jpg",
  "cards/Hope - 1.jpg", "cards/Hope - 2.jpg", "cards/Hope - 3.jpg",
  "cards/Hope - 4.jpg", "cards/Hope - 5.jpg", "cards/Hope - 6.jpg",
  "cards/Love - 1.jpg", "cards/Love - 2.jpg", "cards/Love - 3.jpg",
  "cards/Love - 4.jpg", "cards/Love - 5.jpg", "cards/Love - 6.jpg",
  "cards/Prayer - 1.jpg", "cards/Prayer - 2.jpg", "cards/Prayer - 3.jpg",
  "cards/Prayer - 4.jpg", "cards/Prayer - 5.jpg", "cards/Prayer - 6.jpg",
  "cards/Service - 1.jpg", "cards/Service - 2.jpg", "cards/Service - 3.jpg",
  "cards/Service - 4.jpg", "cards/Service - 5.jpg", "cards/Service - 6.jpg",
  "cards/Word - 1.jpg", "cards/Word - 2.jpg", "cards/Word - 3.jpg",
  "cards/Word - 4.jpg", "cards/Word - 5.jpg", "cards/Word - 6.jpg"
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
        const isSameOrigin = event.request.url.startsWith(self.location.origin);
        const isGoogleFonts = event.request.url.startsWith("https://fonts.googleapis.com") || event.request.url.startsWith("https://fonts.gstatic.com");
        if (event.request.method === "GET" && response.ok && (isSameOrigin || isGoogleFonts)) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
        }
        return response;
      }).catch(() => cached);
    })
  );
});
