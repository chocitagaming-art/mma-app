// Siluetas oficiales de UFC como fallback de diseño para luchadores sin foto
// (pedido del dueño 11-jul: silueta en vez de iniciales). Las imágenes viven en
// /public/fighters (webp con alfa, descargadas de ufc.com y optimizadas), así el
// frontend NO depende de que el scraper guarde URLs de placeholder: la BD sigue
// limpia (el guard _is_placeholder_image de mma-ingesta las rechaza a propósito;
// ambos son complementarios).
export type FighterGender = "male" | "female";

// División/clase de peso femenina. Cubre los dos formatos que maneja la app:
// el texto de UFC ("Women's Flyweight", "Women's Flyweight Title Bout") y los
// slugs del backend de rankings ("womens_flyweight").
export function isWomensDivision(division: string | null | undefined): boolean {
  return /women/i.test(division ?? "");
}

// Luchadoras SIN pelea ni ranking enlazados en BD (la división no es inferible).
// Override curado, mismo patrón que local-headshots/local-bodies. Clave: nombre
// normalizado (trim + minúsculas).
const KNOWN_FEMALE_FIGHTERS = new Set<string>([
  // Debutante con la cartelera cambiada (0 peleas en BD); ufc.com la sirve con
  // la silueta femenina.
  "estefani almeida",
]);

// Género a efectos de silueta. Sin señal (sin división y fuera del override
// curado) cae a masculina, igual que hace ufc.com.
export function inferFighterGender(
  name: string,
  division?: string | null,
): FighterGender {
  if (isWomensDivision(division)) return "female";
  if (KNOWN_FEMALE_FIGHTERS.has(name.trim().toLowerCase())) return "female";
  return "male";
}

export function silhouetteHeadshot(gender: FighterGender): string {
  return gender === "female"
    ? "/fighters/silhouette-headshot-female.webp"
    : "/fighters/silhouette-headshot-male.webp";
}

export function silhouetteBody(gender: FighterGender): string {
  return gender === "female"
    ? "/fighters/silhouette-body-female.webp"
    : "/fighters/silhouette-body-male.webp";
}
