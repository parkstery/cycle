const CACHE_VERSION = 'v2-20260202-gemini-removed';
const CACHE_NAME = `cycle-simulator-${CACHE_VERSION}`;

self.addEventListener("install", (event) => {
  self.skipWaiting();
  // Clear old caches
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames
          .filter((name) => name.startsWith('cycle-simulator-') && name !== CACHE_NAME)
          .map((name) => caches.delete(name))
      );
    })
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames
          .filter((name) => name.startsWith('cycle-simulator-') && name !== CACHE_NAME)
          .map((name) => caches.delete(name))
      );
    })
  );
  self.clients.claim();
});