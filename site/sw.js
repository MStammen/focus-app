/* focus – Aufräum-Service-Worker für die Hauptadresse.
   Bis 2026-10-15 lag die App direkt unter focus-fotografie.de/ und hat dort einen Service Worker
   registriert. Seit die Website dort steht und die App unter /app/ liegt, ersetzt diese Datei den alten:
   Der Browser holt sie beim nächsten Besuch, sie meldet sich sofort ab und lädt offene Seiten neu,
   damit die Website statt der zwischengespeicherten App erscheint. Caches löscht sie nicht: Die App
   unter /app/ nutzt dieselben Cache-Namen und räumt alte Stände beim Aktivieren selbst auf. */
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    await self.registration.unregister();
    for (const client of await self.clients.matchAll({ type: 'window' })) client.navigate(client.url);
  })());
});
