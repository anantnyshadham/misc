const CACHE = 'pt2026-v3';
const CORE = [
  './itinerary.html',
  './manifest.json',
  './tickets-data.js'
];
const EXTRA = [
  './planner.html',
  './index.html',
  './icon-192.png',
  './icon-512.png'
];

// Cache each file individually: one failure must not wipe out the whole install.
self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    // Core assets must succeed — retry each once before giving up.
    await Promise.all(CORE.map(async (url) => {
      for (let i = 0; i < 2; i++) {
        try { await cache.add(new Request(url, { cache: 'reload' })); return; }
        catch (e) { if (i === 1) console.warn('core cache failed', url, e); }
      }
    }));
    // Nice-to-haves: never block the install.
    await Promise.allSettled(EXTRA.map((url) => cache.add(url)));
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

// Cache-first for same-origin app files; network-first for everything else
// (map/menu links still go live, but never hard-fail offline)
self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  const url = new URL(event.request.url);
  if (url.origin === self.location.origin) {
    event.respondWith(
      caches.match(event.request).then((cached) => {
        return cached || fetch(event.request).then((resp) => {
          if (resp && resp.status === 200) {
            const copy = resp.clone();
            caches.open(CACHE).then((cache) => cache.put(event.request, copy));
          }
          return resp;
        }).catch(() => cached);
      })
    );
  } else {
    event.respondWith(
      fetch(event.request).catch(() => caches.match(event.request))
    );
  }
});
