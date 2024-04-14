// https://github.com/mdn/pwa-examples/blob/main/js13kpwa/sw.js
// https://developer.mozilla.org/en-US/docs/Web/Progressive_web_apps/Tutorials/js13kGames/Offline_Service_workers

// Files to cache
const cacheName = 'gamelog-app-v1';
const appShellFiles = [
  // html  
  '/',
  '/edit-game.html',
  '/edit-games.html',
  '/edit-player.html',
  '/game-roulette.html',
  '/index.html',
  '/settings.html',
  '/stats.html',
  // js
  '/js/',
  '/js/csv.js',
  '/js/main.js',
  // css
  '/css/',
  '/css/main.css',
  // remote
  'https://cdn.jsdelivr.net/npm/bootstrap@4.6.2/dist/css/bootstrap.min.css',
  'https://cdn.jsdelivr.net/npm/bootstrap-icons@1.11.1/font/bootstrap-icons.css',
  'https://cdn.jsdelivr.net/npm/idb@7/build/umd.js',
  'https://cdn.jsdelivr.net/npm/jquery@3.5.1/dist/jquery.slim.min.js',
  'https://cdn.jsdelivr.net/npm/bootstrap@4.6.2/dist/js/bootstrap.bundle.min.js',
];

// Installing Service Worker
self.addEventListener('install', (e) => {
  console.log('[Service Worker] Install');
  e.waitUntil((async () => {
    const cache = await caches.open(cacheName);
    console.log('[Service Worker] Caching all: app shell and content');
    await cache.addAll(appShellFiles);
  })());
});

// Fetching content using Service Worker
self.addEventListener('fetch', (e) => {
  // Cache http and https only, skip unsupported chrome-extension:// and file://...
  if (!(
    e.request.url.startsWith('http:') || e.request.url.startsWith('https:')
  )) {
    return;
  }

  e.respondWith((async () => {
    const r = await caches.match(e.request);
    console.log(`[Service Worker] Fetching resource: ${e.request.url}`);
    if (r) return r;
    const response = await fetch(e.request);
    const cache = await caches.open(cacheName);
    console.log(`[Service Worker] Caching new resource: ${e.request.url}`);
    cache.put(e.request, response.clone());
    return response;
  })());
});

// clear old
self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys().then((keyList) => {
      return Promise.all(
        keyList.map((key) => {
          if (key === cacheName) {
            return;
          }
          return caches.delete(key);
        }),
      );
    }),
  );
});
