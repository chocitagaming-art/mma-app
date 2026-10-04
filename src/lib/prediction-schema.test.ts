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

  // El servicio manda value null cuando el valor de un factor no es finito
  // (JSON no tiene NaN). Con z.number() a secas eso tumbaba la predicción
  // ENTERA por un dato que la UI solo enseña como texto junto a la barra.
  it("acepta un factor con value null y conserva el resto de la predicción", () => {
    const result = parsePredictionPayload(
      payload({
        topFeatures: [
          { name: "ranking_position_diff", value: null, contribution: 0.2, direction: "red" },
          { name: "reach_diff", value: 5, contribution: -0.05, direction: "blue" },
        ],
      }),
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.warning).toBeUndefined();
    expect(result.data.topFeatures.map((feature) => feature.value)).toEqual([null, 5]);
    expect(result.data.redProbability).toBe(0.62);
    expect(result.data.methodPrediction?.predicted).toBe("decision");
  });

  // Where the service anchored the prediction (owner decision, 4-oct-2026). The
  // web may deploy before the service, so a response without these fields must
  // keep parsing exactly as before.
  describe("context.anchor / context.anchorFightId", () => {
    const baseContext = { matchupDate: "2026-06-25", weightClass: "Lightweight" };

    it("an old service response (no anchor fields) parses, with no warning", () => {
      const result = parsePredictionPayload(payload());
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.warning).toBeUndefined();
      expect(result.data.context.anchor).toBeUndefined();
      expect(result.data.context.anchorFightId).toBeUndefined();
    });

    it.each([
      ["fight", 14232],
      ["pending", 14232],
      ["pending", null],
      ["today", null],
      ["none", null],
    ] as const)("a new response with anchor %s and anchorFightId %s keeps both", (anchor, anchorFightId) => {
      const result = parsePredictionPayload(
        payload({ context: { ...baseContext, anchor, anchorFightId } }),
      );
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.warning).toBeUndefined();
      expect(result.data.context.anchor).toBe(anchor);
      expect(result.data.context.anchorFightId).toBe(anchorFightId);
      // The rest of the context travels untouched.
      expect(result.data.context.matchupDate).toBe("2026-06-25");
    });

    // A malformed anchor is secondary data: like a broken methodPrediction it
    // is dropped on its own (with a warning) and the winner prediction survives.
    it.each([
      ["an unknown anchor", { anchor: "tomorrow", anchorFightId: null }],
      ["an anchor that is not text", { anchor: 1, anchorFightId: null }],
      ["an anchorFightId as text", { anchor: "fight", anchorFightId: "14232" }],
      ["a fractional anchorFightId", { anchor: "fight", anchorFightId: 14.5 }],
    ])("%s: drops both anchor fields, keeps the prediction and warns", (_case, fields) => {
      const result = parsePredictionPayload(payload({ context: { ...baseContext, ...fields } }));
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.data.redProbability).toBe(0.62);
      expect(result.data.methodPrediction?.predicted).toBe("decision");
      expect(result.data.context).toEqual(baseContext);
      expect(result.warning).toMatch(/anchor/);
    });

    it("a broken method and a broken anchor are both dropped and both reported", () => {
      const result = parsePredictionPayload(
        payload({
          context: { ...baseContext, anchor: "tomorrow" },
          methodPrediction: { probabilities: { decision: 0.5, ko: 0.5 }, predicted: "ko" },
        }),
      );
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.data.methodPrediction).toBeNull();
      expect(result.data.context).toEqual(baseContext);
      expect(result.warning).toMatch(/methodPrediction/);
      expect(result.warning).toMatch(/anchor/);
    });
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
      // value admite null y nada más: ni que falte la clave, ni texto, ni
      // NaN/Infinity (no viajan por JSON, pero sí en un objeto construido a mano).
      [
        "una feature llega sin value",
        { topFeatures: [{ name: "x", contribution: 0.1, direction: "red" }] },
      ],
      [
        "el value de una feature llega como texto",
        { topFeatures: [{ name: "x", value: "1", contribution: 0.1, direction: "red" }] },
      ],
      [
        "el value de una feature es NaN",
        { topFeatures: [{ name: "x", value: Number.NaN, contribution: 0.1, direction: "red" }] },
      ],
      [
        "el value de una feature es Infinity",
        {
          topFeatures: [
            { name: "x", value: Number.POSITIVE_INFINITY, contribution: 0.1, direction: "red" },
          ],
        },
      ],
      // El null es SOLO para value: sin contribución no hay barra que pintar.
      [
        "la contribution de una feature llega null",
        { topFeatures: [{ name: "x", value: 1, contribution: null, direction: "red" }] },
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
