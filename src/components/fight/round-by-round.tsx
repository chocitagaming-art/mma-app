import { PREMIUM_TILE } from "@/components/fighter/premium-tile";
import { displayLastName } from "@/lib/fight-headline";
import { formatControlTime } from "@/lib/format";
import {
  anchoBarra,
  buildRoundByRound,
  estadoDesglose,
  etiquetaFinal,
  type CornerTotals,
} from "@/lib/round-by-round";
import type { FightRoundStats } from "@/lib/types";
import { cn } from "@/lib/utils";

// BE4 + FASE 9 — "Asalto a asalto": el desglose oficial de cada asalto
// (fight_stats_rounds) con golpes significativos, derribos, sumisiones
// intentadas, knockdowns y tiempo de control de AMBAS esquinas, más los totales
// del combate.
//
// ⚠️ NO CONFUNDIR CON "LA PELÍCULA DEL COMBATE" (fight-timeline.tsx), que es la
// función estrella y va justo encima en la ficha. Diferencias que hay que
// mantener visibles, porque las dos hablan de golpes significativos:
//   · aquí el dato es OFICIAL y posterior al combate (ufcstats) → 8.738 peleas;
//     allí se capta EN DIRECTO (ESPN) → 20 peleas.
//   · aquí es una tabla con las siete métricas; allí una curva de una sola.
// Por eso este bloque lleva el título en gris y la fuente escrita en el
// subtítulo: si los dos van en rojo con el mismo tamaño, parecen lo mismo.

type RoundByRoundProps = {
  rounds: FightRoundStats[];
  redId: number | null;
  blueId: number | null;
  redName: string;
  blueName: string;
  // Para marcar el asalto en el que se acabó, y para saber si el combate ya se
  // disputó: en uno futuro la ausencia de datos es lo normal y no se avisa.
  method?: string | null;
  endRound?: number | null;
  endTime?: string | null;
  // De qué época es el combate. Sin esto, el estado vacío miente durante las
  // horas que van del resultado provisional de ESPN al desglose de ufcstats:
  // ver `estadoDesglose`.
  eventDate?: string | null;
};

const CELL_BASE = "tabular whitespace-nowrap px-3 py-2 text-right font-mono text-sm";

const HEAD_CELL =
  "whitespace-nowrap px-3 py-2.5 text-right font-mono text-[0.65rem] font-semibold uppercase tracking-[0.14em] text-muted-foreground last:pr-4 sm:last:pr-6";

function CornerRow({
  corner,
  name,
  stats,
  conSumisiones,
  destacada = false,
}: {
  corner: "red" | "blue";
  name: string;
  stats: CornerTotals | null;
  conSumisiones: boolean;
  destacada?: boolean;
}) {
  const isRed = corner === "red";

  return (
    <tr className={cn("border-b border-border/60", destacada && "bg-muted/20")}>
      <th scope="row" className="max-w-44 py-2 pl-4 pr-3 text-left font-normal sm:pl-6">
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
      </th>
      <td className={cn(CELL_BASE, "text-foreground")}>
        {stats ? `${stats.sigStrikesLanded}/${stats.sigStrikesAttempted}` : "—"}
      </td>
      <td className={cn(CELL_BASE, "text-foreground")}>
        {stats ? `${stats.takedownsLanded}/${stats.takedownsAttempted}` : "—"}
      </td>
      {conSumisiones ? (
        <td className={cn(CELL_BASE, "text-foreground")}>
          {stats ? stats.submissionAttempts : "—"}
        </td>
      ) : null}
      <td className={cn(CELL_BASE, "text-foreground")}>{stats ? stats.knockdowns : "—"}</td>
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
  method = null,
  endRound = null,
  endTime = null,
  eventDate = null,
}: RoundByRoundProps) {
  const datos = buildRoundByRound(rounds, redId, blueId);
  const estado = estadoDesglose(datos != null, method, eventDate);

  // DOS FORMAS DEL MISMO NOMBRE, Y CADA UNA VA A UN SITIO DISTINTO.
  //
  // En las CELDAS, el apellido: el mismo luchador salía en cuatro formas en una
  // sola ficha —«Manoel Sousa» en la película, «SOUSA» en el bloque de agarre,
  // «MANOEL SOUSA» aquí y el nombre entero en la cabecera—, y esta tabla era la
  // única que no se había unificado. El bloque de agarre de justo encima ya
  // imprime el apellido, así que dos tablas hermanas nombraban distinto a la
  // misma persona a diez centímetros una de otra.
  //
  // 🪤 PERO EL `aria-label` Y EL `caption` SE QUEDAN CON EL NOMBRE COMPLETO, y
  // ese es el detalle que casi se cuela: hasta hoy los dos salían de la MISMA
  // prop que las celdas. Cambiarla a secas le habría quitado el nombre entero a
  // quien usa lector de pantalla justo donde hoy lo tiene, y esa es la única
  // parte de la ficha donde no puede leer la cabecera de un vistazo. Un apellido
  // sin nombre delante no es una abreviatura: «Silva» lo publican 22 luchadores
  // distintos de esta base, Anderson Silva entre ellos.
  const redApellido = displayLastName(redName);
  const blueApellido = displayLastName(blueName);

  if (estado === "nada") {
    return null;
  }

  if (!datos) {
    // Solo llega aquí un combate de antes de 1999, cuando de verdad no se
    // registraban los asaltos: son 19 peleas de los torneos de 1995-1998.
    return (
      <section className={cn(PREMIUM_TILE, "p-5 text-center sm:p-6")}>
        <p className="font-mono text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">
          Asalto a asalto
        </p>
        <p className="mt-2 text-sm text-muted-foreground">
          De este combate no se conserva el desglose por asaltos. En las veladas más
          antiguas no se registraba.
        </p>
      </section>
    );
  }

  const { totals, maxSigLanded, hasSubmissionAttempts } = datos;
  const columnas = hasSubmissionAttempts ? 6 : 5;

  return (
    <section className={cn(PREMIUM_TILE, "overflow-hidden")}>
      <div className="px-4 pt-6 sm:px-6">
        <p className="text-center font-mono text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">
          Asalto a asalto
        </p>
        <p className="mt-1 text-center text-xs text-muted-foreground">
          Estadísticas de cada asalto, del acta oficial (fuente ufcstats). Las barras
          comparan los golpes significativos conectados entre las dos esquinas.
        </p>
      </div>
      {/* tabIndex + nombre accesible: la tabla desborda a lo ancho (min-w de
          520-580 px contra un carril de 301 a 375 px), y un carril que solo se
          recorre arrastrando deja fuera a quien navega con teclado. Es la regla
          scrollable-region-focusable, que el bloque de agarre de arriba ya
          cumplía desde el primer día y esta tabla no. */}
      <div
        className="mt-4 overflow-x-auto"
        tabIndex={0}
        role="region"
        aria-label={`Desglose por asaltos, ${redName} contra ${blueName}`}
      >
        <table
          className={cn("w-full border-t border-border text-sm", columnas === 6 ? "min-w-[580px]" : "min-w-[520px]")}
        >
          <caption className="sr-only">
            Desglose por asaltos de {redName} contra {blueName}: golpes significativos
            conectados y intentados, derribos, {hasSubmissionAttempts ? "sumisiones intentadas, " : ""}
            knockdowns y tiempo de control, con los totales del combate.
          </caption>
          <thead>
            <tr className="border-b border-border">
              <th
                scope="col"
                className="py-2.5 pl-4 pr-3 text-left font-mono text-[0.65rem] font-semibold uppercase tracking-[0.14em] text-muted-foreground sm:pl-6"
              >
                Luchador
              </th>
              <th scope="col" className={HEAD_CELL}>
                Golpes sig.
              </th>
              <th scope="col" className={HEAD_CELL}>
                Derribos
              </th>
              {hasSubmissionAttempts ? (
                <th scope="col" className={HEAD_CELL}>
                  Sum.
                </th>
              ) : null}
              <th scope="col" className={HEAD_CELL}>
                KD
              </th>
              <th scope="col" className={HEAD_CELL}>
                Control
              </th>
            </tr>
          </thead>
          <tbody className="[&_tr:last-child]:border-b-0">
            {datos.rounds.map(({ round, red, blue }) => (
              <RoundGroup
                key={round}
                round={round}
                red={red}
                blue={blue}
                redName={redApellido}
                blueName={blueApellido}
                columnas={columnas}
                conSumisiones={hasSubmissionAttempts}
                maxSigLanded={maxSigLanded}
                final={etiquetaFinal(method, endRound, endTime, round)}
              />
            ))}

            {/* Los totales del combate, que son la suma exacta de los asaltos
                de arriba: así se puede comprobar de un vistazo que cuadran con
                las "Estadísticas del combate" del tale-of-the-tape. */}
            <tr className="border-y-2 border-border bg-muted/40">
              <th
                colSpan={columnas}
                scope="colgroup"
                className="py-1.5 pl-4 pr-3 text-left font-mono text-[0.65rem] font-semibold uppercase tracking-[0.18em] text-muted-foreground sm:pl-6"
              >
                Total del combate
              </th>
            </tr>
            <CornerRow
              corner="red"
              name={redApellido}
              stats={totals.red}
              conSumisiones={hasSubmissionAttempts}
              destacada
            />
            <CornerRow
              corner="blue"
              name={blueApellido}
              stats={totals.blue}
              conSumisiones={hasSubmissionAttempts}
              destacada
            />
          </tbody>
        </table>
      </div>
    </section>
  );
}

// Un asalto = subcabecera "Asalto N" (con su barra comparativa y, si acabó ahí,
// la marca del final) + fila roja + fila azul.
function RoundGroup({
  round,
  red,
  blue,
  redName,
  blueName,
  columnas,
  conSumisiones,
  maxSigLanded,
  final,
}: {
  round: number;
  red: FightRoundStats | null;
  blue: FightRoundStats | null;
  redName: string;
  blueName: string;
  columnas: number;
  conSumisiones: boolean;
  maxSigLanded: number;
  final: string | null;
}) {
  const anchoRojo = anchoBarra(red?.sigStrikesLanded, maxSigLanded);
  const anchoAzul = anchoBarra(blue?.sigStrikesLanded, maxSigLanded);

  return (
    <>
      <tr className="border-b border-border/60 bg-muted/40">
        <th
          colSpan={columnas}
          scope="colgroup"
          className="py-1.5 pl-4 pr-3 text-left font-mono text-[0.65rem] font-semibold uppercase tracking-[0.18em] text-muted-foreground sm:pl-6"
        >
          <span className="flex items-center gap-3">
            <span className="shrink-0">Asalto {round}</span>
            {final ? (
              <span className="shrink-0 rounded bg-primary/10 px-1.5 py-0.5 text-primary">
                {final}
              </span>
            ) : null}
            {/* Barras enfrentadas: la roja crece hacia la izquierda y la azul
                hacia la derecha, ambas a escala del mejor asalto del combate.
                aria-hidden porque las cifras exactas ya están en las dos filas
                de debajo: repetirlas solo añadiría ruido al lector de pantalla. */}
            {/* En móvil la barra va pegada al título: con `ml-auto` se iba al
                extremo de una tabla de 520 px y había que arrastrar la tabla
                para ver lo único que se lee de un vistazo. En pantalla ancha sí
                se alinea a la derecha, que es donde no estorba. */}
            <span
              aria-hidden
              className="ml-2 flex w-24 shrink-0 items-center gap-1 sm:ml-auto sm:w-40"
            >
              <span className="flex h-1.5 flex-1 justify-end overflow-hidden rounded-full bg-border/50">
                <span className="h-full bg-corner-red" style={{ width: `${anchoRojo}%` }} />
              </span>
              <span className="flex h-1.5 flex-1 overflow-hidden rounded-full bg-border/50">
                <span className="h-full bg-corner-blue" style={{ width: `${anchoAzul}%` }} />
              </span>
            </span>
          </span>
        </th>
      </tr>
      <CornerRow corner="red" name={redName} stats={red} conSumisiones={conSumisiones} />
      <CornerRow corner="blue" name={blueName} stats={blue} conSumisiones={conSumisiones} />
    </>
  );
}
