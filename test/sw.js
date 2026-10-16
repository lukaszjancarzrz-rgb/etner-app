// ETNER – service worker: aplikacja otwiera się od razu (także bez zasięgu) z plików zapisanych w telefonie,
// a nowa wersja pobiera się w tle i działa od następnego otwarcia. Dane i zapisy idą do Apps Script (nie są tu buforowane).
var CACHE = 'etner-test-372c80a7bc';
var FILES = ["./", "index.html", "config.js", "manifest.webmanifest", "icons/icon-192.png", "icons/icon-512.png", "icons/apple-touch-icon.png"];

self.addEventListener('install', function (e) {
  e.waitUntil(caches.open(CACHE).then(function (c) { return c.addAll(FILES); }).then(function () { return self.skipWaiting(); }));
});

self.addEventListener('activate', function (e) {
  e.waitUntil(caches.keys().then(function (keys) {
    return Promise.all(keys.filter(function (k) { return k.indexOf('etner-') === 0 && k !== CACHE; }).map(function (k) { return caches.delete(k); }));
  }).then(function () { return self.clients.claim(); }));
});

self.addEventListener('fetch', function (e) {
  var req = e.request, url = new URL(req.url);
  if (req.method !== 'GET' || url.origin !== self.location.origin) return;
  if (req.mode === 'navigate') {                         // strona: od razu z pamięci, w tle sprawdzam nowszą
    e.respondWith(caches.open(CACHE).then(function (c) {
      return c.match('index.html').then(function (hit) {
        var net = fetch(req).then(function (r) { if (r && r.ok) c.put('index.html', r.clone()); return r; }).catch(function () { return hit; });
        return hit || net;
      });
    }));
    return;
  }
  e.respondWith(caches.match(req, { ignoreSearch: true }).then(function (hit) {
    return hit || fetch(req);
  }));
});
