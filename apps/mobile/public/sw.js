/* Service worker gaRAN PWA : installabilité, cache réseau-d'abord, mise à jour sur action. */
/* __BUILD_ID__ est remplacé à la compilation (scripts/inject-pwa.mjs) : le fichier change
   d'octets à chaque déploiement, condition pour que le navigateur détecte une nouvelle version. */
const BUILD = '__BUILD_ID__';
const CACHE = 'garan-pwa-' + BUILD;

self.addEventListener('install', () => {
  // On n'active pas tout de suite : l'utilisateur déclenche la mise à jour via le bouton.
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)));
      await self.clients.claim();
    })()
  );
});

self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') self.skipWaiting();
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  // Ne jamais intercepter les schémas non http(s) : les URL blob: et data: (ex. une image
  // sélectionnée qu'on lit via fetch avant l'envoi) ont le même « origin » mais ne sont pas
  // cacheables ; les capter casse la lecture de l'image et fait échouer l'upload.
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return;
  if (url.origin !== self.location.origin) return;
  event.respondWith(
    fetch(req)
      .then((res) => {
        const copy = res.clone();
        caches.open(CACHE).then((c) => c.put(req, copy)).catch(() => {});
        return res;
      })
      .catch(() => caches.match(req))
  );
});
