// Two caches on purpose:
//  APP  — versioned. Bump APP_CACHE to push any content/code change to phones.
//  DATA — unversioned and never purged. Holds the 12.3MB ticket payload so a
//         content update does NOT force every phone to re-download it.
const APP_CACHE  = 'pt2026-app-v4';
const DATA_CACHE = 'pt2026-data-v1';

const APP_CORE = [
  './itinerary.html',
  './manifest.json'
];
const APP_EXTRA = [
  './planner.html',
  './index.html',
  './icon-192.png',
  './icon-512.png'
];
const DATA_ASSETS = ['./tickets-data.js'];

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const app = await caches.open(APP_CACHE);
    // Core must land — retry once each. Individually, so one failure
    // can't silently wipe the whole install (the old addAll bug).
    await Promise.all(APP_CORE.map(async (url) => {
      for (let i = 0; i < 2; i++) {
        try { await app.add(new Request(url, { cache: 'reload' })); return; }
        catch (e) { if (i === 1) console.warn('core cache failed', url, e); }
      }
    }));
    await Promise.allSettled(APP_EXTRA.map((u) => app.add(u)));

    // Tickets: only fetch if not already cached from a previous version.
    const data = await caches.open(DATA_CACHE);
    await Promise.all(DATA_ASSETS.map(async (url) => {
      if (await data.match(url)) return;            // already have it — skip 12.3MB
      for (let i = 0; i < 2; i++) {
        try { await data.add(new Request(url, { cache: 'reload' })); return; }
        catch (e) { if (i === 1) console.warn('ticket cache failed', url, e); }
      }
    }));

    await self.skipWaiting();
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys.filter((k) => k !== APP_CACHE && k !== DATA_CACHE)  // keep DATA
            .map((k) => caches.delete(k))
      )
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin) {
    // Maps / menus / phone links: live when possible, cached if we ever stored one.
    event.respondWith(fetch(event.request).catch(() => caches.match(event.request)));
    return;
  }
  if (url.pathname.endsWith('tickets-data.js')) {
    // Immutable payload: cache-first, never revalidate.
    event.respondWith(
      caches.match(event.request).then((c) => c || fetch(event.request).then((r) => {
        const copy = r.clone();
        caches.open(DATA_CACHE).then((cache) => cache.put(event.request, copy));
        return r;
      }))
    );
    return;
  }
  // App shell: stale-while-revalidate — instant offline load, picks up edits next open.
  event.respondWith(
    caches.match(event.request).then((cached) => {
      const network = fetch(event.request).then((resp) => {
        if (resp && resp.status === 200) {
          const copy = resp.clone();
          caches.open(APP_CACHE).then((cache) => cache.put(event.request, copy));
        }
        return resp;
      }).catch(() => cached);
      return cached || network;
    })
  );
});
