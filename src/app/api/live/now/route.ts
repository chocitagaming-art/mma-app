import { NextResponse } from "next/server";

import { resolveLivePhase, type LiveNowPayload } from "@/lib/live-event";
import { getLiveEventCandidate } from "@/lib/queries/live";
import { diasHastaLaVelada } from "@/lib/ufc-today";

// T3-A: estado "en directo" para el chip de navegación y el banner de la home.
// Son componentes cliente que consultan esta ruta tras montar, así el header y
// la home (ISR) siguen cacheados y solo esta respuesta es dinámica.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const candidate = await getLiveEventCandidate();
    const now = new Date();
    // Evento cuyo estelar ya cayó: 'none' aunque la ventana horaria 'live'
    // (main + 8 h) siga abierta, para que el chip EN VIVO, la franja de la home
    // y el botón "Ver en directo" se apaguen en cuanto termina la velada.
    const phase =
      candidate && !candidate.mainEventFinished
        ? resolveLivePhase(candidate, now)
        : "none";

    const payload: LiveNowPayload = {
      phase,
      live: phase === "live",
      eventId: candidate?.id ?? null,
      eventName: candidate?.name ?? null,
      // Mismo reloj que la fase, para que no puedan discrepar entre sí.
      daysUntil: candidate ? diasHastaLaVelada(candidate, now) : null,
    };

    return NextResponse.json(payload, {
      // El navegador no lo retiene (max-age=0), pero el CDN sí durante 60 s
      // (s-maxage). Sin esto, cada pestaña abierta del sitio traía su propia
      // consulta a Neon y el compute no se suspendía nunca. La consulta de
      // debajo ya está cacheada 60 s en getLiveEventCandidate; esta cabecera
      // evita además ejecutar la lambda entera.
      headers: {
        "cache-control": "public, max-age=0, s-maxage=60, stale-while-revalidate=300",
      },
    });
  } catch {
    // Fallo de BD: el chip simplemente no se pinta (los clientes tratan
    // cualquier error como phase "none"); la página /en-vivo tiene su propio SSR.
    return NextResponse.json(
      { phase: "none", live: false, eventId: null, eventName: null, daysUntil: null },
      { status: 503, headers: { "cache-control": "no-store, max-age=0" } },
    );
  }
}
