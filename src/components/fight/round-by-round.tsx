import { PREMIUM_TILE } from "@/components/fighter/premium-tile";
import { formatControlTime } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { FightRoundStats } from "@/lib/types";

// BE4 — "Por asaltos": desglose asalto a asalto del combate
// (fight_stats_rounds) con golpes significativos (conectados/intentados),
// derribos, knockdowns y tiempo de control de AMBAS esquinas. Tabla compacta
// font-mono con numerales tabulares y los colores rojo/azul de esquina, dentro
// del mismo tratamiento PREMIUM_TILE que los tiles de la ficha de luchador.
// Solo se pinta si hay filas (las peleas antiguas no tienen desglose).

type RoundByRoundProps = {
  rounds: FightRoundStats[];
  redId: number | null;
  blueId: number | null;
  redName: string;
  blueName: string;
};

const METRIC_HEADERS = ["Golpes sig.", "Derribos", "KD", "Control"];

const CELL_BASE =
  "tabular whitespace-nowrap px-3 py-2 text-right font-mono text-sm";

function CornerRow({
  corner,
  name,
  stats,
}: {
  corner: "red" | "blue";
  name: string;
  stats?: FightRoundStats;
}) {
  const isRed = corner === "red";

  return (
    <tr className="border-b border-border/60">
      <td className="max-w-44 py-2 pl-4 pr-3 sm:pl-6">
        <span className="flex min-w-0 items-center gap-2">
          <span
            aria-hidden
            className={cn(
              "size-1.5 shrink-0 rounded-full",
              isRed ? "bg-corner-red" : "bg-corner-blue",
            )}
          />
          <span
            className={cn(
              "truncate font-display text-xs font-bold uppercase tracking-wide",
              isRed ? "text-corner-red" : "text-corner-blue",
            )}
          >
            {name}
          </span>
        </span>
      </td>
      <td className={cn(CELL_BASE, "text-foreground")}>
        {stats ? `${stats.sigStrikesLanded}/${stats.sigStrikesAttempted}` : "—"}
      </td>
      <td className={cn(CELL_BASE, "text-foreground")}>
        {stats ? `${stats.takedownsLanded}/${stats.takedownsAttempted}` : "—"}
      </td>
      <td className={cn(CELL_BASE, "text-foreground")}>
        {stats ? stats.knockdowns : "—"}
      </td>
      <td className={cn(CELL_BASE, "pr-4 text-foreground sm:pr-6")}>
        {stats ? formatControlTime(stats.controlTimeSeconds) : "—"}
      </td>
    </tr>
  );
}

export function RoundByRound({
  rounds,
  redId,
  blueId,
  redName,
  blueName,
}: RoundByRoundProps) {
  if (rounds.length === 0) {
    return null;
  }

  // Agrupa las filas (una por luchador y asalto) en pares rojo/azul por asalto.
  // Filas de un fighter_id que no case con ninguna esquina (datos huérfanos)
  // se descartan; la esquina sin fila pinta "—".
  const byRound = new Map<number, { red?: FightRoundStats; blue?: FightRoundStats }>();
  for (const row of rounds) {
    const entry = byRound.get(row.round) ?? {};
    if (redId != null && row.fighterId === redId) {
      entry.red = row;
    } else if (blueId != null && row.fighterId === blueId) {
      entry.blue = row;
    }
    byRound.set(row.round, entry);
  }
  const roundNumbers = [...byRound.keys()].sort((a, b) => a - b);

  return (
    <section className={cn(PREMIUM_TILE, "overflow-hidden")}>
      <div className="px-4 pt-6 sm:px-6">
        <p className="text-center font-mono text-xs font-semibold uppercase tracking-[0.2em] text-primary">
          Por asaltos
        </p>
        <p className="mt-1 text-center text-xs text-muted-foreground">
          Golpes significativos (conectados/intentados), derribos, knockdowns y
          tiempo de control en cada asalto.
        </p>
      </div>
      <div className="mt-4 overflow-x-auto">
        <table className="w-full min-w-[520px] border-t border-border text-sm">
          <thead>
            <tr className="border-b border-border">
              <th
                scope="col"
                className="py-2.5 pl-4 pr-3 text-left font-mono text-[0.65rem] font-semibold uppercase tracking-[0.14em] text-muted-foreground sm:pl-6"
              >
                Luchador
              </th>
              {METRIC_HEADERS.map((header) => (
                <th
                  key={header}
                  scope="col"
                  className="whitespace-nowrap px-3 py-2.5 text-right font-mono text-[0.65rem] font-semibold uppercase tracking-[0.14em] text-muted-foreground last:pr-4 sm:last:pr-6"
                >
                  {header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="[&_tr:last-child]:border-b-0">
            {roundNumbers.map((round) => {
              const entry = byRound.get(round);

              return (
                <RoundGroup
                  key={round}
                  round={round}
                  red={entry?.red}
                  blue={entry?.blue}
                  redName={redName}
                  blueName={blueName}
                />
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}

// Un asalto = subcabecera "Asalto N" + fila roja + fila azul. Fragmento con
// nombre propio para poder darle key por asalto en el map de arriba.
function RoundGroup({
  round,
  red,
  blue,
  redName,
  blueName,
}: {
  round: number;
  red?: FightRoundStats;
  blue?: FightRoundStats;
  redName: string;
  blueName: string;
}) {
  return (
    <>
      <tr className="border-b border-border/60 bg-muted/40">
        <th
          colSpan={5}
          scope="colgroup"
          className="py-1.5 pl-4 pr-3 text-left font-mono text-[0.65rem] font-semibold uppercase tracking-[0.18em] text-muted-foreground sm:pl-6"
        >
          Asalto {round}
        </th>
      </tr>
      <CornerRow corner="red" name={redName} stats={red} />
      <CornerRow corner="blue" name={blueName} stats={blue} />
    </>
  );
}
