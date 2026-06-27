import { NextResponse } from "next/server";

import { searchFighters } from "@/lib/queries/fighters";
import { normalizeSearchQuery } from "@/lib/search-input";

export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const normalized = normalizeSearchQuery(searchParams.get("q"));

    if (!normalized.ok) {
      return NextResponse.json([]);
    }

    const fighters = await searchFighters(normalized.value, 10);

    return NextResponse.json(fighters);
  } catch (error) {
    console.error("[api/fighters/search] búsqueda fallida", error);
    return NextResponse.json(
      { error: "No se pudo completar la búsqueda." },
      { status: 500 },
    );
  }
}
