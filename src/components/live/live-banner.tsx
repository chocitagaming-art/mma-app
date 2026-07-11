"use client";

import Link from "next/link";

import { useLiveNow } from "@/components/live/use-live-now";

// T3-A: franja "EN DIRECTO" de la home. Solo aparece con un evento EN MARCHA
// (la fase "pre" ya la cubre la cuenta atrás del hero Up Next). El hook cachea
// en sessionStorage, así que en visitas sucesivas pinta sin salto de layout.
export function LiveBanner() {
  const payload = useLiveNow();

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
