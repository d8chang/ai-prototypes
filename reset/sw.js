/* Reset offline cache: the app shell only. No user data passes through here. */
var CACHE = 'reset-v2.1';
var FILES = ['./', 'index.html', 'manifest.webmanifest', 'icon-192.png', 'icon-512.png', 'icon-180.png'];
self.addEventListener('install', function(e){ e.waitUntil(caches.open(CACHE).then(function(c){ return c.addAll(FILES); })); self.skipWaiting(); });
self.addEventListener('activate', function(e){ e.waitUntil(caches.keys().then(function(ks){ return Promise.all(ks.filter(function(k){ return k !== CACHE; }).map(function(k){ return caches.delete(k); })); })); self.clients.claim(); });
self.addEventListener('fetch', function(e){
  if (e.request.method !== 'GET') return;
  e.respondWith(fetch(e.request).then(function(r){ if (r.ok && new URL(e.request.url).origin === location.origin){ var c = r.clone(); caches.open(CACHE).then(function(cc){ cc.put(e.request, c); }); } return r; })
    .catch(function(){ return caches.match(e.request).then(function(m){ return m || caches.match('index.html'); }); }));
});
