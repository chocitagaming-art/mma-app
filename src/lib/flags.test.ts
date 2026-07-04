import { describe, expect, it } from "vitest";

import { countryNameEs, nationalityToCountryCode } from "@/lib/flags";

describe("nationalityToCountryCode", () => {
  it("resolves aliases and demonyms to ISO2 codes", () => {
    expect(nationalityToCountryCode("USA")).toBe("us");
    expect(nationalityToCountryCode("United States")).toBe("us");
    expect(nationalityToCountryCode("Irish")).toBe("ie");
    expect(nationalityToCountryCode("Dagestan")).toBe("ru");
  });

  it("returns null for missing, unknown or unmapped values", () => {
    expect(nationalityToCountryCode(null)).toBeNull();
    expect(nationalityToCountryCode("Unknown")).toBeNull();
    expect(nationalityToCountryCode("Atlantis")).toBeNull();
  });
});

describe("countryNameEs", () => {
  it("translates resolvable nationalities to Spanish country names", () => {
    expect(countryNameEs("USA")).toBe("Estados Unidos");
    expect(countryNameEs("Ireland")).toBe("Irlanda");
    expect(countryNameEs("Brazil")).toBe("Brasil");
  });

  it("falls back to the cleaned raw text when the country is unmapped", () => {
    expect(countryNameEs("Atlantis")).toBe("Atlantis");
    expect(countryNameEs("  Atlantis  ")).toBe("Atlantis");
  });

  it("returns null when there is nothing presentable", () => {
    expect(countryNameEs(null)).toBeNull();
    expect(countryNameEs(undefined)).toBeNull();
    expect(countryNameEs("")).toBeNull();
    expect(countryNameEs("Unknown")).toBeNull();
  });
});
