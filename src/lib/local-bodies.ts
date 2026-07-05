// Fotos de cuerpo entero curadas a mano para luchadores cuya foto oficial falta
// o es de baja calidad (p.ej. leyendas del Salón de la Fama sin full_body_url en
// la BD, o con un recorte que se ve pequeño/borroso). A diferencia de
// local-headshots (solo fallback), estas tienen PRIORIDAD sobre la BD: la
// intención aquí es CURAR/reemplazar imágenes ausentes o malas.
// Se sirven desde /public. Clave: nombre normalizado (trim + minúsculas).
const LOCAL_BODIES: Record<string, string> = {
  // Forrest Griffin: la BD no tiene full_body_url ni standing_body_url, así que
  // su ficha caía al headshot (solo cabeza, B/N). Foto de cuerpo entero provista
  // por el dueño, optimizada a webp.
  "forrest griffin": "/fighters/forrest-griffin-body.webp",
};

export function localBody(name: string): string | null {
  return LOCAL_BODIES[name.trim().toLowerCase()] ?? null;
}
