import { PREMIUM_TILE } from "@/components/fighter/premium-tile";
import {
  buildFightGripView,
  gripSegments,
  segmentBoundaries,
  type FightGripViewInput,
  type GripSegment,
  type GripSegmentCorner,
} from "@/lib/fight-grip-view";
import type { GripSplit } from "@/lib/fight-grip";
import { cn } from "@/lib/utils";

// T8 de la película — "el reparto de agarre": cuánto del combate se peleó
// agarrado, quién sujetaba a quién, y cuánto no lo sujetaba ninguno.
//
// ⚠️ TRES BLOQUES SEGUIDOS EN LA MISMA FICHA. Este va entre "La película del
// combate" (fight-timeline.tsx) y "Asalto a asalto" (round-by-round.tsx), y los
// tres hablan del mismo combate. Lo que los separa:
//   · los otros dos hablan de GOLPES; este habla de SEGUNDOS AGARRADO. No
//     imprime ni una cifra de golpeo, así que no añade un tercer marcador.
//   · la película sale de ESPN en directo y solo existe en 32 peleas de 8.612;
//     este sale del acta de ufcstats, igual que "Asalto a asalto".
// Por eso este bloque NO lleva la cejilla mono en mayúsculas que llevan los
// otros dos: su titular es una frase, no un rótulo de sección. Si tuviera la
// misma cabecera, serían tres cabeceras idénticas seguidas.
//
// El rótulo es AGARRADOS y nunca "control": la tabla de abajo ya tiene una
// columna «Control» (round-by-round.tsx:184) y en español "tenía el control"
// se lee como "iba ganando", que es un veredicto y no un hecho.

type FightGripProps = FightGripViewInput;

const RELLENO: Record<GripSegmentCorner, string> = {
  red: "bg-corner-red",
  nobody: "bg-grip-nobody",
  blue: "bg-corner-blue",
};

/**
 * La barra cerrada: los tres tramos, con su separador en cada frontera.
 *
 * ⚠️ El separador NO es decoración. Ningún relleno llega a 3:1 contra su vecino
 * —«nadie» contra el rojo da 1.39 y contra el azul 1.26, medido— así que sin la
 * línea la barra incumple WCAG 1.4.11. Va por posición absoluta y no como borde
 * de cada tramo: un borde de 2 px dentro de un tramo estrecho se lo come entero.
 * Lo fija src/lib/contrast.test.ts.
 *
 * aria-hidden porque las cifras exactas van debajo en texto: repetirlas solo
 * añadiría ruido al lector de pantalla.
 */
function GripBar({
  segments,
  className,
}: {
  segments: GripSegment[];
  className?: string;
}) {
  return (
    <span
      aria-hidden
      className={cn(
        "relative flex w-full overflow-hidden rounded-sm",
        className,
      )}
    >
      {segments.map((segment) => (
        <span
          key={segment.corner}
          className={cn("h-full", RELLENO[segment.corner])}
          style={{ width: `${segment.share * 100}%` }}
        />
      ))}
      {segmentBoundaries(segments).map((posicion) => (
        <span
          key={posicion}
          className="absolute inset-y-0 w-0.5 bg-card"
          style={{ left: `calc(${posicion}% - 1px)` }}
        />
      ))}
    </span>
  );
}

/** "19 % (2:49)" — el porcentaje primero, que es lo que se entiende. */
function cifra(segment: GripSegment): string {
  return `${segment.percent} % (${segment.clock})`;
}

function celdaDeAsalto(split: GripSplit | null, corner: GripSegmentCorner) {
  if (!split) {
    return "—";
  }
  const segment = gripSegments(split).find((s) => s.corner === corner);
  // gripSegments descarta los tramos de anchura cero para no dibujarlos, pero
  // la cifra SÍ se publica: un cero medido es un dato, y callarlo lo convertiría
  // en un hueco. Es la diferencia que separa este bloque de la columna
  // «Control» de la tabla de al lado, que imprime 0:00 donde no hay acta.
  return segment ? cifra(segment) : "0 % (0:00)";
}

export function FightGrip(props: FightGripProps) {
  const view = buildFightGripView(props);

  // Sin reparto publicable, la sección entera desaparece. No se pinta un tile
  // vacío ni un "no hay datos": la ficha queda igual que antes.
  if (!view) {
    return null;
  }

  const { headline, segments, rounds, redLastName, blueLastName, totalClock } =
    view;
  const asaltos = rounds.length;

  return (
    <section className={cn(PREMIUM_TILE, "p-5 sm:p-6")}>
      {/* El titular va en caja normal, no gritado: 46 caracteres en mayúsculas
          son tres líneas a 375 px, y el titular canónico mide exactamente 46. */}
      <p className="text-balance font-display text-lg leading-tight font-bold sm:text-xl">
        {headline.headline}
      </p>
      <p className="mt-1.5 text-sm text-muted-foreground">{headline.subhead}</p>

      {/* 🪤 Los dos apellidos con justify-between y SIN flex-wrap. Con
          `flex-wrap … justify-center` (lo que hace fight-timeline.tsx:292) a
          375 px envuelve a dos líneas centradas y rompe el mapeo
          izquierda = rojo / derecha = azul, que es lo único que desambigua a
          las dos esquinas en escala de grises. */}
      <div className="mt-5 flex items-baseline justify-between gap-3">
        <span className="min-w-0 truncate font-display text-xs font-bold tracking-wide text-corner-red uppercase">
          {redLastName}
        </span>
        <span className="min-w-0 truncate font-display text-xs font-bold tracking-wide text-corner-blue uppercase">
          {blueLastName}
        </span>
      </div>

      <GripBar segments={segments} className="mt-1.5 h-7" />

      <div className="mt-1.5 flex items-start justify-between gap-2 font-mono text-[0.7rem] text-muted-foreground">
        {segments.map((segment) => (
          <span
            key={segment.corner}
            className={cn(
              "tabular",
              segment.corner === "nobody" && "text-center",
              segment.corner === "blue" && "text-right",
            )}
          >
            {segment.corner === "nobody" ? "nadie sujetaba " : ""}
            {cifra(segment)}
          </span>
        ))}
      </div>
      <p className="mt-0.5 text-right font-mono text-[0.7rem] text-muted-foreground">
        de {totalClock}
      </p>

      {/* Regla 5: si se enseña un porcentaje del reparto, se enseñan los dos.
          Con el "de pie" dentro, Miranda es el 26 %; sin él, el 58 %. Misma
          pelea, dos titulares opuestos: el denominador es un botón de encuadre
          disfrazado de dato. */}
      {headline.grappledLine ? (
        <p className="mt-4 text-sm">{headline.grappledLine}</p>
      ) : null}

      {headline.note ? (
        <p className="mt-2 text-sm text-muted-foreground">{headline.note}</p>
      ) : null}

      <p className="mt-3 text-right text-[0.7rem] text-muted-foreground">
        Datos oficiales
      </p>

      {/* <details> nativo y no el disclosure de la casa: ese pliega con
          aria-hidden pero sin `hidden` ni `inert` (event-bout-disclosure.tsx:79),
          así que lo plegado sigue siendo tabulable. Aquí el panel lleva una
          tabla, y con <details> el contenido cerrado queda fuera del orden de
          tabulación por construcción, no por parche. Y no necesita "use client". */}
      {asaltos > 0 ? (
        <details className="group mt-4 border-t border-border pt-3">
          <summary className="cursor-pointer list-none font-mono text-xs font-semibold tracking-[0.14em] text-muted-foreground uppercase hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring">
            <span aria-hidden className="mr-1.5 inline-block group-open:hidden">
              ▾
            </span>
            <span aria-hidden className="mr-1.5 hidden group-open:inline-block">
              ▴
            </span>
            {/* Nunca "asalto a asalto": es el título literal de la sección de
                al lado, y dos rótulos iguales se leen como el mismo bloque. */}
            Ver los {asaltos === 1 ? "datos del asalto" : `${asaltos} asaltos`}
          </summary>

          {/* tabIndex + nombre accesible porque la tabla puede desbordar a lo
              ancho con 5 asaltos: un carril que solo se recorre arrastrando deja
              fuera a quien navega con teclado. Es la regla que axe llama
              scrollable-region-focusable, y el vecino de abajo la incumple hoy
              (round-by-round.tsx:152) — no se hereda el fallo por copiar. */}
          <div
            className="mt-3 overflow-x-auto"
            tabIndex={0}
            role="region"
            aria-label={`Reparto del agarre por asaltos, ${redLastName} contra ${blueLastName}`}
          >
            <table
              className={cn(
                "w-full text-sm",
                asaltos > 3 ? "min-w-[520px]" : "min-w-[320px]",
              )}
            >
              <caption className="sr-only">
                Reparto del tiempo de agarre asalto por asalto entre{" "}
                {redLastName} y {blueLastName}, en porcentaje de la duración de
                cada asalto y en minutos y segundos. «Nadie» es el tiempo en que
                ninguno de los dos sujetaba al otro.
              </caption>
              <thead>
                <tr className="border-b border-border">
                  <td />
                  {rounds.map((round) => (
                    <th
                      key={round.round}
                      scope="col"
                      className="px-2 py-2 text-right font-mono text-[0.65rem] font-semibold tracking-[0.14em] text-muted-foreground uppercase"
                    >
                      Asalto {round.round}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                <tr className="border-b border-border/60">
                  <th
                    scope="row"
                    className="py-2 pr-3 text-left font-mono text-[0.65rem] font-semibold tracking-[0.14em] text-muted-foreground uppercase"
                  >
                    Agarrados
                  </th>
                  {rounds.map((round) => (
                    <td key={round.round} className="px-2 py-2">
                      {round.split ? (
                        <GripBar
                          segments={gripSegments(round.split)}
                          className="h-2"
                        />
                      ) : (
                        <span className="block text-right font-mono text-[0.7rem] text-muted-foreground">
                          sin medir
                        </span>
                      )}
                    </td>
                  ))}
                </tr>

                {(
                  [
                    ["red", redLastName],
                    ["nobody", "Nadie"],
                    ["blue", blueLastName],
                  ] as const
                ).map(([corner, etiqueta]) => (
                  <tr key={corner} className="border-b border-border/60 last:border-b-0">
                    <th
                      scope="row"
                      className="max-w-32 truncate py-2 pr-3 text-left font-display text-xs font-bold tracking-wide uppercase"
                    >
                      <span className="flex min-w-0 items-center gap-2">
                        <span
                          aria-hidden
                          className={cn(
                            "size-1.5 shrink-0 rounded-full",
                            RELLENO[corner],
                          )}
                        />
                        <span
                          className={cn(
                            "truncate",
                            corner === "red" && "text-corner-red",
                            corner === "blue" && "text-corner-blue",
                            corner === "nobody" && "text-muted-foreground",
                          )}
                        >
                          {etiqueta}
                        </span>
                      </span>
                    </th>
                    {rounds.map((round) => (
                      <td
                        key={round.round}
                        className="tabular px-2 py-2 text-right font-mono text-sm whitespace-nowrap"
                      >
                        {celdaDeAsalto(round.split, corner)}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <p className="mt-3 text-xs text-muted-foreground">
            Sujeto = en el suelo o contra la valla, sin poder soltarse. Nadie =
            ninguno de los dos sujeta al otro. No dice desde dónde se sujeta: el
            acta no distingue la posición.
          </p>
        </details>
      ) : null}
    </section>
  );
}
