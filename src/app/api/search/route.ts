import { NextResponse } from "next/server";

import { clientIpFromHeaders } from "@/lib/maestro/security";
import { searchEvents } from "@/lib/queries/events";
import { searchFighters } from "@/lib/queries/fighters";
import { searchNews } from "@/lib/queries/news";
import { checkRateLimit } from "@/lib/rate-limit";
import { normalizeSearchQuery } from "@/lib/search-input";
import type { GlobalSearchResults } from "@/lib/types";

// Solo para el 200. Los nombres de luchadores y eventos no cambian en cinco
// minutos, y el buscador del cliente tiene un debounce de 300 ms: escribir
// "khabib" dispara 2-3 peticiones, cada una con sus consultas a Neon. Con esta
// cabecera, cien visitantes buscando lo mismo pagan UNA consulta en vez de cien.
// Los 4xx/5xx NO la llevan: un fallo cacheado se convierte en un fallo pegajoso.
const OK_CACHE_CONTROL = "public, s-maxage=300, stale-while-revalidate=3600";

export const runtime = "nodejs";

const EMPTY_RESULTS: GlobalSearchResults = {
  fighters: [],
  events: [],
  news: [],
};

// Búsqueda GLOBAL: devuelve las 3 categorías (luchadores, eventos, noticias),
// cada resultado con un campo `type` discriminante para que el cliente sepa a
// qué ruta enlazar. El endpoint /api/fighters/search se mantiene intacto para
// no romper los comboboxes que sólo eligen luchadores.
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const normalized = normalizeSearchQuery(searchParams.get("q"));

    // La validación va PRIMERO porque es gratis: una query corta o vacía se
    // descarta sin gastar ni la comprobación del límite. Se responde con la
    // lista vacía, no con un 400, porque el buscador consulta según se teclea y
    // las dos primeras letras son un estado normal, no un error.
    if (!normalized.ok) {
      return NextResponse.json(EMPTY_RESULTS);
    }

    // Rate-limit por IP, después de la validación barata y antes de tocar la
    // BD. Esta ruta es la más cara de las tres búsquedas: lanza TRES consultas
    // en paralelo contra un pool de 3 conexiones, así que una sola ráfaga puede
    // dejar sin conexiones al resto de la instancia. `clientIpFromHeaders`
    // prefiere `x-real-ip`, que Vercel reescribe y el cliente no puede falsear.
    const ip = clientIpFromHeaders(request.headers);
    const limit = await checkRateLimit(`search:${ip}`);
    if (!limit.allowed) {
      return NextResponse.json(
        { error: "Vas demasiado rápido. Espera unos segundos e inténtalo de nuevo." },
        { status: 429, headers: { "Retry-After": String(limit.retryAfter) } },
      );
    }

    const [fighters, events, news] = await Promise.all([
      searchFighters(normalized.value, 5),
      searchEvents(normalized.value, 5),
      searchNews(normalized.value, 5),
    ]);

    const results: GlobalSearchResults = {
      fighters: fighters.map((fighter) => ({ ...fighter, type: "fighter" })),
      events: events.map((event) => ({ ...event, type: "event" })),
      news: news.map((article) => ({ ...article, type: "news" })),
    };

    return NextResponse.json(results, {
      headers: { "Cache-Control": OK_CACHE_CONTROL },
    });
  } catch (error) {
    console.error("[api/search] búsqueda global fallida", error);
    return NextResponse.json(
      { error: "No se pudo completar la búsqueda." },
      { status: 500 },
    );
  }
}
