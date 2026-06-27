import { describe, expect, it } from "vitest";

import { compareModelVsMarket, marketFavorite } from "@/lib/odds";

describe("marketFavorite", () => {
  it("identifies the favorite and removes the vig so implied probs sum to 1", () => {
    // Red 3.00 (underdog) vs Blue 1.40 (favorite).
    const result = marketFavorite(3.0, 1.4);
    expect(result).not.toBeNull();
    expect(result!.favorite).toBe("blue");
    expect(result!.blueImplied).toBeCloseTo(0.6818, 3);
    expect(result!.redImplied).toBeCloseTo(0.3182, 3);
    expect(result!.redImplied + result!.blueImplied).toBeCloseTo(1, 6);
  });

  it("handles a heavy favorite on the red corner", () => {
    const result = marketFavorite(1.04, 13.0);
    expect(result!.favorite).toBe("red");
    expect(result!.redImplied).toBeGreaterThan(0.9);
  });

  it("returns null when either odd is missing or invalid (<= 1.0)", () => {
    expect(marketFavorite(null, 1.5)).toBeNull();
    expect(marketFavorite(1.5, null)).toBeNull();
    expect(marketFavorite(0, 2)).toBeNull();
    expect(marketFavorite(1.0, 2.0)).toBeNull();
  });
});

describe("compareModelVsMarket", () => {
  it("computes the signed edge per corner from a known example", () => {
    const result = compareModelVsMarket(
      { redImplied: 0.4, blueImplied: 0.6 },
      { redProbability: 0.7, blueProbability: 0.3 },
    );
    expect(result.redEdge).toBeCloseTo(0.3, 6);
    expect(result.blueEdge).toBeCloseTo(-0.3, 6);
    expect(result.marketFavorite).toBe("blue");
    expect(result.modelFavorite).toBe("red");
    expect(result.agree).toBe(false);
    expect(result.valueCorner).toBe("red");
    expect(result.valueEdge).toBeCloseTo(0.3, 6);
  });

  it("flags agreement when both favour the same corner", () => {
    const result = compareModelVsMarket(
      { redImplied: 0.6, blueImplied: 0.4 },
      { redProbability: 0.7, blueProbability: 0.3 },
    );
    expect(result.marketFavorite).toBe("red");
    expect(result.modelFavorite).toBe("red");
    expect(result.agree).toBe(true);
    expect(result.valueCorner).toBe("red");
    expect(result.valueEdge).toBeCloseTo(0.1, 6);
  });

  it("disagrees when market and model favour different corners", () => {
    const result = compareModelVsMarket(
      { redImplied: 0.7, blueImplied: 0.3 },
      { redProbability: 0.45, blueProbability: 0.55 },
    );
    expect(result.marketFavorite).toBe("red");
    expect(result.modelFavorite).toBe("blue");
    expect(result.agree).toBe(false);
    // The model is more optimistic on blue than the market, so value sits there.
    expect(result.valueCorner).toBe("blue");
    expect(result.valueEdge).toBeCloseTo(0.25, 6);
  });

  it("is symmetric: swapping corners mirrors the output", () => {
    const market = { redImplied: 0.4, blueImplied: 0.6 };
    const model = { redProbability: 0.7, blueProbability: 0.3 };
    const base = compareModelVsMarket(market, model);
    const swapped = compareModelVsMarket(
      { redImplied: market.blueImplied, blueImplied: market.redImplied },
      {
        redProbability: model.blueProbability,
        blueProbability: model.redProbability,
      },
    );
    expect(swapped.redEdge).toBeCloseTo(base.blueEdge, 6);
    expect(swapped.blueEdge).toBeCloseTo(base.redEdge, 6);
    expect(swapped.marketFavorite).toBe(
      base.marketFavorite === "red" ? "blue" : "red",
    );
    expect(swapped.modelFavorite).toBe(
      base.modelFavorite === "red" ? "blue" : "red",
    );
    expect(swapped.agree).toBe(base.agree);
    expect(swapped.valueCorner).toBe(
      base.valueCorner === "red" ? "blue" : "red",
    );
    expect(swapped.valueEdge).toBeCloseTo(base.valueEdge, 6);
  });

  it("treats a 50/50 market and model as agreement with ~zero edge", () => {
    const result = compareModelVsMarket(
      { redImplied: 0.5, blueImplied: 0.5 },
      { redProbability: 0.5, blueProbability: 0.5 },
    );
    expect(result.agree).toBe(true);
    expect(result.valueEdge).toBeCloseTo(0, 6);
  });

  it("normalizes non-complementary model probabilities defensively", () => {
    // If an upstream value drifts (here both 0.6, summing to 1.2), normalize to
    // 0.5/0.5 so there is no phantom edge on both corners at once.
    const result = compareModelVsMarket(
      { redImplied: 0.5, blueImplied: 0.5 },
      { redProbability: 0.6, blueProbability: 0.6 },
    );
    expect(result.redEdge).toBeCloseTo(0, 6);
    expect(result.blueEdge).toBeCloseTo(0, 6);
    expect(result.valueEdge).toBeCloseTo(0, 6);
    expect(result.agree).toBe(true);
  });

  it("puts value on the corner where the model is more optimistic than the market", () => {
    // Market sees a coin flip; the model leans red.
    const result = compareModelVsMarket(
      { redImplied: 0.5, blueImplied: 0.5 },
      { redProbability: 0.62, blueProbability: 0.38 },
    );
    expect(result.valueCorner).toBe("red");
    expect(result.valueEdge).toBeCloseTo(0.12, 6);
  });
});
