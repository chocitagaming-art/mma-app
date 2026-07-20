// Service worker de MMA STATUS.
//
// PRINCIPIO RECTOR: lo unico que entra en la cache es /offline y ficheros de
// /_next/static/ (llevan hash en el nombre: si el contenido cambia, cambia el
// nombre, asi que NO pueden quedar rancios). Ni HTML de paginas reales, ni
// respuestas de API, ni imagenes. Este sitio vive del dato fresco: servir un
// resultado viejo seria peor que no tener service worker.
//
// No se evita el dato rancio con reglas, se evita porque ese dato NUNCA entra
// en la cache. Cualquier cambio que rompa esa propiedad es un cambio de
// DISENO, no un ajuste. Hay un test E2E que revisa el inventario completo de
// las caches para que esto no se erosione.
//
// Subir SW_VERSION invalida todas las caches anteriores.

const SW_VERSION = "v1";
const STATIC_CACHE = `mma-static-${SW_VERSION}`;
const OFFLINE_CACHE = `mma-offline-${SW_VERSION}`;
const OFFLINE_URL = "/offline";

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(OFFLINE_CACHE)
      // cache: "reload" evita precargar una copia rancia del propio navegador.
      .then((cache) => cache.add(new Request(OFFLINE_URL, { cache: "reload" })))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((k) => k.startsWith("mma-") && !k.endsWith(`-${SW_VERSION}`))
            .map((k) => caches.delete(k)),
        ),
      )
      // claim: la version nueva manda ya, sin esperar a que cierren pestanas.
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  // Navegaciones: SIEMPRE a la red. La respuesta buena NO se guarda; si la red
  // falla, se sirve la pantalla sin conexion.
  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request).catch(() =>
        caches
          .open(OFFLINE_CACHE)
          .then((cache) => cache.match(OFFLINE_URL))
          .then((cached) => cached || Response.error()),
      ),
    );
    return;
  }

  // Estaticos con hash: de cache si estan, si no de red y se guardan.
  if (url.pathname.startsWith("/_next/static/")) {
    event.respondWith(
      caches.open(STATIC_CACHE).then((cache) =>
        cache.match(request).then(
          (hit) =>
            hit ||
            fetch(request).then((response) => {
              if (response.ok) cache.put(request, response.clone());
              return response;
            }),
        ),
      ),
    );
  }

  // Todo lo demas (API, imagenes, payloads RSC): el worker no interviene.
});
