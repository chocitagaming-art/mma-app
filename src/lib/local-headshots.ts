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
};

export function localHeadshot(name: string): string | null {
  return LOCAL_HEADSHOTS[name.trim().toLowerCase()] ?? null;
}
