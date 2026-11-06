// Kijo Band service worker (scope /band). Minimal on purpose: it makes the band installable as a
// home-screen app but caches nothing, because alerts and nurse status must always come live from the server.
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));
