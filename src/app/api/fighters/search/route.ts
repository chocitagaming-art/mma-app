import { NextResponse } from "next/server";

import { clientIpFromHeaders } from "@/lib/maestro/security";
import { searchFighters } from "@/lib/queries/fighters";
import { checkRateLimit } from "@/lib/rate-limit";
import { normalizeSearchQuery } from "@/lib/search-input";

export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const normalized = normalizeSearchQuery(searchParams.get("q"));

    // Validación primero, que es gratis: una query de menos de 3 caracteres se
    // descarta sin tocar la BD (con 1-2 letras el planificador tira el índice
    // trigram y escanea las 2.852 filas enteras). Lista vacía y no 400: el
    // combobox consulta según se teclea.
    if (!normalized.ok) {
      return NextResponse.json([]);
    }

    // Rate-limit por IP, antes de tocar Neon. `clientIpFromHeaders` prefiere
    // `x-real-ip`, que Vercel reescribe y el cliente no puede falsear.
    const ip = clientIpFromHeaders(request.headers);
    const limit = await checkRateLimit(`fighters-search:${ip}`);
    if (!limit.allowed) {
      return NextResponse.json(
        { error: "Vas demasiado rápido. Espera unos segundos e inténtalo de nuevo." },
        { status: 429, headers: { "Retry-After": String(limit.retryAfter) } },
      );
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
