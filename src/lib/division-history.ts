import { formatWeightClass } from "@/lib/format";
import type { FighterHistoryItem } from "@/lib/types";

// Helper puro para las divisiones históricas de la ficha (BE10). Sin
// dependencias de Next/DB para poder testearlo aislado (como fighter-form).

// Basta con fecha + categoría: permite testear sin fabricar historiales enteros.
export type DivisionHistoryInput = Pick<
  FighterHistoryItem,
  "eventDate" | "weightClass"
>;

// Paso de un luchador por una división, colapsando idas-y-vueltas: una entrada
// por división con el año de su primera y última pelea en ella. `to` es null
// SOLO para la división de la pelea más reciente (etapa "abierta").
export type DivisionStint = {
  division: string; // etiqueta en español (formatWeightClass)
  from: number; // año de la primera pelea en la división
  to: number | null; // año de la última; null = división actual
  fights: number;
};

// eventDate a Date UTC. node-postgres entrega las columnas DATE como objeto
// Date en runtime aunque el tipo declare string, así que se aceptan ambos.
// null si falta o no es parseable (sin fecha no se puede ordenar).
function parseEventDate(eventDate: string | Date | null): Date | null {
  if (!eventDate) {
    return null;
  }
  if (eventDate instanceof Date) {
    return Number.isNaN(eventDate.getTime()) ? null : eventDate;
  }
  const date = new Date(`${eventDate.slice(0, 10)}T00:00:00Z`);
  return Number.isNaN(date.getTime()) ? null : date;
}

// Divisiones en las que ha peleado el luchador, ordenadas por primera
// aparición cronológica. Se ignoran las peleas sin weightClass, con categoría
// desconocida (formatWeightClass no la traduce) o sin fecha parseable.
export function computeDivisionHistory(
  history: DivisionHistoryInput[],
): DivisionStint[] {
  const normalized: { time: number; year: number; division: string }[] = [];

  for (const item of history) {
    if (!item.weightClass) {
      continue;
    }
    // Catchweight y open weight son acuerdos puntuales de peso, no divisiones
    // en las que el luchador "militó": no deben crear stints.
    if (/catch\s*weight|open\s*weight|openweight/i.test(item.weightClass)) {
      continue;
    }
    const division = formatWeightClass(item.weightClass);
    // formatWeightClass devuelve el texto original cuando no reconoce la
    // categoría: eso es "desconocida" y no debe crear una división fantasma.
    if (division === "—" || division === item.weightClass) {
      continue;
    }
    const date = parseEventDate(item.eventDate);
    if (!date) {
      continue;
    }
    normalized.push({
      time: date.getTime(),
      year: date.getUTCFullYear(),
      division,
    });
  }

  if (normalized.length === 0) {
    return [];
  }

  // Orden cronológico ascendente (el historial de la ficha llega descendente).
  normalized.sort((a, b) => a.time - b.time);

  const byDivision = new Map<string, DivisionStint>();
  for (const item of normalized) {
    const existing = byDivision.get(item.division);
    if (existing) {
      existing.to = item.year;
      existing.fights += 1;
    } else {
      // Map conserva el orden de inserción = orden de primera aparición.
      byDivision.set(item.division, {
        division: item.division,
        from: item.year,
        to: item.year,
        fights: 1,
      });
    }
  }

  const stints = [...byDivision.values()];
  // La división de la pelea MÁS RECIENTE queda "abierta" (to: null).
  const currentDivision = normalized[normalized.length - 1].division;
  for (const stint of stints) {
    if (stint.division === currentDivision) {
      stint.to = null;
    }
  }

  return stints;
}

// "Pluma 2020-23", "Ligero 2023-", "Wélter 2019"... Etiqueta compacta para la
// fila bio: sin el prefijo "Peso " y con el año final en 2 dígitos si comparte
// siglo con el inicial.
export function formatDivisionStint(stint: DivisionStint): string {
  const shortDivision = stint.division.replace(/^Peso /u, "");

  if (stint.to == null) {
    return `${shortDivision} ${stint.from}-`;
  }
  if (stint.to === stint.from) {
    return `${shortDivision} ${stint.from}`;
  }

  const sameCentury = Math.floor(stint.to / 100) === Math.floor(stint.from / 100);
  const toLabel = sameCentury
    ? String(stint.to % 100).padStart(2, "0")
    : String(stint.to);
  return `${shortDivision} ${stint.from}-${toLabel}`;
}
