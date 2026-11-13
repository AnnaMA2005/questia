/* QuestIA — service worker.
   En cada publicación: cambiar CACHE_VERSION aquí, APP_VERSION en app.js y el sufijo ?v= de los
   archivos en index.html. Así la página y sus recursos cambian siempre a la vez.

   Estrategia:
   - Navegaciones (index.html): red primero SALTANDO la caché HTTP del navegador; si falla, caché.
   - data/*.json: red primero saltando la caché HTTP; si falla, caché (último catálogo recibido).
   - Resto de recursos propios (css, js, iconos, versionados con ?v=): caché primero; si no están, red.
   Cuando se instala una versión nueva, toma el control enseguida y la app se recarga una vez. */

var CACHE_VERSION = "questia-v0.3.2";
var APP_SHELL = [
  "./",
  "./index.html",
  "./styles.css?v=0.3.2",
  "./app.js?v=0.3.2",
  "./i18n.js?v=0.3.2",
  "./manifest.json",
  "./icon.svg?v=2",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
  "./data/quests.json",
  "./data/videos.json"
];

self.addEventListener("install", function (event) {
  event.waitUntil(
    caches.open(CACHE_VERSION).then(function (cache) {
      /* cache: "reload" evita que la precarga lea versiones viejas de la caché HTTP */
      return Promise.all(APP_SHELL.map(function (url) {
        return fetch(url, { cache: "reload" }).then(function (res) {
          if (!res.ok) throw new Error(url + " " + res.status);
          return cache.put(url, res);
        });
      }));
    }).then(function () { return self.skipWaiting(); })
  );
});

self.addEventListener("activate", function (event) {
  event.waitUntil(
    caches.keys().then(function (keys) {
      return Promise.all(keys.map(function (key) {
        if (key !== CACHE_VERSION) return caches.delete(key);
      }));
    }).then(function () { return self.clients.claim(); })
  );
});

self.addEventListener("fetch", function (event) {
  var req = event.request;
  if (req.method !== "GET") return;
  var url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  var isNavigation = req.mode === "navigate";
  var isData = url.pathname.indexOf("/data/") !== -1;

  if (isNavigation || isData) {
    event.respondWith(
      fetch(req, { cache: "no-cache" }).then(function (res) {
        if (res && res.ok) {
          var copy = res.clone();
          caches.open(CACHE_VERSION).then(function (cache) { cache.put(isNavigation ? "./index.html" : req, copy); });
        }
        return res;
      }).catch(function () {
        return caches.match(isNavigation ? "./index.html" : req);
      })
    );
    return;
  }

  event.respondWith(
    caches.match(req).then(function (cached) {
      if (cached) return cached;
      return fetch(req).then(function (res) {
        if (res && res.ok) {
          var copy = res.clone();
          caches.open(CACHE_VERSION).then(function (cache) { cache.put(req, copy); });
        }
        return res;
      });
    })
  );
});
