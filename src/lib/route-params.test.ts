import { describe, expect, it } from "vitest";

import { parseId, parsePageParam } from "@/lib/route-params";

describe("parseId", () => {
  it("returns the integer for a valid positive id", () => {
    expect(parseId("42")).toBe(42);
    expect(parseId("1")).toBe(1);
  });

  it("returns null for non-numeric input", () => {
    expect(parseId("abc")).toBeNull();
    expect(parseId("12abc")).toBeNull();
    expect(parseId("NaN")).toBeNull();
  });

  it("returns null for negative numbers", () => {
    expect(parseId("-5")).toBeNull();
  });

  it("returns null for zero", () => {
    expect(parseId("0")).toBeNull();
  });

  it("returns null for decimals", () => {
    expect(parseId("1.5")).toBeNull();
    expect(parseId("2.0")).toBeNull();
  });

  it("returns null for empty or whitespace input", () => {
    expect(parseId("")).toBeNull();
    expect(parseId("   ")).toBeNull();
    expect(parseId(undefined)).toBeNull();
  });

  it("accepts the maximum Postgres int4 id", () => {
    expect(parseId("2147483647")).toBe(2147483647);
  });

  it("returns null for ids beyond Postgres int4 range (would 500 in SQL)", () => {
    expect(parseId("2147483648")).toBeNull(); // int4 max + 1, still a safe JS int
    expect(parseId("9999999999")).toBeNull();
  });

  it("returns null for ids that overflow a safe integer", () => {
    expect(parseId("99999999999999999999")).toBeNull();
  });

  it("uses the first value when given an array", () => {
    expect(parseId(["7", "8"])).toBe(7);
    expect(parseId(["abc"])).toBeNull();
  });
});

describe("parsePageParam", () => {
  it("returns the integer for a valid page", () => {
    expect(parsePageParam("3")).toBe(3);
    expect(parsePageParam("1")).toBe(1);
  });

  it("defaults to 1 for non-numeric input", () => {
    expect(parsePageParam("abc")).toBe(1);
  });

  it("defaults to 1 for negative numbers", () => {
    expect(parsePageParam("-2")).toBe(1);
  });

  it("defaults to 1 for zero", () => {
    expect(parsePageParam("0")).toBe(1);
  });

  it("defaults to 1 for decimals", () => {
    expect(parsePageParam("2.5")).toBe(1);
  });

  it("defaults to 1 for empty or missing input", () => {
    expect(parsePageParam("")).toBe(1);
    expect(parsePageParam(undefined)).toBe(1);
  });

  it("defaults to 1 for pages that overflow a safe integer", () => {
    expect(parsePageParam("99999999999999999999")).toBe(1);
  });

  it("uses the first value when given an array", () => {
    expect(parsePageParam(["4", "9"])).toBe(4);
  });
});
