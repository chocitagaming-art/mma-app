import { describe, expect, it } from "vitest";

import { formatKgFromLbs, formatLbs, lbsToKg } from "@/lib/weigh-in";

describe("lbsToKg", () => {
  it("converts with the exact international pound", () => {
    expect(lbsToKg(155)).toBeCloseTo(70.3068, 3);
    expect(lbsToKg(0)).toBe(0);
  });
});

describe("formatLbs", () => {
  it("formats with one decimal and the lb unit", () => {
    expect(formatLbs(145.5)).toBe("145.5 lb");
    expect(formatLbs(170)).toBe("170.0 lb");
  });

  it("returns an em dash for missing or invalid weights", () => {
    expect(formatLbs(null)).toBe("—");
    expect(formatLbs(Number.NaN)).toBe("—");
  });
});

describe("formatKgFromLbs", () => {
  it("derives kilos from pounds with one decimal", () => {
    expect(formatKgFromLbs(145.5)).toBe("66.0 kg");
    expect(formatKgFromLbs(265)).toBe("120.2 kg");
  });

  it("returns an em dash for missing or invalid weights", () => {
    expect(formatKgFromLbs(null)).toBe("—");
    expect(formatKgFromLbs(Number.NaN)).toBe("—");
  });
});
