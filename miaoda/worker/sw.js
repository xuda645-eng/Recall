const manifest = self.__WB_MANIFEST;
const scope = new URL(self.registration.scope);
const urls = manifest.map(entry => new URL(entry.url, scope));
if (urls.some(url => url.origin !== scope.origin || !url.pathname.startsWith(scope.pathname))) {
  throw new Error('Precache entries must remain within the Recall client scope');
}
let checksum = 2166136261;
for (const entry of manifest) {
  for (const character of `${entry.url}:${entry.revision || ''}`) {
    checksum = Math.imul(checksum ^ character.charCodeAt(0), 16777619);
  }
}
const prefix = `recall-miaoda-static:${scope.href}:`;
const cacheName = `${prefix}${checksum >>> 0}`;
const assets = new Set(urls.map(url => url.href));

self.addEventListener('install', event => {
  event.waitUntil(caches.open(cacheName).then(cache => cache.addAll([...assets])));
});
self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    for (const name of await caches.keys()) {
      if (name.startsWith(prefix) && name !== cacheName) await caches.delete(name);
    }
    await self.clients.claim();
  })());
});
self.addEventListener('message', event => {
  if (event.data && event.data.type === 'SKIP_WAITING') void self.skipWaiting();
});
self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') return;
  const url = new URL(event.request.url);
  if (url.origin !== scope.origin || !url.pathname.startsWith(scope.pathname)) return;
  if (event.request.mode === 'navigate') {
    event.respondWith((async () => {
      const offlineShell = async () => await (await caches.open(cacheName)).match(new URL('miaoda-client.html', scope).href)
        || Response.error();
      if (self.navigator.onLine === false) return offlineShell();
      try { return await fetch(event.request); }
      catch { return offlineShell(); }
    })());
    return;
  }
  url.search = '';
  url.hash = '';
  if (assets.has(url.href)) {
    event.respondWith((async () => (await (await caches.open(cacheName)).match(url.href)) || fetch(event.request))());
  }
});
