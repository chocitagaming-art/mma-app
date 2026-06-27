import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type {
  FighterHistorySummary,
  PredictionFighterProfile,
  PredictionResponse,
} from "./prediction";

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

function historySummary(): FighterHistorySummary {
  return {
    total_prior_fights: 12,
    total_rounds_fought: 30,
    sig_strikes_landed_per_fight: 50,
    sig_strike_accuracy: 0.5,
    knockdowns_per_fight: 0.2,
    takedowns_landed_per_fight: 1.5,
    takedown_accuracy: 0.4,
    submission_attempts_per_fight: 0.5,
    control_time_seconds_per_fight: 120,
    win_streak: 3,
    wins_last_5: 4,
    pct_wins_by_ko: 0.4,
    pct_wins_by_submission: 0.2,
    pct_wins_by_decision: 0.4,
    days_since_last_fight: 90,
    ranking_position: 5,
    sig_strikes_absorbed_per_fight: 40,
    sig_strike_defense: 0.55,
    takedowns_absorbed_per_fight: 0.8,
    takedown_defense: 0.7,
    avg_opponent_prior_win_rate: 0.52,
    latest_prior_fight_date: "2026-03-20",
  };
}

function buildRawPrediction(): RawPrediction {
  return {
    redProbability: 0.62,
    blueProbability: 0.38,
    lowConfidence: false,
    topFeatures: [
      { name: "sig_strikes_diff", value: 12, contribution: 0.2, direction: "red" },
      { name: "takedowns_diff", value: 2, contribution: 0.1, direction: "red" },
      { name: "reach_diff", value: 5, contribution: -0.05, direction: "blue" },
    ],
    featureValues: { sig_strikes_diff: 12 },
    context: {
      matchupDate: "2026-06-25",
      weightClass: "Lightweight",
      lowConfidence: false,
      redHistory: historySummary(),
      blueHistory: historySummary(),
    },
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
