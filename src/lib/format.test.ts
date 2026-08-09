import { describe, expect, it } from "vitest";

import {
  ageFromBirthDate,
  cleanNationality,
  formatDate,
  formatHeight,
  formatMethod,
  isDecisionMethod,
  formatModelDate,
  formatNewsCategory,
  formatReach,
  formatRelativeDate,
  formatStance,
  formatWeight,
} from "@/lib/format";

describe("ageFromBirthDate", () => {
  const ref = new Date("2026-07-04T00:00:00Z");

  it("computes completed years relative to the reference date", () => {
    // Cumpleaños ya pasado este año.
    expect(ageFromBirthDate("1988-07-01", ref)).toBe(38);
    // Cumpleaños aún no cumplido este año.
    expect(ageFromBirthDate("1988-07-05", ref)).toBe(37);
    // Cumpleaños exactamente hoy: ya cuenta el año.
    expect(ageFromBirthDate("1988-07-04", ref)).toBe(38);
  });

  it("accepts full ISO datetimes and ignores the time part", () => {
    expect(ageFromBirthDate("1990-01-15T00:00:00.000Z", ref)).toBe(36);
  });

  it("returns null for missing or unparsable values", () => {
    expect(ageFromBirthDate(null, ref)).toBeNull();
    expect(ageFromBirthDate(undefined, ref)).toBeNull();
    expect(ageFromBirthDate("", ref)).toBeNull();
    expect(ageFromBirthDate("no-date", ref)).toBeNull();
  });

  it("returns null for implausible ages (future or >120 years)", () => {
    expect(ageFromBirthDate("2030-01-01", ref)).toBeNull();
    expect(ageFromBirthDate("1880-01-01", ref)).toBeNull();
  });
});

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

describe("formatRelativeDate", () => {
  const ref = new Date("2026-07-05T10:00:00Z");

  it("formats recent past dates in days ('hace N días', 'ayer', 'hoy')", () => {
    expect(formatRelativeDate("2026-06-29", ref)).toBe("hace 6 días");
    expect(formatRelativeDate("2026-07-04", ref)).toBe("ayer");
    expect(formatRelativeDate("2026-07-05", ref)).toBe("hoy");
  });

  it("switches to weeks and months for older dates", () => {
    expect(formatRelativeDate("2026-06-14", ref)).toBe("hace 3 semanas");
    expect(formatRelativeDate("2026-04-05", ref)).toBe("hace 3 meses");
  });

  it("accepts a full ISO datetime and uses only the date part", () => {
    expect(formatRelativeDate("2026-06-29T23:59:00Z", ref)).toBe("hace 6 días");
  });

  it("returns null for missing or unparsable values", () => {
    expect(formatRelativeDate(null, ref)).toBeNull();
    expect(formatRelativeDate("no-date", ref)).toBeNull();
  });
});

describe("formatMethod", () => {
  it("traduce los códigos canónicos cortos de ufcstats (S3-G)", () => {
    // Antes se pintaban crudos: METHOD_ES no tenía las claves y ningún regex
    // de fallback captura "u-dec"/"cnc" (hallazgo de la revisión adversarial).
    expect(formatMethod("U-DEC")).toBe("Decisión unánime");
    expect(formatMethod("S-DEC")).toBe("Decisión dividida");
    expect(formatMethod("M-DEC")).toBe("Decisión mayoritaria");
    expect(formatMethod("CNC")).toBe("Sin resultado");
  });

  it("conserva los formatos largos y compuestos", () => {
    expect(formatMethod("KO/TKO - Punches")).toBe("KO/TKO");
    expect(formatMethod("SUB - Anaconda Choke")).toBe("Sumisión");
    expect(formatMethod("Decision - Unanimous")).toBe("Decisión unánime");
    expect(formatMethod("DQ")).toBe("Descalificación");
    expect(formatMethod("Overturned")).toBe("Resultado anulado");
  });

  it("cae al valor crudo para métodos desconocidos y a guion sin método", () => {
    expect(formatMethod("Something Odd")).toBe("Something Odd");
    expect(formatMethod(null)).toBe("—");
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

// ── formatDate y el huso del proceso (arreglo del 2-ago) ────────────────────
describe("formatDate y la zona horaria", () => {
  it("un día civil NO se corre por el huso del proceso", () => {
    // Sin `timeZone: "UTC"`, "2026-08-08" se parsea como medianoche UTC y se
    // formatea con el reloj del proceso: al oeste de Greenwich retrocedía al 7.
    // El megatest corre en Europe/Madrid y Vercel en UTC, así que el portátil y
    // producción podían imprimir días distintos para el mismo dato.
    expect(formatDate("2026-08-08")).toBe("8 ago 2026");
    expect(formatDate("2026-01-01")).toBe("1 ene 2026");
    expect(formatDate("2026-12-31")).toBe("31 dic 2026");
  });

  it("un timestamptz se fecha por su día UTC, no por el del proceso", () => {
    expect(formatDate("2026-08-09 00:00:00+00")).toBe("9 ago 2026");
    expect(formatDate("2026-08-08 23:30:00+00")).toBe("8 ago 2026");
  });

  it("sin fecha lo dice en vez de romper", () => {
    expect(formatDate(null)).toBe("Por definir");
  });
});

describe("isDecisionMethod · qué combate es un empate", () => {
  // POR QUÉ EXISTE: un combate que llegó a las tarjetas y no tiene ganador es
  // un EMPATE, y la web no lo decía en ninguna parte. 59 fichas rotulaban
  // "Decisión mayoritaria", no marcaban ganador en ninguna esquina, y dejaban
  // al lector deducirlo. Esta función decide qué se rotula "Empate".

  it("las tres decisiones cuentan, en abreviatura y en texto", () => {
    for (const m of ["U-DEC", "M-DEC", "S-DEC", "u-dec", "Decision - Unanimous", "Decision"]) {
      expect(isDecisionMethod(m)).toBe(true);
    }
  });

  it("un resultado anulado NO es un empate: ya se explica solo", () => {
    // Los 23 'Overturned' de la base tampoco tienen ganador, pero su método se
    // traduce a "Resultado anulado", que se entiende sin ayuda. Llamarlos
    // empate sería inventar un desenlace que no ocurrió.
    expect(isDecisionMethod("Overturned")).toBe(false);
    expect(isDecisionMethod("CNC")).toBe(false);
    expect(isDecisionMethod("NC")).toBe(false);
  });

  it("un final antes del límite tampoco", () => {
    for (const m of ["KO/TKO", "SUB - Rear Naked Choke", "DQ", "Could Not Continue"]) {
      expect(isDecisionMethod(m)).toBe(false);
    }
  });

  it("sin método no se afirma nada", () => {
    expect(isDecisionMethod(null)).toBe(false);
    expect(isDecisionMethod("")).toBe(false);
  });
});
