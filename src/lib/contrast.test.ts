import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import {
  blend,
  contrastRatio,
  extractBlock,
  parseColorTokens,
  parseHex,
  relativeLuminance,
} from "@/lib/contrast";

// Este test LEE globals.css. No es una copia de los valores: si alguien cambia
// un color en el CSS, aquí se entera. Es el único vigilante de contraste que
// tiene el repo, y existe porque la especificación de la película admite por
// escrito que "los ratios citados no se recalcularon".
const CSS = readFileSync(
  fileURLToPath(new URL("../app/globals.css", import.meta.url)),
  "utf8",
);

const claro = parseColorTokens(extractBlock(CSS, ":root") ?? "");
const oscuro = parseColorTokens(extractBlock(CSS, ".dark") ?? "");

// El umbral de WCAG 2.1 SC 1.4.11 para elementos gráficos que transmiten
// información. No es 4.5 (eso es texto, 1.4.3) ni 3.0 por gusto: es la norma.
const UMBRAL = 3;

// La superficie REAL sobre la que se dibuja el bloque de agarre.
//
// NO es --card. Los tiles de la ficha usan PREMIUM_TILE, que es
// `bg-gradient-to-b from-card to-muted/60` (y `dark:to-muted/30`). El extremo
// del degradado lleva alpha, así que compone contra lo que hay DETRÁS del tile,
// que es --background. Medir contra --card a secas regala contraste.
function superficies(tokens: Record<string, string>, alphaMuted: number) {
  const arriba = tokens["--card"];
  const abajo = blend(tokens["--muted"], tokens["--background"], alphaMuted);
  expect(abajo).not.toBeNull();
  return { arriba, abajo: abajo as string };
}

const TEMAS = [
  { nombre: "claro", tokens: claro, alphaMuted: 0.6 },
  { nombre: "oscuro", tokens: oscuro, alphaMuted: 0.3 },
] as const;

describe("aritmética de contraste", () => {
  it("parsea hex de 6 y de 3 cifras, y rechaza lo que no lo es", () => {
    expect(parseHex("#d20a0a")).toEqual([210, 10, 10]);
    expect(parseHex("d20a0a")).toEqual([210, 10, 10]);
    expect(parseHex("#fff")).toEqual([255, 255, 255]);
    expect(parseHex("oklch(0.5 0.1 30)")).toBeNull();
    expect(parseHex("")).toBeNull();
  });

  it("da los dos extremos que fija la norma", () => {
    // Blanco sobre negro es el máximo posible, y sale 21 exacto.
    expect(contrastRatio("#ffffff", "#000000")).toBeCloseTo(21, 5);
    // Un color contra sí mismo es 1: no hay contraste.
    expect(contrastRatio("#d20a0a", "#d20a0a")).toBeCloseTo(1, 5);
  });

  it("es simétrico: el orden de los colores no cambia el número", () => {
    const ida = contrastRatio("#52525b", "#ffffff");
    const vuelta = contrastRatio("#ffffff", "#52525b");
    expect(ida).toBeCloseTo(vuelta as number, 10);
  });

  it("devuelve null en vez de NaN cuando el color no se entiende", () => {
    expect(contrastRatio("#ffffff", "var(--card)")).toBeNull();
    expect(relativeLuminance([0, 0, 0])).toBe(0);
    expect(relativeLuminance([255, 255, 255])).toBeCloseTo(1, 10);
  });

  it("compone alpha: opaco devuelve el color, transparente el fondo", () => {
    expect(blend("#000000", "#ffffff", 1)).toBe("#000000");
    expect(blend("#000000", "#ffffff", 0)).toBe("#ffffff");
    expect(blend("#ffffff", "#000000", 0.5)).toBe("#808080");
    expect(blend("#ffffff", "#000000", Number.NaN)).toBeNull();
  });

  it("lee los tokens de cada tema por separado, sin mezclarlos", () => {
    // Mismo nombre, valor distinto en cada bloque: si extractBlock contara mal
    // las llaves, los dos temas devolverían lo mismo.
    expect(claro["--card"]).toBe("#ffffff");
    expect(oscuro["--card"]).toBe("#161619");
    expect(claro["--card"]).not.toBe(oscuro["--card"]);
    expect(extractBlock(CSS, ".selector-que-no-existe")).toBeNull();
  });
});

describe("T7 · el tramo «nadie sujetaba» cumple WCAG 1.4.11", () => {
  it("el token existe declarado en los DOS temas", () => {
    // Un token declarado solo en :root heredaría el valor claro en oscuro, y
    // eso ya pasa a propósito con --brand-ink: el olvido y la decisión se
    // parecen demasiado como para no fijarlo.
    expect(claro["--grip-nobody"]).toMatch(/^#[0-9a-f]{6}$/i);
    expect(oscuro["--grip-nobody"]).toMatch(/^#[0-9a-f]{6}$/i);
    expect(claro["--grip-nobody"]).not.toBe(oscuro["--grip-nobody"]);
  });

  it("está registrado en @theme inline, sin lo cual no existe la utilidad", () => {
    // Comprobado compilando con el postcss del repo: un token declarado solo en
    // :root/.dark no genera NINGUNA clase de Tailwind. Falla en silencio.
    expect(CSS).toContain("--color-grip-nobody: var(--grip-nobody);");
  });

  for (const { nombre, tokens, alphaMuted } of TEMAS) {
    describe(`tema ${nombre}`, () => {
      const { arriba, abajo } = superficies(tokens, alphaMuted);
      const fondos = [
        ["arriba del degradado", arriba],
        ["abajo del degradado", abajo],
      ] as const;

      // Los TRES tramos de la barra tienen que despegarse del fondo, no solo el
      // nuevo: si el rojo o el azul dejaran de cumplir, la barra sería igual de
      // inconforme aunque «nadie» estuviera perfecto.
      const tramos = [
        ["--grip-nobody", tokens["--grip-nobody"]],
        ["--corner-red", tokens["--corner-red"]],
        ["--corner-blue", tokens["--corner-blue"]],
      ] as const;

      for (const [tramo, color] of tramos) {
        for (const [donde, fondo] of fondos) {
          it(`${tramo} llega a 3:1 ${donde}`, () => {
            const ratio = contrastRatio(color, fondo);
            expect(ratio).not.toBeNull();
            expect(ratio as number).toBeGreaterThanOrEqual(UMBRAL);
          });
        }
      }

      // --border era el candidato obvio para el tramo «nadie» y es el motivo de
      // que T7 exista. Este test lo deja fijado: mientras siga por debajo de
      // 3:1, volver a él es una regresión, no una simplificación.
      it("--border NO vale para un tramo que significa", () => {
        const ratio = contrastRatio(tokens["--border"], arriba);
        expect(ratio).not.toBeNull();
        expect(ratio as number).toBeLessThan(UMBRAL);
      });

      // 1.4.11 no pide solo contraste contra el fondo: lo pide contra los
      // colores ADYACENTES. Y aquí ningún relleno lo cumple contra su vecino:
      // medido, «nadie» contra el rojo da 1.39 y contra el azul 1.26.
      //
      // Por eso los tramos van SEPARADOS por una línea del color de la
      // superficie, y esa línea NO es decorativa: es lo que hace conforme a la
      // barra. Este test existe para que quitarla salga en rojo.
      it("los rellenos NO se distinguen entre sí: el separador es obligatorio", () => {
        const nobodyVsRed = contrastRatio(
          tokens["--grip-nobody"],
          tokens["--corner-red"],
        );
        const nobodyVsBlue = contrastRatio(
          tokens["--grip-nobody"],
          tokens["--corner-blue"],
        );

        expect(nobodyVsRed as number).toBeLessThan(UMBRAL);
        expect(nobodyVsBlue as number).toBeLessThan(UMBRAL);
      });

      it("el separador sí se distingue de los tres tramos que separa", () => {
        // El separador es el color de la superficie del tile (--card), que es
        // lo que se ve por el hueco entre tramo y tramo.
        for (const [, color] of tramos) {
          const ratio = contrastRatio(tokens["--card"], color);
          expect(ratio).not.toBeNull();
          expect(ratio as number).toBeGreaterThanOrEqual(UMBRAL);
        }
      });
    });
  }
});
