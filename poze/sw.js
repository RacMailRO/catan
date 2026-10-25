// Catan v2 Service Worker for PWA Offline Shell & Caching
const CACHE_NAME = 'catan-v2-cache-v2';
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
      return cache.addAll(STATIC_ASSETS).catch(() => {
        // Continue even if some individual asset fails
      });
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
  // Only intercept GET requests with http or https protocol
  if (event.request.method !== 'GET') return;
  if (!event.request.url.startsWith('http://') && !event.request.url.startsWith('https://')) return;

  const url = new URL(event.request.url);

  // Skip API and websocket requests
  if (url.pathname.startsWith('/api') || url.pathname.startsWith('/ws')) return;

  event.respondWith(
    caches.match(event.request).then((cachedResponse) => {
      if (cachedResponse) {
        // Fetch in background to update cache
        fetch(event.request)
          .then((networkResponse) => {
            if (networkResponse && networkResponse.status === 200 && networkResponse.type === 'basic') {
              caches.open(CACHE_NAME).then((cache) => cache.put(event.request, networkResponse));
            }
          })
          .catch(() => {});
        return cachedResponse;
      }
      return fetch(event.request).then((networkResponse) => {
        if (!networkResponse || networkResponse.status !== 200 || networkResponse.type !== 'basic') {
          return networkResponse;
        }
        const responseToCache = networkResponse.clone();
        caches.open(CACHE_NAME).then((cache) => {
          cache.put(event.request, responseToCache).catch(() => {});
        });
        return networkResponse;
      }).catch(() => cachedResponse);
    })
  );
});
