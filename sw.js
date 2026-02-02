// Service Worker - Force unregister and clear all caches
const CACHE_VERSION = 'v3-20260202-force-clear';
const CACHE_NAME = `cycle-simulator-${CACHE_VERSION}`;

self.addEventListener("install", (event) => {
  // Immediately activate and clear all old caches
  self.skipWaiting();
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      // Delete ALL caches
      return Promise.all(cacheNames.map((name) => caches.delete(name)));
    })
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    Promise.all([
      // Delete ALL caches
      caches.keys().then((cacheNames) => 
        Promise.all(cacheNames.map((name) => caches.delete(name)))
      ),
      // Unregister this service worker
      self.registration.unregister(),
      // Claim all clients
      self.clients.claim()
    ])
  );
});

// Don't cache anything - always fetch from network
self.addEventListener("fetch", (event) => {
  event.respondWith(fetch(event.request));
});