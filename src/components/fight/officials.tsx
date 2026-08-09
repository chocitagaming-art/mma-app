import { cn } from "@/lib/utils";
import type { FightScorecard } from "@/lib/types";

// BE8 — Árbitro y tarjetas de los jueces, justo bajo la barra de resultado del
// combate. El árbitro es una línea simple; las tarjetas (solo hay filas cuando
// la pelea llegó a las tarjetas) se listan juez a juez con el marcador teñido
// del color de la esquina que ese juez puntuó ganadora (empate 47-47 = neutro).
//
// 🪤 Y CUÁNDO NO SE PUEDE TEÑIR, que es lo que añade `orientadas`. En ufcstats
// el par de notas va (perdedor, ganador), y el ganador viene marcado con una W
// en la página. En los combates SIN ganador —empates y resultados anulados— los
// dos luchadores llevan 'D' o 'NC': no hay nada a lo que anclar el par, y su
// orden en la fuente es arbitrario (medido: 17 páginas con la nota del ganador
// segunda contra 6 con ella primera).
//
// Son 82 combates. Hasta hoy se pintaban como los demás, con su color de
// esquina, acertando la mitad de las veces con cara de certeza. El caso que lo
// retrata: /fights/6979 (CM Punk vs Mike Jackson, anulada) afirmaba en azul
// tres tarjetas 26-30 contra Jackson. Fue exactamente al revés.
//
// La regla que se aplica es la de la casa: **cada dato declara su precisión
// donde se lee**. Los números son correctos y se conservan; lo que se deja de
// afirmar es a quién pertenece cada uno.
export function FightOfficials({
  referee,
  scorecards,
  orientadas = true,
}: {
  referee: string | null;
  scorecards: FightScorecard[];
  /**
   * Si consta a qué esquina fue cada nota. False en los combates sin ganador
   * oficial: entonces se pintan los dos números sin lado y sin color.
   */
  orientadas?: boolean;
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
                    !orientadas
                      ? "text-foreground"
                      : card.redScore > card.blueScore
                        ? "text-corner-red"
                        : card.blueScore > card.redScore
                          ? "text-corner-blue"
                          : "text-foreground",
                  )}
                >
                  {/* El separador cambia a propósito: un guion entre dos cifras
                      se lee como "izquierda contra derecha", y aquí no hay
                      izquierda ni derecha. El punto medio las presenta como
                      pareja, no como marcador. */}
                  {orientadas ? (
                    <>
                      {card.redScore}-{card.blueScore}
                    </>
                  ) : (
                    <>
                      {card.redScore} · {card.blueScore}
                    </>
                  )}
                </span>
              </li>
            ))}
          </ul>
          {!orientadas ? (
            <p className="mt-2 text-center text-xs leading-relaxed text-muted-foreground">
              Sin ganador oficial: no consta a qué esquina fue cada nota.
            </p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
