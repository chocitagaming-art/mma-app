"use client";

import Link from "next/link";

import { useLiveNow } from "@/components/live/use-live-now";
import { etiquetaChipDirecto } from "@/lib/live-event";

// T3-A: chip "EN VIVO/HOY" del header. Se pinta en fase "live" y también en
// "pre" (evento en <24 h) para que /en-vivo se descubra antes de la velada.
// Oculto entre lg y xl (revisión adversarial): en 1024-1280px los navs de
// escritorio ya rozan el logo y el chip provocaba un solape nuevo; en móvil
// (<lg, navs colapsados) y en pantallas anchas (xl+) hay sitio de sobra.
const POLL_MS = 5 * 60_000;

export function LiveNavChip() {
  const payload = useLiveNow(POLL_MS);

  if (!payload || payload.phase === "none") {
    return null;
  }

  return (
    <Link
      href="/en-vivo"
      className="mr-1 inline-flex shrink-0 items-center gap-1.5 rounded-full border border-primary/50 bg-primary/10 px-2.5 py-1 font-display text-xs font-bold uppercase tracking-wide text-primary transition-colors hover:bg-primary/20 lg:hidden xl:inline-flex"
    >
      <span className="live-dot inline-block size-1.5 rounded-full bg-primary shadow-[0_0_8px_1px_var(--primary)]" />
      {etiquetaChipDirecto(payload.live, payload.daysUntil ?? null)}
    </Link>
  );
}
