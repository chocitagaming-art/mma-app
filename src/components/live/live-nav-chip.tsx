"use client";

import Link from "next/link";

import { useLiveNow } from "@/components/live/use-live-now";
import { etiquetaChipDirecto } from "@/lib/live-event";

// T3-A: chip "EN VIVO/HOY" del header. Se pinta en fase "live" y también en
// "pre" (evento en <24 h) para que /en-vivo se descubra antes de la velada.
// Oculto entre lg y xl (revisión adversarial): en 1024-1280px los navs de
// escritorio ya rozan el logo y el chip provocaba un solape nuevo; en móvil
// (<lg, navs colapsados) y en pantallas anchas (xl+) hay sitio de sobra.
// SONDEO ADAPTATIVO, y no un intervalo fijo. Antes eran 5 minutos SIEMPRE, y ese
// número coincidía EXACTAMENTE con el autosuspend de Neon: como este chip vive en
// el header de TODAS las páginas, bastaba una pestaña abierta en cualquier rincón
// del sitio para que la base de datos no se durmiera jamás. Fue una de las causas
// de que la cuota de cómputo se fundiera el 18-ago-2026.
//
// El reparto correcto sale de mirar qué pasa en cada fase:
//   · "none" (el 95 % del tiempo): no se sondea NADA. No hay velada que anunciar,
//     así que no hay nada que refrescar y Neon puede dormir. La fase se recalcula
//     igualmente en cada carga de página.
//   · "pre" / "live" (día de velada): cada 2 minutos, MÁS reactivo que los 5
//     minutos de antes. Y aquí sondear es gratis: durante una velada el bucle del
//     directo está escribiendo en la base cada 20 s, o sea que Neon está despierta
//     de todas formas.
//
// Resultado: el chip se enciende antes cuando importa y deja dormir a la base
// cuando no. Limitación conocida y asumida: una pestaña abierta más de 24 h
// seguidas no verá el salto de "none" a "pre" sin recargar. La transición que de
// verdad importa —"pre" a "live"— sí la coge, porque en "pre" ya se está sondeando.
const POLL_EN_VELADA_MS = 2 * 60_000;

export function LiveNavChip() {
  // Quien decide si hay que repetir la pregunta es useLiveNow, mirando la fase que
  // devuelve el servidor: aquí solo se dice CADA CUÁNTO preguntar cuando toca.
  const payload = useLiveNow(POLL_EN_VELADA_MS);

  if (!payload || payload.phase === "none") {
    return null;
  }

  // 🪤 EL TINTE DEL FONDO NO PUEDE SUBIR, y el hover no puede tocarlo.
  // `bg-primary/10` daba 4,36:1 contra --primary en tema claro (pide 4,5), y el
  // `hover:bg-primary/20` que había aquí lo hundía a 3,66. Los dos eran
  // invisibles para axe: este chip solo existe en día de velada —fase "live" o
  // "pre"—, así que un megatest de un martes no lo ve, y el hover no se simula
  // nunca. Ahora el fondo es fijo y el que responde al puntero es el BORDE, así
  // que el texto mide lo mismo en los dos estados y no hay un segundo número
  // que vigilar. Lo fija src/lib/contrast.test.ts, que además lee este fichero.
  return (
    <Link
      href="/en-vivo"
      className="mr-1 inline-flex shrink-0 items-center gap-1.5 rounded-full border border-primary/50 bg-primary/5 px-2.5 py-1 font-display text-xs font-bold uppercase tracking-wide text-primary transition-colors hover:border-primary lg:hidden xl:inline-flex"
    >
      <span className="live-dot inline-block size-1.5 rounded-full bg-primary shadow-[0_0_8px_1px_var(--primary)]" />
      {etiquetaChipDirecto(payload.live, payload.daysUntil ?? null)}
    </Link>
  );
}
