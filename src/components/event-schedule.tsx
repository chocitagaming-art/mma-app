"use client";

import { useSyncExternalStore } from "react";
import { Clock } from "lucide-react";

import { parseEventTimestamp } from "@/lib/event-time";

// FE5b: horarios por tramo de la cartelera en la zona horaria del VISITANTE.
// Mismo patrón useSyncExternalStore que EventStartTime (FE5a): la zona del
// navegador no existe en SSR, así que servidor e hidratación pintan UTC y,
// ya montado, se re-renderiza en hora local sin mismatch.
const emptySubscribe = () => () => {};

function useMounted(): boolean {
  return useSyncExternalStore(
    emptySubscribe,
    () => true,
    () => false,
  );
}

function formatTime(date: Date, mounted: boolean, withZone: boolean): string {
  return new Intl.DateTimeFormat("es-ES", {
    hour: "2-digit",
    minute: "2-digit",
    // La zona ("CEST", "GMT-4"…) solo en el último tramo de la línea: repetirla
    // en cada uno sería ruido, y una vez basta para saber de qué hora hablamos.
    ...(withZone ? { timeZoneName: "short" as const } : {}),
    ...(mounted ? {} : { timeZone: "UTC" }),
  }).format(date);
}

// Línea de horarios bajo el hero del evento:
// "Early Prelims 00:00 · Prelims 02:00 · Estelar 04:00 CEST".
// Solo se pinta si existe algún tramo previo (early/prelims): con únicamente
// start_time la línea duplicaría el EventStartTime de la cabecera.
export function EventScheduleLine({
  earlyPrelimsTime,
  prelimsTime,
  startTime,
}: {
  earlyPrelimsTime: string | null;
  prelimsTime: string | null;
  startTime: string | null;
}) {
  const mounted = useMounted();

  const segments = [
    { label: "Early Prelims", date: parseEventTimestamp(earlyPrelimsTime) },
    { label: "Prelims", date: parseEventTimestamp(prelimsTime) },
    { label: "Estelar", date: parseEventTimestamp(startTime) },
  ].filter(
    (segment): segment is { label: string; date: Date } => segment.date != null,
  );

  const hasPreliminary = segments.some(
    (segment) => segment.label !== "Estelar",
  );
  if (!hasPreliminary) {
    return null;
  }

  return (
    <p
      className="mt-3 flex flex-wrap items-center gap-x-2 gap-y-1 font-mono text-xs text-muted-foreground"
      title="Horarios de cada tramo de la cartelera (hora local)"
    >
      <Clock className="size-3.5" />
      {segments.map((segment, index) => (
        <span key={segment.label} className="flex items-center gap-x-2">
          {index > 0 ? <span aria-hidden>·</span> : null}
          <span>
            {segment.label}{" "}
            <span className="tabular font-semibold text-foreground">
              {formatTime(segment.date, mounted, index === segments.length - 1)}
            </span>
          </span>
        </span>
      ))}
    </p>
  );
}

// Hora compacta ("04:00") para los encabezados de sección de la cartelera
// ("Cartelera estelar", "Preliminares"…). Sin zona: la línea del hero ya la da.
export function EventSectionTime({ time }: { time: string | null }) {
  const mounted = useMounted();

  const date = parseEventTimestamp(time);
  if (!date) {
    return null;
  }

  return (
    <span
      className="font-mono text-xs font-medium normal-case tracking-normal text-muted-foreground/80"
      title="Hora de inicio de esta parte de la cartelera (hora local)"
    >
      {formatTime(date, mounted, false)}
    </span>
  );
}
