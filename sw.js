/* Service worker de Domi — permite instalar la app y usarla sin conexión.

   Estrategia:
   - App (HTML / JS / CSS del propio origen): RED PRIMERO, con la caché como
     respaldo si no hay internet. Así, con conexión, siempre ves la última
     versión desplegada sin tener que borrar nada.
   - Recursos estáticos del origen (iconos, manifest): caché primero.
   - Librerías de terceros (Firebase SDK de gstatic, fuentes de Google):
     caché primero, porque sus URLs llevan versión y no cambian.
   - Todo lo demás de otros orígenes (API de Firestore/Auth): no se toca. */

const CACHE_NAME = 'domi-cache-v14';

const ARCHIVOS_CORE = [
  './',
  './index.html',
  './style.css',
  './script.js',
  './js/config.js',
  './js/utils.js',
  './js/firebase.js',
  './js/dom.js',
  './js/state.js',
  './js/render-bus.js',
  './js/calculos.js',
  './js/data.js',
  './js/render.js',
  './js/sheets.js',
  './js/navigation.js',
  './js/auth.js',
  './js/clientes.js',
  './js/actualizacion.js',
  './js/pull-refresh.js',
  './firebase-config.js',
  './manifest.json',
  './icons/icon.svg',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-maskable-512.png'
];

const TERCEROS_CACHEABLES = [
  'https://www.gstatic.com/',
  'https://fonts.googleapis.com/',
  'https://fonts.gstatic.com/'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      // Uno por uno y tolerando fallos: con cache.addAll() basta un 404 para
      // tumbar toda la instalación y quedarse sin modo offline.
      .then((cache) => Promise.allSettled(ARCHIVOS_CORE.map((url) => cache.add(url))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((nombres) => Promise.all(
        nombres.filter((n) => n !== CACHE_NAME).map((n) => caches.delete(n))
      ))
      .then(() => self.clients.claim())
  );
});

function guardarEnCache(request, response) {
  if (response && response.ok) {
    const copia = response.clone();
    caches.open(CACHE_NAME).then((cache) => cache.put(request, copia));
  }
  return response;
}

async function redPrimero(request) {
  try {
    return guardarEnCache(request, await fetch(request));
  } catch (err) {
    const cache = await caches.match(request);
    if (cache) return cache;
    if (request.mode === 'navigate') return caches.match('./index.html');
    throw err;
  }
}

async function cachePrimero(request) {
  const cache = await caches.match(request);
  if (cache) return cache;
  return guardarEnCache(request, await fetch(request));
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  const mismoOrigen = url.origin === self.location.origin;

  if (mismoOrigen) {
    const esApp = request.mode === 'navigate'
      || url.pathname === '/'
      || /\.(?:html|js|css)$/.test(url.pathname);
    event.respondWith(esApp ? redPrimero(request) : cachePrimero(request));
    return;
  }

  if (TERCEROS_CACHEABLES.some((prefijo) => request.url.startsWith(prefijo))) {
    event.respondWith(cachePrimero(request));
  }
  // Resto de orígenes (Firestore, Auth…): sin interceptar.
});
