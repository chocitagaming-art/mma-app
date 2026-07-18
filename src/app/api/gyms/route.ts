import { NextResponse } from "next/server";

import { getGymsNearby } from "@/lib/queries/gyms";

export const runtime = "nodejs";

const UA = "MMA-STATUS/1.0 (+https://mma-status.app)";

async function geocodeCity(query: string): Promise<[number, number] | null> {
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
  const city = searchParams.get("city");
  const latRaw = searchParams.get("lat");
  const lonRaw = searchParams.get("lon");

  try {
    let center: [number, number] | null = null;

    if (latRaw && lonRaw) {
      const lat = Number.parseFloat(latRaw);
      const lon = Number.parseFloat(lonRaw);
      if (Number.isFinite(lat) && Number.isFinite(lon)) center = [lat, lon];
    } else if (city && city.trim()) {
      center = await geocodeCity(city.trim());
      if (!center) {
        return NextResponse.json({ error: "city_not_found" }, { status: 404 });
      }
    }

    if (!center) {
      return NextResponse.json({ error: "bad_request" }, { status: 400 });
    }

    // Antes: Overpass en runtime (lento, tope de 120, sin acumular). Ahora se lee
    // de Neon (tabla `gyms`, migración 023, poblada por el cron refresh-gyms.yml).
    const gyms = await getGymsNearby(center[0], center[1]);
    return NextResponse.json({ center, gyms });
  } catch {
    return NextResponse.json({ error: "upstream" }, { status: 502 });
  }
}
