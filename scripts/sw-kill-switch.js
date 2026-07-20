// INTERRUPTOR DE EMERGENCIA del service worker.
//
// Un service worker es PEGAJOSO: queda instalado en el navegador del usuario y
// sigue mandando aunque el servidor este sano. Si se publica uno defectuoso,
// arreglar el servidor NO basta: hay que desinstalar el worker desde el propio
// navegador. Para eso existe este fichero.
//
// USO:
//   1. cp scripts/sw-kill-switch.js public/sw.js
//   2. commit + push (Vercel despliega solo)
//   3. En la siguiente visita, cada usuario borra sus caches, desregistra el
//      worker y recarga en una web sin service worker.
//
// Funciona porque public/sw.js se sirve con Cache-Control: no-store (ver
// next.config.ts), asi que el navegador siempre ve la version nueva.
//
// Cuando ya no quede nadie con el worker viejo, se puede restaurar sw.js desde
// el historial de git.

self.addEventListener("install", () => self.skipWaiting());

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.map((k) => caches.delete(k))))
      .then(() => self.registration.unregister())
      .then(() => self.clients.matchAll({ type: "window" }))
      .then((clients) => {
        for (const client of clients) client.navigate(client.url);
      }),
  );
});

// Sin listener de fetch a proposito: el navegador va directo a la red.
