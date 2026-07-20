import { PREMIUM_TILE } from "@/components/fighter/premium-tile";
import {
  ROUND_SECONDS,
  buildFightTimeline,
  decimateSamples,
  scaleSeconds,
  scaleValue,
  type CornerSeries,
  type FightTimelineSample,
} from "@/lib/fight-timeline";
import { selectMarkerIndices } from "@/lib/fight-timeline-markers";
import { cn } from "@/lib/utils";

// Timeline del directo (migración 024): la "película" del combate. Line chart
// SVG server-rendered (patrón ranking-trajectory, sin librerías): golpes
// significativos conectados ACUMULADOS de cada esquina sobre el tiempo real de
// combate, con los cortes de asalto y anillos en los knockdowns. Identidad no
// solo por color (CVD): la roja lleva círculos y la azul rombos, como el radar.
// Solo se pinta si hay historia (peleas muestreadas en directo desde jul-2026
// + el backfill de UFC 329); sin muestras devuelve null y la ficha queda igual.

const WIDTH = 760;

type Layout = {
  height: number;
  pad: { top: number; right: number; bottom: number; left: number };
  // El SVG escala completo con el viewBox de 760: en un contenedor de ~310px
  // (móvil) el texto queda a ~0,41x. La compacta (nueva, sin precedente que
  // respetar) compensa con fuente mayor; la completa mantiene el 11 del
  // patrón ranking-trajectory aprobado.
  fontSize: number;
};

const FULL: Layout = {
  height: 300, pad: { top: 20, right: 16, bottom: 34, left: 44 }, fontSize: 11,
};
const COMPACT: Layout = {
  height: 190, pad: { top: 14, right: 12, bottom: 30, left: 44 }, fontSize: 17,
};

// Tope de muestras de la variante compacta (payload RSC de /en-vivo cada
// 20 s): suficiente para la forma de la película sin arrastrar ~75 puntos.
const COMPACT_MAX_SAMPLES = 40;

// Ticks enteros del eje Y (0..max), ~4 como mucho, siempre con los extremos.
function yTickValues(max: number): number[] {
  const step = Math.max(1, Math.ceil(max / 4));
  const values: number[] = [];
  for (let v = 0; v <= max; v += step) {
    values.push(v);
  }
  if (values[values.length - 1] !== max) {
    values.push(max);
  }
  return values;
}

type FightTimelineProps = {
  samples: FightTimelineSample[];
  redId: number | null;
  blueId: number | null;
  redName: string;
  blueName: string;
  compact?: boolean;
};

function CornerPoints({
  series,
  corner,
  name,
  totalSeconds,
  maxValue,
  layout,
}: {
  series: CornerSeries;
  corner: "red" | "blue";
  name: string;
  totalSeconds: number;
  maxValue: number;
  layout: Layout;
}) {
  const colorVar = corner === "red" ? "var(--corner-red)" : "var(--corner-blue)";
  const plotWidth = WIDTH - layout.pad.left - layout.pad.right;
  const plotHeight = layout.height - layout.pad.top - layout.pad.bottom;
  const laidOut = series.points.map((p) => ({
    ...p,
    x: scaleSeconds(p.seconds, totalSeconds, layout.pad.left, plotWidth),
    y: scaleValue(p.value, maxValue, layout.pad.top, plotHeight),
  }));
  if (laidOut.length === 0) {
    return null;
  }
  // La polilínea usa TODOS los puntos; solo los marcadores se adelgazan.
  const markerIndices = selectMarkerIndices(laidOut);
  return (
    <g>
      {laidOut.length > 1 ? (
        <polyline
          points={laidOut.map((p) => `${p.x},${p.y}`).join(" ")}
          fill="none"
          stroke={colorVar}
          strokeWidth={2}
          strokeLinejoin="round"
          strokeLinecap="round"
        />
      ) : null}
      {laidOut.map((p, idx) => {
        if (!markerIndices.has(idx)) {
          return null;
        }
        const title = `${name}: ${p.value} golpes sig. (${p.label})${
          p.kdDelta > 0 ? " · ¡KD!" : ""
        }${p.tdDelta > 0 ? " · derribo" : ""}`;
        return (
          <g key={`${corner}-${idx}`}>
            {/* Anillo de knockdown: el momento que cambia la pelea. */}
            {p.kdDelta > 0 ? (
              <circle
                cx={p.x}
                cy={p.y}
                r={7}
                fill="none"
                stroke={colorVar}
                strokeWidth={1.5}
              />
            ) : null}
            {corner === "red" ? (
              <circle cx={p.x} cy={p.y} r={3} fill={colorVar}>
                <title>{title}</title>
              </circle>
            ) : (
              <rect
                x={p.x - 3}
                y={p.y - 3}
                width={6}
                height={6}
                fill={colorVar}
                transform={`rotate(45 ${p.x} ${p.y})`}
              >
                <title>{title}</title>
              </rect>
            )}
          </g>
        );
      })}
    </g>
  );
}

export function FightTimeline({
  samples,
  redId,
  blueId,
  redName,
  blueName,
  compact = false,
}: FightTimelineProps) {
  const timeline = buildFightTimeline(
    compact ? decimateSamples(samples, COMPACT_MAX_SAMPLES) : samples,
    redId,
    blueId,
  );
  if (!timeline) {
    return null;
  }
  const { red, blue, totalSeconds, rounds, maxValue } = timeline;
  const layout = compact ? COMPACT : FULL;
  const plotWidth = WIDTH - layout.pad.left - layout.pad.right;
  const plotHeight = layout.height - layout.pad.top - layout.pad.bottom;
  const plotRight = layout.pad.left + plotWidth;
  const plotBottom = layout.pad.top + plotHeight;

  // Límites de asalto dentro del dominio (el último asalto acaba donde acaba
  // la pelea, no en 5:00) y una etiqueta "R n" centrada en cada tramo.
  const boundaries: number[] = [];
  for (let r = 1; r * ROUND_SECONDS < totalSeconds; r++) {
    boundaries.push(r * ROUND_SECONDS);
  }
  const roundLabels = Array.from({ length: rounds }, (_, i) => {
    const start = i * ROUND_SECONDS;
    const end = Math.min((i + 1) * ROUND_SECONDS, totalSeconds);
    return { round: i + 1, mid: (start + end) / 2 };
  }).filter((band) => band.mid < totalSeconds);

  const hasKd = [...red.points, ...blue.points].some((p) => p.kdDelta > 0);
  const ariaLabel = `Película del combate (golpes significativos conectados): ${redName} ${
    red.final ?? "—"
  }, ${blueName} ${blue.final ?? "—"}, en ${rounds} ${rounds === 1 ? "asalto" : "asaltos"}.`;

  const chart = (
    <svg
      viewBox={`0 0 ${WIDTH} ${layout.height}`}
      className="h-auto w-full"
      role="img"
      aria-label={ariaLabel}
    >
      <title>{ariaLabel}</title>

      {yTickValues(maxValue).map((value) => {
        const y = scaleValue(value, maxValue, layout.pad.top, plotHeight);
        return (
          <g key={`y-${value}`}>
            <line
              x1={layout.pad.left}
              y1={y}
              x2={plotRight}
              y2={y}
              stroke="var(--border)"
              strokeWidth={1}
              strokeDasharray="2 4"
            />
            <text
              x={layout.pad.left - 8}
              y={y}
              textAnchor="end"
              dominantBaseline="middle"
              fill="var(--muted-foreground)"
              fontSize={layout.fontSize}
              className="font-mono"
            >
              {value}
            </text>
          </g>
        );
      })}

      {boundaries.map((seconds) => (
        <line
          key={`r-${seconds}`}
          x1={scaleSeconds(seconds, totalSeconds, layout.pad.left, plotWidth)}
          y1={layout.pad.top}
          x2={scaleSeconds(seconds, totalSeconds, layout.pad.left, plotWidth)}
          y2={plotBottom}
          stroke="var(--border)"
          strokeWidth={1}
        />
      ))}
      {roundLabels.map((band) => (
        <text
          key={`rl-${band.round}`}
          x={scaleSeconds(band.mid, totalSeconds, layout.pad.left, plotWidth)}
          y={layout.height - layout.pad.bottom + 16}
          textAnchor="middle"
          fill="var(--muted-foreground)"
          fontSize={layout.fontSize}
          className="font-mono"
        >
          R{band.round}
        </text>
      ))}

      <CornerPoints
        series={red}
        corner="red"
        name={redName}
        totalSeconds={totalSeconds}
        maxValue={maxValue}
        layout={layout}
      />
      <CornerPoints
        series={blue}
        corner="blue"
        name={blueName}
        totalSeconds={totalSeconds}
        maxValue={maxValue}
        layout={layout}
      />
    </svg>
  );

  if (compact) {
    return (
      <div className="pt-2">
        {chart}
        <p className="pt-1 text-center font-mono text-[0.55rem] uppercase tracking-[0.12em] text-muted-foreground">
          Evolución · golpes sig. conectados
        </p>
      </div>
    );
  }

  return (
    <section className={cn(PREMIUM_TILE, "p-5 sm:p-6")}>
      <p className="text-center font-mono text-xs font-semibold uppercase tracking-[0.2em] text-primary">
        La película del combate
      </p>
      <p className="mt-1 text-center text-xs text-muted-foreground">
        Golpes significativos conectados acumulados, capturados en directo
        (fuente ESPN).{hasKd ? " Los anillos marcan knockdowns." : ""}
      </p>
      <div className="mt-4">{chart}</div>
      <ul className="mt-3 flex flex-wrap items-center justify-center gap-x-5 gap-y-2">
        <li className="flex items-center gap-2">
          <span
            aria-hidden
            className="inline-block size-2.5 rounded-full bg-corner-red"
          />
          <span className="text-xs font-medium text-muted-foreground">
            {redName}
            {red.final != null ? ` — ${red.final}` : ""}
          </span>
        </li>
        <li className="flex items-center gap-2">
          <span aria-hidden className="inline-block size-2.5 rotate-45 bg-corner-blue" />
          <span className="text-xs font-medium text-muted-foreground">
            {blueName}
            {blue.final != null ? ` — ${blue.final}` : ""}
          </span>
        </li>
      </ul>
    </section>
  );
}
