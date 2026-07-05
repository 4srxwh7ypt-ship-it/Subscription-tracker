const CACHE_NAME = 'renewal-radar-v2';
const MAX_CACHE_ITEMS = 60; // keep the last ~60 entries

const LOCAL_ASSETS = [
  '/',
  '/index.html',
  '/manifest.json',
  '/icon-192.png',
  '/icon-512.png'
];

// Utility: remove oldest entries when cache grows
async function trimCache(cacheName, maxItems) {
  const cache = await caches.open(cacheName);
  const keys = await cache.keys();
  if (keys.length <= maxItems) return;
  // delete oldest entries (keys are ordered by insertion)
  const deleteCount = keys.length - maxItems;
  for (let i = 0; i < deleteCount; i++) {
    try { await cache.delete(keys[i]); } catch(e){}
  }
}

// Install — cache local assets only
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => {
      return cache.addAll(LOCAL_ASSETS).catch(err => {
        console.warn('[SW] Cache failed (install):', err);
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

// Helper: should this request be cached?
function isCacheableRequest(request) {
  // Only GETs
  if (request.method !== 'GET') return false;

  // Only same origin
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return false;

  // Only cache known static file extensions or root/index/manifest
  const path = url.pathname;
  if (LOCAL_ASSETS.includes(path)) return true;
  return (/\.(js|css|html|png|jpg|jpeg|svg|gif|webp|json|ico)$/i).test(path);
}

// Fetch — conservative cache-first for static same-origin assets
self.addEventListener('fetch', event => {
  const req = event.request;
  // Let external requests pass through
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  if (!isCacheableRequest(req)) {
    // For non-cacheable requests (APIs, fonts from CDN, etc.) do network-first or just let the browser handle it
    return;
  }

  event.respondWith(
    caches.match(req).then(cached => {
      if (cached) return cached;
      return fetch(req).then(response => {
        // Only cache successful, basic responses (no opaque or cross-origin)
        if (!response || response.status !== 200 || response.type === 'opaque') {
          return response;
        }
        const clone = response.clone();
        caches.open(CACHE_NAME).then(cache => {
          cache.put(req, clone).then(() => trimCache(CACHE_NAME, MAX_CACHE_ITEMS));
        });
        return response;
      }).catch(err => {
        // network failed — fallback to cache if available (match above),
        // otherwise fail gracefully
        console.warn('[SW] fetch failed for', req.url, err);
        throw err;
      });
    })
  );
});
