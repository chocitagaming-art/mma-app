import { NextResponse } from "next/server";

import { clientIpFromHeaders } from "@/lib/maestro/security";
import { getGymsNearby } from "@/lib/queries/gyms";
import { checkRateLimit } from "@/lib/rate-limit";

export const runtime = "nodejs";

const UA = "MMA-STATUS/1.0 (+https://mma-status.app)";

// Límites del parámetro `city`: nombres de ciudad razonables. Evita que la ruta
// se use como proxy de Nominatim con queries arbitrarias/enormes (hallazgo M1).
const CITY_MIN_LENGTH = 2;
const CITY_MAX_LENGTH = 100;

// Solo para el 200: los datos de gyms son OSM públicos y se refrescan a diario
// (cron refresh-gyms.yml), así que el CDN puede servirlos 1h y revalidar en
// background hasta 24h. Los 4xx/5xx NO llevan esta cabecera.
const OK_CACHE_CONTROL = "public, s-maxage=3600, stale-while-revalidate=86400";

async function geocodeCity(query: string): Promise<[number, number] | null> {
  // `query` llega normalizado (trim + minúsculas): la misma ciudad con distinta
  // capitalización produce la MISMA URL y por tanto más hits en la Data Cache.
  const url = `https://nominatim.openstreetmap.org/search?format=json&limit=1&q=${encodeURIComponent(query)}`;
  // Cacheado a diario: la geocodificación de una ciudad no cambia.
  const res = await fetch(url, {
    headers: { "Accept-Language": "es", "User-Agent": UA },
    next: { revalidate: 86_400 },
  });
  if (!res.ok) return null;
  const data = (await res.json()) as { lat: string; lon: string }[];
  if (!data.length) return null;
  return [Number.parseFloat(data[0].lat), Number.parseFloat(data[0].lon)];
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const cityRaw = searchParams.get("city");
  const latRaw = searchParams.get("lat");
  const lonRaw = searchParams.get("lon");

  // 1) Validación de entrada ANTES de cualquier trabajo (red o BD). Nota: aquí
  //    NO hay check de Origin (a diferencia de /api/predict): un fetch GET
  //    same-origin no envía esa cabecera y romperíamos usuarios legítimos.
  let coords: [number, number] | null = null;
  let city: string | null = null;

  if (latRaw && lonRaw) {
    const lat = Number.parseFloat(latRaw);
    const lon = Number.parseFloat(lonRaw);
    const latValid = Number.isFinite(lat) && lat >= -90 && lat <= 90;
    const lonValid = Number.isFinite(lon) && lon >= -180 && lon <= 180;
    if (!latValid || !lonValid) {
      return NextResponse.json({ error: "bad_request" }, { status: 400 });
    }
    coords = [lat, lon];
  } else if (cityRaw !== null) {
    const trimmed = cityRaw.trim();
    if (trimmed.length < CITY_MIN_LENGTH || trimmed.length > CITY_MAX_LENGTH) {
      return NextResponse.json({ error: "bad_request" }, { status: 400 });
    }
    // Normalizada a minúsculas: sube el hit-rate de la Data Cache de Nominatim.
    city = trimmed.toLowerCase();
  } else {
    return NextResponse.json({ error: "bad_request" }, { status: 400 });
  }

  // 2) Rate-limit por IP (mismo patrón que /api/predict): geocodificar en
  //    Nominatim y leer Neon cuestan; un flood queda cortado aquí, tras la
  //    validación barata y antes de cualquier trabajo caro.
  const ip = clientIpFromHeaders(request.headers);
  const limit = await checkRateLimit(`gyms:${ip}`);
  if (!limit.allowed) {
    return NextResponse.json(
      { error: "Vas demasiado rápido. Espera unos segundos e inténtalo de nuevo." },
      { status: 429, headers: { "Retry-After": String(limit.retryAfter) } },
    );
  }

  try {
    let center = coords;
    if (!center && city) {
      center = await geocodeCity(city);
      if (!center) {
        return NextResponse.json({ error: "city_not_found" }, { status: 404 });
      }
    }
    if (!center) {
      // Inalcanzable tras la validación de arriba; defensa en profundidad.
      return NextResponse.json({ error: "bad_request" }, { status: 400 });
    }

    // Antes: Overpass en runtime (lento, tope de 120, sin acumular). Ahora se lee
    // de Neon (tabla `gyms`, migración 023, poblada por el cron refresh-gyms.yml).
    const gyms = await getGymsNearby(center[0], center[1]);
    return NextResponse.json(
      { center, gyms },
      { headers: { "Cache-Control": OK_CACHE_CONTROL } },
    );
  } catch {
    return NextResponse.json({ error: "upstream" }, { status: 502 });
  }
}
