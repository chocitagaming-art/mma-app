import { createElement, isValidElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { EventBoutRow } from "@/components/event-bout-row";
import { FighterHeadshot } from "@/components/fighter-headshot";
import { LastEventSection } from "@/components/home/last-event-section";
import type { EventBout, EventBoutFighter, LastEventResults } from "@/lib/types";

// LAS CARAS DE LA FILA DE CARTELERA, pintadas en servidor (sin DOM: la
// geometría de verdad, a cada ancho, la miden e2e/portada-cartelera.spec.ts y
// e2e/evento-caras.spec.ts).
//
// El dueño, el 29-oct-2026, sobre el «Último evento» de la portada: «ponemos
// las fotos de las cabezas más grandes y nítidas»; y el 30-oct, la misma fila
// grande en la cartelera de /eventos/[id], en /ufc-hoy y en /en-vivo. Las
// «Peleas canceladas» de la ficha se quedan con la de siempre (quién pide qué
// lo fija src/lib/bout-row-callsites.test.ts). Lo que se juzga aquí:
//   · La fila grande: 72 px en el móvil y 96 desde sm, con el original de
//     ufc.com en el srcset y un `sizes` EXACTO (el ancho al que se pinta la
//     foto, no el de la caja).
//   · El ganador conserva su anillo verde.
//   · Con rankings (eventos futuros), el #12 va pegado al nombre: el nombre de
//     la fila grande no lleva flex-1.
//   · La fila grande con lo que añade el marcador del directo de /en-vivo: el
//     panel de estadísticas abierto (el combate en curso), con resultado
//     (terminado) y con rankings (por empezar).
//   · Sin pedirlo, la fila es la de siempre, byte a byte: el HTML de a5d3ad2
//     (__snapshots__/) y las mismas props de la cara (el payload RSC no crece).

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

/** La línea del nombre de `nombre`: la clase de su <span> y el ranking que le
 *  sigue en el marcado (null si no lleva). */
function lineaDelNombre(html: string, nombre: string): { clase: string; rango: string | null } {
  const encontrado = new RegExp(
    `<span class="([^"]*)">${nombre}</span>(?:<span class="[^"]*">([^<]*)</span>)?`,
  ).exec(html);
  if (!encontrado) throw new Error(`no encuentro la línea del nombre de ${nombre}`);
  return { clase: encontrado[1], rango: encontrado[2] ?? null };
}

// El mismo combate antes de pelearse: sin ganador, sin método y sin bonos.
const SIN_PELEAR: EventBout = {
  ...ESTELAR,
  winnerId: null,
  method: null,
  endRound: null,
  endTime: null,
};

describe("la fila de cartelera grande (headshotSize «large»)", () => {
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

  // 🪤 Apilada (por debajo de lg) la línea del nombre ocupa la esquina entera,
  // y con flex-1 el nombre se estiraba hasta el otro lado: el «#12» acababa
  // debajo del VS, a 27-135 px de su nombre (medido en /eventos/1099 a 390 y a
  // 768 el 29-oct). La portada no lo tenía porque no enseña rankings.
  it("🔴 con rankings, el ranking va pegado al nombre: el nombre de la fila grande no lleva flex-1", () => {
    const html = fila({ headshotSize: "large", showRanks: true, bout: SIN_PELEAR });
    const roja = lineaDelNombre(html, "Alexander Volkanovski");
    const azul = lineaDelNombre(html, "Movsar Evloev");
    expect(roja.clase.split(" ")).not.toContain("flex-1");
    expect(azul.clase.split(" ")).not.toContain("flex-1");
    expect(roja.clase.split(" ")).toEqual(expect.arrayContaining(["min-w-0", "truncate"]));
    expect(azul.clase.split(" ")).toEqual(expect.arrayContaining(["min-w-0", "truncate"]));
    // El ranking sigue justo detrás del nombre (0 = campeón, «C»).
    expect(roja.rango).toBe("C");
    expect(azul.rango).toBe("#1");
  });
});

// Lo que /en-vivo le pone a la fila, con la fila GRANDE: el panel de
// estadísticas del combate en curso, que llega ABIERTO (panelDefaultOpen), y el
// resultado de los que ya acabaron. /en-vivo pinta la grande desde el 30-oct
// por la noche (el dueño). Aquí, cada estado del marcado, sin red ni base.
describe("la fila grande con lo del marcador del directo: en curso, terminado y por empezar", () => {
  const STATS = createElement("div", { "data-stats-en-vivo": "" }, "Golpes significativos");

  function cajasGrandes(html: string): void {
    for (const nombre of ["Alexander Volkanovski", "Movsar Evloev"]) {
      const { caja } = cara(html, nombre);
      expect(caja, nombre).toMatch(/(^| )size-18( |$)/);
      expect(caja, nombre).toMatch(/(^| )sm:size-24( |$)/);
    }
  }

  it("en curso: el panel de estadísticas llega abierto, encima de la comparativa", () => {
    const html = fila({
      headshotSize: "large",
      showRanks: true,
      bout: SIN_PELEAR,
      statsPanel: STATS,
      panelDefaultOpen: true,
    });
    cajasGrandes(html);
    expect(html).toContain('aria-label="Ver estadísticas y comparativa"');
    expect(html).toContain('aria-expanded="true"');
    expect(html).toContain("grid-rows-[1fr]");
    expect(html.indexOf("data-stats-en-vivo")).toBeGreaterThan(-1);
    expect(html.indexOf("data-stats-en-vivo")).toBeLessThan(html.indexOf("Altura"));
    // La columna del chevron va FUERA del enlace: desplegar nunca navega.
    expect(html).toMatch(/<\/a><\/div><button type="button"/);
    expect(html).not.toContain("GANA");
    expect(lineaDelNombre(html, "Alexander Volkanovski").rango).toBe("C");
  });

  it("terminado: GANA, el anillo y el resultado en el centro; el panel, cerrado", () => {
    const html = fila({
      headshotSize: "large",
      showRanks: true,
      statsPanel: STATS,
      panelDefaultOpen: false,
    });
    cajasGrandes(html);
    expect(html).toContain('aria-expanded="false"');
    expect(html).toContain("grid-rows-[0fr]");
    expect(cara(html, "Alexander Volkanovski").caja).toMatch(/(^| )ring-win( |$)/);
    expect(html).toMatch(/text-win">GANA</);
    expect(html).toContain("R2 · 4:54");
  });

  it("por empezar: sin panel de estadísticas, la comparativa plegada y los rankings pegados", () => {
    const html = fila({ headshotSize: "large", showRanks: true, bout: SIN_PELEAR });
    cajasGrandes(html);
    expect(html).toContain('aria-label="Ver comparativa física"');
    expect(html).toContain('aria-expanded="false"');
    expect(html).not.toContain("ring-win");
    expect(lineaDelNombre(html, "Movsar Evloev").rango).toBe("#1");
  });
});

describe("la fila de cartelera sin pedir nada (las «Peleas canceladas» de /eventos/[id])", () => {
  // Guarda, no rojo: esto ya era así antes del cambio y tiene que seguir
  // siéndolo.
  const DEFAULT_CAJA =
    "relative overflow-hidden rounded-md border border-border bg-muted size-9 shrink-0 sm:size-12";

  // 🪤 BYTE A BYTE: el HTML de la fila de siempre, congelado en a5d3ad2 (el
  // commit de producción del 30-oct) en __snapshots__/. Cualquier clase de
  // más, de menos o en otro orden lo pone en rojo. Se escribió corriendo este
  // mismo test contra a5d3ad2; no se regenera (`vitest -u`) para «arreglar» un
  // rojo: un rojo aquí es la fila de siempre cambiando.
  const SIN_FICHA = (f: EventBoutFighter): EventBoutFighter => ({
    ...f,
    heightCm: null,
    reachCm: null,
    stance: null,
    birthDate: null,
  });
  const CASOS: Record<string, Partial<Parameters<typeof EventBoutRow>[0]>> = {
    "con-comparativa": {},
    "con-rankings": { showRanks: true },
    "en-vivo-abierta": {
      showRanks: true,
      statsPanel: createElement("div", null, "stats"),
      panelDefaultOpen: true,
    },
    "sin-comparativa": {
      bout: { ...SIN_PELEAR, red: SIN_FICHA(ESTELAR.red), blue: SIN_FICHA(ESTELAR.blue) },
    },
  };
  for (const [caso, props] of Object.entries(CASOS)) {
    it(`el HTML no cambia ni un byte: ${caso}`, async () => {
      await expect(fila(props)).toMatchFileSnapshot(
        `./__snapshots__/event-bout-row.fila-de-siempre.${caso}.html`,
      );
    });
  }

  it("el nombre sigue con flex-1", () => {
    const html = fila({ showRanks: true });
    expect(lineaDelNombre(html, "Alexander Volkanovski").clase).toBe("min-w-0 flex-1 truncate");
    expect(lineaDelNombre(html, "Movsar Evloev").clase).toBe("min-w-0 flex-1 truncate");
  });

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

  // 🪤 El HTML igual no basta: FighterHeadshot es de cliente, así que sus props
  // viajan en el payload RSC, y React Flight escribe una prop PRESENTE con valor
  // undefined como «"quality":"$undefined"» (unos 44 bytes por cara, en cada
  // router.refresh de /en-vivo). La fila de siempre le pasa las mismas props
  // que antes, en el mismo orden (Flight las escribe en ese orden).
  it("🔴 el payload RSC tampoco cambia: la cara recibe las props de antes, ni quality ni sizes", () => {
    for (const props of [{}, { statsPanel: createElement("div", null, "stats"), panelDefaultOpen: true }]) {
      const caras = propsDeLasCaras(EventBoutRow({ bout: ESTELAR, ...props }));
      expect(caras).toHaveLength(2);
      for (const cara of caras) {
        expect(Object.keys(cara)).toEqual(["name", "headshotUrl", "division", "size", "className"]);
      }
    }
  });
});

/** Las props con que la fila llama a FighterHeadshot, buscadas en el árbol de
 *  elementos SIN pintarlo (en cualquier prop: la fila va en `row` del acordeón). */
function propsDeLasCaras(nodo: unknown): Record<string, unknown>[] {
  if (Array.isArray(nodo)) return nodo.flatMap(propsDeLasCaras);
  if (!isValidElement(nodo)) return [];
  const props = nodo.props as Record<string, unknown>;
  const propias = nodo.type === FighterHeadshot ? [props] : [];
  return [...propias, ...Object.values(props).flatMap(propsDeLasCaras)];
}
