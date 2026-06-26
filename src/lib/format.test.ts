import { describe, expect, it } from "vitest";

import { cleanNationality, formatNewsCategory } from "@/lib/format";

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
