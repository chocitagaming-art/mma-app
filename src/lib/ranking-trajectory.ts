import { formatDivision } from "@/lib/format";
import type { FighterRankingHistoryEntry } from "@/lib/types";

// Un punto de la trayectoria. `position` es la posición YA normalizada para
// dibujar: el campeón se trata como 0 (la cima del eje), por encima del #1.
export type TrajectoryPoint = {
  date: string;
  position: number;
  isChampion: boolean;
};

// Una serie = la trayectoria del luchador dentro de una división, con su color.
export type DivisionSeries = {
  division: string; // slug crudo
  label: string; // etiqueta en español
  colorVar: string; // p.ej. "var(--chart-1)"
  points: TrajectoryPoint[];
};

export type RankingTrajectory = {
  series: DivisionSeries[];
  dates: string[]; // fechas únicas ordenadas (dominio del eje X)
  minPosition: number; // mejor posición alcanzada (0 = campeón) → cima del eje
  maxPosition: number; // peor posición → base del eje
};

const SERIES_COLORS = [
  "var(--chart-1)",
  "var(--chart-2)",
  "var(--chart-3)",
  "var(--chart-4)",
  "var(--chart-5)",
];

// Convierte las filas crudas del historial en series por división, listas para
// dibujar. El orden de las series (y por tanto sus colores) es estable y no
// depende del orden de entrada: ordenamos por fecha y, a igualdad, por slug.
export function buildRankingTrajectory(
  rows: FighterRankingHistoryEntry[],
): RankingTrajectory {
  const sorted = [...rows].sort((a, b) => {
    if (a.snapshotDate !== b.snapshotDate) {
      return a.snapshotDate < b.snapshotDate ? -1 : 1;
    }
    if (a.division !== b.division) {
      return a.division < b.division ? -1 : 1;
    }
    return 0;
  });

  const byDivision = new Map<string, TrajectoryPoint[]>();
  for (const r of sorted) {
    const points = byDivision.get(r.division) ?? [];
    points.push({
      date: r.snapshotDate,
      position: r.isChampion ? 0 : r.rankPosition,
      isChampion: r.isChampion,
    });
    byDivision.set(r.division, points);
  }

  const series: DivisionSeries[] = [...byDivision.entries()].map(
    ([division, points], index) => ({
      division,
      label: formatDivision(division),
      colorVar: SERIES_COLORS[index % SERIES_COLORS.length],
      points,
    }),
  );

  const dates = [...new Set(sorted.map((r) => r.snapshotDate))];
  const positions = sorted.map((r) => (r.isChampion ? 0 : r.rankPosition));
  const minPosition = positions.length ? Math.min(...positions) : 0;
  const maxPosition = positions.length ? Math.max(...positions) : 0;

  return { series, dates, minPosition, maxPosition };
}

// Posición horizontal de la fecha en el índice `index` de `count` fechas. Con una
// sola fecha (count <= 1) el punto se centra en el área de dibujo.
export function scaleX(
  index: number,
  count: number,
  left: number,
  width: number,
): number {
  if (count <= 1) {
    return left + width / 2;
  }
  return left + (width * index) / (count - 1);
}

// Posición vertical de una posición de ranking. Eje INVERTIDO: la mejor posición
// (minPosition, p.ej. el campeón en 0) se mapea a `top` (arriba). Si todo el
// rango es una sola posición, se centra.
export function scaleY(
  position: number,
  minPosition: number,
  maxPosition: number,
  top: number,
  height: number,
): number {
  if (maxPosition === minPosition) {
    return top + height / 2;
  }
  return top + (height * (position - minPosition)) / (maxPosition - minPosition);
}
