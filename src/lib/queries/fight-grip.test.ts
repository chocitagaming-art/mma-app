import { describe, expect, it } from "vitest";

import { mapFightGripRows, type FightGripRow } from "@/lib/queries/fight-grip";

// El acta de 14232 tal como la devuelve la consulta: una fila por esquina para
// el total (round null) y una por esquina y asalto. Medido contra Neon el
// 9-ago-2026.
const ACTA_14232: FightGripRow[] = [
  { round: null, corner: "red", control_time_seconds: 169 },
  { round: null, corner: "blue", control_time_seconds: 231 },
  { round: 1, corner: "red", control_time_seconds: 64 },
  { round: 1, corner: "blue", control_time_seconds: 147 },
  { round: 2, corner: "red", control_time_seconds: 57 },
  { round: 2, corner: "blue", control_time_seconds: 31 },
  { round: 3, corner: "red", control_time_seconds: 48 },
  { round: 3, corner: "blue", control_time_seconds: 53 },
];

describe("mapFightGripRows", () => {
  it("separa el total de los asaltos", () => {
    const stats = mapFightGripRows(ACTA_14232);
    expect(stats.redControlSeconds).toBe(169);
    expect(stats.blueControlSeconds).toBe(231);
    expect(stats.rounds).toEqual([
      { round: 1, redControlSeconds: 64, blueControlSeconds: 147 },
      { round: 2, redControlSeconds: 57, blueControlSeconds: 31 },
      { round: 3, redControlSeconds: 48, blueControlSeconds: 53 },
    ]);
  });

  it("CONSERVA el null en vez de convertirlo en cero", () => {
    // 🪤 Esta es la razón de existir del fichero. La tubería vieja hace
    // `row.control_time_seconds ?? 0` (queries/fights.ts:131 y :438) y con eso
    // un asalto SIN ACTA se vuelve indistinguible de un asalto sin agarre: la
    // barra dibujaría "nadie sujetaba, el 100 %" sobre un dato que no existe.
    // Son 374 filas de fight_stats_rounds, toda la era 1995-1998.
    const stats = mapFightGripRows([
      { round: null, corner: "red", control_time_seconds: null },
      { round: null, corner: "blue", control_time_seconds: null },
      { round: 1, corner: "red", control_time_seconds: null },
      { round: 1, corner: "blue", control_time_seconds: null },
    ]);
    expect(stats.redControlSeconds).toBeNull();
    expect(stats.blueControlSeconds).toBeNull();
    expect(stats.rounds[0]?.redControlSeconds).toBeNull();
    expect(stats.rounds[0]?.blueControlSeconds).toBeNull();
  });

  it("distingue el cero de verdad del hueco", () => {
    // 12863 Ankalaev-Guskov: el azul no sujetó ni un segundo en 1.361 s. Ese
    // cero está medido y se publica; el null de arriba no.
    const stats = mapFightGripRows([
      { round: null, corner: "red", control_time_seconds: 506 },
      { round: null, corner: "blue", control_time_seconds: 0 },
    ]);
    expect(stats.blueControlSeconds).toBe(0);
    expect(stats.blueControlSeconds).not.toBeNull();
  });

  it("ordena los asaltos aunque lleguen sueltos", () => {
    const stats = mapFightGripRows([
      { round: 3, corner: "red", control_time_seconds: 48 },
      { round: 1, corner: "blue", control_time_seconds: 147 },
      { round: 2, corner: "red", control_time_seconds: 57 },
      { round: 1, corner: "red", control_time_seconds: 64 },
    ]);
    expect(stats.rounds.map((r) => r.round)).toEqual([1, 2, 3]);
  });

  it("deja a null la esquina que no trae fila", () => {
    // fight_stats siempre trae las dos esquinas (verificado: 8.764 combates),
    // pero la ficha no puede romperse si un día falta una.
    const stats = mapFightGripRows([
      { round: 1, corner: "red", control_time_seconds: 64 },
    ]);
    expect(stats.rounds).toEqual([
      { round: 1, redControlSeconds: 64, blueControlSeconds: null },
    ]);
  });

  it("devuelve todo vacío para un combate sin acta", () => {
    // 87 combates de 8.851 no tienen ninguna fila en fight_stats.
    const stats = mapFightGripRows([]);
    expect(stats.redControlSeconds).toBeNull();
    expect(stats.blueControlSeconds).toBeNull();
    expect(stats.rounds).toEqual([]);
  });
});
