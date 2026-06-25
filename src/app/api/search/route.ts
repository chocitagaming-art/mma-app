import { NextResponse } from "next/server";

import { searchEvents } from "@/lib/queries/events";
import { searchFighters } from "@/lib/queries/fighters";
import { searchNews } from "@/lib/queries/news";
import type { GlobalSearchResults } from "@/lib/types";

export const runtime = "nodejs";

// Búsqueda GLOBAL: devuelve las 3 categorías (luchadores, eventos, noticias),
// cada resultado con un campo `type` discriminante para que el cliente sepa a
// qué ruta enlazar. El endpoint /api/fighters/search se mantiene intacto para
// no romper los comboboxes que sólo eligen luchadores.
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const query = searchParams.get("q") ?? "";

  if (!query.trim()) {
    const empty: GlobalSearchResults = { fighters: [], events: [], news: [] };
    return NextResponse.json(empty);
  }

  const [fighters, events, news] = await Promise.all([
    searchFighters(query, 5),
    searchEvents(query, 5),
    searchNews(query, 5),
  ]);

  const results: GlobalSearchResults = {
    fighters: fighters.map((fighter) => ({ ...fighter, type: "fighter" })),
    events: events.map((event) => ({ ...event, type: "event" })),
    news: news.map((article) => ({ ...article, type: "news" })),
  };

  return NextResponse.json(results);
}
