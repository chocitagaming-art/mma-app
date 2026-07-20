"use client";

import { useEffect } from "react";

// Registra /sw.js. Solo en producción: en desarrollo una caché de por medio
// hace perder tiempo persiguiendo cambios que sí estaban.
export function ServiceWorkerRegistrar() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production") return;

    // Comprobar el VALOR, no solo que exista la propiedad: en un contexto no
    // seguro (HTTP plano) `serviceWorker` está en el prototipo de navigator
    // pero vale undefined, así que `"serviceWorker" in navigator` da true y
    // `.register()` peta con un TypeError. Lo cazó el test E2E.
    const contenedor =
      typeof navigator === "undefined" ? undefined : navigator.serviceWorker;
    if (!contenedor) return;

    const register = () => {
      contenedor
        // updateViaCache "none": el navegador nunca sirve una copia cacheada del
        // propio worker, así que una versión nueva se ve siempre. Es la mitad
        // del interruptor de emergencia (la otra mitad es la cabecera no-store).
        .register("/sw.js", { scope: "/", updateViaCache: "none" })
        .catch(() => {
          // Un fallo de registro no puede romper la página: sin service worker
          // la web funciona exactamente igual que antes de esta feature.
        });
    };

    // Registrar tras 'load' para no competir con el render inicial.
    if (document.readyState === "complete") {
      register();
      return;
    }
    window.addEventListener("load", register);
    return () => window.removeEventListener("load", register);
  }, []);

  return null;
}
