import { describe, expect, it } from "vitest";
import {
  MAX_TIMELINE_MARKERS,
  TIMELINE_DASH_OFF,
  TIMELINE_DASH_ON,
  readsAsDashed,
  selectMarkerIndices,
  splitReconciledSeries,
} from "@/lib/fight-timeline-markers";

const plain = (n: number) =>
  Array.from({ length: n }, () => ({ kdDelta: 0, tdDelta: 0 }));

describe("selectMarkerIndices", () => {
  it("no descarta nada por debajo del tope: las películas ya publicadas no cambian", () => {
    const points = plain(MAX_TIMELINE_MARKERS);
    const keep = selectMarkerIndices(points);
    expect(keep.size).toBe(MAX_TIMELINE_MARKERS);
    expect([...keep].sort((a, b) => a - b)).toEqual(
      points.map((_, idx) => idx),
    );
  });

  it("adelgaza un combate de 5 asaltos muestreado cada 20 s (~90 puntos)", () => {
    const keep = selectMarkerIndices(plain(90));
    // Sin eventos que rescatar, el reparto por stride no puede pasarse del
    // presupuesto, y tiene que seguir describiendo la curva entera.
    expect(keep.size).toBeLessThanOrEqual(MAX_TIMELINE_MARKERS + 1);
    expect(keep.size).toBeGreaterThan(10);
  });

  it("conserva SIEMPRE el último punto: es el total con el que cierra la leyenda", () => {
    for (const total of [29, 45, 70, 91]) {
      const keep = selectMarkerIndices(plain(total));
      expect(keep.has(total - 1)).toBe(true);
    }
  });

  it("no decima jamás un knockdown ni un derribo, aunque caiga entre strides", () => {
    const points = plain(90);
    // 37 y 53 son primos con el stride de este tamaño: sin la regla de eventos
    // el reparto por índice los tiraría.
    points[37] = { kdDelta: 1, tdDelta: 0 };
    points[53] = { kdDelta: 0, tdDelta: 2 };
    const keep = selectMarkerIndices(points);
    expect(keep.has(37)).toBe(true);
    expect(keep.has(53)).toBe(true);
  });

  it("aguanta una serie vacía sin romperse", () => {
    expect(selectMarkerIndices([]).size).toBe(0);
  });

  it("nunca genera stride 0 aunque el presupuesto sea absurdo", () => {
    const keep = selectMarkerIndices(plain(50), 0);
    expect(keep.size).toBeGreaterThan(0);
    expect(keep.has(49)).toBe(true);
  });
});

// Series de golpes significativos REALES (Neon, live_fight_stat_samples,
// extraídas el 2026-08-16 pasando las filas por mapFightTimelineSample y
// buildFightTimeline, o sea el mismo camino que la ficha). Son las cuatro
// series con bajada que reparten el problema: una en el último punto y tres
// que NO están en el último punto, que es donde se rompe el algoritmo de
// retroceder desde el final.
const SERIE_14232_AZUL = [
  6, 9, 11, 19, 19, 21, 21, 21, 26, 26, 27, 27, 27, 29, 30, 33, 33, 34, 38, 41,
  41, 41, 44, 45, 45, 51, 53, 53, 60, 60, 63, 63, 65, 65, 46,
];
const SERIE_12865_9012 = [
  2, 6, 6, 6, 7, 8, 10, 10, 12, 12, 12, 14, 16, 17, 18, 19, 21, 23, 25, 27, 25,
  26, 26, 26,
];
const SERIE_14570_ROJO = [9, 14, 14, 14, 11, 11];
const SERIE_14570_AZUL = [6, 7, 7, 7, 6, 6];

const serie = (values: number[]) => values.map((value) => ({ value }));
const values = (points: { value: number }[]) => points.map((p) => p.value);
const isMonotone = (nums: number[]) =>
  nums.every((v, i) => i === 0 || v >= nums[i - 1]);

describe("splitReconciledSeries", () => {
  it("una serie que solo sube no se parte (el 99 % de las películas)", () => {
    const { solid, reconciled } = splitReconciledSeries(
      serie([0, 3, 3, 9, 14, 14, 21]),
    );
    expect(values(solid)).toEqual([0, 3, 3, 9, 14, 14, 21]);
    expect(reconciled).toEqual([]);
  });

  it("14232 (azul): la corrección del cierre, 65 -> 46, en el ÚLTIMO punto", () => {
    const { solid, reconciled } = splitReconciledSeries(serie(SERIE_14232_AZUL));
    expect(values(solid)).toEqual(SERIE_14232_AZUL.slice(0, 34));
    // El tramo discontinuo son solo los dos últimos: la bisagra (65) y el
    // valor bueno (46, el del acta).
    expect(values(reconciled)).toEqual([65, 46]);
    expect(isMonotone(values(solid))).toBe(true);
  });

  it("12865 (9012): la corrección cae al cerrar el ASALTO 2 y quedan 4 puntos detrás", () => {
    const { solid, reconciled } = splitReconciledSeries(serie(SERIE_12865_9012));
    // 🪤 Aquí es donde falla retroceder desde el final: como el último punto
    // (26) NO es menor que el anterior, ese algoritmo no corta nada y deja
    // dibujado el segmento vertical 27 -> 25 en mitad de la película.
    expect(values(solid)).toEqual(SERIE_12865_9012.slice(0, 20));
    expect(values(reconciled)).toEqual([27, 25, 26, 26, 26]);
    expect(isMonotone(values(solid))).toBe(true);
  });

  it("14570: las dos esquinas bajan en END_OF_FIGHT y la 'post' repite el valor ya corregido", () => {
    for (const real of [SERIE_14570_ROJO, SERIE_14570_AZUL]) {
      const { solid, reconciled } = splitReconciledSeries(serie(real));
      // 🪤 El último punto REPITE el corregido (11,11 / 6,6), así que
      // retroceder desde el final se para en seco y no pinta nada discontinuo.
      expect(values(solid)).toEqual(real.slice(0, 4));
      expect(values(reconciled)).toEqual(real.slice(3));
      expect(isMonotone(values(solid))).toBe(true);
    }
  });

  it("corta en la PRIMERA bajada aunque vinieran dos (hoy no pasa en ninguna serie)", () => {
    // Medido: de las 86 series reales, 18 bajan y ninguna baja dos veces. Si
    // algún día pasa, el tramo discontinuo se traga las dos y la línea sólida
    // sigue sin dibujar una acumulada que decrece.
    const { solid, reconciled } = splitReconciledSeries(
      serie([4, 9, 7, 12, 20, 18]),
    );
    expect(values(solid)).toEqual([4, 9]);
    expect(values(reconciled)).toEqual([9, 7, 12, 20, 18]);
    expect(isMonotone(values(solid))).toBe(true);
  });

  it("si la bajada es el punto 1, el sólido se queda con UNO y no se puede pintar", () => {
    const { solid, reconciled } = splitReconciledSeries(serie([12, 5, 6]));
    expect(solid.length).toBe(1);
    // La guarda del componente es `solid.length > 1`: con un solo punto no hay
    // polilínea, y el discontinuo lleva la serie entera.
    expect(values(reconciled)).toEqual([12, 5, 6]);
  });

  it("aguanta series de 0 y 1 punto sin partirse", () => {
    expect(splitReconciledSeries([])).toEqual({ solid: [], reconciled: [] });
    const uno = splitReconciledSeries(serie([7]));
    expect(values(uno.solid)).toEqual([7]);
    expect(uno.reconciled).toEqual([]);
  });

  it("no muta la serie de entrada ni devuelve el mismo array", () => {
    const points = serie([1, 2, 3]);
    const { solid } = splitReconciledSeries(points);
    solid.push({ value: 99 });
    expect(points.length).toBe(3);
  });

  it("conserva el punto entero, no solo el valor (la línea necesita x/y)", () => {
    const points = [
      { value: 1, x: 10, y: 90 },
      { value: 4, x: 20, y: 60 },
      { value: 2, x: 20, y: 80 },
    ];
    const { solid, reconciled } = splitReconciledSeries(points);
    expect(solid).toEqual([points[0], points[1]]);
    expect(reconciled).toEqual([points[1], points[2]]);
  });
});

// ---------------------------------------------------------------------------
// Y si el tramo corregido se VE discontinuo, que es de lo que cuelga la frase
// del pie de la ficha.
describe("readsAsDashed", () => {
  it("un trazo más corto que el primer guion se dibuja SÓLIDO", () => {
    // El estelar de UFC 330 (12885): la corrección es de 23 a 22 golpes en el
    // mismo segundo, o sea 8,5 unidades de trazo vertical. Con "9 6" el SVG
    // pinta un único guion de punta a punta y no hay nada discontinuo que ver.
    expect(
      readsAsDashed([
        { x: 744, y: 70.9 },
        { x: 744, y: 79.4 },
      ]),
    ).toBe(false);
  });

  it("el corte está en un guion MÁS un hueco: por debajo no cabe la trama", () => {
    expect(TIMELINE_DASH_ON + TIMELINE_DASH_OFF).toBe(15);
    expect(
      readsAsDashed([
        { x: 0, y: 0 },
        { x: 0, y: 14.9 },
      ]),
    ).toBe(false);
    expect(
      readsAsDashed([
        { x: 0, y: 0 },
        { x: 0, y: 15 },
      ]),
    ).toBe(true);
  });

  it("la 14232 SÍ se ve: 65 -> 46 son 70 unidades y cinco huecos", () => {
    expect(
      readsAsDashed([
        { x: 744, y: 27.3 },
        { x: 744, y: 97.1 },
      ]),
    ).toBe(true);
  });

  it("suma el recorrido de TODOS los segmentos, no solo el primero", () => {
    // La 12865 corrige al cerrar el R2 y arrastra cuatro puntos más: el tramo
    // es una polilínea, no un salto suelto, y cada trozo cuenta.
    expect(
      readsAsDashed([
        { x: 0, y: 0 },
        { x: 4, y: 0 },
        { x: 8, y: 0 },
        { x: 12, y: 0 },
        { x: 16, y: 0 },
      ]),
    ).toBe(true);
  });

  it("sin tramo, o con un punto suelto, no hay nada que anunciar", () => {
    expect(readsAsDashed([])).toBe(false);
    expect(readsAsDashed([{ x: 10, y: 10 }])).toBe(false);
  });
});
