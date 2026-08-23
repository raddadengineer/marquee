// Deliberately simple: this is a live dashboard, not an offline-first app, so
// there's no value in serving stale Now Playing/download-queue data. The only
// job here is (a) satisfy PWA installability and (b) show the last-loaded shell
// instead of a browser error page during a brief network drop.
const CACHE = 'marquee-shell';

self.addEventListener('install', () => self.skipWaiting());

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
  );
  self.clients.claim();
});

self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);
  // API calls must always hit the network — never serve cached family/session data.
  if (event.request.method !== 'GET' || url.pathname.startsWith('/api/')) return;

  event.respondWith(
    fetch(event.request)
      .then(res => {
        const copy = res.clone();
        caches.open(CACHE).then(c => c.put(event.request, copy));
        return res;
      })
      .catch(() => caches.match(event.request))
  );
});
