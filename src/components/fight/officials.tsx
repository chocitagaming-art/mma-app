import { cn } from "@/lib/utils";
import type { FightScorecard } from "@/lib/types";

// BE8 — Árbitro y tarjetas de los jueces, justo bajo la barra de resultado del
// combate. El árbitro es una línea simple; las tarjetas (solo hay filas cuando
// la pelea llegó a las tarjetas) se listan juez a juez con el marcador teñido
// del color de la esquina que ese juez puntuó ganadora (empate 47-47 = neutro).
export function FightOfficials({
  referee,
  scorecards,
}: {
  referee: string | null;
  scorecards: FightScorecard[];
}) {
  if (!referee && scorecards.length === 0) {
    return null;
  }

  return (
    <div className="space-y-3 border-t border-border px-6 py-4">
      {referee ? (
        <p className="text-center font-mono text-xs text-muted-foreground">
          Árbitro:{" "}
          <span className="font-semibold text-foreground">{referee}</span>
        </p>
      ) : null}
      {scorecards.length > 0 ? (
        <div className="mx-auto w-full max-w-xs">
          <p className="mb-1.5 text-center font-mono text-[0.65rem] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
            Tarjetas de los jueces
          </p>
          <ul className="divide-y divide-border/60">
            {/* index en la key: nombres de juez repetidos no son imposibles. */}
            {scorecards.map((card, index) => (
              <li
                key={`${card.judgeName}-${index}`}
                className="flex items-baseline justify-between gap-4 py-1.5"
              >
                <span className="min-w-0 truncate text-sm text-muted-foreground">
                  {card.judgeName}
                </span>
                <span
                  className={cn(
                    "tabular shrink-0 font-mono text-sm font-bold",
                    card.redScore > card.blueScore
                      ? "text-corner-red"
                      : card.blueScore > card.redScore
                        ? "text-corner-blue"
                        : "text-foreground",
                  )}
                >
                  {card.redScore}-{card.blueScore}
                </span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
