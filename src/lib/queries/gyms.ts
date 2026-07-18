import { sql } from "@/lib/db";
import {
  gymDescription,
  haversineKm,
  sportLabels,
  type Gym,
} from "@/lib/gyms";

// Fila cruda de la tabla `gyms` (migración 023, poblada por gyms_osm.py). Las
// etiquetas en español y la descripción por plantilla se derivan aquí con los
// helpers de gyms.ts (única fuente de verdad de presentación).
type GymRow = {
  osm_id: string;
  name: string;
  lat: number;
  lon: number;
  sports: string[];
  address: string | null;
  city: string | null;
  website: string | null;
  phone: string | null;
};

const RADIUS_KM = 15;
const MAX_RESULTS = 120;

// Gimnasios de lucha cerca de (lat, lon), leídos de Neon (antes: Overpass en
// runtime). Un bounding-box aprovecha idx_gyms_lat_lon y el filtro fino por
// distancia haversine + orden se hace en memoria (≤250 filas en toda España).
export async function getGymsNearby(lat: number, lon: number): Promise<Gym[]> {
  const dLat = RADIUS_KM / 111;
  // A mayor latitud, un grado de longitud abarca menos km (cos). Evita /0 en polos.
  const dLon = RADIUS_KM / (111 * Math.max(Math.cos((lat * Math.PI) / 180), 0.01));
  const rows = await sql<GymRow>(
    `SELECT osm_id, name, lat, lon, sports, address, city, website, phone
       FROM gyms
      WHERE lat BETWEEN $1 AND $2 AND lon BETWEEN $3 AND $4`,
    [lat - dLat, lat + dLat, lon - dLon, lon + dLon],
  );

  const gyms: Gym[] = [];
  for (const row of rows) {
    const distanceKm =
      Math.round(haversineKm(lat, lon, row.lat, row.lon) * 100) / 100;
    if (distanceKm > RADIUS_KM) continue;
    const sports = sportLabels(row.sports.join(";"));
    gyms.push({
      id: row.osm_id,
      lat: row.lat,
      lon: row.lon,
      name: row.name,
      sports,
      address: row.address,
      city: row.city,
      description: gymDescription(sports, row.city),
      website: row.website,
      phone: row.phone,
      distanceKm,
    });
  }
  gyms.sort((a, b) => a.distanceKm - b.distanceKm);
  return gyms.slice(0, MAX_RESULTS);
}
