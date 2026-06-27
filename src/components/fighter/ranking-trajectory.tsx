import { PREMIUM_TILE } from "@/components/fighter/premium-tile";
import {
  buildRankingTrajectory,
  scaleX,
  scaleY,
} from "@/lib/ranking-trajectory";
import type { FighterRankingHistoryEntry } from "@/lib/types";

// Line chart estático (renderizado en servidor, sin recharts). Eje X = fecha de
// snapshot; eje Y = posición con el #1 ARRIBA (invertido) y el campeón en la cima.
const WIDTH = 760;
const HEIGHT = 300;
const PAD = { top: 20, right: 20, bottom: 36, left: 46 };
const PLOT_LEFT = PAD.left;
const PLOT_RIGHT = WIDTH - PAD.right;
const PLOT_TOP = PAD.top;
const PLOT_WIDTH = PLOT_RIGHT - PLOT_LEFT;
const PLOT_HEIGHT = HEIGHT - PAD.bottom - PAD.top;

function formatAxisDate(date: string): string {
  const d = new Date(`${date.slice(0, 10)}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) {
    return date;
  }
  return new Intl.DateTimeFormat("es", {
    month: "short",
    year: "2-digit",
    timeZone: "UTC",
  }).format(d);
}

function positionLabel(position: number, isChampion: boolean): string {
  return isChampion || position === 0 ? "Campeón" : `#${position}`;
}

// Ticks enteros del eje Y (posiciones), ~5 como mucho, incluyendo siempre los extremos.
function yTickValues(min: number, max: number): number[] {
  if (min === max) {
    return [min];
  }
  const step = Math.max(1, Math.ceil((max - min) / 4));
  const values: number[] = [];
  for (let p = min; p <= max; p += step) {
    values.push(p);
  }
  if (values[values.length - 1] !== max) {
    values.push(max);
  }
  return values;
}

// Subconjunto de índices de fecha para etiquetar el eje X sin saturarlo.
function xTickIndices(count: number, maxTicks = 6): number[] {
  if (count <= 1) {
    return count === 1 ? [0] : [];
  }
  const ticks = Math.min(maxTicks, count);
  const indices = Array.from({ length: ticks }, (_, i) =>
    Math.round((i * (count - 1)) / (ticks - 1)),
  );
  return [...new Set(indices)];
}

type RankingTrajectoryProps = {
  history: FighterRankingHistoryEntry[];
};

export function RankingTrajectory({ history }: RankingTrajectoryProps) {
  const { series, dates, minPosition, maxPosition } =
    buildRankingTrajectory(history);

  if (series.length === 0) {
    return null;
  }

  const count = dates.length;
  const dateIndex = new Map(dates.map((d, i) => [d, i]));
  const yTicks = yTickValues(minPosition, maxPosition);
  const xTicks = xTickIndices(count);

  const laidOut = series.map((s) => {
    const points = s.points.map((p) => ({
      ...p,
      x: scaleX(dateIndex.get(p.date) ?? 0, count, PLOT_LEFT, PLOT_WIDTH),
      y: scaleY(p.position, minPosition, maxPosition, PLOT_TOP, PLOT_HEIGHT),
    }));
    return {
      ...s,
      laidOutPoints: points,
      polyline: points.map((p) => `${p.x},${p.y}`).join(" "),
    };
  });

  const range =
    count > 1
      ? `desde ${formatAxisDate(dates[0])} hasta ${formatAxisDate(dates[count - 1])}`
      : `en ${formatAxisDate(dates[0])}`;
  const ariaLabel = `Trayectoria de ranking ${range}, por división: ${series
    .map((s) => s.label)
    .join(", ")}.`;

  return (
    <div className={`${PREMIUM_TILE} p-5`}>
      <svg
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        className="h-auto w-full"
        role="img"
        aria-label={ariaLabel}
      >
        <title>{ariaLabel}</title>

        {yTicks.map((pos) => {
          const y = scaleY(pos, minPosition, maxPosition, PLOT_TOP, PLOT_HEIGHT);
          return (
            <g key={`y-${pos}`}>
              <line
                x1={PLOT_LEFT}
                y1={y}
                x2={PLOT_RIGHT}
                y2={y}
                stroke="var(--border)"
                strokeWidth={1}
                strokeDasharray="2 4"
              />
              <text
                x={PLOT_LEFT - 8}
                y={y}
                textAnchor="end"
                dominantBaseline="middle"
                fill="var(--muted-foreground)"
                fontSize={11}
                className="font-mono"
              >
                {pos === 0 ? "Camp." : `#${pos}`}
              </text>
            </g>
          );
        })}

        {xTicks.map((i) => (
          <text
            key={`x-${i}`}
            x={scaleX(i, count, PLOT_LEFT, PLOT_WIDTH)}
            y={HEIGHT - PAD.bottom + 18}
            textAnchor="middle"
            fill="var(--muted-foreground)"
            fontSize={11}
            className="font-mono"
          >
            {formatAxisDate(dates[i])}
          </text>
        ))}

        {laidOut.map((s) => (
          <g key={s.division}>
            {s.laidOutPoints.length > 1 ? (
              <polyline
                points={s.polyline}
                fill="none"
                stroke={s.colorVar}
                strokeWidth={2}
                strokeLinejoin="round"
                strokeLinecap="round"
              />
            ) : null}
            {s.laidOutPoints.map((p, idx) => (
              <circle
                key={`${s.division}-${idx}`}
                cx={p.x}
                cy={p.y}
                r={p.isChampion ? 4.5 : 3}
                fill={s.colorVar}
                stroke={p.isChampion ? "var(--background)" : "none"}
                strokeWidth={p.isChampion ? 1.5 : 0}
              >
                <title>{`${s.label} — ${positionLabel(p.position, p.isChampion)} (${formatAxisDate(p.date)})`}</title>
              </circle>
            ))}
          </g>
        ))}
      </svg>

      <ul className="mt-3 flex flex-wrap gap-x-5 gap-y-2">
        {series.map((s) => (
          <li key={s.division} className="flex items-center gap-2">
            <span
              className="inline-block h-2.5 w-2.5 rounded-full"
              style={{ backgroundColor: s.colorVar }}
              aria-hidden
            />
            <span className="text-xs font-medium text-muted-foreground">
              {s.label}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
