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

    const load = async () => {
      try {
        const response = await fetch("/api/live/now");
        if (!response.ok) {
          return;
        }
        const data = (await response.json()) as LiveNowPayload;
        if (cancelled) {
          return;
        }
        setPayload(data);
        try {
          sessionStorage.setItem(CACHE_KEY, JSON.stringify(data));
        } catch {
          // Caché opcional: si falla, seguimos con el estado en memoria.
        }
      } catch {
        // Sin red o BD caída: el consumidor simplemente no se pinta.
      }
    };

    void load();

    if (!pollMs) {
      return () => {
        cancelled = true;
      };
    }

    const id = setInterval(() => {
      if (document.visibilityState === "visible") {
        void load();
      }
    }, pollMs);

    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [pollMs]);

  return payload;
}
