"use client";

import { useSyncExternalStore } from "react";
import { Clock } from "lucide-react";

// Hora de inicio de la cartelera en la zona horaria del VISITANTE (FE5a).
// La zona del navegador no existe en SSR, así que el servidor (y el primer
// render de hidratación) pintan la hora en UTC y, ya montados, se re-renderiza
// en hora local. Mismo patrón useSyncExternalStore que theme-toggle.tsx:
// getServerSnapshot=false garantiza que servidor y cliente coinciden al hidratar.
const emptySubscribe = () => () => {};

// events.start_time es timestamptz y llega como texto de Postgres
// ("2026-08-16 01:00:00+00"). Lo normalizamos a ISO 8601 ("T" y offset con
// minutos) porque el formato de Postgres no es parseable en todos los motores.
function parseStartTime(value: string): Date | null {
  const iso = value.trim().replace(" ", "T");
  const normalized = /[+-]\d{2}$/.test(iso) ? `${iso}:00` : iso;
  const date = new Date(normalized);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function EventStartTime({
  startTime,
  title = "Inicio de la cartelera estelar (hora local)",
}: {
  startTime: string | null;
  // Quién pinta esta hora decide a qué tramo corresponde. El hero de la home
  // pasa el PRIMER tramo, no el estelar: junto a la fecha "8 ago" un "02:00
  // CEST" (que es del día 9) se lee como "las 2 de la madrugada del 8", y ahí
  // había 24 h de error para el que se plantara delante de la tele.
  title?: string;
}) {
  const mounted = useSyncExternalStore(
    emptySubscribe,
    () => true,
    () => false,
  );

  const date = startTime ? parseStartTime(startTime) : null;
  if (!date) {
    return null;
  }

  const formatted = new Intl.DateTimeFormat("es-ES", {
    hour: "2-digit",
    minute: "2-digit",
    // "short" añade la zona ("CEST", "GMT-4"…) para que quede claro de qué hora
    // hablamos, tanto en el fallback UTC como en la hora local del visitante.
    timeZoneName: "short",
    ...(mounted ? {} : { timeZone: "UTC" }),
  }).format(date);

  return (
    <span className="flex items-center gap-1.5" title={title}>
      <Clock className="size-3.5" />
      {formatted}
    </span>
  );
}
