import { NextResponse } from "next/server";

import { clientIpFromHeaders } from "@/lib/maestro/security";
import { getUpcomingBoutsForFighters } from "@/lib/queries/fighters";
import { checkRateLimit } from "@/lib/rate-limit";
import type { FavoriteUpcomingBout } from "@/lib/types";

export const runtime = "nodejs";

// Mismo criterio que parseId (route-params.ts): enteros int4 positivos.
const PG_INT4_MAX = 2_147_483_647;
// Tope alineado con MAX_FAVORITES (lib/favorites.ts).
const MAX_IDS = 50;

// Próximo combate de una lista de luchadores (franja "Tus favoritos" de la
// home). Los ids viajan como CSV (?ids=1,2,3); se validan, deduplican y ordenan
// para que la URL sea canónica y la CDN pueda cachearla.
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const raw = searchParams.get("ids") ?? "";

    const ids = [
      ...new Set(
        raw
          .split(",")
          .map((part) => part.trim())
          .filter((part) => /^\d+$/.test(part))
          .map(Number)
          .filter((id) => Number.isSafeInteger(id) && id > 0 && id <= PG_INT4_MAX),
      ),
    ]
      .sort((a, b) => a - b)
      .slice(0, MAX_IDS);

    if (ids.length === 0) {
      return NextResponse.json({ bouts: [] as FavoriteUpcomingBout[] });
    }

    // Rate-limit por IP tras la validación barata y antes de tocar Neon (mismo
    // patrón que /api/gyms): el espacio de combinaciones de ids es enorme y la
    // CDN solo absorbe URLs repetidas.
    const ip = clientIpFromHeaders(request.headers);
    const limit = await checkRateLimit(`upcoming:${ip}`);
    if (!limit.allowed) {
      return NextResponse.json(
        { error: "Vas demasiado rápido. Espera unos segundos e inténtalo de nuevo." },
        { status: 429, headers: { "Retry-After": String(limit.retryAfter) } },
      );
    }

    const bouts = await getUpcomingBoutsForFighters(ids);

    const response = NextResponse.json({ bouts });
    // Datos no personales (los ids van en la URL) que cambian poco: caché CDN
    // corta, solo en el 200 (mismo criterio que /api/gyms).
    response.headers.set(
      "Cache-Control",
      "public, s-maxage=300, stale-while-revalidate=3600",
    );
    return response;
  } catch (error) {
    console.error("[api/fighters/upcoming] fallo", error);
    return NextResponse.json(
      { error: "No se pudieron cargar los próximos combates." },
      { status: 500 },
    );
  }
}
