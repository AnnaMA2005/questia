/* QuestIA — service worker (fase 2: caché mínima de la interfaz).
   Cada publicación nueva debe cambiar CACHE_VERSION para que los dispositivos reciban la actualización. */

var CACHE_VERSION = "questia-v0.3.0";
var APP_SHELL = [
  "./",
  "./index.html",
  "./styles.css",
  "./app.js",
  "./i18n.js",
  "./manifest.json",
  "./icon.svg",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
  "./data/quests.json"
];

self.addEventListener("install", function (event) {
  event.waitUntil(
    caches.open(CACHE_VERSION).then(function (cache) {
      return cache.addAll(APP_SHELL);
    }).then(function () {
      return self.skipWaiting();
    })
  );
});

self.addEventListener("activate", function (event) {
  event.waitUntil(
    caches.keys().then(function (keys) {
      return Promise.all(keys.map(function (key) {
        if (key !== CACHE_VERSION) return caches.delete(key);
      }));
    }).then(function () {
      return self.clients.claim();
    })
  );
});

/* Estrategia: red primero y, si falla, caché (así el contenido se actualiza cuando hay conexión
   y la app sigue abriéndose sin conexión). En fases posteriores los datos del servidor
   tendrán su propia política de caché. */
self.addEventListener("fetch", function (event) {
  if (event.request.method !== "GET") return;
  var url = new URL(event.request.url);
  if (url.origin !== self.location.origin) return;

  event.respondWith(
    fetch(event.request).then(function (response) {
      if (response && response.ok) {
        var copy = response.clone();
        caches.open(CACHE_VERSION).then(function (cache) { cache.put(event.request, copy); });
      }
      return response;
    }).catch(function () {
      return caches.match(event.request).then(function (cached) {
        return cached || caches.match("./index.html");
      });
    })
  );
});
