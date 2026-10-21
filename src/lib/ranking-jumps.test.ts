import { describe, expect, it, vi } from "vitest";

// rankings.ts trae la base y la caché de Next: aquí solo hace falta su lista
// de divisiones, la que pinta la página.
vi.mock("@/lib/db", () => ({ sql: vi.fn() }));
vi.mock("next/cache", () => ({
  unstable_cache: (fn: (...args: never[]) => unknown) => fn,
}));

import { DIVISION_SLUGS } from "@/lib/queries/rankings";
import {
  divisionGroup,
  divisionJump,
  divisionRow,
  pickActiveDivision,
  type CardBox,
} from "@/lib/ranking-jumps";

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
      name: "Peso Pluma",
      group: "men",
    });
    expect(divisionJump("womens_pound_for_pound", "Libra por libra (F)")).toEqual({
      anchor: "libra-por-libra-femenino",
      short: "P4P (F)",
      name: "P4P (F), libra por libra femenino",
      group: "p4p",
    });
  });

  // 🪤 La página y la barra sacan el id de la MISMA función: si uno cambiara,
  // el href y el id seguirían cuadrando y todo saldría verde, mientras los
  // enlaces ya compartidos (/clasificacion#peso-medio) llevarían a lo alto de
  // la página sin avisar. Por eso los catorce, escritos a mano, en el orden
  // del backend (rankings.ts, DIVISION_ORDER).
  it("los catorce ids, escritos a mano: ninguno puede cambiar", () => {
    expect(DIVISION_SLUGS.map((slug) => divisionJump(slug, slug).anchor)).toEqual([
      "libra-por-libra",
      "peso-mosca",
      "peso-gallo",
      "peso-pluma",
      "peso-ligero",
      "peso-welter",
      "peso-medio",
      "peso-semipesado",
      "peso-pesado",
      "libra-por-libra-femenino",
      "peso-paja-femenino",
      "peso-mosca-femenino",
      "peso-gallo-femenino",
      "peso-pluma-femenino",
    ]);
  });

  // Lo que oye un lector de pantalla: «P4P» se lee letra a letra y «(F)» como
  // una «F» suelta. El nombre entero, y SIEMPRE con lo que se ve dentro (WCAG
  // 2.5.3): quien dice «pulsa Mosca F» a su programa de voz lo encuentra.
  it("cada enlace dice su división entera y contiene lo que se ve", () => {
    const saltos = DIVISION_SLUGS.map((slug) => divisionJump(slug, slug));
    expect(saltos.map((s) => s.name)).toEqual([
      "P4P, libra por libra",
      "Peso Mosca",
      "Peso Gallo",
      "Peso Pluma",
      "Peso Ligero",
      "Peso Wélter",
      "Peso Medio",
      "Peso Semipesado",
      "Peso Pesado",
      "P4P (F), libra por libra femenino",
      "Peso Paja (F), femenino",
      "Peso Mosca (F), femenino",
      "Peso Gallo (F), femenino",
      "Peso Pluma (F), femenino",
    ]);
    for (const salto of saltos) expect(salto.name, salto.anchor).toContain(salto.short);
  });

  it("las femeninas se distinguen de las masculinas del mismo nombre", () => {
    expect(divisionJump("womens_flyweight", "").short).toBe("Mosca (F)");
    expect(divisionJump("flyweight", "").short).toBe("Mosca");
  });

  it("🪤 una división que el backend añada sin mapear sigue teniendo un enlace que funciona", () => {
    expect(divisionJump("catch_weight", "catch_weight")).toEqual({
      anchor: "division-catch-weight",
      short: "catch_weight",
      name: "catch_weight",
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

  // 🪤 El observador de la barra vigila una franja de 1 px en la línea y da
  // por dentro una tarjeta que solo la roza. La regla tiene que decir lo mismo:
  // con la cabecera de «c» en (línea, línea + 1], la barra encendía «b» y, sin
  // más avisos del observador, la dejaba encendida toda la tarjeta.
  it("🪤 una tarjeta que solo roza la franja de la línea ya cuenta como cruzada", () => {
    expect(pickActiveDivision(columna, 39.5, null)).toBe("c");
    expect(pickActiveDivision(columna, 39, null)).toBe("c");
    // Y por abajo, un borde que toca la línea también.
    expect(pickActiveDivision(columna, 20, null)).toBe("b");
  });

  // En un hueco, la que viene: la que está en pantalla justo debajo. 🪤 La
  // última que pasó era, en la rejilla, la de la derecha de la fila de arriba
  // o la última del grupo anterior, ya fuera de la pantalla.
  it("la línea en un hueco: la siguiente, la que se ve debajo", () => {
    expect(pickActiveDivision(columna, 30, null)).toBe("c");
  });

  // Arriba del todo no se está leyendo nada: un «P4P» encendido ahí parecía
  // una pestaña elegida, un filtro, y no un índice.
  it("por encima de todas (lo alto de la página): ninguna", () => {
    expect(pickActiveDivision(columna, -3000, null)).toBeNull();
  });

  it("por debajo de todas (el pie): la última; en la rejilla, la primera de la última fila", () => {
    expect(pickActiveDivision(columna, 2000, null)).toBe("c");
    expect(pickActiveDivision(fila, 3000, null)).toBe("ligero");
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
    { id: "welter", top: 1220, bottom: 2400 },
  ];

  it("en una fila, la de la izquierda", () => {
    expect(pickActiveDivision(fila, 50, null)).toBe("mosca");
  });

  it("🪤 en una fila, la que se acaba de pulsar aunque no sea la primera", () => {
    expect(pickActiveDivision(fila, 50, "pluma")).toBe("pluma");
  });

  it("la pulsada manda mientras se lee su fila; después, la fila siguiente", () => {
    expect(pickActiveDivision(fila, 1100, "gallo")).toBe("gallo");
    expect(pickActiveDivision(fila, 1300, "pluma")).toBe("ligero");
  });

  // «gallo» acaba antes que las otras dos: sigue siendo su fila la que se lee.
  it("🪤 en una fila de tarjetas desiguales, la de la izquierda hasta acabar la fila (sin encender la más larga unos px)", () => {
    const desigual: CardBox[] = [
      { id: "mosca", top: -100, bottom: 1000 },
      { id: "gallo", top: -100, bottom: 1100 },
      { id: "pluma", top: -100, bottom: 1150 },
      { id: "ligero", top: 1170, bottom: 2500 },
    ];
    expect(pickActiveDivision(desigual, 1120, null)).toBe("mosca");
    expect(pickActiveDivision(desigual, 1160, null)).toBe("ligero");
  });

  it("🪤 en el hueco entre dos filas, la izquierda de la fila que viene (no la derecha de la de arriba)", () => {
    expect(pickActiveDivision(fila, 1210, null)).toBe("ligero");
  });
});

// La fila de la que se lee: en escritorio se ven dos o tres divisiones a la vez.
describe("divisionRow", () => {
  const rejilla: CardBox[] = [
    { id: "mosca", top: -100.4, bottom: 1200 },
    { id: "gallo", top: -100.4, bottom: 1000 },
    { id: "pluma", top: -100.4, bottom: 1200 },
    { id: "ligero", top: 1220, bottom: 2500 },
  ];

  it("las tarjetas que comparten fila, en el orden de la página", () => {
    expect(divisionRow(rejilla, "gallo")).toEqual(["mosca", "gallo", "pluma"]);
    expect(divisionRow(rejilla, "ligero")).toEqual(["ligero"]);
  });

  it("una división que no está, ninguna", () => {
    expect(divisionRow(rejilla, "pesado")).toEqual([]);
  });
});
