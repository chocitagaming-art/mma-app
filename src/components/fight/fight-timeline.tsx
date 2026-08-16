import { PREMIUM_TILE } from "@/components/fighter/premium-tile";
import {
  ROUND_SECONDS,
  buildFightTimeline,
  decimateSamples,
  periodForSeconds,
  scaleSeconds,
  scaleValue,
  timelinePointLabel,
  type ControlBand,
  type ControlBandOwner,
  type CornerSeries,
  type FightTimelineSample,
} from "@/lib/fight-timeline";
import {
  TIMELINE_DASH_OFF,
  TIMELINE_DASH_ON,
  controlLaneOffset,
  readsAsDashed,
  selectMarkerIndices,
  splitReconciledSeries,
} from "@/lib/fight-timeline-markers";
import { formatControlTime } from "@/lib/format";
import { cn } from "@/lib/utils";

// Timeline del directo (migración 024): la "película" del combate. Line chart
// SVG server-rendered (patrón ranking-trajectory, sin librerías): golpes
// significativos conectados ACUMULADOS de cada esquina sobre el tiempo real de
// combate, con los cortes de asalto y anillos en los knockdowns. Identidad no
// solo por color (CVD): la roja lleva círculos y la azul rombos, como el radar.
// Solo se pinta si hay historia (peleas muestreadas en directo desde jul-2026
// + el backfill de UFC 329); sin muestras devuelve null y la ficha queda igual.
//
// SEGUNDA CAPA (ago-2026): LA BANDA DE AGARRE. Los tramos en que uno sujetaba
// al otro, que es lo que explica los 971 s de línea plana de UFC 330 (ver el
// porqué, con los números, en buildControlBands de lib/fight-timeline.ts).
// Se dibuja en DOS trozos, y no por gusto:
//   · el BAÑO, dentro del área de dibujo, que conecta "la línea está plana" con
//     "porque lo tenía en el suelo" y no afirma nada por sí solo;
//   · el CARRIL, bajo el eje, a color sólido y con dos alturas.
// El reparto es obligado: medido, el rojo y el azul de marca tienen casi la
// misma luminancia y como baño de fondo se distinguen entre sí 1,04:1 (1,10 y
// 1,11 a color sólido). Un baño rojo/azul a secas NO PUEDE decir quién sujetaba
// —en escala de grises, o para un deuteranope, son la misma mancha— y eso
// incumple WCAG 1.4.1. Por eso el dueño se codifica por POSICIÓN (rojo arriba,
// azul abajo), igual que las esquinas ya se codifican por FORMA (círculo/rombo)
// y no solo por color. Lo fija src/lib/contrast.test.ts.

const WIDTH = 760;

type Layout = {
  height: number;
  pad: { top: number; right: number; bottom: number; left: number };
  // El SVG escala completo con el viewBox de 760: en un contenedor de ~310px
  // (móvil) el texto queda a ~0,41x. La compacta (nueva, sin precedente que
  // respetar) compensa con fuente mayor; la completa mantiene el 11 del
  // patrón ranking-trajectory aprobado.
  fontSize: number;
  // Grosor de cada carril de la banda de agarre. Medido en el navegador: la
  // completa se renderiza a 301 px en un móvil de 390 (0,396x), así que sus 4
  // unidades son 1,58 px de pantalla — el DOBLE de los 0,79 px a los que queda
  // la línea de golpes (strokeWidth 2) a esa misma escala, o sea que el carril
  // nunca es lo más fino del dibujo. La compacta lo sube a 7 por lo mismo que
  // sube su fontSize a 17: vive dentro de una tarjeta de /en-vivo, más estrecha
  // todavía que el ancho completo del móvil.
  lane: number;
};

// 🪤 EL LIENZO CRECIÓ POR ABAJO Y `pad.bottom` VA CON ÉL, siempre las dos.
// height +14 y pad.bottom +14 en la completa (+20 en la compacta) dejan
// plotHeight EXACTAMENTE igual que antes —246 y 146—, así que las películas ya
// publicadas dibujan sus líneas píxel a píxel donde las dibujaban. Si alguien
// mueve solo una de las dos constantes, el área de dibujo se come el carril o
// las etiquetas "R n" se meten dentro de él.
const FULL: Layout = {
  height: 314, pad: { top: 20, right: 16, bottom: 48, left: 44 },
  fontSize: 11, lane: 4,
};
const COMPACT: Layout = {
  height: 210, pad: { top: 14, right: 12, bottom: 50, left: 44 },
  fontSize: 17, lane: 7,
};

// El color de una esquina, a nivel de módulo porque lo necesitan las líneas Y
// las dos capas de la banda.
function cornerColor(corner: "red" | "blue"): string {
  return corner === "red" ? "var(--corner-red)" : "var(--corner-blue)";
}

// Geometría de la banda, derivada del layout para no clavar números a mano.
function bandLayout(layout: Layout, plotBottom: number) {
  const railTop = plotBottom + layout.lane;
  const gap = Math.floor(layout.lane / 2);
  return {
    railTop,
    gap,
    // Etiqueta "R n" por debajo de los dos carriles: FULL 295 de 314, COMPACT
    // 205 de 210.
    labelY: railTop + 2 * layout.lane + gap + layout.fontSize + 4,
    // Las DOS alturas salen de lib porque son el requisito de 1.4.1, no una
    // preferencia de maquetación: ver controlLaneOffset.
    laneY: (owner: ControlBandOwner) =>
      railTop + controlLaneOffset(owner, layout.lane, gap),
  };
}

// Los puntos de una esquina llevados al área de dibujo. Vive a nivel de módulo
// —y no dentro de CornerPoints— porque la cabecera lo necesita también: decidir
// si la frase del pie sobre el tramo corregido tiene algo que señalar es una
// pregunta de PÍXELES (ver readsAsDashed), y con la serie sin escalar no se
// puede contestar. Una sola función para que las dos respuestas se calculen
// sobre la misma geometría.
function layOutSeries(
  series: CornerSeries,
  totalSeconds: number,
  maxValue: number,
  layout: Layout,
) {
  const plotWidth = WIDTH - layout.pad.left - layout.pad.right;
  const plotHeight = layout.height - layout.pad.top - layout.pad.bottom;
  return series.points.map((p) => ({
    ...p,
    x: scaleSeconds(p.seconds, totalSeconds, layout.pad.left, plotWidth),
    y: scaleValue(p.value, maxValue, layout.pad.top, plotHeight),
  }));
}

// Tope de muestras de la variante compacta (payload RSC de /en-vivo cada
// 20 s): suficiente para la forma de la película sin arrastrar ~75 puntos.
const COMPACT_MAX_SAMPLES = 40;

// Tacha de derribo: segmento vertical PEGADO al punto pero fuera del anillo de
// knockdown (r = 7), para que un punto con las dos cosas se siga leyendo.
const TD_TICK_GAP = 8;
const TD_TICK_LEN = 7;

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
  const colorVar = cornerColor(corner);
  const plotHeight = layout.height - layout.pad.top - layout.pad.bottom;
  const laidOut = layOutSeries(series, totalSeconds, maxValue, layout);
  if (laidOut.length === 0) {
    return null;
  }
  const plotBottom = layout.pad.top + plotHeight;
  // La polilínea usa TODOS los puntos; solo los marcadores se adelgazan.
  const markerIndices = selectMarkerIndices(laidOut);
  // El tramo que ESPN rehace al cerrar se dibuja discontinuo en vez de fingir
  // una acumulada que baja (ver fight-timeline-markers.ts).
  const { solid, reconciled } = splitReconciledSeries(laidOut);
  // La bisagra es el último punto del sólido, así que el primero corregido es
  // el que ocupa esa misma posición en el array completo.
  const correctedIndex = reconciled.length > 0 ? solid.length : -1;
  // Derribos con TOPE en el total final de la esquina: la suma de los tdDelta
  // se queda con el máximo del directo y ESPN a veces retira uno al cerrar
  // (14022, rojo 6455: acredita el segundo en R3 y lo quita; el acta y la tabla
  // de asaltos de esta misma ficha dicen 1). Se conservan los PRIMEROS: la
  // corrección siempre retira lo último acreditado.
  const tdMarks = new Map<number, number>();
  let tdBudget = series.tdTotal;
  for (let idx = 0; idx < laidOut.length && tdBudget > 0; idx++) {
    const marks = Math.min(laidOut[idx].tdDelta, tdBudget);
    if (marks > 0) {
      tdMarks.set(idx, marks);
      tdBudget -= marks;
    }
  }
  const asPoints = (pts: typeof laidOut) =>
    pts.map((p) => `${p.x},${p.y}`).join(" ");
  return (
    <g>
      {/* Guarda: con la bajada en el punto 1 el tramo sólido se queda con un
          único punto y no hay polilínea que dibujar. */}
      {solid.length > 1 ? (
        <polyline
          points={asPoints(solid)}
          fill="none"
          stroke={colorVar}
          strokeWidth={2}
          strokeLinejoin="round"
          strokeLinecap="round"
        />
      ) : null}
      {reconciled.length > 1 ? (
        // Trama medida EN PANTALLA, no en el viewBox: el SVG de 760 se escala a
        // 0,40x en un móvil de 390 px (301 px reales, medido en /fights/14232),
        // así que la "5 4" de manual se queda en 2 px de guion y el tramo se lee
        // como una línea fina cualquiera. Con "9 6" al 75 % siguen viéndose los
        // cortes a 0,40x y en escritorio no pesa más que la línea sólida.
        // 🪤 Y no siempre llega a verse discontinua: cuando la corrección es de
        // un golpe en el mismo segundo, el trazo mide menos que un guion. Quien
        // sabe eso es readsAsDashed, y de él cuelga la frase del pie.
        <polyline
          points={asPoints(reconciled)}
          fill="none"
          stroke={colorVar}
          strokeWidth={2}
          strokeLinejoin="round"
          strokeLinecap="round"
          strokeDasharray={`${TIMELINE_DASH_ON} ${TIMELINE_DASH_OFF}`}
          strokeOpacity={0.75}
        />
      ) : null}
      {laidOut.map((p, idx) => {
        if (!markerIndices.has(idx)) {
          return null;
        }
        const tdCount = tdMarks.get(idx) ?? 0;
        const title = `${name}: ${p.value} golpes sig. (${p.label})${
          p.kdDelta > 0 ? " · ¡KD!" : ""
        }${tdCount === 1 ? " · derribo" : tdCount > 1 ? ` · ${tdCount} derribos` : ""}${
          idx === correctedIndex ? " · ESPN corrigió el recuento aquí" : ""
        }`;
        // La tacha baja desde el punto, salvo que no quepa: un derribo sin
        // golpes conectados deja el punto en el suelo del área (8 de los 77
        // puntos con derribo medidos) y la tacha se comería las etiquetas
        // "R1/R2" del eje.
        const tdDown = p.y + TD_TICK_GAP + TD_TICK_LEN <= plotBottom;
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
            {/* Tacha(s) de derribo: una por derribo, centradas en el punto. */}
            {Array.from({ length: tdCount }, (_, mark) => {
              const x = p.x + (mark - (tdCount - 1) / 2) * 4;
              const from = p.y + (tdDown ? TD_TICK_GAP : -TD_TICK_GAP);
              const to = from + (tdDown ? TD_TICK_LEN : -TD_TICK_LEN);
              return (
                <line
                  key={`td-${mark}`}
                  x1={x}
                  y1={from}
                  x2={x}
                  y2={to}
                  stroke={colorVar}
                  strokeWidth={2}
                  strokeLinecap="round"
                />
              );
            })}
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

// Rectángulo de un tramo sobre el eje X, compartido por las dos capas: el baño
// y el carril tienen que empezar y acabar EXACTAMENTE en el mismo píxel o el
// ojo lee dos cosas distintas.
function bandRect(
  band: ControlBand,
  totalSeconds: number,
  layout: Layout,
): { x: number; width: number } {
  const plotWidth = WIDTH - layout.pad.left - layout.pad.right;
  const x = scaleSeconds(band.from, totalSeconds, layout.pad.left, plotWidth);
  const end = scaleSeconds(band.to, totalSeconds, layout.pad.left, plotWidth);
  return { x, width: Math.max(0, end - x) };
}

/**
 * Capa 1 — EL BAÑO. Va DEBAJO de todo (rejillas incluidas), a altura completa
 * del área de dibujo y con la opacidad en un token.
 *
 * 🪤 No lleva borde ni etiqueta y su contraste contra el tile es de susurro
 * (1,22-1,28 en claro, 1,18-1,24 en oscuro) A PROPÓSITO: es atmósfera, no dato.
 * Quien AFIRMA es el carril de abajo, que sí cumple 1.4.11. Los números que
 * fijan el alpha están en el comentario de --timeline-band, en globals.css.
 */
function ControlWash({
  bands,
  totalSeconds,
  layout,
}: {
  bands: ControlBand[];
  totalSeconds: number;
  layout: Layout;
}) {
  const plotHeight = layout.height - layout.pad.top - layout.pad.bottom;
  return (
    <g aria-hidden>
      {bands.map((band) => {
        const { x, width } = bandRect(band, totalSeconds, layout);
        return (
          <rect
            key={`wash-${band.from}-${band.owner}`}
            x={x}
            y={layout.pad.top}
            width={width}
            height={plotHeight}
            fill={cornerColor(band.owner)}
            style={{ fillOpacity: "var(--timeline-band)" }}
          />
        );
      })}
    </g>
  );
}

/**
 * Capa 2 — EL CARRIL. Fuera del área de dibujo, a color sólido, en dos alturas:
 * el rojo pegado al eje y el azul justo debajo.
 *
 * Es la capa que afirma, y por eso va sólida: 4,86-6,12:1 contra los dos
 * extremos del degradado del tile en los dos temas, donde 1.4.11 pide 3.
 *
 * 🪤 Y NO NECESITA SEPARADOR, al revés que GripBar: dos tramos de dueños
 * distintos nunca se tocan porque viven en carriles distintos, y dos del mismo
 * dueño nunca se tocan porque buildControlBands los funde en uno. Si alguien
 * "simplifica" esto a un solo carril coloreado según el dueño, vuelve el
 * problema que GripBar resolvió con la línea de separación: rojo contra azul
 * mide 1,10:1.
 *
 * El <title> publica los SEGUNDOS MEDIDOS del tramo, que es lo que salva la
 * honradez del umbral de 1/3: el rectángulo marca dónde, y el texto dice cuánto
 * de ese dónde fue agarre. El peor caso de UFC 330 es un tramo de 31 s que
 * declara "sujetó 0:14" — no miente, se explica.
 */
function ControlRail({
  bands,
  totalSeconds,
  layout,
  plotBottom,
  redName,
  blueName,
}: {
  bands: ControlBand[];
  totalSeconds: number;
  layout: Layout;
  plotBottom: number;
  redName: string;
  blueName: string;
}) {
  const { laneY } = bandLayout(layout, plotBottom);
  return (
    <g>
      {bands.map((band) => {
        const { x, width } = bandRect(band, totalSeconds, layout);
        const who = band.owner === "red" ? redName : blueName;
        const desde = timelinePointLabel(band.from, periodForSeconds(band.from));
        const hasta = timelinePointLabel(band.to, periodForSeconds(band.to));
        return (
          <rect
            key={`rail-${band.from}-${band.owner}`}
            x={x}
            y={laneY(band.owner)}
            width={width}
            height={layout.lane}
            fill={cornerColor(band.owner)}
          >
            <title>{`${who} sujetó ${formatControlTime(band.seconds)} entre ${desde} y ${hasta}`}</title>
          </rect>
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
  const { red, blue, totalSeconds, rounds, maxValue, control } = timeline;
  const layout = compact ? COMPACT : FULL;
  const plotWidth = WIDTH - layout.pad.left - layout.pad.right;
  const plotHeight = layout.height - layout.pad.top - layout.pad.bottom;
  const plotRight = layout.pad.left + plotWidth;
  const plotBottom = layout.pad.top + plotHeight;
  const { labelY } = bandLayout(layout, plotBottom);

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
  // tdTotal > 0 implica siempre algún tdDelta > 0 (los deltas parten de 0 y son
  // monótonos), así que sirve de gemelo de hasKd sin recorrer los puntos.
  const hasTd = red.tdTotal > 0 || blue.tdTotal > 0;
  // 🪤 LA FRASE DEL PIE SOLO SALE SI HAY ALGO DISCONTINUO QUE MIRAR. No basta
  // con que exista tramo corregido: hay que medir lo que se dibuja, porque una
  // corrección de un golpe en el mismo segundo da un trazo más corto que un
  // guion y se pinta sólido (7 de las 18 series reales, el estelar incluido).
  // Ver readsAsDashed. Sin este filtro, el pie de /fights/12885 anunciaba un
  // tramo discontinuo que en esa ficha no se ve por ninguna parte.
  const hasReconciled = [red, blue].some((series) =>
    readsAsDashed(
      splitReconciledSeries(layOutSeries(series, totalSeconds, maxValue, layout))
        .reconciled,
    ),
  );
  // Una pelea sin agarre no tiene capa: ni rects, ni leyenda, ni frase. La
  // condición es una sola —`control.length`— y de ella cuelga TODO lo que la
  // nombra, para que no pueda quedar un rótulo huérfano sobre un dibujo que no
  // está. Verificado con datos reales: Barboza-Ribovics (19 s de clinch en
  // 6:33) y Johnson-McConico (3 s) dan cero tramos.
  const hasControl = control.length > 0;
  const redBands = control.filter((band) => band.owner === "red").length;
  const blueBands = control.length - redBands;
  // Solo se nombra a quien tiene tramos: "0 tramos de Fulano" es ruido. Pasa de
  // verdad — Turner-Fernandes y Tobias-Fernando, de UFC 330, tienen UN tramo
  // cada uno y los dos son de la esquina roja.
  const bandsPhrase = [
    redBands > 0
      ? `${redBands} ${redBands === 1 ? "tramo" : "tramos"} de ${redName}`
      : null,
    blueBands > 0
      ? `${blueBands} ${blueBands === 1 ? "tramo" : "tramos"} de ${blueName}`
      : null,
  ]
    .filter(Boolean)
    .join(" y ");
  // 🪤 EL <title> DE CADA RECT NO LLEGA AL LECTOR DE PANTALLA: el <svg
  // role="img"> poda a sus descendientes, así que son tooltip de ratón y nada
  // más (mismo límite que ya tienen los marcadores). Todo lo que la banda le
  // diga a quien no ve tiene que caber AQUÍ.
  //
  // Y cuenta TRAMOS, nunca totales: el bloque de agarre de justo debajo ya
  // publica los segundos, y los saca del acta de ufcstats mientras que esto
  // sale de ESPN en directo. Dos cifras del mismo dato a 100 px de distancia y
  // de dos fuentes distintas es un bug esperando a que las fuentes discrepen.
  // La película cuenta CUÁNDO; el bloque de abajo cuenta CUÁNTO.
  const ariaLabel =
    `Película del combate. Golpes significativos conectados: ${redName} ${red.final ?? "—"}, ` +
    `${blueName} ${blue.final ?? "—"}, en ${rounds} ${rounds === 1 ? "asalto" : "asaltos"}.` +
    (hasControl ? ` Bajo el eje, la franja de agarre: ${bandsPhrase}.` : "");

  const chart = (
    <svg
      viewBox={`0 0 ${WIDTH} ${layout.height}`}
      className="h-auto w-full"
      role="img"
      aria-label={ariaLabel}
    >
      <title>{ariaLabel}</title>

      {/* El baño, ANTES que nada: por debajo de las rejillas y de las líneas. */}
      {hasControl ? (
        <ControlWash bands={control} totalSeconds={totalSeconds} layout={layout} />
      ) : null}

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
          // Ya no es "un poco por debajo del eje": entre el eje y esta etiqueta
          // van ahora los dos carriles de la banda (ver bandLayout).
          y={labelY}
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

      {/* El carril, EL ÚLTIMO: va encima de las líneas en orden de pintado,
          pero fuera del área de dibujo, así que no tapa ni un píxel de ellas. */}
      {hasControl ? (
        <ControlRail
          bands={control}
          totalSeconds={totalSeconds}
          layout={layout}
          plotBottom={plotBottom}
          redName={redName}
          blueName={blueName}
        />
      ) : null}
    </svg>
  );

  if (compact) {
    return (
      <div className="pt-2">
        {chart}
        <p className="pt-1 text-center font-mono text-[0.55rem] uppercase tracking-[0.12em] text-muted-foreground">
          Evolución · golpes sig.
          {hasControl ? " y agarre" : " conectados"}
          {hasReconciled ? " · tramo corregido" : ""}
        </p>
      </div>
    );
  }

  return (
    <section className={cn(PREMIUM_TILE, "p-5 sm:p-6")}>
      <p className="text-center font-mono text-xs font-semibold uppercase tracking-[0.2em] text-primary">
        La película del combate
      </p>
      {/* 🪤 «SUJETABA», NUNCA «CONTROL». Lo razona fight-grip.tsx:26-29: la tabla
          de «Asalto a asalto» de esta misma ficha ya tiene una columna
          «Control», y en español «tenía el control» se lee como «iba ganando»,
          que es un veredicto y no un hecho. En el código sí se llama
          ControlBand/ctrl, que es la clave del contrato de ESPN. */}
      <p className="mt-1 text-center text-xs text-muted-foreground">
        {hasControl
          ? "Las líneas son los golpes significativos conectados; la franja de abajo, los tramos en que uno sujetaba al otro. En directo (fuente ESPN)."
          : "Golpes significativos conectados acumulados, capturados en directo (fuente ESPN)."}
        {hasKd ? " Los anillos marcan knockdowns." : ""}
        {hasTd ? " Las tachas, los derribos." : ""}
        {hasReconciled
          ? " El tramo discontinuo es el recuento que ESPN rehízo al cerrar."
          : ""}
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
        {/* La tercera fila es EL CARRIL EN MINIATURA, no un cuadrado de color:
            enseña la convención (rojo arriba, azul abajo) sin tener que
            explicarla, y el orden de las dos filas de arriba ya la repite.
            🪤 Y NO LLEVA CIFRA. Ver el aria-label: los totales de agarre son
            del bloque de justo debajo, que los saca del acta. Añadir aquí un
            «— 12:30» pondría dos números del mismo hecho, de dos fuentes
            distintas, a un dedo de distancia. */}
        {hasControl ? (
          <li className="flex items-center gap-2">
            <span
              aria-hidden
              className="inline-flex h-2.5 w-5 flex-col justify-between"
            >
              <span className="h-1 w-full bg-corner-red" />
              <span className="h-1 w-full bg-corner-blue" />
            </span>
            <span className="text-xs font-medium text-muted-foreground">
              quién sujetaba
            </span>
          </li>
        ) : null}
      </ul>
    </section>
  );
}
