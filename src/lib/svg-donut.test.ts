import { describe, expect, it } from "vitest";

import {
  clampFraction,
  donutArc,
  donutRing,
  donutSegments,
} from "@/lib/svg-donut";

describe("donutRing", () => {
  it("derives the stroke mid-line radius, thickness and circumference", () => {
    const ring = donutRing(36, 50);

    expect(ring.radius).toBeCloseTo(43);
    expect(ring.strokeWidth).toBeCloseTo(14);
    expect(ring.circumference).toBeCloseTo(2 * Math.PI * 43);
  });
});

describe("clampFraction", () => {
  it("keeps an in-range value untouched", () => {
    expect(clampFraction(0.42)).toBe(0.42);
  });

  it("clamps out-of-range values into [0, 1]", () => {
    expect(clampFraction(-0.5)).toBe(0);
    expect(clampFraction(1.7)).toBe(1);
  });

  it("treats NaN as 0", () => {
    expect(clampFraction(Number.NaN)).toBe(0);
  });
});

describe("donutArc", () => {
  it("splits the circumference into the painted arc and the remaining gap", () => {
    expect(donutArc(0.25, 100)).toEqual({ dashArray: "25 75", dashOffset: 0 });
  });

  it("paints nothing for fraction 0 and the full ring for fraction 1", () => {
    expect(donutArc(0, 100)).toEqual({ dashArray: "0 100", dashOffset: 0 });
    expect(donutArc(1, 100)).toEqual({ dashArray: "100 0", dashOffset: 0 });
  });

  it("clamps fractions outside [0, 1]", () => {
    expect(donutArc(2, 100)).toEqual({ dashArray: "100 0", dashOffset: 0 });
    expect(donutArc(-1, 100)).toEqual({ dashArray: "0 100", dashOffset: 0 });
  });
});

describe("donutSegments", () => {
  it("lays out consecutive arcs sized by their share of the total", () => {
    expect(donutSegments([3, 1], 100)).toEqual([
      { dashArray: "75 25", dashOffset: -0 },
      { dashArray: "25 75", dashOffset: -75 },
    ]);
  });

  it("fills the full ring with a single segment", () => {
    expect(donutSegments([5], 100)).toEqual([
      { dashArray: "100 0", dashOffset: -0 },
    ]);
  });

  it("produces empty arcs when every value is zero", () => {
    expect(donutSegments([0, 0], 100)).toEqual([
      { dashArray: "0 100", dashOffset: -0 },
      { dashArray: "0 100", dashOffset: -0 },
    ]);
  });

  it("ignores negative values when computing shares", () => {
    expect(donutSegments([-4, 1], 100)).toEqual([
      { dashArray: "0 100", dashOffset: -0 },
      { dashArray: "100 0", dashOffset: -0 },
    ]);
  });
});
