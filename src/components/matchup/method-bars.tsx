import { formatPercentage } from "@/lib/format";
import { buildMethodBars } from "@/lib/method-prediction";
import type { MethodPrediction } from "@/lib/prediction";
import { cn } from "@/lib/utils";

// Barras de probabilidad por MÉTODO de victoria (¿cómo acaba la pelea?).
// Divs, no SVG: es maquetación de filas (patrón ProbabilityBar/ShapBars). El
// ancho es la probabilidad ABSOLUTA (50% = media caja), igual que
// ProbabilityBar, así las tres barras se leen contra la misma escala. El
// método no pertenece a ninguna esquina, por eso no usa los colores de
// esquina: el método más probable va en primary y el resto en neutro.

type MethodBarsProps = {
  method: MethodPrediction | null | undefined;
  // Atenúa las barras cuando la predicción es de baja confianza (mismo
  // tratamiento que las barras de probabilidad por esquina).
  lowConfidence?: boolean;
  compact?: boolean;
};

export function MethodBars({
  method,
  lowConfidence = false,
  compact = false,
}: MethodBarsProps) {
  const rows = buildMethodBars(method);
  if (!rows) {
    return null;
  }

  const described = rows
    .map((row) => `${row.label} ${formatPercentage(row.probability)}`)
    .join(", ");

  return (
    <div
      role="img"
      aria-label={`Probabilidad por método de victoria: ${described}.`}
      className={cn("flex flex-col", compact ? "gap-1.5" : "gap-2.5")}
    >
      {rows.map((row) => (
        <div
          key={row.method}
          title={`${row.label}: ${formatPercentage(row.probability)}${
            row.isPredicted ? " · método más probable" : ""
          }`}
          className={cn(
            "grid items-center",
            compact
              ? "grid-cols-[5.5rem_1fr_2.4rem] gap-2"
              : "grid-cols-[6.5rem_1fr_3rem] gap-3",
          )}
        >
          <p
            className={cn(
              "truncate",
              compact ? "text-xs" : "text-sm font-medium",
              row.isPredicted ? "text-foreground" : "text-muted-foreground",
            )}
          >
            {row.label}
          </p>
          <div
            className={cn(
              "overflow-hidden rounded-full bg-muted",
              compact ? "h-2" : "h-3",
            )}
          >
            <div
              className={cn(
                "h-full rounded-full transition-all",
                row.isPredicted
                  ? lowConfidence
                    ? "bg-primary/40"
                    : "bg-primary"
                  : lowConfidence
                    ? "bg-foreground/15"
                    : "bg-foreground/30",
              )}
              style={{
                width: `${Math.max(0, Math.min(100, row.probability * 100))}%`,
              }}
            />
          </div>
          <p
            className={cn(
              "text-right font-mono tabular-nums",
              compact ? "text-[0.65rem]" : "text-xs",
              row.isPredicted
                ? "font-semibold text-foreground"
                : "text-muted-foreground",
            )}
          >
            {formatPercentage(row.probability)}
          </p>
        </div>
      ))}
    </div>
  );
}
