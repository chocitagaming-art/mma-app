import { describe, expect, it } from "vitest";

import { mapFighterFacts, mapFighterQa } from "@/lib/queries/fighters.mappers";

describe("mapFighterFacts", () => {
  it("acepta el array de strings del JSONB", () => {
    expect(mapFighterFacts(["Profesional desde 2013", "Campeón de la AFL"])).toEqual([
      "Profesional desde 2013",
      "Campeón de la AFL",
    ]);
  });

  it("filtra entradas no-string o vacías", () => {
    expect(mapFighterFacts(["ok", "", "   ", 7, null, { x: 1 }])).toEqual(["ok"]);
  });

  it("degrada a vacío con NULL o formas corruptas (nunca rompe la ficha)", () => {
    expect(mapFighterFacts(null)).toEqual([]);
    expect(mapFighterFacts(undefined)).toEqual([]);
    expect(mapFighterFacts("no soy un array")).toEqual([]);
    expect(mapFighterFacts({ facts: [] })).toEqual([]);
  });
});

describe("mapFighterQa", () => {
  it("acepta el array de pares {q,a} del JSONB", () => {
    const qa = [
      { q: "¿Cuándo empezaste?", a: "En 2013." },
      { q: "Técnica favorita:", a: "Kimura" },
    ];
    expect(mapFighterQa(qa)).toEqual(qa);
  });

  it("descarta pares incompletos, vacíos o mal formados", () => {
    expect(
      mapFighterQa([
        { q: "¿Válida?", a: "Sí" },
        { q: "Sin respuesta" },
        { a: "Sin pregunta" },
        { q: "", a: "vacía" },
        { q: "   ", a: "blancos" },
        { q: 1, a: 2 },
        "string suelto",
        null,
        ["array"],
      ]),
    ).toEqual([{ q: "¿Válida?", a: "Sí" }]);
  });

  it("degrada a vacío con NULL o formas corruptas", () => {
    expect(mapFighterQa(null)).toEqual([]);
    expect(mapFighterQa(undefined)).toEqual([]);
    expect(mapFighterQa({ q: "objeto", a: "suelto" })).toEqual([]);
  });
});
