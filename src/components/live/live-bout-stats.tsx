import { cn } from "@/lib/utils";
import {
  buildLiveStatRows,
  liveStatusLabel,
  type LiveFightStats,
} from "@/lib/live-stats";
import type { EventBout } from "@/lib/types";

// T3-A fase B: panel de stats EN VIVO dentro del acordeón de cada pelea de
// /en-vivo (pedido del dueño: "al expandir la flecha, ver los datos como en
// el fightcenter de ESPN"). Server-rendered: llega fresco con cada
// router.refresh() de AutoRefresh; EventBoutDisclosure solo lo muestra/oculta.
// Misma retícula visual que el mini tale-of-the-tape (valor rojo | ETIQUETA |
// valor azul) para que ambos bloques lean como un solo panel.

function sideFor(
  stats: LiveFightStats,
  fighterId: number | null,
) {
  return fighterId != null ? (stats.byFighter[String(fighterId)] ?? null) : null;
}

// ¿El panel aportaría algo? En curso basta el estado fino ("Salida al
// octágono"); en post sin filas de stats no hay nada que enseñar.
export function hasLiveStatsContent(bout: EventBout, stats: LiveFightStats): boolean {
  const rows = buildLiveStatRows(
    sideFor(stats, bout.red.id),
    sideFor(stats, bout.blue.id),
  );
  if (rows.length > 0) {
    return true;
  }
  return stats.state === "in" && liveStatusLabel(stats) != null;
}

export function LiveBoutStatsPanel({
  bout,
  stats,
}: {
  bout: EventBout;
  stats: LiveFightStats;
}) {
  const rows = buildLiveStatRows(
    sideFor(stats, bout.red.id),
    sideFor(stats, bout.blue.id),
  );
  const status = liveStatusLabel(stats);
  const live = stats.state === "in";

  if (rows.length === 0 && !(live && status)) {
    return null;
  }

  return (
    <div className="border-t border-border/60 bg-muted/30 px-4 py-2.5 sm:px-5">
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 py-1">
        <p
          className={cn(
            "flex items-center gap-1.5 font-mono text-[0.6rem] font-bold uppercase tracking-[0.12em]",
            live ? "text-primary" : "text-muted-foreground",
          )}
        >
          {live ? (
            <span className="live-dot inline-block size-1.5 rounded-full bg-primary shadow-[0_0_8px_1px_var(--primary)]" />
          ) : null}
          {live ? "Estadísticas en directo" : "Estadísticas provisionales"}
        </p>
        {status ? (
          <p className="font-mono text-[0.6rem] uppercase tracking-[0.1em] text-muted-foreground">
            {status}
          </p>
        ) : null}
      </div>

      {rows.map((row) => {
        const both = row.redNum != null && row.blueNum != null;
        const redBetter = both && (row.redNum as number) > (row.blueNum as number);
        const blueBetter = both && (row.blueNum as number) > (row.redNum as number);
        return (
          <div
            key={row.label}
            className="grid grid-cols-[1fr_auto_1fr] items-center gap-3 border-b border-border/60 py-2 last:border-b-0 sm:gap-4"
          >
            <p
              className={cn(
                "tabular min-w-0 break-words text-right text-sm font-semibold leading-tight",
                redBetter ? "text-corner-red" : "text-foreground",
              )}
            >
              {row.red}
            </p>
            <p className="w-20 text-center font-mono text-[0.6rem] uppercase leading-tight tracking-[0.12em] text-muted-foreground sm:w-24">
              {row.label}
            </p>
            <p
              className={cn(
                "tabular min-w-0 break-words text-left text-sm font-semibold leading-tight",
                blueBetter ? "text-corner-blue" : "text-foreground",
              )}
            >
              {row.blue}
            </p>
          </div>
        );
      })}

      <p className="pt-2 text-right font-mono text-[0.55rem] uppercase tracking-[0.12em] text-muted-foreground/70">
        Datos provisionales
      </p>
    </div>
  );
}
