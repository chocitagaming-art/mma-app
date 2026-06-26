import { describe, expect, it } from "vitest";

import { marketFavorite } from "@/lib/odds";

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
