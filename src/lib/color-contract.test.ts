import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import {
  CONTRATO,
  PARES_DE_TEXTO,
  SUPERFICIES,
  claridad,
  contraste,
  deltaE00,
  hexARgb,
} from "./color-contract";

// ─── PUERTA 1 de 2 · EL CONTRATO DE COLOR, A NIVEL DE TOKEN ──────────────────
//
// Destino en el repo: src/lib/color-contract.test.ts
//
// Esta puerta lee globals.css y comprueba las RELACIONES entre tokens. Es la
// barata: no necesita navegador, ni servidor, ni puerto 3100; corre dentro de
// `npm test` en milisegundos y por eso es la que puede correr en cada commit.
//
// La cara de píxeles la pone e2e/color.spec.ts. Las dos hacen falta y no se
// solapan: aquí no se ve un degradado (es una clase de Tailwind, no un token),
// y allí no se ve una relación de tokens que hoy no esté pintada en pantalla.
//
// 🪤 Se parsea el CSS a mano y a propósito. Meter postcss aquí ataría la puerta
// a la cadena de build: si el build se rompe, la puerta se calla, que es
// justo lo contrario de lo que tiene que hacer una puerta.

const CSS = readFileSync(
  fileURLToPath(new URL("../app/globals.css", import.meta.url)),
  "utf8",
);

/** Saca el bloque `{...}` del primer selector que case, sin anidamiento. */
function bloque(selector: string): string {
  const i = CSS.indexOf(selector);
  if (i === -1) throw new Error(`No hay bloque "${selector}" en globals.css`);
  const abre = CSS.indexOf("{", i);
  const cierra = CSS.indexOf("}", abre);
  if (abre === -1 || cierra === -1) {
    throw new Error(`Bloque "${selector}" mal formado en globals.css`);
  }
  return CSS.slice(abre + 1, cierra);
}

function tokens(selector: string): Map<string, string> {
  const mapa = new Map<string, string>();
  for (const linea of bloque(selector).split(";")) {
    const m = linea.match(/(--[a-z0-9-]+)\s*:\s*(#[0-9a-fA-F]{3,6})\s*$/);
    if (m) mapa.set(m[1], m[2]);
  }
  return mapa;
}

const CLARO = tokens(":root {");
// 🪤 `.dark {` a secas casaría antes con `@custom-variant dark (&:is(.dark *))`.
// Se ancla al comentario del bloque, que es la única marca estable del fichero.
const OSCURO = tokens("/* DARK");

const TEMAS = [
  { nombre: "claro", mapa: CLARO },
  { nombre: "oscuro", mapa: OSCURO },
] as const;

function color(mapa: Map<string, string>, token: string) {
  const hex = mapa.get(token) ?? CLARO.get(token); // los tokens de :root heredan
  if (!hex) throw new Error(`Token ${token} sin valor hex sólido`);
  return hexARgb(hex);
}

describe("contrato de color · los dos temas se leen", () => {
  it("encuentra los dos juegos de tokens", () => {
    expect(CLARO.get("--background")).toBe("#faf7f6");
    expect(OSCURO.get("--background")).toBe("#0b0b0d");
    expect(CLARO.size).toBeGreaterThan(30);
    expect(OSCURO.size).toBeGreaterThan(30);
  });
});

// ─── R1 · TEXTO ──────────────────────────────────────────────────────────────
describe("R1 · todo par de texto declarado cumple WCAG AA (4,5:1)", () => {
  for (const { nombre, mapa } of TEMAS) {
    for (const [texto, fondo] of PARES_DE_TEXTO) {
      it(`${nombre}: ${texto} sobre ${fondo}`, () => {
        const cr = contraste(color(mapa, texto), color(mapa, fondo));
        expect(
          Number(cr.toFixed(3)),
          `${nombre}: ${texto} (${mapa.get(texto) ?? CLARO.get(texto)}) sobre ` +
            `${fondo} (${mapa.get(fondo) ?? CLARO.get(fondo)}) da ${cr.toFixed(3)}:1, ` +
            `por debajo de ${CONTRATO.TEXTO_AA}:1`,
        ).toBeGreaterThanOrEqual(CONTRATO.TEXTO_AA);
      });
    }
  }
});

// ─── R2(c) · SIN CRUCE ───────────────────────────────────────────────────────
describe("R2(c) · toda superficie está separada del fondo en L*", () => {
  for (const { nombre, mapa } of TEMAS) {
    for (const token of SUPERFICIES) {
      it(`${nombre}: ${token} vs --background`, () => {
        const dL =
          claridad(color(mapa, token)) - claridad(color(mapa, "--background"));
        expect(
          Number(Math.abs(dL).toFixed(3)),
          `${nombre}: ${token} está a ${dL.toFixed(3)} L* del fondo; ` +
            `por debajo de ${CONTRATO.SUPERFICIE_DL_MIN} L* la superficie se funde`,
        ).toBeGreaterThanOrEqual(CONTRATO.SUPERFICIE_DL_MIN);
      });
    }
  }
});

// ─── R3 · EL MISMO SIGNO EN LOS DOS TEMAS ────────────────────────────────────
//
// ⚠️ ESTA ES LA QUE PILLA EL BUG DEL DEGRADADO, y lo pilla en la CAUSA en vez de
// en el síntoma: premium-tile.ts usa `to-muted/60`, o sea --muted como suelo de
// una superficie elevada. En claro --muted está POR DEBAJO del fondo y en oscuro
// POR ENCIMA. Un degradado que sale de --card (siempre por encima) y llega a
// --muted CRUZA el fondo en claro, y por narices: es un continuo que empieza en
// +2,570 L* y acaba en −2,757 L*.
describe("R3 · un token de superficie no cambia de lado según el tema", () => {
  for (const token of SUPERFICIES) {
    it(`${token} está del mismo lado de --background en claro y en oscuro`, () => {
      const dLClaro =
        claridad(color(CLARO, token)) - claridad(color(CLARO, "--background"));
      const dLOscuro =
        claridad(color(OSCURO, token)) - claridad(color(OSCURO, "--background"));
      expect(
        Math.sign(dLClaro) === Math.sign(dLOscuro),
        `${token} vale ${dLClaro.toFixed(3)} L* respecto al fondo en CLARO y ` +
          `${dLOscuro.toFixed(3)} en OSCURO: cambia de lado. Cualquier mezcla ` +
          `entre este token y --card cruza el fondo en uno de los dos temas.`,
      ).toBe(true);
    });
  }
});

// ─── R2(b) · EL DELIMITADOR SE VE CONTRA LOS DOS LADOS ───────────────────────
//
// En claro la card blanca solo tiene ΔE00 2,069 contra el fondo: quien separa es
// el borde. Este test es el que impide "limpiar" --border sin darse cuenta.
describe("R2(b) · --border se ve contra el fondo Y contra la card", () => {
  for (const { nombre, mapa } of TEMAS) {
    it(`${nombre}: --border contra --background y --card`, () => {
      const borde = color(mapa, "--border");
      const contraFondo = deltaE00(borde, color(mapa, "--background"));
      const contraCard = deltaE00(borde, color(mapa, "--card"));
      expect(
        Number(contraFondo.toFixed(3)),
        `${nombre}: ΔE00(--border, --background) = ${contraFondo.toFixed(3)}`,
      ).toBeGreaterThanOrEqual(CONTRATO.DELIMITADOR_DE00);
      expect(
        Number(contraCard.toFixed(3)),
        `${nombre}: ΔE00(--border, --card) = ${contraCard.toFixed(3)}`,
      ).toBeGreaterThanOrEqual(CONTRATO.DELIMITADOR_DE00);
    });
  }
});
