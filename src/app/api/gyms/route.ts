import { NextResponse } from "next/server";

export const runtime = "nodejs";

const RADIUS_M = 15000;
const UA = "MMA-STATUS/1.0 (+https://mma-app-ruby.vercel.app)";

type OverpassElement = {
  type: string;
  id: number;
  lat?: number;
  lon?: number;
  center?: { lat: number; lon: number };
  tags?: Record<string, string>;
};

type Gym = { id: string; lat: number; lon: number; name: string; type: string };

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

async function fetchGyms(lat: number, lon: number): Promise<Gym[]> {
  // Solo el tag `sport~` (indexado, rápido y fiable). Añadir un regex sobre el
  // `name` de todos los fitness_centre disparaba el timeout server-side de
  // Overpass y devolvía vacío.
  const query = `[out:json][timeout:25];nwr[sport~"martial_arts|boxing|muay_thai|brazilian_jiu_jitsu|mixed_martial_arts|kickboxing|judo|karate|taekwondo|wrestling|sambo|grappling|aikido|krav_maga"](around:${RADIUS_M},${lat},${lon});out center 80;`;
  const res = await fetch("https://overpass-api.de/api/interpreter", {
    method: "POST",
    headers: { "User-Agent": UA, "Content-Type": "application/x-www-form-urlencoded" },
    body: `data=${encodeURIComponent(query)}`,
    // Cacheado 1h: reduce carga sobre Overpass y acelera búsquedas repetidas.
    next: { revalidate: 3600 },
  });
  if (!res.ok) throw new Error("overpass");
  const data = (await res.json()) as { elements?: OverpassElement[] };
  const seen = new Set<string>();
  const gyms: Gym[] = [];
  for (const element of data.elements ?? []) {
    const mlat = element.lat ?? element.center?.lat;
    const mlon = element.lon ?? element.center?.lon;
    const tags = element.tags ?? {};
    const name = tags.name;
    if (mlat == null || mlon == null || !name || seen.has(name)) continue;
    seen.add(name);
    const type = tags.sport ? tags.sport.replace(/[_;]+/g, " ") : "Gimnasio";
    gyms.push({ id: `${element.type}/${element.id}`, lat: mlat, lon: mlon, name, type });
  }
  return gyms;
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

    const gyms = await fetchGyms(center[0], center[1]);
    return NextResponse.json({ center, gyms });
  } catch {
    return NextResponse.json({ error: "upstream" }, { status: 502 });
  }
}
