import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { RankingDivisionCard } from "@/components/ranking-division-card";
import type { RankingEntry } from "@/lib/types";

// LA ETIQUETA DEL CAMPEÓN EN /clasificacion, pintada en servidor (sin DOM: que
// «CAMPEONA» quepa a 360 px, en Chromium y en WebKit, lo mide
// e2e/clasificacion.spec.ts; que cada división real lleve la suya, contra la
// base, e2e/campeones-oro.spec.ts).
//
// El dueño, 30-oct-2026: «Campeona» a las campeonas también en la
// Clasificación, con la MISMA regla que ya usan las tarjetas de /fighters y del
// libra por libra (inferFighterGender de src/lib/fighter-silhouette.ts, que
// lee «women» en la división). Aquí la división es el slug del ranking
// («womens_bantamweight»), el mismo que la tarjeta ya le pasa a la silueta.

function campeon(datos: Partial<RankingEntry>): RankingEntry {
  return {
    rankPosition: 0,
    isChampion: true,
    rankChange: null,
    fighterId: 1,
    fighterName: "Kayla Harrison",
    headshotUrl: null,
    nationality: "United States",
    nickname: null,
    wins: 19,
    losses: 1,
    draws: 0,
    ...datos,
  };
}

/** Los textos «Campeón» / «Campeona» que pinta la tarjeta, en su orden. */
function etiquetas(division: string, nombre: string): string[] {
  const html = renderToStaticMarkup(
    createElement(RankingDivisionCard, {
      division: { division, label: "x", champion: campeon({ fighterName: nombre }), ranked: [] },
    }),
  );
  return html
    .split(/<[^>]+>/)
    .map((texto) => texto.trim())
    .filter((texto) => /^Campe(ón|ona)$/.test(texto));
}

describe("RankingDivisionCard: la etiqueta del campeón", () => {
  // Producción (a5d3ad2) decía «Campeón» sobre Kayla Harrison, Natalia Silva y
  // Mackenzie Dern: la línea era un texto fijo.
  it("dice «Campeona» en una división femenina", () => {
    expect(etiquetas("womens_bantamweight", "Kayla Harrison")).toEqual(["Campeona"]);
    expect(etiquetas("womens_strawweight", "Mackenzie Dern")).toEqual(["Campeona"]);
  });

  it("sigue diciendo «Campeón» en una masculina (control)", () => {
    expect(etiquetas("flyweight", "Joshua Van")).toEqual(["Campeón"]);
  });

  it("sin campeón (título vacante) no hay etiqueta", () => {
    const html = renderToStaticMarkup(
      createElement(RankingDivisionCard, {
        division: { division: "womens_featherweight", label: "x", champion: null, ranked: [] },
      }),
    );
    expect(html).not.toMatch(/Campe(ón|ona)/);
  });
});
