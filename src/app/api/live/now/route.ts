import { NextResponse } from "next/server";

import { resolveLivePhase, type LiveNowPayload } from "@/lib/live-event";
import { getLiveEventCandidate } from "@/lib/queries/live";

// T3-A: estado "en directo" para el chip de navegación y el banner de la home.
// Son componentes cliente que consultan esta ruta tras montar, así el header y
// la home (ISR) siguen cacheados y solo esta respuesta es dinámica.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const candidate = await getLiveEventCandidate();
    // Evento cuyo estelar ya cayó: 'none' aunque la ventana horaria 'live'
    // (main + 8 h) siga abierta, para que el chip EN VIVO, la franja de la home
    // y el botón "Ver en directo" se apaguen en cuanto termina la velada.
    const phase =
      candidate && !candidate.mainEventFinished
        ? resolveLivePhase(candidate, new Date())
        : "none";

    const payload: LiveNowPayload = {
      phase,
      live: phase === "live",
      eventId: candidate?.id ?? null,
      eventName: candidate?.name ?? null,
    };

    return NextResponse.json(payload, {
      // El estado cambia con el reloj: ni el CDN ni el navegador deben retenerlo.
      headers: { "cache-control": "no-store, max-age=0" },
    });
  } catch {
    // Fallo de BD: el chip simplemente no se pinta (los clientes tratan
    // cualquier error como phase "none"); la página /en-vivo tiene su propio SSR.
    return NextResponse.json(
      { phase: "none", live: false, eventId: null, eventName: null },
      { status: 503, headers: { "cache-control": "no-store, max-age=0" } },
    );
  }
}
