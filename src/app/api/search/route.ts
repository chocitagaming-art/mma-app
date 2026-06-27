import { NextResponse } from "next/server";

import { searchEvents } from "@/lib/queries/events";
import { searchFighters } from "@/lib/queries/fighters";
import { searchNews } from "@/lib/queries/news";
import { normalizeSearchQuery } from "@/lib/search-input";
import type { GlobalSearchResults } from "@/lib/types";

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

    if (!normalized.ok) {
      return NextResponse.json(EMPTY_RESULTS);
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

    return NextResponse.json(results);
  } catch (error) {
    console.error("[api/search] búsqueda global fallida", error);
    return NextResponse.json(
      { error: "No se pudo completar la búsqueda." },
      { status: 500 },
    );
  }
}
