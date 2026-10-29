import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { RankingTrajectory } from "@/components/fighter/ranking-trajectory";
import type { FighterRankingHistoryEntry } from "@/lib/types";

// EL TOOLTIP DE CADA PUNTO DE LA TRAYECTORIA DE RANKING (el <title> que sale
// al pasar el ratón en la ficha), pintado en servidor.
//
// El dueño, 30-oct-2026: «Campeona» a las campeonas también en su ficha. Cada
// serie decide por SU división (isWomensDivision, la regla de las tarjetas):
// la gráfica no necesita que la página le diga si es mujer. El «Camp.» del eje
// es neutro y no cambia.

function punto(
  division: string,
  snapshotDate: string,
  rankPosition: number,
  isChampion: boolean,
): FighterRankingHistoryEntry {
  return { division, snapshotDate, rankPosition, isChampion };
}

function pintar(history: FighterRankingHistoryEntry[]): string {
  return renderToStaticMarkup(createElement(RankingTrajectory, { history }));
}

describe("RankingTrajectory: «Campeona» / «Campeón» en el tooltip", () => {
  // Producción (a5d3ad2), /fighters/5850: «Peso Gallo (F) — Campeón (jul 25)».
  it("una campeona en una división femenina dice «Campeona», nunca «Campeón»", () => {
    const html = pintar([
      punto("womens_bantamweight", "2025-07-01", 0, true),
      punto("womens_bantamweight", "2025-08-01", 0, true),
    ]);
    expect(html).toContain("Peso Gallo (F) — Campeona (jul 25)");
    expect(html).toContain("Peso Gallo (F) — Campeona (ago 25)");
    expect(html).not.toContain("Campeón");
  });

  it("un campeón en una división masculina sigue diciendo «Campeón» (control)", () => {
    const html = pintar([
      punto("flyweight", "2025-07-01", 2, false),
      punto("flyweight", "2025-08-01", 0, true),
    ]);
    expect(html).toContain("Peso Mosca — #2 (jul 25)");
    expect(html).toContain("Peso Mosca — Campeón (ago 25)");
    expect(html).not.toContain("Campeona");
  });

  it("el eje sigue diciendo «Camp.», neutro", () => {
    const html = pintar([
      punto("womens_flyweight", "2025-07-01", 3, false),
      punto("womens_flyweight", "2025-08-01", 0, true),
    ]);
    expect(html).toMatch(/>Camp\.<\/text>/);
    expect(html).toContain("Peso Mosca (F) — #3 (jul 25)");
    expect(html).toContain("Peso Mosca (F) — Campeona (ago 25)");
  });
});
