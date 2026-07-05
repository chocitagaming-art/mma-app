// Headshots conseguidos a mano para luchadores que el enrichment de ESPN no resuelve
// (p.ej. atletas que ESPN solo lista en otro deporte). Se sirven desde /public y se usan
// SOLO como fallback cuando la BD no tiene headshot_url, así que no pisan el dato real:
// si algún día el backend consigue la foto oficial, esa tiene prioridad.
// Clave: nombre normalizado (trim + minúsculas).
const LOCAL_HEADSHOTS: Record<string, string> = {
  "josh hokit": "/fighters/josh-hokit.avif",
  // Debutantes de eventos próximos sin foto oficial en UFC/ESPN (fuente: Tapology).
  "farman hasanov": "/fighters/farman-hasanov.jpg",
  "vlasto čepo": "/fighters/vlasto-cepo.jpg",
  "michael aswell jr.": "/fighters/michael-aswell-jr.jpg",
  "michael aswell jr": "/fighters/michael-aswell-jr.jpg",
  "magomed tuchalov": "/fighters/magomed-tuchalov.png",
  "jovan leka": "/fighters/jovan-leka.jpg",
  "gable steveson": "/fighters/gable-steveson.webp",
  "jefferson nascimento": "/fighters/jefferson-nascimento.jpg",
  "tahir abdullayev": "/fighters/tahir-abdullayev.png",
  "theodor berggren": "/fighters/theodor-berggren.jpg",
};

// Overrides de headshot con PRIORIDAD sobre la BD (espejo de local-bodies): para
// curar cabezas ausentes o de baja calidad, p.ej. sustituir el headshot B/N de
// una leyenda por una foto en color. A diferencia de LOCAL_HEADSHOTS (solo
// fallback), estas pisan el headshot_url de la BD.
const LOCAL_HEADSHOT_OVERRIDES: Record<string, string> = {
  // Forrest Griffin: en BD solo está su headshot 2012 en blanco y negro; foto en
  // color provista por el dueño, optimizada a webp.
  "forrest griffin": "/fighters/forrest-griffin.webp",
};

export function localHeadshot(name: string): string | null {
  return LOCAL_HEADSHOTS[name.trim().toLowerCase()] ?? null;
}

export function localHeadshotOverride(name: string): string | null {
  return LOCAL_HEADSHOT_OVERRIDES[name.trim().toLowerCase()] ?? null;
}
