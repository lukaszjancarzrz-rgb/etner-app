// ETNER – service worker: aplikacja otwiera się od razu (także bez zasięgu) z plików zapisanych w telefonie,
// a nowa wersja pobiera się w tle i działa od następnego otwarcia. Dane i zapisy idą do Apps Script (nie są tu buforowane).
var CACHE = 'etner-test-963055e464';
var FILES = ["./", "index.html", "config.js", "manifest.webmanifest", "icons/icon-192.png", "icons/icon-512.png", "icons/apple-touch-icon.png"];

self.addEventListener('install', function (e) {
  e.waitUntil(caches.open(CACHE).then(function (c) { return c.addAll(FILES); }).then(function () { return self.skipWaiting(); }));
});

self.addEventListener('activate', function (e) {
  e.waitUntil(caches.keys().then(function (keys) {
    return Promise.all(keys.filter(function (k) { return k.indexOf('etner-') === 0 && k !== CACHE && k !== 'etner-lib'; }).map(function (k) { return caches.delete(k); }));
  }).then(function () { return self.clients.claim(); }));
});

self.addEventListener('fetch', function (e) {
  var req = e.request, url = new URL(req.url);
  if (req.method === 'GET' && url.host === 'www.gstatic.com' && url.pathname.indexOf('/firebasejs/') === 0) {   // biblioteka Firebase (wersja w adresie)
    e.respondWith(caches.open('etner-lib').then(function (c) {
      return c.match(req).then(function (hit) {
        return hit || fetch(req).then(function (r) { if (r && r.ok) c.put(req, r.clone()); return r; });
      });
    }));
    return;
  }
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

// ---------------------------------------------------------------- powiadomienia push
// Treść przychodzi w samym powiadomieniu (szyfrowana kluczem tego telefonu). Starsze subskrypcje (bez kluczy) dostają
// „pusty” push – wtedy treść pobieramy z apiPushInbox tym samym osobistym kodem co aplikacja.
function swCfg() {
  return new Promise(function (res) {
    try {
      var rq = indexedDB.open('etner', 1);
      rq.onupgradeneeded = function () { rq.result.createObjectStore('kv'); };
      rq.onsuccess = function () {
        try {
          var tx = rq.result.transaction('kv', 'readonly'), g = tx.objectStore('kv').get('cfg');
          g.onsuccess = function () { res(g.result || null); }; g.onerror = function () { res(null); };
        } catch (e) { res(null); }
      };
      rq.onerror = function () { res(null); };
    } catch (e) { res(null); }
  });
}
self.addEventListener('push', function (e) {
  var data = null;
  try { data = e.data ? e.data.json() : null; } catch (x) { data = null; }   // treść w samym powiadomieniu (szyfrowana)
  e.waitUntil(swCfg().then(function (cfg) {
    if (data && data.title) { data.base = cfg && cfg.base; return data; }
    if (!cfg || !cfg.api) return null;
    return fetch(cfg.api, { method: 'POST', redirect: 'follow', headers: { 'Content-Type': 'text/plain;charset=utf-8' },
                            body: JSON.stringify({ fn: 'apiPushInbox', token: cfg.token, args: [] }) })
      .then(function (r) { return r.json(); })
      .then(function (j) { var n = j && j.ok && j.result && j.result.items && j.result.items[0]; if (n) n.base = cfg.base; return n || { base: cfg.base }; })
      .catch(function () { return { base: cfg.base }; });
  }).then(function (n) {
    n = n || {};
    return self.registration.showNotification(n.title || 'ETNER', {
      body: n.body || 'Nowe powiadomienie w aplikacji ETNER.', tag: n.tag || 'etner', renotify: true,
      icon: 'icons/icon-192.png', badge: 'icons/icon-192.png', data: { url: (n.base || './') + (n.url || '') }
    });
  }));
});
self.addEventListener('notificationclick', function (e) {
  e.notification.close();
  var url = (e.notification.data && e.notification.data.url) || './', hash = url.indexOf('#') >= 0 ? url.split('#')[1] : '';
  e.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function (list) {
    for (var i = 0; i < list.length; i++) {
      var c = list[i];
      if ('focus' in c) { if (hash) c.postMessage({ go: hash }); return c.focus(); }
    }
    return self.clients.openWindow(url);
  }));
});
