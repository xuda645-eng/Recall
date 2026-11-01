const CACHE = 'recall-status-edge-20261101-r2';
const ASSETS = ['', 'styles.css', 'boot.js', 'probe.js', 'manifest.webmanifest', 'icon.svg', 'icon-192.png', 'icon-512.png'];
self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(ASSETS.map(path => new URL(path, self.registration.scope).href))).then(() => self.skipWaiting()));
});
self.addEventListener('activate', event => event.waitUntil(self.clients.claim()));
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);
  const scope = new URL(self.registration.scope);
  if (url.origin !== scope.origin || event.request.method !== 'GET') return;
  const path = url.pathname.slice(scope.pathname.length);
  const relativePath = path === 'index.html' ? '' : path;
  if (!url.pathname.startsWith(scope.pathname) || !ASSETS.includes(relativePath)) return;
  const asset = new URL(relativePath, scope).href;
  event.respondWith(caches.open(CACHE).then(async cache => (await cache.match(asset)) || fetch(event.request)));
});
