// ============================================================
// Pass It On — Service Worker
// Caches the app shell and card artwork on first load so the
// game works offline afterward (Section 18 of the brief).
// Code files are network-first (see fetch handler), so updates
// arrive automatically; bump CACHE_NAME only when card art changes.
// ============================================================
const CACHE_NAME = "pass-it-on-v24";

const ASSETS = [
  "./",
  "index.html",
  "manifest.webmanifest",
  "css/style.css",
  "js/cards.js",
  "js/engine.js",
  "js/ui.js",
  "js/app.js",
  "js/online.js",
  "js/firebase-config.js",
  "icons/icon-192.png",
  "icons/icon-512.png",
  "icons/apple-touch-icon.png",
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
  const url = new URL(event.request.url);
  const isGoogleFonts = url.origin === "https://fonts.googleapis.com" || url.origin === "https://fonts.gstatic.com";

  // Build the set of exact same-origin URLs this service worker is
  // allowed to cache, resolved the same way the browser resolves
  // relative ASSETS paths against this file's own location.
  const cacheableUrls = new Set(ASSETS.map(a => new URL(a, self.registration.scope).href));
  const isCoreAsset = cacheableUrls.has(event.request.url);

  if (!isCoreAsset && !isGoogleFonts) {
    // Not part of the real app's precached shell — most importantly
    // this covers standalone test pages (sync-game-test.html and
    // friends), which should always reflect whatever was most
    // recently deployed rather than getting silently pinned to
    // whatever version happened to load first. Always go to the
    // network, never read from or write to the cache.
    event.respondWith(fetch(event.request));
    return;
  }

  // App code (HTML/JS/CSS/manifest) is network-first, so a new
  // version shows up on the next launch without needing to bump the
  // cache or clear anything — the cache is only the offline fallback.
  // Card art and fonts rarely change, so they stay cache-first.
  const isCode = /\.(html|js|css|webmanifest)$/.test(url.pathname) || url.pathname.endsWith("/");
  const saveCopy = response => {
    if (event.request.method === "GET" && response.ok) {
      const copy = response.clone();
      caches.open(CACHE_NAME).then(cache => cache.put(event.request, copy));
    }
    return response;
  };

  if (isCode && !isGoogleFonts) {
    event.respondWith(
      fetch(event.request).then(saveCopy).catch(() => caches.match(event.request))
    );
    return;
  }

  event.respondWith(
    caches.match(event.request).then(cached => {
      if (cached) return cached;
      return fetch(event.request).then(saveCopy).catch(() => cached);
    })
  );
});
