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
