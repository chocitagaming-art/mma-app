import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { PredictionFighterProfile, PredictionResponse } from "./prediction";

// Controlamos la respuesta de Anthropic por test sin tocar la red real.
const { createMock } = vi.hoisted(() => ({ createMock: vi.fn() }));

vi.mock("@anthropic-ai/sdk", () => ({
  Anthropic: vi.fn(function () {
    return { messages: { create: createMock } };
  }),
}));

import { generatePredictionExplanation } from "./prediction";

type RawPrediction = Omit<PredictionResponse, "explanation" | "explanationSource">;

function profile(id: number, name: string): PredictionFighterProfile {
  return {
    id,
    name,
    nickname: null,
    headshot_url: null,
    wins: 10,
    losses: 2,
    draws: 0,
    height_cm: 180,
    reach_cm: 183,
    stance: "Orthodox",
    latest_weight_class: "Lightweight",
    aggregate_stats: {
      sigStrikesLandedPerFight: 50,
      sigStrikeAccuracy: 0.5,
      knockdownsPerFight: 0.2,
      takedownsLandedPerFight: 1.5,
      takedownAccuracy: 0.4,
      submissionAttemptsPerFight: 0.5,
      controlTimePerFightSeconds: 120,
    },
  };
}

function buildRawPrediction(): RawPrediction {
  return {
    redProbability: 0.62,
    blueProbability: 0.38,
    topFeatures: [
      { name: "sig_strikes_diff", value: 12, importance: 0.3, impact: 0.2 },
      { name: "takedowns_diff", value: 2, importance: 0.2, impact: 0.1 },
      { name: "reach_diff", value: 5, importance: 0.1, impact: 0.05 },
    ],
    featureValues: { sig_strikes_diff: 12 },
    context: { matchupDate: "2026-06-25", weightClass: "Lightweight" },
    fighters: { red: profile(1, "Red Fighter"), blue: profile(2, "Blue Fighter") },
    modelTrainedAt: "2026-06-25",
  };
}

describe("generatePredictionExplanation", () => {
  beforeEach(() => {
    createMock.mockReset();
    process.env.ANTHROPIC_API_KEY = "test-key";
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("usa la explicación de Anthropic cuando la llamada tiene éxito", async () => {
    createMock.mockResolvedValueOnce({
      content: [{ type: "text", text: "Análisis IA del combate." }],
    });

    const result = await generatePredictionExplanation(buildRawPrediction());

    expect(result.explanationSource).toBe("anthropic");
    expect(result.explanation).toBe("Análisis IA del combate.");
  });

  it("cae al fallback sin lanzar cuando Anthropic falla, y loggea server-side", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    createMock.mockRejectedValueOnce(new Error("529 Overloaded"));

    const data = buildRawPrediction();
    const result = await generatePredictionExplanation(data);

    // El contrato con el cliente se mantiene: probabilidades + explicación de respaldo.
    expect(result.explanationSource).toBe("fallback");
    // Red es favorito (0.62 >= 0.38), así que aparece en el resumen local.
    expect(result.explanation).toContain(data.fighters.red.name);
    expect(consoleError).toHaveBeenCalled();
  });

  it("usa el fallback cuando no hay API key, sin llamar a Anthropic", async () => {
    delete process.env.ANTHROPIC_API_KEY;

    const result = await generatePredictionExplanation(buildRawPrediction());

    expect(result.explanationSource).toBe("fallback");
    expect(createMock).not.toHaveBeenCalled();
  });
});
