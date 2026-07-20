import { describe, expect, it } from "vitest";
import {
  MAX_TIMELINE_MARKERS,
  selectMarkerIndices,
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
