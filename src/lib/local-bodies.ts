// Fotos de cuerpo entero curadas a mano para luchadores cuya foto oficial falta
// o es de baja calidad (p.ej. leyendas del Salón de la Fama sin full_body_url en
// la BD, o con un recorte que se ve pequeño/borroso). A diferencia de
// local-headshots (solo fallback), estas tienen PRIORIDAD sobre la BD: la
// intención aquí es CURAR/reemplazar imágenes ausentes o malas.
// Se sirven desde /public. Clave: nombre normalizado (trim + minúsculas).

// Encuadre explícito del recorte, para no inferirlo del nombre de la URL:
// - "cover-top": recorte cabeza-muslo (medio cuerpo); ancla arriba y llena el
//   marco (recorta laterales, no la cara). Igual que athlete_bio_full_body.
// - "contain-bottom": figura completa; se asienta en la base del marco.
export type BodyFit = "cover-top" | "contain-bottom";

export type LocalBody = {
  src: string;
  fit: BodyFit;
};

const LOCAL_BODIES: Record<string, LocalBody> = {
  // Forrest Griffin: la BD no tiene full_body_url ni standing_body_url, así que
  // su ficha caía al headshot (solo cabeza, B/N). Foto de cuerpo entero provista
  // por el dueño, optimizada a webp; figura completa → se asienta en la base.
  "forrest griffin": { src: "/fighters/forrest-griffin-body.webp", fit: "contain-bottom" },
};

export function localBody(name: string): LocalBody | null {
  return LOCAL_BODIES[name.trim().toLowerCase()] ?? null;
}
