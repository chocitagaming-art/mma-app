import { NextResponse } from "next/server";

import { clientIpFromHeaders } from "@/lib/maestro/security";
import { searchEvents } from "@/lib/queries/events";
import { checkRateLimit } from "@/lib/rate-limit";
import { normalizeSearchQuery } from "@/lib/search-input";

// Solo para el 200. Los nombres de luchadores y eventos no cambian en cinco
// minutos, y el buscador del cliente tiene un debounce de 300 ms: escribir
// "khabib" dispara 2-3 peticiones, cada una con sus consultas a Neon. Con esta
// cabecera, cien visitantes buscando lo mismo pagan UNA consulta en vez de cien.
// Los 4xx/5xx NO la llevan: un fallo cacheado se convierte en un fallo pegajoso.
const OK_CACHE_CONTROL = "public, s-maxage=300, stale-while-revalidate=3600";

export const runtime = "nodejs";

// FE7: alimenta el combobox "salto a evento" de /eventos. Misma arquitectura
// que /api/fighters/search; reutiliza searchEvents (ILIKE sobre nombre y
// ubicación, ya ordenada por exactitud + fecha) con límite 8.
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const normalized = normalizeSearchQuery(searchParams.get("q"));

    // Validación primero, que es gratis: una query de menos de 3 caracteres se
    // descarta sin tocar la BD. Lista vacía y no 400: el combobox consulta
    // según se teclea.
    if (!normalized.ok) {
      return NextResponse.json([]);
    }

    // Rate-limit por IP, antes de tocar Neon. `clientIpFromHeaders` prefiere
    // `x-real-ip`, que Vercel reescribe y el cliente no puede falsear.
    const ip = clientIpFromHeaders(request.headers);
    const limit = await checkRateLimit(`eventos-search:${ip}`);
    if (!limit.allowed) {
      return NextResponse.json(
        { error: "Vas demasiado rápido. Espera unos segundos e inténtalo de nuevo." },
        { status: 429, headers: { "Retry-After": String(limit.retryAfter) } },
      );
    }

    const events = await searchEvents(normalized.value, 8);

    return NextResponse.json(events, {
      headers: { "Cache-Control": OK_CACHE_CONTROL },
    });
  } catch (error) {
    console.error("[api/eventos/search] búsqueda fallida", error);
    return NextResponse.json(
      { error: "No se pudo completar la búsqueda." },
      { status: 500 },
    );
  }
}
