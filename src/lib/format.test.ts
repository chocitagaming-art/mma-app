import { describe, expect, it } from "vitest";

import {
  cleanNationality,
  formatHeight,
  formatModelDate,
  formatNewsCategory,
  formatReach,
  formatStance,
  formatWeight,
} from "@/lib/format";

describe("formatHeight", () => {
  it("formats centimetres as an integer with the cm suffix", () => {
    expect(formatHeight(196)).toBe("196 cm");
    expect(formatHeight(180.4)).toBe("180 cm");
    expect(formatHeight(180.6)).toBe("181 cm");
  });

  it("returns the placeholder for null/zero (missing data)", () => {
    expect(formatHeight(null)).toBe("—");
    expect(formatHeight(0)).toBe("—");
  });
});

describe("formatReach", () => {
  it("formats centimetres as an integer with the cm suffix", () => {
    expect(formatReach(193)).toBe("193 cm");
    expect(formatReach(190.5)).toBe("191 cm");
  });

  it("returns the placeholder for null/zero (missing data)", () => {
    expect(formatReach(null)).toBe("—");
    expect(formatReach(0)).toBe("—");
  });
});

describe("formatWeight", () => {
  it("formats grams as kilograms with one decimal", () => {
    expect(formatWeight(70300)).toBe("70.3 kg");
    expect(formatWeight(120000)).toBe("120.0 kg");
  });

  it("returns the placeholder for null/zero (missing data)", () => {
    expect(formatWeight(null)).toBe("—");
    expect(formatWeight(0)).toBe("—");
  });
});

describe("formatStance", () => {
  it("translates known stances to Spanish (case-insensitive)", () => {
    expect(formatStance("Orthodox")).toBe("Ortodoxa");
    expect(formatStance("southpaw")).toBe("Zurda");
    expect(formatStance("Switch")).toBe("Cambiante");
  });

  it("returns a placeholder for null/empty and echoes unknown values", () => {
    expect(formatStance(null)).toBe("—");
    expect(formatStance(undefined)).toBe("—");
    expect(formatStance("Karate")).toBe("Karate");
  });
});

describe("formatNewsCategory", () => {
  it("translates the known backend category slugs to Spanish", () => {
    expect(formatNewsCategory("fight_announcement")).toBe("Anuncio de pelea");
    expect(formatNewsCategory("fight_result")).toBe("Resultado de pelea");
    expect(formatNewsCategory("injury")).toBe("Lesión");
    expect(formatNewsCategory("ranking_change")).toBe("Cambio de ranking");
    expect(formatNewsCategory("transfer")).toBe("Fichaje");
    expect(formatNewsCategory("interview")).toBe("Entrevista");
    expect(formatNewsCategory("other")).toBe("General");
  });

  it("falls back to 'General' for null/empty", () => {
    expect(formatNewsCategory(null)).toBe("General");
    expect(formatNewsCategory("")).toBe("General");
  });

  it("title-cases an unexpected slug instead of showing raw snake_case", () => {
    expect(formatNewsCategory("press_conference")).toBe("Press conference");
  });
});

describe("formatModelDate", () => {
  it("formats an ISO date as a long Spanish date", () => {
    expect(formatModelDate("2026-06-25")).toBe("25 de junio de 2026");
    expect(formatModelDate("2026-01-02")).toBe("2 de enero de 2026");
  });

  it("accepts a full ISO datetime and uses only the date part (UTC, no TZ drift)", () => {
    expect(formatModelDate("2026-06-25T23:59:00Z")).toBe("25 de junio de 2026");
  });

  it("returns the raw value when it is not a parseable date", () => {
    expect(formatModelDate("not-a-date")).toBe("not-a-date");
  });
});

describe("cleanNationality", () => {
  it("returns a real nationality untouched (trimmed)", () => {
    expect(cleanNationality("Brazil")).toBe("Brazil");
    expect(cleanNationality("  United States  ")).toBe("United States");
  });

  it("treats null, empty and the literal 'Unknown' as no data (null)", () => {
    expect(cleanNationality(null)).toBeNull();
    expect(cleanNationality(undefined)).toBeNull();
    expect(cleanNationality("")).toBeNull();
    expect(cleanNationality("Unknown")).toBeNull();
    expect(cleanNationality("unknown")).toBeNull();
  });
});
