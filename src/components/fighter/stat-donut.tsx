import { PREMIUM_TILE } from "@/components/fighter/premium-tile";
import { clampFraction, donutArc, donutRing } from "@/lib/svg-donut";

type StatDonutProps = {
  label: string;
  value: number; // 0..1
  helper?: string;
  colorVar?: string; // CSS var string, e.g. "var(--chart-1)"
};

// Server-rendered SVG donut (no recharts in the client bundle). Mirrors a
// recharts <PieChart> of 112x112 (h-28 w-28) with its default 5px margin:
// outer radius = (112 - 2*5) / 2 = 51, inner = 72% of it.
const SIZE = 112;
const CENTER = SIZE / 2;
const OUTER_RADIUS = (SIZE - 10) / 2;
const INNER_RADIUS = OUTER_RADIUS * 0.72;

const RING = donutRing(INNER_RADIUS, OUTER_RADIUS);

export function StatDonut({
  label,
  value,
  helper,
  colorVar = "var(--chart-1)",
}: StatDonutProps) {
  const pct = clampFraction(value);
  const arc = donutArc(pct, RING.circumference);

  return (
    <div className={`flex flex-col items-center gap-3 p-4 ${PREMIUM_TILE}`}>
      <div className="relative h-28 w-28">
        <svg viewBox={`0 0 ${SIZE} ${SIZE}`} className="h-full w-full">
          <g
            fill="none"
            strokeWidth={RING.strokeWidth}
            transform={`rotate(-90 ${CENTER} ${CENTER})`}
          >
            <circle cx={CENTER} cy={CENTER} r={RING.radius} stroke="var(--border)" />
            <circle
              cx={CENTER}
              cy={CENTER}
              r={RING.radius}
              stroke={colorVar}
              strokeDasharray={arc.dashArray}
              strokeDashoffset={arc.dashOffset}
            />
          </g>
        </svg>
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <span className="tabular font-display text-2xl font-extrabold leading-none text-foreground">
            {Math.round(pct * 100)}%
          </span>
        </div>
      </div>
      <p className="text-center font-mono text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
        {label}
      </p>
      {helper ? (
        <p className="tabular text-center text-xs text-muted-foreground">{helper}</p>
      ) : null}
    </div>
  );
}
