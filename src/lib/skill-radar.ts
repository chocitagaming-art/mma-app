// Radar de habilidades (pentágono 5 ejes) del tale-of-the-tape. Helpers puros
// de geometría y tipos, sin dependencias de Next/DB para poder testearlos
// aislados (mismo patrón que svg-donut.ts / division-history.ts).

export type SkillAxes = {
  striking: number;
  grappling: number;
  defense: number;
  experience: number;
  cardio: number;
};

// Orden fijo de los ejes en el pentágono (índice 0 arriba, sentido horario).
// Las etiquetas Striking/Grappling se quedan en inglés (términos MMA de uso
// corriente); el resto en español, según la maqueta aprobada por el dueño.
export const SKILL_AXES: { key: keyof SkillAxes; label: string }[] = [
  { key: "striking", label: "Striking" },
  { key: "grappling", label: "Grappling" },
  { key: "defense", label: "Defensa" },
  { key: "experience", label: "Experiencia" },
  { key: "cardio", label: "Cardio" },
];

export type FightSkillRadar = {
  red: SkillAxes | null;
  blue: SkillAxes | null;
  // Etiqueta en español de la división de referencia de los percentiles
  // (null si ningún luchador tiene datos).
  divisionLabel: string | null;
};

// Slug canónico de división -> etiqueta en español (las mismas divisiones que
// normaliza la query de percentiles; ver queries/skill-radar.ts).
export const SKILL_DIVISION_LABELS: Record<string, string> = {
  strawweight: "Peso paja",
  flyweight: "Peso mosca",
  bantamweight: "Peso gallo",
  featherweight: "Peso pluma",
  lightweight: "Peso ligero",
  welterweight: "Peso wélter",
  middleweight: "Peso medio",
  "light-heavyweight": "Peso semipesado",
  heavyweight: "Peso pesado",
  "womens-strawweight": "Peso paja femenino",
  "womens-flyweight": "Peso mosca femenino",
  "womens-bantamweight": "Peso gallo femenino",
  "womens-featherweight": "Peso pluma femenino",
};

export type SkillRadarEntry = {
  fighterId: number;
  division: string;
  axes: SkillAxes;
};

// Punto de un valor 0-100 sobre el eje `index` de un radar de `total` ejes.
// El eje 0 apunta hacia arriba (-90°) y el resto sigue en sentido horario.
export function radarPoint(
  index: number,
  total: number,
  value: number,
  cx: number,
  cy: number,
  radius: number,
): { x: number; y: number } {
  const angle = -Math.PI / 2 + (2 * Math.PI * index) / total;
  const r = (radius * clampValue(value)) / 100;
  return { x: cx + r * Math.cos(angle), y: cy + r * Math.sin(angle) };
}

// Punto sobre el eje `index` a un radio ABSOLUTO en px, SIN clamp: para
// etiquetas y radios de la rejilla que viven fuera del pentágono de valores.
export function radarAxisPoint(
  index: number,
  total: number,
  cx: number,
  cy: number,
  r: number,
): { x: number; y: number } {
  const angle = -Math.PI / 2 + (2 * Math.PI * index) / total;
  return { x: cx + r * Math.cos(angle), y: cy + r * Math.sin(angle) };
}

// Atributo `points` del <polygon> de una serie completa.
export function radarPolygonPoints(
  values: number[],
  cx: number,
  cy: number,
  radius: number,
): string {
  return values
    .map((value, index) => {
      const { x, y } = radarPoint(index, values.length, value, cx, cy, radius);
      return `${round2(x)},${round2(y)}`;
    })
    .join(" ");
}

// Valores fuera de 0-100 (datos corruptos) se acotan para no romper el dibujo.
export function clampValue(value: number): number {
  if (Number.isNaN(value)) {
    return 0;
  }
  return Math.max(0, Math.min(100, value));
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

// Une las entradas cacheadas de percentiles con las dos esquinas de la pelea.
// Esquina TBD (id null) o luchador sin entrada (menos de 3 peleas cronometradas,
// división no mapeable) -> null en ese lado.
export function buildFightRadar(
  entries: SkillRadarEntry[],
  redId: number | null,
  blueId: number | null,
): FightSkillRadar {
  const byId = new Map(entries.map((entry) => [entry.fighterId, entry]));
  const red = redId != null ? (byId.get(redId) ?? null) : null;
  const blue = blueId != null ? (byId.get(blueId) ?? null) : null;

  // Cada luchador puntúa contra SU división (la de su última pelea): la
  // etiqueta única solo es veraz si todos los lados con datos coinciden; si
  // difieren (subida de división, catchweight) la UI cae a "su división".
  const division =
    red && blue
      ? red.division === blue.division
        ? red.division
        : null
      : (red?.division ?? blue?.division ?? null);

  return {
    red: red?.axes ?? null,
    blue: blue?.axes ?? null,
    divisionLabel: division ? (SKILL_DIVISION_LABELS[division] ?? null) : null,
  };
}
