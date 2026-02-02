// Service Worker - DISABLED - Just clear all caches and unregister
self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(cacheNames.map((name) => caches.delete(name)));
    }).then(() => {
      // Immediately unregister this service worker
      return self.registration.unregister();
    })
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    Promise.all([
      caches.keys().then((cacheNames) => 
        Promise.all(cacheNames.map((name) => caches.delete(name)))
      ),
      self.registration.unregister(),
      self.clients.claim()
    ])
  );
});
