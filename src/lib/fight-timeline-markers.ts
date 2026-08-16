// Qué se dibuja de una serie de la película ya construida: densidad de
// marcadores y corte del tramo que ESPN reconcilia. Las dos decisiones son de
// RENDER (el builder no se toca) y viven en lib porque vitest corre en entorno
// node: cualquier cuenta metida en el .tsx se queda literalmente sin probar
// (mismo motivo que fight-grip-view.ts:17-24 y round-by-round.ts).
//
// ---------------------------------------------------------------------------
// 1) Densidad de marcadores
//
// El backfill de UFC 329 venía de capturas cada 120 s, así que la película
// completa nunca ha pintado más de ~6 puntos por esquina. El bucle del directo
// muestrea cada ~20 s: un combate de 3 asaltos deja ~40 puntos y uno de 5 (con
// los descansos) ~70-90. Pintar un marcador por muestra sobre 700 px convierte
// la línea en un rosario y tapa justo lo que la película cuenta: la FORMA de la
// pelea y el instante de cada evento.
//
// Reparto: la LÍNEA se sigue dibujando con todos los puntos (la fidelidad no se
// toca) y solo se adelgazan los MARCADORES, conservando siempre los que llevan
// evento (knockdown o derribo) y el último de la serie. Por debajo del tope no
// descarta nada, así que las películas ya publicadas se ven exactamente igual.

// ~28 marcadores sobre los 700 px útiles del viewBox = uno cada ~25 px, que es
// la densidad del patrón ranking-trajectory ya aprobado.
export const MAX_TIMELINE_MARKERS = 28;

type MarkerCandidate = {
  kdDelta: number;
  tdDelta: number;
};

// Índices de `points` que llevan marcador. Devuelve un Set para que el
// componente decida punto a punto sin recorrer el array otra vez.
export function selectMarkerIndices(
  points: readonly MarkerCandidate[],
  maxMarkers: number = MAX_TIMELINE_MARKERS,
): Set<number> {
  const total = points.length;
  const budget = Math.max(1, Math.floor(maxMarkers));
  if (total <= budget) {
    return new Set(points.map((_, idx) => idx));
  }
  const stride = Math.ceil(total / budget);
  const keep = new Set<number>();
  for (let idx = 0; idx < total; idx++) {
    const point = points[idx];
    // Un evento jamás se decima: el anillo de knockdown es el momento que
    // cambia la pelea y perderlo sería perder el dato, no resolución.
    if (
      idx % stride === 0 ||
      idx === total - 1 ||
      point.kdDelta > 0 ||
      point.tdDelta > 0
    ) {
      keep.add(idx);
    }
  }
  return keep;
}

// ---------------------------------------------------------------------------
// 2) El corte de la reconciliación de ESPN
//
// Al sellar el combate, ESPN RECONCILIA el conteo y la última muestra puede
// BAJAR: en la 14232 la esquina azul pasa de 65 a 46 golpes significativos. La
// buena es la ÚLTIMA (su desglose cuadra: 41 cabeza + 4 cuerpo + 1 pierna = 46,
// el total del acta), pero cae en el MISMO segundo que la anterior, así que la
// polilínea dibuja un segmento VERTICAL hacia abajo: una acumulada que decrece,
// imposible por definición. En vez de mentir aplanando el valor —que rompería
// el único número que hoy está bien—, el tramo de la corrección se dibuja
// DISCONTINUO: "aquí ESPN rehízo la cuenta".
//
// Medido sobre las 86 series reales con 2+ puntos (2026-08-16, 58 peleas):
//   - 18 series tienen una bajada de golpes; NINGUNA tiene dos.
//   - En 15 la bajada es el ÚLTIMO punto, pero en 3 NO: la 12865 (esquina
//     9012) reconcilia 27->25 al cerrar el ASALTO 2 y la pelea sigue 4 puntos
//     más hasta 26; y las DOS esquinas de la 14570 bajan en la muestra
//     STATUS_END_OF_FIGHT (14->11 y 7->6) con una 'post' posterior que repite
//     el valor ya corregido.
// Por eso el corte se busca hacia DELANTE, en la PRIMERA bajada: retroceder
// desde el final acierta en las 15 y deja la línea decreciente dibujada en las
// otras 3 (en la 14570 ni siquiera llega a cortar, porque el último punto
// repite el valor y no es menor que el anterior).
//
// Y el valor bueno es el último: cruzado con el acta de ufcstats, el final en
// vivo coincide en 17 de las 18 series con bajada (la excepción es la 12865,
// donde el directo va desfasado de ufcstats en toda la pelea, 26 contra 20, y
// ningún corte puede arreglar eso).
export function splitReconciledSeries<T extends { value: number }>(
  points: readonly T[],
): { solid: T[]; reconciled: T[] } {
  for (let idx = 1; idx < points.length; idx++) {
    if (points[idx].value < points[idx - 1].value) {
      // El punto ANTERIOR pertenece a los dos tramos: es la bisagra, y sin él
      // el discontinuo empezaría flotando en el aire. Si la bajada es el punto
      // 1, el sólido se queda con un único punto: no hay polilínea que dibujar
      // y el llamador tiene que saltárselo (guarda `solid.length > 1`).
      return { solid: points.slice(0, idx), reconciled: points.slice(idx - 1) };
    }
  }
  return { solid: points.slice(), reconciled: [] };
}

// La trama del tramo corregido, en unidades del viewBox. Está medida EN
// PANTALLA y no en el papel: el SVG de 760 se escala a 0,40x en un móvil de
// 390 px, así que la "5 4" de manual deja guiones de 2 px y el tramo se lee
// como una línea fina cualquiera.
export const TIMELINE_DASH_ON = 9;
export const TIMELINE_DASH_OFF = 6;

// 🪤 UNA TRAMA NO SE VE SI EL TRAZO ES MÁS CORTO QUE SU PRIMER GUION. Con
// "9 6", un tramo corregido de 8 unidades se dibuja de UNA PIEZA: sólido,
// idéntico a la línea normal. Y no es un caso de laboratorio — medido sobre las
// 18 series reales con corrección, 7 caen por debajo, entre ellas el estelar de
// UFC 330 (12885: la bajada es de 23 a 22 golpes en el mismo segundo, o sea 8,5
// unidades de trazo vertical) y la 13927, que se queda en 1,8.
//
// Importa porque el PIE de la ficha anuncia «el tramo discontinuo es el
// recuento que ESPN rehízo al cerrar». Si no hay nada discontinuo que mirar, esa
// frase manda al lector a buscar algo que no existe: peor que no decir nada. La
// polilínea se sigue dibujando con su trama (no cuesta nada y a zoom de
// escritorio ayuda), y el <title> del punto sigue explicando la corrección —lo
// que se apaga es la frase, que es la que promete algo VISIBLE.
//
// El corte es un guion + un hueco: por debajo de eso no cabe ni una
// interrupción entera.
export function readsAsDashed(
  points: readonly { x: number; y: number }[],
): boolean {
  if (points.length < 2) {
    return false;
  }
  let length = 0;
  for (let idx = 1; idx < points.length; idx++) {
    length += Math.hypot(
      points[idx].x - points[idx - 1].x,
      points[idx].y - points[idx - 1].y,
    );
  }
  return length >= TIMELINE_DASH_ON + TIMELINE_DASH_OFF;
}

// ---------------------------------------------------------------------------
// 3) Las dos alturas del carril de agarre
//
// A qué distancia del techo del carril va el tramo de cada esquina: el rojo
// pegado al eje, el azul un carril y un hueco más abajo.
//
// 🪤 VIVE AQUÍ, Y NO SUELTO EN EL `.tsx`, PORQUE ES UN REQUISITO DE WCAG 1.4.1
// Y NECESITA TEST. El rojo y el azul de marca tienen casi la misma luminancia
// —1,10:1 sólidos, 1,04:1 como baño—, así que un carril de UNA sola altura
// coloreado según el dueño diría quién sujetaba ÚNICAMENTE con el tono: en
// escala de grises, o para un deuteranope, la misma mancha. La segunda altura
// es lo que convierte el color en redundante, igual que el círculo y el rombo
// hacen redundantes los colores de las dos líneas.
//
// Antes de esto, `contrast.test.ts` decía protegerlo y no lo protegía: sus
// asertos comparan los dos tokens de color entre sí, que es una propiedad de la
// paleta y sale igual de roja o de verde se dibujen uno o dos carriles.
// Comprobado con una mutación —`laneOffset` devolviendo 0 para las dos
// esquinas—: la suite entera seguía en verde. Ahora no.
export function controlLaneOffset(
  owner: "red" | "blue",
  lane: number,
  gap: number,
): number {
  return owner === "red" ? 0 : lane + gap;
}
