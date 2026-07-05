const CACHE_NAME = 'renewal-radar-v2';

const LOCAL_ASSETS = [
  '/',
  '/index.html',
  '/manifest.json',
  '/icon-192.png',
  '/icon-512.png'
];

// Install — cache local assets only
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => {
      return cache.addAll(LOCAL_ASSETS).catch(err => {
        console.warn('[SW] Cache failed:', err);
      });
    })
  );
  self.skipWaiting();
});

// Activate — clean old caches
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

// Fetch — only intercept same-origin requests
// Let ALL external requests (API, fonts, CDN) pass through untouched
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);

  // Only handle same-origin requests (your own files)
  if (url.origin !== self.location.origin) {
    // External request — do NOT intercept, let browser handle it normally
    return;
  }

  // Same-origin: cache first, network fallback
  event.respondWith(
    caches.match(event.request).then(cached => {
      if (cached) return cached;
      return fetch(event.request).then(response => {
        if (response && response.status === 200) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
        }
        return response;
      });
    })
  );
});
