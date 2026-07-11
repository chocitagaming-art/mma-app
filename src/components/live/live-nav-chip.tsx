"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

import type { LiveNowPayload } from "@/lib/live-event";

// T3-A: chip "EN VIVO" del header. Consulta /api/live/now tras montar (y cada
// 5 min) para no volver dinámicos el header ni las páginas ISR que lo montan.
// Se pinta en fase "live" (evento en marcha) y también en "pre" (evento en las
// próximas 24 h) para que la página se descubra antes de que empiece la noche.
const POLL_MS = 5 * 60_000;

export function LiveNavChip() {
  const [payload, setPayload] = useState<LiveNowPayload | null>(null);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      try {
        const response = await fetch("/api/live/now");
        if (!response.ok) {
          return;
        }
        const data = (await response.json()) as LiveNowPayload;
        if (!cancelled) {
          setPayload(data);
        }
      } catch {
        // Sin red o BD caída: el chip simplemente no aparece.
      }
    };

    void load();
    const id = setInterval(() => {
      if (document.visibilityState === "visible") {
        void load();
      }
    }, POLL_MS);

    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, []);

  if (!payload || payload.phase === "none") {
    return null;
  }

  return (
    <Link
      href="/en-vivo"
      className="mr-1 inline-flex shrink-0 items-center gap-1.5 rounded-full border border-primary/50 bg-primary/10 px-2.5 py-1 font-display text-xs font-bold uppercase tracking-wide text-primary transition-colors hover:bg-primary/20"
    >
      <span className="live-dot inline-block size-1.5 rounded-full bg-primary shadow-[0_0_8px_1px_var(--primary)]" />
      {payload.live ? "En vivo" : "Hoy"}
    </Link>
  );
}
