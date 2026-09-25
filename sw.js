/* Fiona PWA service worker — resilient for Vercel cleanUrls + mobile install */
const CACHE_NAME = 'fiona-pwa-v8';
/* Only cache final URLs (no /index.html — Vercel 308-redirects it to /) */
const PRECACHE = [
  '/',
  '/privacy',
  '/site.webmanifest',
  '/icon-192.png',
  '/icon-512.png',
  '/icon-512-maskable.png',
  '/apple-touch-icon.png'
];

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_NAME);
    await Promise.all(
      PRECACHE.map(async (url) => {
        try {
          const res = await fetch(url, { cache: 'no-cache', redirect: 'follow' });
          if (res && res.ok) await cache.put(url, res.clone());
        } catch (_) {
          /* skip individual failures so install still succeeds */
        }
      })
    );
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith('/api/')) return;

  event.respondWith((async () => {
    try {
      const res = await fetch(req);
      if (res && res.ok && req.mode !== 'navigate') {
        const cache = await caches.open(CACHE_NAME);
        cache.put(req, res.clone()).catch(() => {});
      }
      return res;
    } catch (_) {
      const cached = await caches.match(req);
      if (cached) return cached;
      if (req.mode === 'navigate') {
        const home = await caches.match('/');
        if (home) return home;
      }
      return new Response('Fiona is offline for a moment. Reconnect and try again.', {
        status: 503,
        headers: { 'Content-Type': 'text/plain; charset=utf-8' }
      });
    }
  })());
});
