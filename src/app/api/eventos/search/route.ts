import { NextResponse } from "next/server";

import { searchEvents } from "@/lib/queries/events";
import { normalizeSearchQuery } from "@/lib/search-input";

export const runtime = "nodejs";

// FE7: alimenta el combobox "salto a evento" de /eventos. Misma arquitectura
// que /api/fighters/search; reutiliza searchEvents (ILIKE sobre nombre y
// ubicación, ya ordenada por exactitud + fecha) con límite 8.
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const normalized = normalizeSearchQuery(searchParams.get("q"));

    if (!normalized.ok) {
      return NextResponse.json([]);
    }

    const events = await searchEvents(normalized.value, 8);

    return NextResponse.json(events);
  } catch (error) {
    console.error("[api/eventos/search] búsqueda fallida", error);
    return NextResponse.json(
      { error: "No se pudo completar la búsqueda." },
      { status: 500 },
    );
  }
}
