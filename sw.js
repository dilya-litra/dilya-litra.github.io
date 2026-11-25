/* dilya.litra: офлайн-режим. При обновлении сайта поменяй номер версии */
const V = 'dilya-v2';
const SHELL = ['./', 'index.html', 'css/base.css?v=2', 'css/app.css?v=2', 'js/data.js?v=2', 'js/app.js?v=2', 'js/extra.js?v=2',
  'logo.jpg', 'dilya.jpg', 'manifest.webmanifest', 'icons/icon-192.png',
  'mascot/idle.svg', 'mascot/wave.svg', 'mascot/happy.svg', 'mascot/sad.svg', 'mascot/sleep.svg'];
self.addEventListener('install', e => { e.waitUntil(caches.open(V).then(c => c.addAll(SHELL)).then(() => self.skipWaiting())); });
self.addEventListener('activate', e => { e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== V).map(k => caches.delete(k)))).then(() => self.clients.claim())); });
self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== location.origin) {
    if (/fonts\.(googleapis|gstatic)\.com$/.test(url.hostname)) e.respondWith(caches.open(V).then(c => c.match(req).then(r => r || fetch(req).then(res => { c.put(req, res.clone()); return res; }))));
    return;
  }
  // уроки: сначала из кэша (они меняются редко), в фоне обновляем
  // остальное: сначала сеть, без сети из кэша
  const lesson = url.pathname.includes('/data/');
  e.respondWith(caches.open(V).then(async c => {
    const hit = await c.match(req, { ignoreSearch: false });
    const net = fetch(req).then(res => { if (res.ok) c.put(req, res.clone()); return res; });
    if (lesson && hit) { net.catch(() => {}); return hit; }
    try { return await net; } catch (err) { return hit || c.match('index.html'); }
  }));
});
