// https://developer.mozilla.org/en-US/docs/Web/Progressive_web_apps/Tutorials/js13kGames/Offline_Service_workers

// Files to cache
const cacheVersion = 'v15';
const cacheName = `gamelog-app-${cacheVersion}`;
const appShellFiles = [
  // html  
  '/',
  '/edit-game-title.html',
  '/edit-game.html',
  '/edit-games.html',
  '/edit-player.html',
  '/game-roulette.html',
  '/index.html',
  '/settings.html',
  '/stats.html',
  // js
  '/js/bootstrap.bundle.min.js',
  '/js/csv.js',
  '/js/idb.umd.js',
  '/js/jquery.slim.min.js',
  '/js/main.js',
  '/js/uuidv7.js',
  // css
  '/fonts/bootstrap-icons.woff',
  '/fonts/bootstrap-icons.woff2',
  '/css/bootstrap-icons.css',
  '/css/bootstrap.min.css',
  '/css/main.css',
];

// Installing Service Worker
self.addEventListener('install', (e) => {
  console.log('[Service Worker] Install');
  self.skipWaiting();
  e.waitUntil((async () => {
    const cache = await caches.open(cacheName);
    console.log('[Service Worker] Caching all: app shell and content');
    
    if (self.location.origin === 'https://zurginq.github.io') {
      await cache.addAll(appShellFiles.map((path) => `/gamelog${path}`));
    } else {
      await cache.addAll(appShellFiles);
    }
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

  if (!e.request.url.startsWith('https://zurginq.github.io')) {
    return;
  }

  e.respondWith((async () => {
    const r = await caches.match(e.request, { ignoreSearch: true });
    console.log(`[Service Worker] Fetching resource: ${e.request.url}`);

    if (r) {
      return r
    };

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
