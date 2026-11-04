// Service worker minimal : rend l'app installable. Pas de cache, tout vient du réseau.
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', e => e.waitUntil(self.clients.claim()));
self.addEventListener('fetch', () => {});
