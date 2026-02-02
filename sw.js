// Service Worker - Clear all caches and disable caching
self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(cacheNames.map((name) => caches.delete(name)));
    })
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    Promise.all([
      caches.keys().then((cacheNames) => 
        Promise.all(cacheNames.map((name) => caches.delete(name)))
      ),
      self.clients.claim()
    ])
  );
});

// Always fetch from network, never cache
self.addEventListener('fetch', (event) => {
  event.respondWith(fetch(event.request));
});
