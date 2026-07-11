// Helpers puros del buscador de gimnasios (/gimnasios): filtro de disciplinas
// de lucha sobre datos de OpenStreetMap/Overpass, composición de dirección desde
// tags addr:* reales (nunca inventada) y distancia haversine al centro buscado.

export type GymTags = Record<string, string>;

export type OverpassElement = {
  type: string;
  id: number;
  lat?: number;
  lon?: number;
  center?: { lat: number; lon: number };
  tags?: GymTags;
};

export type Gym = {
  id: string;
  lat: number;
  lon: number;
  name: string;
  sports: string[];
  address: string | null;
  website: string | null;
  phone: string | null;
  distanceKm: number;
};

// Token OSM del tag `sport` → etiqueta en español para los chips.
const SPORT_LABELS: Record<string, string> = {
  martial_arts: "Artes marciales",
  boxing: "Boxeo",
  mixed_martial_arts: "MMA",
  muay_thai: "Muay Thai",
  brazilian_jiu_jitsu: "BJJ",
  kickboxing: "Kickboxing",
  judo: "Judo",
  karate: "Kárate",
  taekwondo: "Taekwondo",
  wrestling: "Lucha",
  sambo: "Sambo",
  grappling: "Grappling",
  aikido: "Aikido",
  krav_maga: "Krav Magá",
};

const MARTIAL_SPORT_TOKENS = Object.keys(SPORT_LABELS);

// Regex Overpass anclada por token: `sport` es una lista separada por `;`
// (a veces con espacios), y sin anclas `boxing` matchearía dentro de otros
// valores. El post-filtro de abajo sigue siendo necesario porque un
// `sport=fitness;boxing` de una cadena de fitness también matchea aquí.
export const OVERPASS_SPORT_REGEX = `(^|;| )(${MARTIAL_SPORT_TOKENS.join("|")})( |;|$)`;

// Cadenas de gimnasios fitness que etiquetan `boxing`/`martial_arts` en OSM
// pero no son gimnasios de lucha.
const FITNESS_CHAIN_RE =
  /basic.?fit|mcfit|anytime|smart.?fit|vivagym|synergym|altafit|holmes|metropolitan|fitboxing/i;

export function parseSportTokens(sport: string | undefined): string[] {
  if (!sport) return [];
  return sport
    .toLowerCase()
    .split(";")
    .map((token) => token.trim())
    .filter(Boolean);
}

export function isExcludedGym(name: string, sport: string | undefined): boolean {
  if (parseSportTokens(sport).includes("fitness")) return true;
  return FITNESS_CHAIN_RE.test(name);
}

export function sportLabels(sport: string | undefined): string[] {
  const labels: string[] = [];
  for (const token of parseSportTokens(sport)) {
    const label = SPORT_LABELS[token];
    if (label && !labels.includes(label)) labels.push(label);
  }
  return labels;
}

// Dirección SOLO desde tags addr:* reales; sin tags no se inventa nada.
export function composeAddress(tags: GymTags): string | null {
  const street = tags["addr:street"];
  const number = tags["addr:housenumber"];
  const postcode = tags["addr:postcode"];
  const city = tags["addr:city"];
  const streetLine = street ? (number ? `${street}, ${number}` : street) : null;
  const cityLine = [postcode, city].filter(Boolean).join(" ") || null;
  const parts = [streetLine, cityLine].filter(Boolean);
  return parts.length ? parts.join(", ") : null;
}

// OSM guarda a veces webs sin protocolo ("www.gym.es"); un href relativo
// rompería la navegación.
export function normalizeWebsite(raw: string | undefined): string | null {
  const value = raw?.trim();
  if (!value) return null;
  if (/^https?:\/\//i.test(value)) return value;
  return `https://${value}`;
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

export function buildGym(element: OverpassElement, center: [number, number]): Gym | null {
  const lat = element.lat ?? element.center?.lat;
  const lon = element.lon ?? element.center?.lon;
  const tags = element.tags ?? {};
  const name = tags.name;
  if (lat == null || lon == null || !name) return null;
  if (isExcludedGym(name, tags.sport)) return null;
  return {
    id: `${element.type}/${element.id}`,
    lat,
    lon,
    name,
    sports: sportLabels(tags.sport),
    address: composeAddress(tags),
    website: normalizeWebsite(tags.website ?? tags["contact:website"]),
    phone: tags.phone?.trim() || tags["contact:phone"]?.trim() || null,
    distanceKm: Math.round(haversineKm(center[0], center[1], lat, lon) * 100) / 100,
  };
}
