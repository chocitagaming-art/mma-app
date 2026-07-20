import { describe, expect, it } from "vitest";

import { buildMethodBars, METHOD_LABELS_ES } from "@/lib/method-prediction";
import type { MethodPrediction } from "@/lib/prediction";

function methodPrediction(overrides?: Partial<MethodPrediction>): MethodPrediction {
  return {
    probabilities: { decision: 0.5, ko: 0.3, submission: 0.2 },
    predicted: "decision",
    trainedAt: "2026-07-19",
    ...overrides,
  };
}

describe("buildMethodBars", () => {
  it("ordena por probabilidad descendente con etiquetas en español", () => {
    const rows = buildMethodBars(methodPrediction());
    expect(rows).not.toBeNull();
    expect(rows!.map((row) => row.method)).toEqual(["decision", "ko", "submission"]);
    expect(rows![0].label).toBe(METHOD_LABELS_ES.decision);
    expect(rows![0].probability).toBe(0.5);
  });

  it("marca solo el método predicho", () => {
    const rows = buildMethodBars(
      methodPrediction({
        probabilities: { decision: 0.38, ko: 0.46, submission: 0.16 },
        predicted: "ko",
      }),
    );
    expect(rows!.map((row) => [row.method, row.isPredicted])).toEqual([
      ["ko", true],
      ["decision", false],
      ["submission", false],
    ]);
  });

  it("devuelve null para el campo ausente (cache antigua / bundle pre-método)", () => {
    expect(buildMethodBars(null)).toBeNull();
    expect(buildMethodBars(undefined)).toBeNull();
  });

  it("devuelve null ante probabilidades corruptas", () => {
    expect(
      buildMethodBars(
        methodPrediction({
          probabilities: { decision: Number.NaN, ko: 0.3, submission: 0.2 },
        }),
      ),
    ).toBeNull();
    expect(
      buildMethodBars(
        // Falta una clase (payload malformado).
        methodPrediction({
          probabilities: { decision: 0.5, ko: 0.5 } as MethodPrediction["probabilities"],
        }),
      ),
    ).toBeNull();
    expect(
      buildMethodBars({ predicted: "ko" } as unknown as MethodPrediction),
    ).toBeNull();
  });

  it("clampa probabilidades fuera de rango por defensa", () => {
    const rows = buildMethodBars(
      methodPrediction({
        probabilities: { decision: 1.2, ko: -0.1, submission: 0.2 },
      }),
    );
    expect(rows![0].probability).toBe(1);
    expect(rows!.at(-1)!.probability).toBe(0);
  });

  it("desempata con finales primero en empate exacto", () => {
    const rows = buildMethodBars(
      methodPrediction({
        probabilities: { decision: 0.4, ko: 0.4, submission: 0.2 },
        predicted: "ko",
      }),
    );
    expect(rows!.map((row) => row.method)).toEqual(["ko", "decision", "submission"]);
  });

  it("un predicted inválido no marca ninguna fila", () => {
    const rows = buildMethodBars(
      methodPrediction({ predicted: "dq" as MethodPrediction["predicted"] }),
    );
    expect(rows!.every((row) => !row.isPredicted)).toBe(true);
  });
});
