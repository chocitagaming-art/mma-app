import type { PredictionFeature } from "@/lib/prediction";
import {
  buildShapBars,
  formatContribution,
  type ShapBarRow,
} from "@/lib/shap-bars";
import { cn } from "@/lib/utils";

import { featureLabel, formatFeatureValue } from "./helpers";

// Minigráfico de barras divergentes de factores (maqueta aprobada 19-jul):
// cada factor empuja hacia la esquina roja (izquierda) o azul (derecha) y el
// largo de la barra es cuánto empuja. Divs, no SVG: es maquetación de filas
// (patrón ProbabilityBar); el radar es SVG porque es geométrico. El número de
// cada barra vive en un hueco FIJO fuera del área de la barra — una barra al
// 100% llena su área y el número nunca se sale de la caja (condición del
// dueño al aprobar la maqueta). Tooltips nativos con title, como el radar.

type ShapBarsChartProps = {
  topFeatures: PredictionFeature[];
  featureContributions?: Record<string, number> | null;
  redName: string;
  blueName: string;
  compact?: boolean;
};

// La barra "resto" agrega factores: se pinta rayada (no es un factor único) y
// en el color de la esquina hacia la que empuja.
function hatchBackground(side: "red" | "blue"): string {
  const color = side === "red" ? "var(--corner-red)" : "var(--corner-blue)";
  return `repeating-linear-gradient(135deg, color-mix(in oklab, ${color} 55%, transparent) 0 4px, color-mix(in oklab, ${color} 20%, transparent) 4px 8px)`;
}

function rowLabel(row: ShapBarRow, compact: boolean): string {
  if (!row.isRest) {
    return featureLabel(row.name);
  }
  return compact ? `Resto (${row.restCount})` : "Resto de factores";
}

function rowTitle(row: ShapBarRow, redName: string, blueName: string): string {
  const target = row.side === "red" ? redName : blueName;
  const push = `empuja ${formatContribution(row.contribution)} hacia ${target}`;
  if (row.isRest) {
    return `Los otros ${row.restCount} factores en conjunto · ${push}`;
  }
  return `${featureLabel(row.name)} · valor ${formatFeatureValue(row.value)} · ${push}`;
}

function BarRow({
  row,
  compact,
  redName,
  blueName,
}: {
  row: ShapBarRow;
  compact: boolean;
  redName: string;
  blueName: string;
}) {
  // El número vive en un hueco FIJO y la barra se escala sobre el área
  // RESTANTE (calc(100% − hueco)): una barra al 100% termina justo donde
  // empieza el número, que queda pegado a su extremo (como en la maqueta) y
  // nunca puede salirse de la caja.
  const valueSlot = compact ? "2rem" : "2.4rem";
  const contribution = (
    <span
      className={cn(
        "shrink-0 font-mono tabular-nums",
        compact ? "text-[0.65rem]" : "text-xs",
        row.isRest ? "text-muted-foreground" : "text-foreground",
      )}
    >
      {formatContribution(row.contribution)}
    </span>
  );
  const bar = (edge: "l" | "r") => (
    <span
      className={cn(
        "shrink-0",
        compact ? "h-2" : "h-3.5",
        edge === "l" ? "rounded-l" : "rounded-r",
        !row.isRest && (row.side === "red" ? "bg-corner-red" : "bg-corner-blue"),
      )}
      style={{
        width: `calc((100% - ${valueSlot}) * ${row.widthPct / 100})`,
        ...(row.isRest ? { background: hatchBackground(row.side) } : {}),
      }}
    />
  );

  return (
    <div
      title={rowTitle(row, redName, blueName)}
      className={cn(
        "grid items-center",
        compact ? "grid-cols-[7.5rem_1fr] gap-2" : "grid-cols-[8.5rem_1fr] gap-3 sm:grid-cols-[10.5rem_1fr]",
      )}
    >
      <div className="min-w-0">
        <p
          className={cn(
            compact ? "truncate text-xs" : "line-clamp-2 text-sm font-medium leading-snug",
            row.isRest ? "text-muted-foreground" : "text-foreground",
          )}
        >
          {rowLabel(row, compact)}
        </p>
        {compact ? null : (
          <p className="truncate text-xs text-muted-foreground">
            {row.isRest
              ? `${row.restCount} con efecto menor`
              : `valor ${formatFeatureValue(row.value)}`}
          </p>
        )}
      </div>
      <div
        className={cn(
          "grid grid-cols-[1fr_2px_1fr] items-center",
          compact ? "h-5" : "h-7",
        )}
      >
        <span className="flex min-w-0 items-center justify-end gap-1.5">
          {row.side === "red" ? (
            <>
              {contribution}
              {bar("l")}
            </>
          ) : null}
        </span>
        <span aria-hidden className="h-full w-0.5 rounded bg-border" />
        <span className="flex min-w-0 items-center gap-1.5">
          {row.side === "blue" ? (
            <>
              {bar("r")}
              {contribution}
            </>
          ) : null}
        </span>
      </div>
    </div>
  );
}

export function ShapBarsChart({
  topFeatures,
  featureContributions,
  redName,
  blueName,
  compact = false,
}: ShapBarsChartProps) {
  const rows = buildShapBars(
    topFeatures,
    featureContributions,
    compact ? 3 : 5,
  );
  if (rows.length === 0) {
    return null;
  }

  const described = rows
    .map(
      (row) =>
        `${rowLabel(row, false)}: ${formatContribution(row.contribution)} hacia ${row.side === "red" ? redName : blueName}`,
    )
    .join(". ");

  return (
    <div
      role="img"
      aria-label={`Barras de contribución por factor del modelo (log-odds). ${described}.`}
    >
      <div
        className={cn(
          "flex items-center justify-between gap-3 font-mono font-semibold uppercase text-muted-foreground",
          compact
            ? "mb-2 text-[0.6rem] tracking-[0.08em]"
            : "mb-3 text-[0.65rem] tracking-[0.1em]",
        )}
      >
        <span className="flex min-w-0 items-center gap-1.5">
          <span aria-hidden className="size-2 shrink-0 rounded-full bg-corner-red" />
          <span className="truncate text-foreground">{redName}</span>
        </span>
        <span className="flex min-w-0 items-center gap-1.5">
          <span className="truncate text-foreground">{blueName}</span>
          <span aria-hidden className="size-2 shrink-0 rounded-full bg-corner-blue" />
        </span>
      </div>
      <div className={cn("flex flex-col", compact ? "gap-1.5" : "gap-2.5")}>
        {rows.map((row) => (
          <BarRow
            key={row.name}
            row={row}
            compact={compact}
            redName={redName}
            blueName={blueName}
          />
        ))}
      </div>
    </div>
  );
}
