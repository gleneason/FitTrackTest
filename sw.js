const CACHE = "glen-track-v1";
const ASSETS = [
  "./",
  "./index.html",
  "./styles.css",
  "./app.js",
  "./manifest.webmanifest",
  "./icon-192.png",
  "./icon-512.png"
];

self.addEventListener("install", (evt) => {
  evt.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    await cache.addAll(ASSETS);
    self.skipWaiting();
  })());
});

self.addEventListener("activate", (evt) => {
  evt.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.map(k => (k === CACHE ? null : caches.delete(k))));
    self.clients.claim();
  })());
});

self.addEventListener("fetch", (evt) => {
  evt.respondWith((async () => {
    const cached = await caches.match(evt.request);
    if (cached) return cached;
    try {
      const res = await fetch(evt.request);
      return res;
    } catch {
      return caches.match("./index.html");
    }
  })());
});