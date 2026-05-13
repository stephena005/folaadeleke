const CACHE = 'studio-v1';

const PRECACHE = [
  '/studio.html',
  '/studio-icon.svg',
  '/favicon.svg',
  'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/dist/umd/supabase.min.js',
];

// ── Install: pre-cache shell ──────────────────────
self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE).then(c => c.addAll(PRECACHE))
  );
  self.skipWaiting();
});

// ── Activate: clear old caches ────────────────────
self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

// ── Fetch strategy ────────────────────────────────
self.addEventListener('fetch', e => {
  const url = e.request.url;

  // Always go network-first for Supabase API/storage calls
  if (url.includes('supabase.co')) {
    e.respondWith(
      fetch(e.request).catch(() =>
        new Response(JSON.stringify({ error: 'offline' }), {
          status: 503,
          headers: { 'Content-Type': 'application/json' },
        })
      )
    );
    return;
  }

  // Network-first for microlink (article preview fetches)
  if (url.includes('microlink.io')) {
    e.respondWith(fetch(e.request).catch(() => new Response('{}', { status: 503 })));
    return;
  }

  // Cache-first for everything else (app shell, CDN assets)
  e.respondWith(
    caches.match(e.request).then(cached => {
      if (cached) return cached;
      return fetch(e.request).then(response => {
        // Cache successful GET responses
        if (e.request.method === 'GET' && response.status === 200) {
          const clone = response.clone();
          caches.open(CACHE).then(c => c.put(e.request, clone));
        }
        return response;
      });
    })
  );
});
