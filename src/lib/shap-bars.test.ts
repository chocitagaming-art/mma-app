import { describe, expect, it } from "vitest";

import type { PredictionFeature } from "@/lib/prediction";
import {
  MIN_BAR_WIDTH_PCT,
  buildShapBars,
  formatContribution,
} from "@/lib/shap-bars";

function feature(
  name: string,
  contribution: number,
  value = 1,
): PredictionFeature {
  return {
    name,
    value,
    contribution,
    direction: contribution >= 0 ? "red" : "blue",
  };
}

const TOP = [
  feature("age_diff", 0.28, -6.68),
  feature("wins_last_5_diff", 0.11, 2),
  feature("takedown_defense_diff", -0.09, -0.55),
];

// Mapa completo: los 3 de arriba + 2 no mostrados que suman -0.39.
const CONTRIBUTIONS: Record<string, number> = {
  age_diff: 0.28,
  wins_last_5_diff: 0.11,
  takedown_defense_diff: -0.09,
  reach_cm_diff: -0.14,
  sig_strike_accuracy_diff: -0.25,
};

describe("buildShapBars", () => {
  it("conserva el orden de topFeatures y asigna lados por signo", () => {
    const rows = buildShapBars(TOP, CONTRIBUTIONS, 5);
    expect(rows.map((row) => row.name)).toEqual([
      "age_diff",
      "wins_last_5_diff",
      "takedown_defense_diff",
      "rest",
    ]);
    expect(rows.map((row) => row.side)).toEqual(["red", "red", "blue", "blue"]);
  });

  it("agrega el resto desde el mapa completo y cuenta los factores", () => {
    const rows = buildShapBars(TOP, CONTRIBUTIONS, 5);
    const rest = rows.at(-1)!;
    expect(rest.isRest).toBe(true);
    expect(rest.restCount).toBe(2);
    expect(rest.contribution).toBeCloseTo(-0.39, 10);
    expect(rest.value).toBeNull();
  });

  it("la barra mas larga mide 100% y el resto escala en proporcion", () => {
    const rows = buildShapBars(TOP, CONTRIBUTIONS, 5);
    // |rest| = 0.39 es la mayor magnitud del grafico.
    expect(rows.at(-1)!.widthPct).toBe(100);
    expect(rows[0]!.widthPct).toBeCloseTo((0.28 / 0.39) * 100, 0);
  });

  it("sin featureContributions no hay fila de resto (respuesta antigua)", () => {
    const rows = buildShapBars(TOP, null, 5);
    expect(rows).toHaveLength(3);
    expect(rows.every((row) => !row.isRest)).toBe(true);
    // Ahora la mayor es age_diff.
    expect(rows[0]!.widthPct).toBe(100);
  });

  it("maxFactors recorta los mostrados y engorda el resto", () => {
    const rows = buildShapBars(TOP, CONTRIBUTIONS, 2);
    expect(rows.map((row) => row.name)).toEqual([
      "age_diff",
      "wins_last_5_diff",
      "rest",
    ]);
    const rest = rows.at(-1)!;
    expect(rest.restCount).toBe(3);
    expect(rest.contribution).toBeCloseTo(-0.48, 10);
  });

  it("una contribucion minuscula conserva un ancho visible minimo", () => {
    const rows = buildShapBars(
      [feature("age_diff", 0.5), feature("reach_cm_diff", 0.0001)],
      null,
      5,
    );
    expect(rows[1]!.widthPct).toBe(MIN_BAR_WIDTH_PCT);
  });

  it("todo a cero no divide por cero", () => {
    const rows = buildShapBars([feature("age_diff", 0)], { age_diff: 0 }, 5);
    expect(rows[0]!.widthPct).toBe(MIN_BAR_WIDTH_PCT);
    expect(rows[0]!.side).toBe("red");
  });

  it("mapa presente pero sin factores extra: sin fila de resto", () => {
    const rows = buildShapBars(TOP, {
      age_diff: 0.28,
      wins_last_5_diff: 0.11,
      takedown_defense_diff: -0.09,
    }, 5);
    expect(rows.every((row) => !row.isRest)).toBe(true);
  });
});

describe("formatContribution", () => {
  it("muestra la magnitud sin signo con 2 decimales", () => {
    expect(formatContribution(-0.3928)).toBe("0.39");
    expect(formatContribution(0.111)).toBe("0.11");
  });
});
