// Elección de la foto de cuerpo entero (Ronda B). Dos cadenas de prioridad:
// - "standing-first" (combates y /enfrentamiento): standing_body_url (foto de
//   pie recortada) → full_body_url → null (el componente cae al headshot).
// - "full-first" (ficha del luchador): full_body_url PRIMERO —la ficha aprobada
//   no cambia de foto— y standing solo como respaldo si falta la full body.
export type BodyPhotoPreference = "standing-first" | "full-first";

export function pickBodyPhotoUrl(
  preference: BodyPhotoPreference,
  standingBodyUrl: string | null | undefined,
  fullBodyUrl: string | null | undefined,
): string | null {
  const standing = standingBodyUrl ?? null;
  const full = fullBodyUrl ?? null;

  return preference === "standing-first" ? (standing ?? full) : (full ?? standing);
}

// --- F1 Tanda 4: espejo DEFINITIVO del cara a cara ---------------------------
// La foto standing de ufc.com mira a un lado según la ESQUINA en la que el
// luchador combatió (token en la URL): roja -> _L_ (mira a la DERECHA), azul ->
// _R_ (mira a la IZQUIERDA). Guardamos cada dirección por separado (migración
// 019); en el cara a cara cada esquina elige la suya para que los dos SE MIREN.
export type Corner = "red" | "blue";

// Dirección a la que mira una URL standing, según su token _L_/_R_.
function standingToken(url: string | null | undefined): "L" | "R" | null {
  if (!url) return null;
  const match = url.match(/_([LR])_\d/);
  return match ? (match[1] as "L" | "R") : null;
}

export type CornerPhoto = { url: string | null; mirror: boolean };

// Elige la foto de cuerpo correctamente orientada para una esquina del cara a
// cara. La roja quiere la variante _L_ (mira a la derecha, hacia el centro); la
// azul quiere la _R_. Prioridad (máxima info, sin degradar la pareja):
//   1. standing de la dirección exacta -> facing y logo correctos (sin espejo).
//   2. standing de la dirección opuesta ESPEJADA -> facing correcto, logo
//      invertido (último recurso mientras falte esa dirección).
//   3. standing legada (columna única) -> espejo si su token mira al lado malo.
//   4. full body (ficha bio) -> mismo trato por token.
// Devuelve { url, mirror }. mirror=true => aplicar scaleX(-1) a la imagen.
export function pickCornerBodyPhoto(
  corner: Corner,
  opts: {
    standingL?: string | null;
    standingR?: string | null;
    standing?: string | null;
    fullBody?: string | null;
  },
): CornerPhoto {
  const want: "L" | "R" = corner === "red" ? "L" : "R";
  const l = opts.standingL ?? null;
  const r = opts.standingR ?? null;

  const exact = want === "L" ? l : r;
  if (exact) return { url: exact, mirror: false };

  const opposite = want === "L" ? r : l;
  if (opposite) return { url: opposite, mirror: true };

  const legacy = opts.standing ?? null;
  if (legacy) {
    const token = standingToken(legacy);
    return { url: legacy, mirror: token != null && token !== want };
  }

  const full = opts.fullBody ?? null;
  if (full) {
    const token = standingToken(full);
    return { url: full, mirror: token != null && token !== want };
  }

  return { url: null, mirror: false };
}
