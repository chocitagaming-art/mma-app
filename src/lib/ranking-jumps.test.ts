import { describe, expect, it, vi } from "vitest";

// rankings.ts trae la base y la caché de Next: aquí solo hace falta su lista
// de divisiones, la que pinta la página.
vi.mock("@/lib/db", () => ({ sql: vi.fn() }));
vi.mock("next/cache", () => ({
  unstable_cache: (fn: (...args: never[]) => unknown) => fn,
}));

import { DIVISION_SLUGS } from "@/lib/queries/rankings";
import { divisionGroup, divisionJump, pickActiveDivision, type CardBox } from "@/lib/ranking-jumps";

// La barra de saltos de /clasificacion (21-oct-2026). Los ids van en enlaces
// que se comparten (/clasificacion#peso-pluma): si uno cambiara, el enlace
// llevaría a lo alto de la página sin avisar.
describe("divisionJump", () => {
  it("cada división conocida tiene su id legible y su nombre corto", () => {
    for (const slug of DIVISION_SLUGS) {
      const salto = divisionJump(slug, slug);
      expect(salto.anchor, slug).toMatch(/^[a-z]+(-[a-z]+)*$/);
      expect(salto.short, slug).not.toBe(slug);
    }
  });

  it("los ids no se repiten (y los nombres cortos tampoco)", () => {
    const saltos = DIVISION_SLUGS.map((slug) => divisionJump(slug, slug));
    expect(new Set(saltos.map((s) => s.anchor)).size).toBe(saltos.length);
    expect(new Set(saltos.map((s) => s.short)).size).toBe(saltos.length);
  });

  it("los ids de siempre, que ya pueden estar en enlaces compartidos", () => {
    expect(divisionJump("featherweight", "Peso Pluma")).toEqual({
      anchor: "peso-pluma",
      short: "Pluma",
      group: "men",
    });
    expect(divisionJump("womens_pound_for_pound", "Libra por libra (F)")).toEqual({
      anchor: "libra-por-libra-femenino",
      short: "P4P (F)",
      group: "p4p",
    });
    expect(divisionJump("womens_strawweight", "Peso Paja (F)").anchor).toBe("peso-paja-femenino");
    expect(divisionJump("welterweight", "Peso Wélter").anchor).toBe("peso-welter");
  });

  it("las femeninas se distinguen de las masculinas del mismo nombre", () => {
    expect(divisionJump("womens_flyweight", "").short).toBe("Mosca (F)");
    expect(divisionJump("flyweight", "").short).toBe("Mosca");
  });

  it("🪤 una división que el backend añada sin mapear sigue teniendo un enlace que funciona", () => {
    expect(divisionJump("catch_weight", "catch_weight")).toEqual({
      anchor: "division-catch-weight",
      short: "catch_weight",
      group: "men",
    });
    expect(divisionJump("womens_Atomweight!", "x").anchor).toBe("division-womens-atomweight");
    expect(divisionJump("womens_atomweight", "x").group).toBe("women");
  });

  it("los tres grupos de la página", () => {
    expect(divisionGroup("mens_pound_for_pound")).toBe("p4p");
    expect(divisionGroup("womens_pound_for_pound")).toBe("p4p");
    expect(divisionGroup("womens_bantamweight")).toBe("women");
    expect(divisionGroup("heavyweight")).toBe("men");
  });
});

// La división «que se está viendo»: la línea va justo bajo la barra fija.
describe("pickActiveDivision", () => {
  // Una columna (el móvil): tarjetas de 1.000 px con 20 de hueco.
  const columna: CardBox[] = [
    { id: "a", top: -2000, bottom: -1000 },
    { id: "b", top: -980, bottom: 20 },
    { id: "c", top: 40, bottom: 1040 },
  ];

  it("la tarjeta que cruza la línea", () => {
    expect(pickActiveDivision(columna, 10, null)).toBe("b");
    expect(pickActiveDivision(columna, 500, null)).toBe("c");
  });

  it("la línea en un hueco: la última que pasó", () => {
    expect(pickActiveDivision(columna, 30, null)).toBe("b");
  });

  it("por encima de todas (lo alto de la página): la primera", () => {
    expect(pickActiveDivision(columna, -3000, null)).toBe("a");
  });

  it("sin tarjetas, ninguna", () => {
    expect(pickActiveDivision([], 100, null)).toBeNull();
  });

  // Tres columnas (escritorio): una fila entera cruza la línea a la vez.
  const fila: CardBox[] = [
    { id: "mosca", top: -100, bottom: 1200 },
    { id: "gallo", top: -100, bottom: 1000 },
    { id: "pluma", top: -100, bottom: 1200 },
    { id: "ligero", top: 1220, bottom: 2500 },
  ];

  it("en una fila, la de la izquierda", () => {
    expect(pickActiveDivision(fila, 50, null)).toBe("mosca");
  });

  it("🪤 en una fila, la que se acaba de pulsar aunque no sea la primera", () => {
    expect(pickActiveDivision(fila, 50, "pluma")).toBe("pluma");
  });

  it("la pulsada deja de mandar cuando la línea ya no la cruza", () => {
    expect(pickActiveDivision(fila, 1100, "gallo")).toBe("mosca");
    expect(pickActiveDivision(fila, 1300, "pluma")).toBe("ligero");
  });
});
