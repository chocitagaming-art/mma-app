import { describe, expect, it } from "vitest";

import { p4pDescription } from "@/lib/p4p-description";

// El texto bajo «Mejores libra por libra» de la portada. Tiene que decir la
// verdad sobre DE DÓNDE salen las tarjetas: si la última foto de rankings no
// trae el libra por libra masculino, getFeaturedFighters cae al plan B «los de
// más peleas UFC» (Jim Miller, Arlovski, Magny…, medido el 29-sep-2026), que no
// es ningún ranking. Antes el texto decía «ranking oficial» en los dos casos.
describe("p4pDescription", () => {
  it("masculino y femenino del ranking", () => {
    expect(
      p4pDescription([
        { key: "masculino", source: "ranking" },
        { key: "femenino", source: "ranking" },
      ]),
    ).toBe("Los mejores del ranking oficial de UFC sin importar el peso, en masculino y en femenino.");
  });

  it("solo el masculino del ranking (el femenino llegó vacío)", () => {
    expect(p4pDescription([{ key: "masculino", source: "ranking" }])).toBe(
      "Los mejores del ranking oficial masculino de UFC, sin importar el peso.",
    );
  });

  it("solo el femenino del ranking", () => {
    expect(p4pDescription([{ key: "femenino", source: "ranking" }])).toBe(
      "Las mejores del ranking oficial femenino de UFC, sin importar el peso.",
    );
  });

  it("🪤 masculino del plan B: NO dice «ranking oficial»", () => {
    const texto = p4pDescription([{ key: "masculino", source: "most-fights" }]);
    expect(texto).toBe("Sin el ranking oficial a mano: los luchadores con más peleas en UFC.");
  });

  it("🪤 femenino del ranking y masculino del plan B: cada uno con su origen", () => {
    const texto = p4pDescription([
      { key: "masculino", source: "most-fights" },
      { key: "femenino", source: "ranking" },
    ]);
    expect(texto).toBe(
      "Las mejores del ranking oficial femenino de UFC y, sin el masculino a mano, los luchadores con más peleas en UFC.",
    );
  });

  it("simétrico: un femenino del plan B (hoy imposible) tampoco se llama ranking", () => {
    const texto = p4pDescription([
      { key: "masculino", source: "ranking" },
      { key: "femenino", source: "most-fights" },
    ]);
    expect(texto).toBe(
      "Los mejores del ranking oficial masculino de UFC y, sin el femenino a mano, los luchadores con más peleas en UFC.",
    );
  });

  it("sin paneles no hay nada que describir", () => {
    expect(p4pDescription([])).toBeNull();
  });
});
