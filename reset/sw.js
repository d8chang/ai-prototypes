/* Reset offline cache and reminders. Only the app shell is cached; no answers pass through here. */
var CACHE = 'reset-v2.38';
var FILES = ['./', 'index.html', 'privacy.html', 'manifest.webmanifest', 'icon-192.png', 'icon-512.png', 'icon-180.png'];
self.addEventListener('install', function(e){ e.waitUntil(caches.open(CACHE).then(function(c){ return c.addAll(FILES); })); self.skipWaiting(); });
self.addEventListener('activate', function(e){ e.waitUntil(caches.keys().then(function(ks){ return Promise.all(ks.filter(function(k){ return k !== CACHE && k !== 'reset-prefs'; }).map(function(k){ return caches.delete(k); })); })); self.clients.claim(); });
self.addEventListener('fetch', function(e){
  if (e.request.method !== 'GET' || new URL(e.request.url).origin !== location.origin) return;
  e.respondWith(fetch(e.request, { cache:'no-cache' }).then(function(r){ if (r.ok){ var c = r.clone(); caches.open(CACHE).then(function(cc){ cc.put(e.request, c); }); } return r; })
    .catch(function(){ return caches.match(e.request).then(function(m){ return m || caches.match('index.html'); }); }));
});

/* Reminders: the server sends only a number; the text and your name are filled in here, on the phone. */
var NUDGES = [
  ['{n}! Take a deep breath.', 'In for 4, out for 6. Three times. That’s it.'],
  ['Shoulders check, {n}.', 'Drop them away from your ears and roll them back 5 times.'],
  ['Water break?', 'One glass, away from the screen. Small counts.'],
  ['Look up for a sec, {n}.', 'Find the farthest thing you can see and rest your eyes on it for 20 seconds.'],
  ['Unclench your jaw.', 'Seriously. Now your shoulders. Nice.'],
  ['One-minute stretch?', 'Stand up, reach for the ceiling, fold forward gently.'],
  ['{n}, you did enough today.', 'Name one thing that went okay. Tap if you want one more idea.'],
  ['Tiny walk?', 'Down the hall and back. Notice one thing you haven’t seen before.']
];
self.addEventListener('push', function(e){
  var d = {}; try { d = e.data ? e.data.json() : {}; } catch (x) {}
  var i = Math.abs(parseInt(d.n, 10) || 0) % NUDGES.length;
  e.waitUntil(caches.open('reset-prefs').then(function(c){ return c.match('prefs'); }).then(function(r){ return r ? r.json() : {}; }).catch(function(){ return {}; }).then(function(p){
    var name = (p && p.name) || 'Hey', n = NUDGES[i];
    /* Every 3rd reminder (on whatever days this person chose) invites a full check-in instead of a nudge. */
    return countReminder().then(function(k){
    if (k % 3 === 0) {
      return self.registration.showNotification('How are you feeling right now, ' + name + '?', {
        body: 'Three taps, one small idea for this moment.', icon: 'icon-192.png', badge: 'icon-192.png', tag: 'reset-reminder', data: { checkin: true }
      });
    }
    return self.registration.showNotification(n[0].replace('{n}', name), {
      body: n[1].replace('{n}', name) + ' Tap to log it and see how you feel.', icon: 'icon-192.png', badge: 'icon-192.png', tag: 'reset-reminder', data: { n: i },
      actions: [{ action: 'did', title: 'Did it' }, { action: 'more', title: 'Check in' }]
    });
    });
  }));
});
/* How many reminders this phone has received (kept only on the phone). */
function countReminder(){
  return caches.open('reset-prefs').then(function(c){
    return c.match('count').then(function(r){ return r ? r.text() : '0'; }).then(function(v){
      var k = (parseInt(v, 10) || 0) + 1;
      return c.put('count', new Response(String(k))).then(function(){ return k; });
    });
  }).catch(function(){ return 1; });
}
self.addEventListener('notificationclick', function(e){
  e.notification.close();
  var i = (e.notification.data && e.notification.data.n) || 0;
  var hash = (e.notification.data && e.notification.data.checkin) ? '#checkin' : e.action === 'did' ? '#did' : e.action === 'more' ? '#checkin' : '#nudge-' + i;
  var url = new URL('./' + hash, self.registration.scope).href;
  e.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function(ws){
    var w = null;
    for (var k = 0; k < ws.length; k++) if (ws[k].url.indexOf(self.registration.scope) === 0) { w = ws[k]; break; }
    if (w) {
      // Tell the open app which screen to show (works on iPhone, where navigate() does not).
      w.postMessage({ reset: hash });
      return w.focus ? w.focus().catch(function(){}) : null;
    }
    return self.clients.openWindow(url);
  }).catch(function(){ return self.clients.openWindow(url); }));
});

/* If the browser resets the reminder address, sign up again with the new one. */
function keyBytes(k){ k=k.replace(/-/g,'+').replace(/_/g,'/'); while (k.length%4) k+='='; var r=atob(k), a=new Uint8Array(r.length); for (var i=0;i<r.length;i++) a[i]=r.charCodeAt(i); return a; }
self.addEventListener('pushsubscriptionchange', function(e){
  e.waitUntil(caches.open('reset-prefs').then(function(c){ return c.match('prefs'); }).then(function(r){ return r ? r.json() : null; }).then(function(p){
    if (!p || !p.id || !p.url) return;
    return (e.newSubscription ? Promise.resolve(e.newSubscription) : self.registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(p.key) })).then(function(sub){
      return fetch(p.url, { method: 'POST', mode: 'no-cors', headers: { 'Content-Type': 'text/plain' }, body: JSON.stringify({ action: 'subscribe', id: p.id, sub: sub.toJSON(), time: p.time, freq: p.freq, tz: p.tz }) });
    });
  }).catch(function(){}));
});
