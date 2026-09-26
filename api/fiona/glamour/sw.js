/* Fiona PWA service worker — resilient for Vercel cleanUrls + mobile install */
const CACHE_NAME = 'fiona-pwa-v19';
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
    // HTML navigations: always network, never serve a stale "Building…" shell.
    if (req.mode === 'navigate' || (req.headers.get('accept') || '').includes('text/html')) {
      try {
        return await fetch(req, { cache: 'no-store' });
      } catch (_) {
        const cached = await caches.match(req) || await caches.match('/');
        if (cached) return cached;
        return new Response('Fiona is offline for a moment. Reconnect and try again.', {
          status: 503,
          headers: { 'Content-Type': 'text/plain; charset=utf-8' }
        });
      }
    }
    try {
      const res = await fetch(req, { cache: 'no-cache' });
      if (res && res.ok) {
        const cache = await caches.open(CACHE_NAME);
        cache.put(req, res.clone()).catch(() => {});
      }
      return res;
    } catch (_) {
      const cached = await caches.match(req);
      if (cached) return cached;
      return new Response('Fiona is offline for a moment. Reconnect and try again.', {
        status: 503,
        headers: { 'Content-Type': 'text/plain; charset=utf-8' }
      });
    }
  })());
});
