/* focus Lab – Service Worker.
   Strategie: Cache-First für alles Eigene. Beim Installieren wird die App-Hülle
   vorgeladen, danach läuft alles offline. Neue Version = neuer CACHE-Name;
   die Liste PRECACHE muss bei neuen Dateien von Hand ergänzt werden. */

const VERSION = '1.48.0';
const CACHE = `focuslab-${VERSION}`;

const PRECACHE = [
  './',
  './index.html',
  './manifest.webmanifest',
  './css/base.css',
  './css/dark.css',
  './css/redlight.css',
  './fonts/WorkSans-latin.woff2',
  './fonts/WorkSans-latin-ext.woff2',
  './js/app.js',
  './js/lib/i18n.js',
  './js/lib/storage.js',
  './js/lib/access.js',
  './js/lib/mode-dial.js',
  './js/lib/features.js',
  './js/lib/gpu-stack.js',
  './data/access.json',
  './js/modules/capture.js',
  './js/modules/calc.js',
  './js/modules/timer.js',
  './js/modules/learn.js',
  './js/modules/log.js',
  './js/modules/settings.js',
  './js/modules/calc-exposure.js',
  './js/modules/calc-nd.js',
  './js/modules/calc-pinhole.js',
  './js/modules/calc-film.js',
  './js/core/exposure.js',
  './js/core/entry.js',
  './js/core/pinhole.js',
  './js/core/film.js',
  './js/lib/ui.js',
  './js/lib/session.js',
  './js/lib/audio.js',
  './js/lib/films-store.js',
  './data/films.json',
  './js/core/stack-worker.js',
  './js/lib/camera.js',
  './js/lib/db.js',
  './js/lib/image.js',
  './js/lib/markdown.js',
  './js/lib/scene.js',
  './js/lib/camera-svg.js',
  './js/modules/learn-graphics.js',
  './js/modules/learn-sim.js',
  './js/modules/camera.js',
  './js/modules/camera-view.js',
  './js/modules/camera-virtual.js',
  './js/modules/camera-finder.js',
  './js/lib/camera-profile.js',
  './js/lib/camera-bridge.js',
  './data/devices.json',
  './data/camera-modes.json',
  './content/cards/09-modusrad.md',
  './content/cards/index.json',
  './content/cards/01-stufe.md',
  './content/cards/02-blendenzahl.md',
  './content/cards/03-schaerfentiefe.md',
  './content/cards/04-lochkamera.md',
  './content/cards/05-langzeitbelichtung.md',
  './content/cards/06-nd-filter.md',
  './content/cards/07-schwarzschild.md',
  './content/cards/08-handy-kamera-film.md',
  './content/tasks.json',
  './content/compare/index.json',
  './content/compare/strasse/meta.json',
  './content/compare/strasse/phone.svg',
  './content/compare/strasse/digital.svg',
  './content/compare/strasse/film.svg',
  './i18n/de.json',
  './assets/logo.svg',
  './assets/wordmark.svg',
  './assets/icons/focus-32.png',
  './assets/icons/focus-192.png',
  './assets/icons/focus-512.png',
  './assets/icons/focus-maskable-192.png',
  './assets/icons/focus-maskable-512.png',
  './assets/icons/focus-touch-180.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    // cache: 'reload' holt jede Datei frisch vom Server, nicht aus dem Browser-Zwischenspeicher,
    // sonst landet nach einem Update evtl. eine alte Datei im neuen Cache
    caches.open(CACHE).then((cache) => cache.addAll(PRECACHE.map((url) => new Request(url, { cache: 'reload' }))))
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') self.skipWaiting();
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  // Liste der Kurs-Codes immer frisch vom Server (Sperren greift sofort), offline aus dem Cache
  if (url.pathname.endsWith('/data/access.json')) {
    event.respondWith(fetch(req).then((res) => {
      if (res.ok) { const copy = res.clone(); caches.open(CACHE).then((cache) => cache.put(new Request(url.pathname), copy)); }
      return res;
    }).catch(() => caches.match(new Request(url.pathname))));
    return;
  }

  event.respondWith(
    caches.match(req, { ignoreSearch: true }).then((cached) => {
      if (cached) return cached;
      return fetch(req).then((res) => {
        if (res && res.ok && res.type === 'basic') {
          const copy = res.clone();
          caches.open(CACHE).then((cache) => cache.put(req, copy));
        }
        return res;
      }).catch(() => {
        // Offline und nicht im Cache: bei Seitenaufrufen die App-Hülle liefern.
        if (req.mode === 'navigate') return caches.match('./index.html');
        return Response.error();
      });
    })
  );
});
