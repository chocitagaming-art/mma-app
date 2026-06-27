import { PREMIUM_TILE } from "@/components/fighter/premium-tile";
import { donutRing, donutSegments } from "@/lib/svg-donut";
import type { FighterWinMethods } from "@/lib/types";

const SLICES = [
  { key: "koTko", label: "KO/TKO", color: "var(--chart-1)" },
  { key: "submission", label: "Sumisión", color: "var(--chart-2)" },
  { key: "decision", label: "Decisión", color: "var(--chart-3)" },
  { key: "other", label: "Otro", color: "var(--chart-5)" },
] as const;

// Server-rendered SVG donut (no recharts in the client bundle). Mirrors a
// recharts <PieChart> of 128x128 (h-32 w-32) with its default 5px margin:
// outer radius = (128 - 2*5) / 2 = 59, inner = 60% of it.
const SIZE = 128;
const CENTER = SIZE / 2;
const OUTER_RADIUS = (SIZE - 10) / 2;
const INNER_RADIUS = OUTER_RADIUS * 0.6;

const RING = donutRing(INNER_RADIUS, OUTER_RADIUS);

export function WinMethodChart({ methods }: { methods: FighterWinMethods }) {
  const data = SLICES.map((slice) => ({
    ...slice,
    value: methods[slice.key],
  })).filter((slice) => slice.value > 0);

  const segments = donutSegments(
    data.map((slice) => slice.value),
    RING.circumference,
  );

  return (
    <div className={`p-5 ${PREMIUM_TILE}`}>
      <p className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
        Victorias por método
      </p>
      <div className="mt-4 flex items-center gap-6">
        <div className="relative h-32 w-32 shrink-0">
          <svg viewBox={`0 0 ${SIZE} ${SIZE}`} className="h-full w-full">
            <g
              fill="none"
              strokeWidth={RING.strokeWidth}
              transform={`rotate(-90 ${CENTER} ${CENTER})`}
            >
              {data.map((slice, index) => (
                <circle
                  key={slice.key}
                  cx={CENTER}
                  cy={CENTER}
                  r={RING.radius}
                  stroke={slice.color}
                  strokeDasharray={segments[index].dashArray}
                  strokeDashoffset={segments[index].dashOffset}
                />
              ))}
            </g>
          </svg>
          <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
            <span className="tabular font-display text-3xl font-extrabold leading-none text-foreground">
              {methods.total}
            </span>
            <span className="font-mono text-[10px] uppercase tracking-wide text-muted-foreground">
              victorias
            </span>
          </div>
        </div>
        <ul className="flex-1 space-y-2">
          {data.map((slice) => (
            <li key={slice.key} className="flex items-center gap-2.5 text-sm">
              <span
                className="size-3 shrink-0 rounded-sm"
                style={{ backgroundColor: slice.color }}
              />
              <span className="text-muted-foreground">{slice.label}</span>
              <span className="tabular ml-auto font-semibold text-foreground">
                {slice.value}
              </span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
