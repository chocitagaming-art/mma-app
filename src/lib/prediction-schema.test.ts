import { describe, expect, it } from "vitest";

import { parsePredictionPayload } from "@/lib/prediction-schema";

// Payload mínimo con la forma que devuelve el microservicio de Render.
function payload(overrides?: Record<string, unknown>): Record<string, unknown> {
  return {
    redProbability: 0.62,
    blueProbability: 0.38,
    lowConfidence: false,
    topFeatures: [
      { name: "sig_strikes_diff", value: 12, contribution: 0.2, direction: "red" },
      { name: "reach_diff", value: 5, contribution: -0.05, direction: "blue" },
    ],
    featureValues: { sig_strikes_diff: 12 },
    context: { matchupDate: "2026-06-25", weightClass: "Lightweight" },
    fighters: { red: { id: 1, name: "Red" }, blue: { id: 2, name: "Blue" } },
    methodPrediction: {
      probabilities: { decision: 0.5, ko: 0.3, submission: 0.2 },
      predicted: "decision",
      trainedAt: "2026-07-19",
    },
    ...overrides,
  };
}

describe("parsePredictionPayload", () => {
  it("acepta una respuesta completa y conserva el método", () => {
    const result = parsePredictionPayload(payload());
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.warning).toBeUndefined();
    expect(result.data.redProbability).toBe(0.62);
    expect(result.data.methodPrediction?.predicted).toBe("decision");
  });

  it("acepta una respuesta sin methodPrediction (servicio con bundle antiguo)", () => {
    for (const ausente of [{}, { methodPrediction: null }, { methodPrediction: undefined }]) {
      const base = payload();
      delete base.methodPrediction;
      const result = parsePredictionPayload({ ...base, ...ausente });
      expect(result.ok).toBe(true);
    }
  });

  // Lo que motivó esta validación: el microservicio puede añadir campos nuevos
  // (así llegaron featureContributions y methodPrediction) sin desplegar la app.
  it("deja pasar los campos desconocidos en vez de descartarlos", () => {
    const result = parsePredictionPayload(
      payload({ featureContributions: { age_diff: -0.03 }, campoDelFuturo: 42 }),
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const data = result.data as unknown as Record<string, unknown>;
    expect(data.featureContributions).toEqual({ age_diff: -0.03 });
    expect(data.campoDelFuturo).toBe(42);
  });

  describe("degrada solo el método cuando es el método lo que viene roto", () => {
    const metodosRotos: Array<[string, unknown]> = [
      ["le falta una clase", { probabilities: { decision: 0.5, ko: 0.5 }, predicted: "ko" }],
      [
        "una probabilidad se sale de rango",
        { probabilities: { decision: 1.5, ko: 0.3, submission: 0.2 }, predicted: "decision" },
      ],
      [
        "la clase predicha no existe",
        { probabilities: { decision: 0.5, ko: 0.3, submission: 0.2 }, predicted: "empate" },
      ],
      [
        "una probabilidad llega como texto",
        { probabilities: { decision: "0.5", ko: 0.3, submission: 0.2 }, predicted: "decision" },
      ],
      ["probabilities renombrado", { probs: { decision: 0.5, ko: 0.3, submission: 0.2 }, predicted: "ko" }],
    ];

    it.each(metodosRotos)("%s: salva el ganador y avisa", (_caso, methodPrediction) => {
      const result = parsePredictionPayload(payload({ methodPrediction }));
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      // El ganador sobrevive intacto; el método se cae solo.
      expect(result.data.redProbability).toBe(0.62);
      expect(result.data.methodPrediction).toBeNull();
      expect(result.warning).toMatch(/methodPrediction/);
    });
  });

  describe("rechaza cuando lo roto es el núcleo", () => {
    // Cada uno de estos habría pintado "NaN%" o un hueco en el careo, en
    // silencio, con el cast que había antes.
    const nucleosRotos: Array<[string, Record<string, unknown>]> = [
      ["falta redProbability", { redProbability: undefined }],
      ["redProbability renombrada", { redProbability: undefined, red_probability: 0.62 }],
      ["redProbability es NaN", { redProbability: Number.NaN }],
      ["redProbability es Infinity", { redProbability: Number.POSITIVE_INFINITY }],
      ["redProbability llega como texto", { redProbability: "0.62" }],
      ["redProbability se sale de rango", { redProbability: 1.4 }],
      ["redProbability es negativa", { redProbability: -0.1 }],
      ["lowConfidence no es booleano", { lowConfidence: "no" }],
      ["topFeatures no es una lista", { topFeatures: {} }],
      [
        "una feature apunta a una esquina inexistente",
        {
          topFeatures: [{ name: "x", value: 1, contribution: 0.1, direction: "verde" }],
        },
      ],
    ];

    it.each(nucleosRotos)("%s", (_caso, override) => {
      const result = parsePredictionPayload(payload(override));
      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.error.length).toBeGreaterThan(0);
    });

    it.each([
      ["null", null],
      ["undefined", undefined],
      ["una cadena", "vaya"],
      ["una lista", []],
      ["un objeto vacío", {}],
    ])("la respuesta es %s", (_caso, entrada) => {
      expect(parsePredictionPayload(entrada).ok).toBe(false);
    });
  });
});
