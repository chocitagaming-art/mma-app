"use client";

import { useEffect, useState, useSyncExternalStore } from "react";

// Cuenta atrás del módulo "Up Next" (FE1): días/horas/min/seg hasta el inicio
// de la cartelera. SSR-safe con el mismo patrón useSyncExternalStore que
// event-start-time.tsx: el reloj del cliente no existe en SSR, así que el
// servidor (y el primer render de hidratación) pintan un placeholder estático
// "--" idéntico en ambos lados y, ya montados, el intervalo pinta el tiempo
// real cada segundo (sin mismatch de hidratación).
const emptySubscribe = () => () => {};

// Mismo parser que event-start-time.tsx: events.start_time es timestamptz y
// llega como texto de Postgres ("2026-08-16 01:00:00+00"), no ISO 8601 estricto.
function parseStartTime(value: string): Date | null {
  const iso = value.trim().replace(" ", "T");
  const normalized = /[+-]\d{2}$/.test(iso) ? `${iso}:00` : iso;
  const date = new Date(normalized);
  return Number.isNaN(date.getTime()) ? null : date;
}

// Objetivo de la cuenta atrás: start_time si existe; si no, medianoche UTC del
// día del evento (mejor una cuenta aproximada que ninguna).
function targetTime(
  startTime: string | null,
  eventDate: string | null,
): number | null {
  if (startTime) {
    const date = parseStartTime(startTime);
    if (date) {
      return date.getTime();
    }
  }
  if (eventDate) {
    const date = new Date(`${eventDate.slice(0, 10)}T00:00:00Z`);
    if (!Number.isNaN(date.getTime())) {
      return date.getTime();
    }
  }
  return null;
}

export function EventCountdown({
  startTime,
  eventDate,
}: {
  startTime: string | null;
  eventDate: string | null;
}) {
  const mounted = useSyncExternalStore(
    emptySubscribe,
    () => true,
    () => false,
  );
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  const target = targetTime(startTime, eventDate);
  if (target == null) {
    return null;
  }

  // Antes de montar no hay reloj fiable: null → placeholder "--".
  const remaining = mounted ? target - now : null;

  // Con HTML cacheado (ISR stale) o pestaña abierta días, el objetivo puede
  // quedar MUY atrás: pasadas 12h no se afirma "¡Es hoy!" para un evento que
  // ya terminó — no se pinta nada.
  if (remaining != null && remaining <= -12 * 3_600_000) {
    return null;
  }

  // Cuenta a cero: el evento es HOY (o ya está en marcha).
  if (remaining != null && remaining <= 0) {
    return (
      <p className="flex items-center justify-center gap-2.5 font-display text-3xl font-extrabold uppercase tracking-tight text-primary">
        <span className="live-dot inline-block size-2.5 rounded-full bg-primary shadow-[0_0_12px_2px_var(--primary)]" />
        ¡Es hoy!
      </p>
    );
  }

  const totalSeconds = remaining != null ? Math.floor(remaining / 1000) : null;
  const parts = [
    {
      label: "Días",
      value: totalSeconds != null ? Math.floor(totalSeconds / 86_400) : null,
    },
    {
      label: "Horas",
      value:
        totalSeconds != null ? Math.floor(totalSeconds / 3_600) % 24 : null,
    },
    {
      label: "Min",
      value: totalSeconds != null ? Math.floor(totalSeconds / 60) % 60 : null,
    },
    {
      label: "Seg",
      value: totalSeconds != null ? totalSeconds % 60 : null,
    },
  ];

  return (
    <div
      className="flex items-center justify-center gap-2 sm:gap-3"
      role="timer"
      aria-label="Cuenta atrás para el evento"
    >
      {parts.map((part) => (
        <div
          key={part.label}
          className="flex min-w-[3.6rem] flex-col items-center rounded-lg border border-border/70 bg-background/60 px-2 py-2 sm:min-w-[4.2rem] sm:py-2.5"
        >
          <span className="tabular font-display text-2xl font-extrabold leading-none text-foreground sm:text-3xl">
            {part.value != null ? String(part.value).padStart(2, "0") : "--"}
          </span>
          <span className="mt-1 font-mono text-[0.6rem] uppercase tracking-[0.18em] text-muted-foreground">
            {part.label}
          </span>
        </div>
      ))}
    </div>
  );
}
