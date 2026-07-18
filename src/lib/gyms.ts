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
  city: string | null;
  description: string | null;
  website: string | null;
  phone: string | null;
  distanceKm: number;
};

// Token OSM del tag `sport` → etiqueta en español para los chips. Incluye
// sinónimos y tokens en español muy usados en OSM España (boxeo, mma, k1…) y las
// variantes reales de BJJ (jiu-jitsu con guion / jiu_jitsu), que antes se perdían.
// Varios tokens pueden mapear a la misma etiqueta (sportLabels deduplica).
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

const MARTIAL_SPORT_TOKENS = Object.keys(SPORT_LABELS);

// Conjunto para comprobar rápido si un gimnasio tiene alguna disciplina de lucha.
const COMBAT_TOKENS = new Set(MARTIAL_SPORT_TOKENS);

// Regex Overpass anclada por token: `sport` es una lista separada por `;`
// (a veces con espacios), y sin anclas `boxing` matchearía dentro de otros
// valores. El post-filtro de abajo sigue siendo necesario porque un
// `sport=fitness;boxing` de una cadena de fitness también matchea aquí.
export const OVERPASS_SPORT_REGEX = `(^|;| )(${MARTIAL_SPORT_TOKENS.join("|")})( |;|$)`;

// Cadenas de gimnasios fitness que etiquetan `boxing`/`martial_arts` en OSM
// pero no son gimnasios de lucha. `metropolitan\b` no matchea "Metropolitano"
// (clubs de lucha legítimos con ese nombre) — solo la cadena "Metropolitan".
const FITNESS_CHAIN_RE =
  /basic.?fit|mcfit|anytime|smart.?fit|vivagym|synergym|altafit|holmes|metropolitan\b|fitboxing/i;

export function parseSportTokens(sport: string | undefined): string[] {
  if (!sport) return [];
  // Separador OSM canónico es ';', pero hay datos reales con espacios/comas
  // ("fitness boxing") — la regex Overpass anclada también los acepta, así que
  // el post-filtro debe trocear igual para no dejar pasar el token fitness.
  return sport
    .toLowerCase()
    .split(/[;,\s]+/)
    .map((token) => token.trim())
    .filter(Boolean);
}

// True si alguno de los tokens `sport` es una disciplina de lucha.
export function hasCombatDiscipline(sport: string | undefined): boolean {
  return parseSportTokens(sport).some((token) => COMBAT_TOKENS.has(token));
}

export function isExcludedGym(name: string, sport: string | undefined): boolean {
  // Cadenas de fitness conocidas por nombre → fuera siempre.
  if (FITNESS_CHAIN_RE.test(name)) return true;
  // Sobre-exclusión CORREGIDA: antes bastaba el token 'fitness' para descartar,
  // lo que mataba gimnasios de lucha legítimos etiquetados `fitness;boxing;mma`.
  // Ahora solo se excluye si NO hay ninguna disciplina de lucha (p. ej. `fitness`
  // a secas, o yoga/pilates como único contenido).
  if (!hasCombatDiscipline(sport)) return true;
  return false;
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

// OSM permite MULTIVALOR separado por ';' en phone/website; para un href solo
// sirve el primero (dos números concatenados forman un tel: inválido).
export function firstOsmValue(raw: string | undefined): string | null {
  const value = raw?.split(";")[0]?.trim();
  return value || null;
}

// OSM guarda a veces webs sin protocolo ("www.gym.es"); un href relativo
// rompería la navegación.
export function normalizeWebsite(raw: string | undefined): string | null {
  const value = firstOsmValue(raw);
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
  const sports = sportLabels(tags.sport);
  const city = tags["addr:city"] ?? null;
  return {
    id: `${element.type}/${element.id}`,
    lat,
    lon,
    name,
    sports,
    address: composeAddress(tags),
    city,
    description: gymDescription(sports, city),
    website: normalizeWebsite(tags.website ?? tags["contact:website"]),
    phone: firstOsmValue(tags.phone) ?? firstOsmValue(tags["contact:phone"]),
    distanceKm: Math.round(haversineKm(center[0], center[1], lat, lon) * 100) / 100,
  };
}

// El mismo gimnasio puede venir mapeado DOS veces en OSM (un node dentro del
// edificio y el way del edificio, ambos con sport=*): además del id, se
// deduplica por nombre normalizado + celda de coordenadas (~110 m).
export function dedupeGyms(gyms: Gym[]): Gym[] {
  const seenIds = new Set<string>();
  const seenNameCells = new Set<string>();
  const result: Gym[] = [];
  for (const gym of gyms) {
    const nameCell = `${gym.name.trim().toLowerCase()}|${gym.lat.toFixed(3)}|${gym.lon.toFixed(3)}`;
    if (seenIds.has(gym.id) || seenNameCells.has(nameCell)) continue;
    seenIds.add(gym.id);
    seenNameCells.add(nameCell);
    result.push(gym);
  }
  return result;
}
