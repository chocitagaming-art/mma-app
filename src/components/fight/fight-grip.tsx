import { Fragment } from "react";

import { PREMIUM_TILE } from "@/components/fighter/premium-tile";
import {
  buildFightGripView,
  gripSegments,
  type FightGripViewInput,
  type GripSegment,
  type GripSegmentCorner,
} from "@/lib/fight-grip-view";
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
 * línea la barra incumple WCAG 1.4.11. Lo fija src/lib/contrast.test.ts.
 *
 * 🪤 Y VA EN FLUJO, NO ENCIMA. Hasta el 15-ago-2026 los separadores eran un
 * overlay absoluto de 2 px centrado en la frontera (`left: calc(X% - 1px)`),
 * así que se pintaban SOBRE los rellenos y tapaban 1 px del tramo de cada lado.
 * Medido sobre las 8.612 fichas con carril real de 301 px a 375 px: en 641
 * (7,4 %) un tramo con segundos medidos quedaba por debajo de eso, y en 284
 * (3,3 %) desaparecía del todo. La barra decía «cero» donde el texto de justo
 * debajo publicaba «<1 % (0:01)».
 *
 * Lo cual era exactamente la mentira que el separador vino a impedir: el
 * comentario que estaba aquí decía que iba por posición «porque un borde de
 * 2 px dentro de un tramo estrecho se lo come entero». Se blindó una puerta y
 * se dejó abierta la de al lado, que es el patrón que ya se repitió con el
 * `Math.round` y con las partículas de los apellidos.
 *
 * En flujo, los 2 px del separador los ceden los rellenos por flex-shrink,
 * repartidos en proporción a su tamaño: ningún tramo pierde píxeles PROPIOS y
 * las cifras publicadas no se tocan. No se pone suelo mínimo a propósito —
 * dibujar un tramo más ancho de lo que es sería el mismo pecado por el otro
 * lado, y el «<1 %» del texto ya cuenta lo que la barra no puede.
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
      // El e2e que vigila que ningún tramo se quede sin píxeles necesita
      // agarrarse a algo: colgarlo de las clases de Tailwind ya rompió el test
      // una vez, al quitar `relative` de aquí.
      data-testid="grip-bar"
      className={cn("flex w-full overflow-hidden rounded-sm", className)}
    >
      {segments.map((segment, i) => (
        <Fragment key={segment.corner}>
          {i > 0 ? <span className="w-0.5 shrink-0 bg-card" /> : null}
          <span
            className={cn("h-full", RELLENO[segment.corner])}
            // 🪤 UN PIXEL DE SUELO, y solo uno. Sacar el separador del overlay
            // arreglo la OCLUSION pero no el REDONDEO DEL PINTADO: Chrome fija
            // el fondo de una caja entre round(inicio) y round(fin) en pixeles
            // de dispositivo, asi que una caja de 0,33 px existe en el arbol y
            // no pinta nada. Quedaban 111 fichas a 375 px publicando
            // «<1 % (0:01)» sobre una barra sin un solo pixel de ese color.
            //
            // El suelo miente, si. Medido: como mucho 0,331 puntos en la barra
            // grande (301 px) y 1,041 en la de asalto (96 px). El PORCENTAJE
            // QUE SE PUBLICA AL LADO ya se redondea a entero, o sea que se
            // aleja del real hasta 0,500 puntos por definicion: en la barra
            // grande el suelo miente MENOS que el numero que el lector lee.
            // Entre dibujar 0,33 puntos de mas y afirmar un cero que no
            // existe, la primera es la mentira pequena.
            //
            // Va en las DOS barras o en ninguna: con suelo solo en la grande,
            // el resumen dibujaria tramos que las barras de asalto del mismo
            // tile no dibujan, y dos vistas del mismo dato dejarian de cuadrar.
            style={{ width: `${segment.share * 100}%`, minWidth: "1px" }}
          />
        </Fragment>
      ))}
    </span>
  );
}

/**
 * "19 % (2:49)" — el porcentaje primero, que es lo que se entiende.
 *
 * 🪤 Salvo cuando el redondeo dejaría un «0 %» sobre segundos MEDIDOS: ahí se
 * rotula «<1 %». Un 0 % afirma ausencia, y con 3 segundos de agarre no la hay.
 * Eran 494 combates publicando «0 % (0:03)» con la misma tipografía que el cero
 * de verdad, hasta que la revisión de después de desplegar lo cazó.
 *
 * El suelo NO se pone en el reparto: subir cada parte diminuta a 1 % infla el
 * total —dos partes de 1 s en un combate de 501 publicarían un 2 % donde hay un
 * 0,4 %— y eso lo prohíbe el barrido de fight-headline.test.ts. La parte
 * diminuta se queda pequeña en la aritmética y se declara pequeña en el texto.
 */
function cifra(segment: GripSegment): string {
  // La condición mira la fracción EXACTA, no el entero que le tocó en el
  // reparto: dos tramos con los mismos segundos tienen que rotularse igual. En
  // 3850 los dos sujetaron 0:01 y el resto mayor le daba el punto a uno de los
  // dos, así que salían «1 %» y «<1 %» sobre relojes idénticos.
  const menorQueUno = segment.seconds > 0 && segment.share * 100 < 1;
  const porcentaje = menorQueUno ? "<1" : `${segment.percent}`;
  return `${porcentaje} % (${segment.clock})`;
}

/**
 * La cifra de un tramo concreto, o el cero MEDIDO si ese tramo no se dibuja.
 *
 * Un tramo de anchura cero desaparece del dibujo —pintarlo con su separador lo
 * haría visible sin serlo— pero su cifra se sigue publicando: son 167 combates
 * en los que alguna esquina no llegó a sujetar ni un segundo, y ese cero es un
 * dato medido, no un hueco.
 *
 * 🪤 Y por eso "0 % (0:00)" NO se usa nunca para un asalto sin acta: ahí se
 * escribe «sin acta de este asalto». Es justo la diferencia que la columna
 * «Control» de la tabla de al lado no hace —imprime 0:00 en los dos casos—, y
 * el motivo de que este bloque tenga tubería propia.
 */
function cifraDe(segments: GripSegment[], corner: GripSegmentCorner): string {
  const segment = segments.find((s) => s.corner === corner);
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
    <section data-testid="fight-grip" className={cn(PREMIUM_TILE, "p-5 sm:p-6")}>
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

      {/* 🪤 Las tres cifras NO caben en una fila a 375 px. Medido: los tres
          rótulos suman 336 px de mono y el carril útil son 335. Puestas en una
          sola fila se parten cada una en dos líneas y el bloque se lee como un
          amasijo. Van en dos alturas: las dos esquinas a sus extremos —bajo su
          nombre y su tramo, que es lo que mantiene el mapeo izquierda = rojo—
          y el residuo centrado debajo, que es donde está su tramo. */}
      <div className="mt-2 flex items-baseline justify-between gap-3 font-mono text-[0.7rem] text-muted-foreground">
        <span className="tabular whitespace-nowrap">{cifraDe(segments, "red")}</span>
        <span className="tabular whitespace-nowrap">{cifraDe(segments, "blue")}</span>
      </div>
      {segments.some((s) => s.corner === "nobody") ? (
        <p className="tabular mt-1 text-center font-mono text-[0.7rem] text-muted-foreground">
          nadie sujetaba {cifraDe(segments, "nobody")}
        </p>
      ) : null}
      {/* 🪤 El alpha de esta línea NO puede bajar de /90. Con el /80 que tenía
          daba 4,01:1 sobre el extremo oscuro del degradado del tile en tema
          claro, donde el texto pequeño pide 4,5 — en las 8.612 fichas. Y no lo
          cazó nadie durante cuatro días porque axe-core NO SABE resolver un
          fondo en degradado: dejaba este nodo en `incomplete`, y el vigilante
          solo leía `violations`. Ahora lo mide e2e/contraste-degradado.ts.
          Sigue siendo la línea más tenue del bloque (5,30 contra los 6,78 del
          texto de encima), que es lo que la ordena por detrás de las cifras. */}
      <p className="tabular mt-0.5 text-center font-mono text-[0.7rem] text-muted-foreground/90">
        de {totalClock} de combate
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

      {/* 🪤 «Datos oficiales» era la TERCERA forma de nombrar la fuente en la
          misma pantalla, y la segunda de nombrar ESTA: el bloque de abajo ya
          decía «(fuente ufcstats)» para el mismo origen. Dos maneras de decir
          lo mismo invitan a pensar que son dos cosas. Ahora las dos fuentes
          reales de la ficha se escriben con la misma plantilla, «(fuente X)».
          Y dice «Control:» y no «Datos» a secas porque solo el reparto sale del
          acta: el titular y la nota usan fights.method y fights.winner_id, que
          en la noche del evento son el resultado provisional de ESPN. */}
      <p className="mt-3 text-right text-[0.7rem] text-muted-foreground">
        Control: acta oficial (fuente ufcstats)
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
                // Los asaltos van en FILAS y las tres esquinas en columnas, al
                // revés que el maquetado. Motivo medido a 375 px: con los
                // asaltos en columnas la tabla crece con el combate y de tres
                // asaltos solo se veían dos sin arrastrar; en uno de cinco
                // (12863) se saldrían tres. Así son siempre cuatro columnas.
                "w-full min-w-[300px] text-xs",
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
                  {(
                    [
                      ["red", redLastName],
                      ["nobody", "Nadie"],
                      ["blue", blueLastName],
                    ] as const
                  ).map(([corner, etiqueta]) => (
                    <th
                      key={corner}
                      scope="col"
                      className="w-1/3 truncate px-1.5 py-2 text-center font-display text-[0.7rem] font-bold tracking-wide uppercase"
                    >
                      <span
                        className={cn(
                          corner === "red" && "text-corner-red",
                          corner === "blue" && "text-corner-blue",
                          corner === "nobody" && "text-muted-foreground",
                        )}
                      >
                        {etiqueta}
                      </span>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rounds.map(({ round, split }) => (
                  <Fragment key={round}>
                    {/* El asalto como subcabecera a todo lo ancho, con su barra
                        al lado: es el patrón del vecino (round-by-round.tsx:263)
                        y libera la columna de rótulos, que a 375 px se comía el
                        último dato. */}
                    <tr className="bg-muted/40">
                      <th
                        colSpan={3}
                        scope="colgroup"
                        className="px-1.5 py-1.5 text-left font-mono text-[0.6rem] font-semibold tracking-[0.14em] text-muted-foreground uppercase"
                      >
                        <span className="flex items-center gap-2">
                          <span className="shrink-0">Asalto {round}</span>
                          {split ? (
                            <GripBar
                              segments={gripSegments(split)}
                              className="ml-auto h-1.5 w-24 shrink-0 sm:w-40"
                            />
                          ) : null}
                        </span>
                      </th>
                    </tr>
                    <tr className="border-b border-border/60 last:border-b-0">
                      {split ? (
                        (["red", "nobody", "blue"] as const).map((corner) => (
                          <td
                            key={corner}
                            className="tabular px-1.5 py-2 text-center font-mono text-xs whitespace-nowrap"
                          >
                            {cifraDe(gripSegments(split), corner)}
                          </td>
                        ))
                      ) : (
                        // Aquí NO vale un guion ni un 0:00 en las tres celdas:
                        // se leería como "no sujetó nadie", que es lo contrario
                        // de "de este asalto no se conserva el dato".
                        <td
                          colSpan={3}
                          className="px-1.5 py-2 text-center font-mono text-[0.7rem] text-muted-foreground"
                        >
                          sin acta de este asalto
                        </td>
                      )}
                    </tr>
                  </Fragment>
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
