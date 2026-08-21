"use client";

import { useEffect, useState } from "react";

import type { LiveNowPayload } from "@/lib/live-event";

// T3-A: estado none/pre/live compartido por chip, banner y CTA "Ver en directo".
// Cliente + fetch a /api/live/now para no volver dinámicos el header ni las
// páginas ISR que los montan.
const CACHE_KEY = "mma-live-now";

export function useLiveNow(pollMs?: number): LiveNowPayload | null {
  const [payload, setPayload] = useState<LiveNowPayload | null>(null);

  useEffect(() => {
    let cancelled = false;

    // Caché de sesión ANTES del fetch (revisión adversarial: layout shift):
    // en navegaciones dentro de la misma pestaña el componente pinta al montar
    // sin esperar a la red; el salto queda limitado a la primera visita.
    try {
      const raw = sessionStorage.getItem(CACHE_KEY);
      if (raw) {
        // Lectura única de la caché al montar, a propósito: pinta el último
        // estado conocido antes de que responda la red (evita el salto de
        // layout que señaló la revisión adversarial).
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setPayload(JSON.parse(raw) as LiveNowPayload);
      }
    } catch {
      // Sin sessionStorage (modo privado estricto): solo fetch.
    }

    // Devuelve la fase leída, para que el planificador de abajo decida si merece
    // la pena volver a preguntar.
    const load = async (): Promise<LiveNowPayload | null> => {
      try {
        const response = await fetch("/api/live/now");
        if (!response.ok) {
          return null;
        }
        const data = (await response.json()) as LiveNowPayload;
        if (cancelled) {
          return null;
        }
        setPayload(data);
        try {
          sessionStorage.setItem(CACHE_KEY, JSON.stringify(data));
        } catch {
          // Caché opcional: si falla, seguimos con el estado en memoria.
        }
        return data;
      } catch {
        // Sin red o BD caída: el consumidor simplemente no se pinta.
        return null;
      }
    };

    if (!pollMs) {
      void load();
      return () => {
        cancelled = true;
      };
    }

    // SONDEO QUE SE APAGA SOLO, y no un setInterval ciego. Este hook lo monta el
    // chip del header, o sea que vive en TODAS las páginas: con un intervalo fijo,
    // una sola pestaña abierta en cualquier rincón del sitio bastaba para que Neon
    // no se durmiera nunca (el autosuspend es a los 5 min). Eso fue una de las
    // causas de que la cuota de cómputo se fundiera el 18-ago-2026.
    //
    // Ahora la respuesta decide si hay siguiente pregunta: solo se re-programa
    // mientras la fase sea "pre" o "live", es decir, en día de velada — que es
    // justo cuando sondear sale gratis, porque el bucle del directo ya está
    // escribiendo en la base cada 20 s y Neon está despierta igualmente.
    //
    // setTimeout encadenado y no setInterval: así la decisión de continuar se
    // toma DESPUÉS de conocer la respuesta, no antes.
    let timer: ReturnType<typeof setTimeout> | undefined;

    const programarSiguiente = () => {
      timer = setTimeout(() => {
        void tick();
      }, pollMs);
    };

    const tick = async () => {
      // Pestaña en segundo plano: no se consulta, pero se sigue vigilando por si
      // vuelve al frente.
      if (document.visibilityState !== "visible") {
        if (!cancelled) programarSiguiente();
        return;
      }
      const data = await load();
      if (cancelled) {
        return;
      }
      // Sin velada a la vista no hay nada que refrescar: se para. La fase se
      // recalcula igualmente en la siguiente carga de página.
      if (data && data.phase !== "none") {
        programarSiguiente();
      }
    };

    // La PRIMERA lectura va siempre, esté la pestaña al frente o no: es la que
    // pinta el chip al montar. Solo a partir de ahí manda la visibilidad.
    void load().then((data) => {
      if (cancelled) {
        return;
      }
      if (data && data.phase !== "none") {
        programarSiguiente();
      }
    });

    return () => {
      cancelled = true;
      if (timer !== undefined) {
        clearTimeout(timer);
      }
    };
  }, [pollMs]);

  return payload;
}
