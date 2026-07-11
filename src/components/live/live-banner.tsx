"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

import type { LiveNowPayload } from "@/lib/live-event";

// T3-A: franja "EN DIRECTO" de la home. Cliente + fetch tras montar para que
// la home conserve su ISR (revalidate 1800); solo aparece con un evento EN
// MARCHA (la fase "pre" ya la cubre la cuenta atrás del hero Up Next).
export function LiveBanner() {
  const [payload, setPayload] = useState<LiveNowPayload | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/live/now")
      .then((response) => (response.ok ? response.json() : null))
      .then((data: LiveNowPayload | null) => {
        if (!cancelled && data) {
          setPayload(data);
        }
      })
      .catch(() => {
        // Silencio: sin estado no hay banner.
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (!payload?.live) {
    return null;
  }

  return (
    <Link
      href="/en-vivo"
      className="group flex items-center justify-center gap-2.5 border-b border-border bg-primary px-4 py-2.5 text-primary-foreground transition-opacity hover:opacity-95"
    >
      <span className="live-dot inline-block size-2 rounded-full bg-primary-foreground shadow-[0_0_10px_2px_rgba(255,255,255,0.6)]" />
      <span className="font-display text-sm font-extrabold uppercase tracking-wide">
        {payload.eventName ?? "Evento"} · en directo
      </span>
      <span className="font-mono text-xs uppercase tracking-[0.15em] opacity-90 transition-transform group-hover:translate-x-0.5">
        Sigue los resultados →
      </span>
    </Link>
  );
}
