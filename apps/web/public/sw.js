// Catan v2 Service Worker for PWA Offline Shell & Auto-Update
const CACHE_NAME = 'catan-v2-cache-v141';
const STATIC_ASSETS = [
  '/',
  '/index.html',
  '/manifest.json',
  '/terrains_hexes.png',
  '/harbors.png',
  '/coastline.png',
  '/numbers.png',
  '/cards.jpg',
  '/cost.jpg',
  '/city_red.svg',
  '/city_blue.svg',
  '/city_green.svg',
  '/city_orange.svg',
  '/settlement_red.22949197b57f9cfd968b.svg',
  '/settlement_blue.bad4cdb43d65c329deda.svg',
  '/settlement_green.1b78c696cd137be02fae.svg',
  '/settlement_orange.774ddafc8cc0595acdb7.svg'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(STATIC_ASSETS).catch(() => {});
    })
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys.map((key) => {
          if (key !== CACHE_NAME) {
            return caches.delete(key);
          }
          return Promise.resolve();
        })
      )
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  if (!event.request.url.startsWith('http://') && !event.request.url.startsWith('https://')) return;

  const url = new URL(event.request.url);

  // NEVER intercept Vite dev server internal assets, HMR, APIs or websockets
  if (
    url.pathname.startsWith('/src') ||
    url.pathname.startsWith('/@') ||
    url.pathname.startsWith('/node_modules') ||
    url.pathname.startsWith('/api') ||
    url.pathname.startsWith('/ws') ||
    url.search.includes('token=') ||
    url.search.includes('v=')
  ) {
    return;
  }

  // 1. Navigation / HTML requests: NETWORK-FIRST so PWA on mobile always gets the latest version
  if (event.request.mode === 'navigate' || event.request.destination === 'document' || url.pathname === '/' || url.pathname === '/index.html') {
    event.respondWith(
      fetch(event.request)
        .then((networkResponse) => {
          if (networkResponse && networkResponse.status === 200) {
            const responseToCache = networkResponse.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, responseToCache));
          }
          return networkResponse;
        })
        .catch(() => caches.match(event.request).then((res) => res || caches.match('/index.html')))
    );
    return;
  }

  // 2. Static hashed assets: CACHE-FIRST with network fallback and background update
  event.respondWith(
    caches.match(event.request).then((cachedResponse) => {
      if (cachedResponse) {
        return cachedResponse;
      }

      return fetch(event.request)
        .then((networkResponse) => {
          if (!networkResponse || networkResponse.status !== 200 || networkResponse.type !== 'basic') {
            return networkResponse;
          }
          const responseToCache = networkResponse.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(event.request, responseToCache).catch(() => {});
          });
          return networkResponse;
        })
        .catch(() => {
          return new Response('Offline resource unavailable', {
            status: 503,
            statusText: 'Service Unavailable',
            headers: { 'Content-Type': 'text/plain' }
          });
        });
    })
  );
});
