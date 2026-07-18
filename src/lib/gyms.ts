// Helpers de PRESENTACIÓN del buscador de gimnasios (/gimnasios). Los datos vienen
// ya filtrados de Neon (tabla `gyms`, poblada por mma-ingesta/src/scrapers/gyms_osm.py,
// que porta el filtro de disciplinas de lucha). Aquí solo se traducen los tokens OSM
// a etiquetas en español, se compone la descripción por plantilla y se calcula la
// distancia al centro buscado.

export type Gym = {
  id: string;
  lat: number;
  lon: number;
  name: string;
  sports: string[];
  address: string | null;
  city: string | null;
  description: string | null;
  website: string | null;
  phone: string | null;
  distanceKm: number;
};

// Token OSM del tag `sport` → etiqueta en español para los chips. Incluye
// sinónimos y tokens en español muy usados en OSM España (boxeo, mma, k1…) y las
// variantes reales de BJJ (jiu-jitsu con guion / jiu_jitsu). Varios tokens pueden
// mapear a la misma etiqueta (sportLabels deduplica). Espeja MARTIAL_TOKENS del
// scraper gyms_osm.py.
const SPORT_LABELS: Record<string, string> = {
  martial_arts: "Artes marciales",
  boxing: "Boxeo",
  boxeo: "Boxeo",
  mixed_martial_arts: "MMA",
  mma: "MMA",
  artes_marciales_mixtas: "MMA",
  muay_thai: "Muay Thai",
  thai_boxing: "Muay Thai",
  brazilian_jiu_jitsu: "BJJ",
  "jiu-jitsu": "BJJ",
  jiu_jitsu: "BJJ",
  bjj: "BJJ",
  kickboxing: "Kickboxing",
  kick_boxing: "Kickboxing",
  k1: "K-1",
  judo: "Judo",
  karate: "Kárate",
  taekwondo: "Taekwondo",
  wrestling: "Lucha",
  sambo: "Sambo",
  grappling: "Grappling",
  kung_fu: "Kung-fu",
  aikido: "Aikido",
  krav_maga: "Krav Magá",
  defensa_personal: "Defensa personal",
};

export function parseSportTokens(sport: string | undefined): string[] {
  if (!sport) return [];
  return sport
    .toLowerCase()
    .split(/[;,\s]+/)
    .map((token) => token.trim())
    .filter(Boolean);
}

export function sportLabels(sport: string | undefined): string[] {
  const labels: string[] = [];
  for (const token of parseSportTokens(sport)) {
    const label = SPORT_LABELS[token];
    if (label && !labels.includes(label)) labels.push(label);
  }
  return labels;
}

// Para la frase de descripción: los acrónimos (MMA, BJJ, K-1) se mantienen en
// mayúsculas; el resto va en minúscula ("Boxeo" → "boxeo", "Muay Thai" → "muay thai").
function descriptionLabel(label: string): string {
  return /^[A-Z0-9-]+$/.test(label) ? label : label.toLowerCase();
}

// Descripción DETERMINISTA por plantilla (decisión del dueño: OSM apenas trae
// `description`, ~6%). Ej.: ["Boxeo","Muay Thai"] + "Madrid" → "Gimnasio de boxeo
// y muay thai en Madrid." Sin disciplinas devuelve null (no se inventa nada).
export function gymDescription(sports: string[], city: string | null): string | null {
  if (!sports.length) return null;
  const parts = sports.map(descriptionLabel);
  const joined =
    parts.length === 1
      ? parts[0]
      : `${parts.slice(0, -1).join(", ")} y ${parts[parts.length - 1]}`;
  return `Gimnasio de ${joined}${city ? ` en ${city}` : ""}.`;
}

export function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const earthRadiusKm = 6371;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * earthRadiusKm * Math.asin(Math.sqrt(a));
}

export function formatDistance(distanceKm: number): string {
  if (distanceKm < 1) return `a ${Math.round(distanceKm * 1000)} m`;
  const rounded = Math.round(distanceKm * 10) / 10;
  return `a ${rounded.toLocaleString("es-ES", { maximumFractionDigits: 1 })} km`;
}
