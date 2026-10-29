import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { EventBoutRow } from "@/components/event-bout-row";
import { LastEventSection } from "@/components/home/last-event-section";
import type { EventBout, EventBoutFighter, LastEventResults } from "@/lib/types";

// LAS CARAS DE LA FILA DE CARTELERA, pintadas en servidor (sin DOM: la
// geometría de verdad, a cada ancho, la mide e2e/portada-cartelera.spec.ts).
//
// El dueño, el 29-oct-2026, sobre el «Último evento» de la portada: «ponemos
// las fotos de las cabezas más grandes y nítidas». SOLO la portada: la misma
// fila pinta /eventos/[id], /en-vivo y /ufc-hoy, y el sábado 31 hay velada en
// /en-vivo. Lo que se juzga aquí:
//   · La portada pide la fila grande: 72 px en el móvil y 96 desde sm, con el
//     original de ufc.com en el srcset y un `sizes` EXACTO (el ancho al que se
//     pinta la foto, no el de la caja).
//   · El ganador conserva su anillo verde.
//   · Sin pedirlo, la fila es la de siempre: 36/48 px y sin original.

// El estelar del UFC 333 (consulta de solo lectura del 29-oct-2026): cara de
// ufc.com del estilo event_results en la roja, de ESPN en la azul.
const VOLKANOVSKI =
  "https://www.ufc.com/images/styles/event_results_athlete_headshot/s3/2026-01/VOLKANOVSKI_ALEXANDER_BELT_01-31.png?itok=GscR5oi8";
const EVLOEV = "https://a.espncdn.com/i/headshots/mma/players/full/4029275.png";

function luchador(datos: Partial<EventBoutFighter>): EventBoutFighter {
  return {
    id: 1,
    name: "Alexander Volkanovski",
    nickname: "The Great",
    headshotUrl: VOLKANOVSKI,
    nationality: "Australia",
    wins: 27,
    losses: 4,
    draws: 0,
    rank: 0,
    heightCm: 168,
    reachCm: 182,
    stance: "Orthodox",
    birthDate: "1988-09-29",
    ...datos,
  };
}

const ESTELAR: EventBout = {
  fightId: 9001,
  weightClass: "Featherweight",
  method: "KO/TKO - Punches",
  endRound: 2,
  endTime: "4:54",
  scheduledRounds: 5,
  winnerId: 1,
  boutOrder: 1,
  cardSegment: "main",
  status: null,
  isTitleFight: true,
  oddsRed: 1.913,
  oddsBlue: 1.915,
  red: luchador({}),
  blue: luchador({
    id: 2,
    name: "Movsar Evloev",
    nickname: null,
    headshotUrl: EVLOEV,
    nationality: "Russia",
    wins: 19,
    losses: 1,
    rank: 1,
  }),
};

// Lo que la portada pide: el ancho al que se PINTA la cara de ufc.com (1,6:1
// cubriendo una caja cuadrada con 1 px de borde): (72 − 2) × 1,6 = 112 y
// (96 − 2) × 1,6 = 150,4.
const SIZES_PORTADA = "(min-width: 640px) 150px, 112px";

type Cara = { caja: string; img: string };

/** La caja (el <div> de FighterHeadshot) y el <img> de la cara de `nombre`. */
function cara(html: string, nombre: string): Cara {
  for (const [, caja, img] of html.matchAll(/<div class="([^"]*)"><img ([^>]*)>/g)) {
    if (img.includes(`alt="Foto de ${nombre}"`)) return { caja, img };
  }
  throw new Error(`no encuentro la cara de ${nombre}`);
}

function atributo(img: string, nombre: string): string | null {
  return new RegExp(`\\s?${nombre}="([^"]*)"`, "i").exec(` ${img}`)?.[1] ?? null;
}

function fila(props: Partial<Parameters<typeof EventBoutRow>[0]> = {}): string {
  return renderToStaticMarkup(createElement(EventBoutRow, { bout: ESTELAR, ...props }));
}

describe("la fila de cartelera en la portada (headshotSize «large»)", () => {
  it("🔴 la cara de ufc.com: 72 px en el móvil y 96 desde sm, con el original y su sizes exacto", () => {
    const { caja, img } = cara(fila({ headshotSize: "large" }), "Alexander Volkanovski");
    expect(caja).toMatch(/(^| )size-18( |$)/);
    expect(caja).toMatch(/(^| )sm:size-24( |$)/);
    expect(caja).not.toMatch(/size-9|size-12/);
    expect(img).toContain('data-headshot-quality="hd"');
    expect(atributo(img, "srcset")).toBe(
      `${VOLKANOVSKI} 256w, https://www.ufc.com/images/2026-01/VOLKANOVSKI_ALEXANDER_BELT_01-31.png 500w`,
    );
    expect(atributo(img, "sizes")).toBe(SIZES_PORTADA);
  });

  it("🔴 la cara de ESPN (sin original que ofrecer): la misma caja grande", () => {
    const { caja, img } = cara(fila({ headshotSize: "large" }), "Movsar Evloev");
    expect(caja).toMatch(/(^| )size-18( |$)/);
    expect(caja).toMatch(/(^| )sm:size-24( |$)/);
    // Un PNG de 600×436: ya es nítido a 3x en una caja de 96. No hay srcset HD.
    expect(img).not.toContain('data-headshot-quality="hd"');
    expect(img).not.toContain("500w");
  });

  it("el ganador conserva su anillo verde, y solo él", () => {
    const html = fila({ headshotSize: "large" });
    expect(cara(html, "Alexander Volkanovski").caja).toMatch(/(^| )ring-win( |$)/);
    expect(cara(html, "Movsar Evloev").caja).not.toContain("ring-");
    // Con la azul ganadora, el anillo cambia de esquina.
    const azul = fila({ headshotSize: "large", bout: { ...ESTELAR, winnerId: 2 } });
    expect(cara(azul, "Movsar Evloev").caja).toMatch(/(^| )ring-win( |$)/);
    expect(cara(azul, "Alexander Volkanovski").caja).not.toContain("ring-");
  });

  it("🔴 el «Último evento» de la portada pide la fila grande", () => {
    const evento: LastEventResults = {
      id: 1093,
      name: "UFC 333: Volkanovski vs. Evloev",
      eventDate: "2026-10-24",
      location: "Las Vegas, Nevada, USA",
      bouts: [ESTELAR],
    };
    const html = renderToStaticMarkup(createElement(LastEventSection, { event: evento }));
    const { caja, img } = cara(html, "Alexander Volkanovski");
    expect(caja).toMatch(/(^| )sm:size-24( |$)/);
    expect(atributo(img, "sizes")).toBe(SIZES_PORTADA);
    expect(atributo(img, "srcset")).toMatch(/ 500w$/);
  });
});

describe("la fila de cartelera sin pedir nada (/eventos/[id], /en-vivo, /ufc-hoy)", () => {
  // Guarda, no rojo: esto ya era así antes del cambio y tiene que seguir
  // siéndolo. El byte a byte del marcado se comprobó aparte el 29-oct.
  const DEFAULT_CAJA =
    "relative overflow-hidden rounded-md border border-border bg-muted size-9 shrink-0 sm:size-12";

  it("las caras siguen a 36/48 px y sin el original de ufc.com", () => {
    const html = fila();
    expect(cara(html, "Alexander Volkanovski").caja).toBe(`${DEFAULT_CAJA} ring-2 ring-win`);
    expect(cara(html, "Movsar Evloev").caja).toBe(DEFAULT_CAJA);
    expect(html).not.toContain('data-headshot-quality="hd"');
    expect(html).not.toContain("500w");
  });

  it("también con el panel de estadísticas de /en-vivo abierto", () => {
    const html = fila({
      statsPanel: createElement("div", null, "stats"),
      panelDefaultOpen: true,
      showRanks: true,
    });
    expect(cara(html, "Alexander Volkanovski").caja).toBe(`${DEFAULT_CAJA} ring-2 ring-win`);
    expect(html).not.toContain('data-headshot-quality="hd"');
  });
});
