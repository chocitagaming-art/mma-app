import { describe, expect, it } from "vitest";

import {
  classifyDirectMatchup,
  describeMatchupTies,
  isHypotheticalMatchup,
  splitDirectMatchups,
  summarizeDirectMatchups,
} from "@/lib/matchup-history";
import type { DirectMatchupFight } from "@/lib/types";

const RED_ID = 6608;
const BLUE_ID = 6340;

function fight(overrides: Partial<DirectMatchupFight> = {}): DirectMatchupFight {
  return {
    fightId: 1,
    eventName: "UFC 300",
    eventDate: "2024-04-13",
    winnerId: null,
    method: null,
    endRound: null,
    endTime: null,
    weightClass: "bantamweight",
    ...overrides,
  };
}

describe("classifyDirectMatchup", () => {
  it("classifies a red-corner win", () => {
    expect(
      classifyDirectMatchup(fight({ winnerId: RED_ID, method: "Decision - Unanimous" }), RED_ID, BLUE_ID),
    ).toBe("redWin");
  });

  it("classifies a blue-corner win", () => {
    expect(
      classifyDirectMatchup(fight({ winnerId: BLUE_ID, method: "KO/TKO" }), RED_ID, BLUE_ID),
    ).toBe("blueWin");
  });

  // Los métodos de empate reales de `fights` son M-DEC/S-DEC/U-DEC (62 filas el
  // 9-ago-2026). "Decision - Split Draw" y "Draw", que usaban estos fixtures,
  // NO existen en la tabla: 0 filas con method ilike '%draw%'.
  it.each(["M-DEC", "S-DEC", "U-DEC"])(
    "classifies winner NULL + judges' decision %s as a real draw",
    (method) => {
      expect(
        classifyDirectMatchup(fight({ winnerId: null, method }), RED_ID, BLUE_ID),
      ).toBe("draw");
    },
  );

  it("classifies winner NULL + method NULL as a scheduled bout, not a draw", () => {
    expect(
      classifyDirectMatchup(fight({ winnerId: null, method: null }), RED_ID, BLUE_ID),
    ).toBe("scheduled");
  });

  // El bug: Aspinall (6335) vs Gane (6336), fight 3254, method 'CNC'. El cara a
  // cara decía "1 empate" de un combate que se paró por un rodillazo ilegal.
  it("classifies a CNC no contest as nc, not as a draw", () => {
    expect(
      classifyDirectMatchup(fight({ winnerId: null, method: "CNC" }), RED_ID, BLUE_ID),
    ).toBe("nc");
  });

  // Esta función es la GEMELA en TypeScript del CASE de fight-result.ts, y las
  // dos tienen que contestar lo mismo a la misma fila. La noche de la velada
  // hay ganador antes que método (`espn_live_results` escribe winner_id en
  // cuanto ESPN lo marca), y ahí el SQL llegó a decir 'scheduled' mientras esta
  // decía "ganó": la ficha ponía "Sin resultado" y el cara a cara "Ganó X"
  // sobre el mismo combate. Este test fija el lado bueno.
  it("classifies a winner without a method yet as a win, not as scheduled", () => {
    expect(
      classifyDirectMatchup(fight({ winnerId: RED_ID, method: null }), RED_ID, BLUE_ID),
    ).toBe("redWin");
  });

  it("classifies an Overturned result with detail as nc", () => {
    expect(
      classifyDirectMatchup(
        fight({ winnerId: null, method: "Overturned - Punch" }),
        RED_ID,
        BLUE_ID,
      ),
    ).toBe("nc");
  });
});

describe("splitDirectMatchups", () => {
  it("separates scheduled bouts from completed fights preserving order", () => {
    const upcoming = fight({ fightId: 12840, winnerId: null, method: null });
    const won = fight({ fightId: 10001, winnerId: RED_ID, method: "Decision - Unanimous" });
    const drew = fight({ fightId: 10002, winnerId: null, method: "M-DEC" });

    const split = splitDirectMatchups([upcoming, won, drew]);

    expect(split.scheduled.map((item) => item.fightId)).toEqual([12840]);
    expect(split.completed.map((item) => item.fightId)).toEqual([10001, 10002]);
  });

  it("handles an empty history", () => {
    expect(splitDirectMatchups([])).toEqual({ completed: [], scheduled: [] });
  });
});

describe("summarizeDirectMatchups", () => {
  // Caso real del bug: Sandhagen (6608) 1-0 sobre Bautista (6340) + un bout
  // futuro (UFC 329) que ANTES se contaba como "1 empate" fantasma.
  it("does not count scheduled bouts as draws", () => {
    const summary = summarizeDirectMatchups(
      [
        fight({ fightId: 12840, winnerId: null, method: null }),
        fight({ fightId: 11000, winnerId: RED_ID, method: "U-DEC" }),
      ],
      RED_ID,
      BLUE_ID,
    );

    expect(summary).toEqual({ redWins: 1, blueWins: 0, draws: 0, noContests: 0 });
  });

  it("still counts real draws (winner NULL with a judges' decision)", () => {
    const summary = summarizeDirectMatchups(
      [
        fight({ winnerId: null, method: "M-DEC" }),
        fight({ winnerId: BLUE_ID, method: "SUB - Rear Naked Choke" }),
      ],
      RED_ID,
      BLUE_ID,
    );

    expect(summary).toEqual({ redWins: 0, blueWins: 1, draws: 1, noContests: 0 });
  });

  // Caso real: Aspinall-Gane. Un no contest no es un empate, y contarlo como
  // tal es lo que hacía decir "1 empate" a una pareja que nunca empató.
  it("counts a no contest apart from the draws", () => {
    const summary = summarizeDirectMatchups(
      [
        fight({ fightId: 3254, winnerId: null, method: "CNC" }),
        fight({ winnerId: RED_ID, method: "KO/TKO - Punch" }),
      ],
      RED_ID,
      BLUE_ID,
    );

    expect(summary).toEqual({ redWins: 1, blueWins: 0, draws: 0, noContests: 1 });
  });
});

// El rótulo del centro de la tarjeta "Cara a cara". Antes decía siempre
// "N empates", así que Aspinall-Gane (un no contest) leía "1 empate".
describe("describeMatchupTies", () => {
  it("says zero draws when the pair only traded wins", () => {
    expect(
      describeMatchupTies({ redWins: 2, blueWins: 1, draws: 0, noContests: 0 }),
    ).toBe("0 empates");
  });

  it("pluralises a single draw correctly", () => {
    expect(
      describeMatchupTies({ redWins: 0, blueWins: 0, draws: 1, noContests: 0 }),
    ).toBe("1 empate");
  });

  it("pluralises several draws", () => {
    expect(
      describeMatchupTies({ redWins: 0, blueWins: 0, draws: 2, noContests: 0 }),
    ).toBe("2 empates");
  });

  // El caso Aspinall-Gane: cero empates y un combate anulado. Decir "0 empates"
  // a secas escondería el combate que sí existió.
  it("names the no contest instead of hiding it behind a zero", () => {
    expect(
      describeMatchupTies({ redWins: 0, blueWins: 0, draws: 0, noContests: 1 }),
    ).toBe("1 sin resultado");
  });

  it("does not pluralise 'sin resultado'", () => {
    expect(
      describeMatchupTies({ redWins: 0, blueWins: 0, draws: 0, noContests: 2 }),
    ).toBe("2 sin resultado");
  });

  it("lists both when the pair has a draw and a no contest", () => {
    expect(
      describeMatchupTies({ redWins: 1, blueWins: 0, draws: 1, noContests: 1 }),
    ).toBe("1 empate · 1 sin resultado");
  });
});

// El aviso «Enfrentamiento hipotético» de /enfrentamiento. Desde el 28-sep-2026
// la categoría de cada esquina sale de la regla única (ranking > último
// disputado > programado, current-weight-class.ts), y esa regla le da al que
// sube o baja de peso la categoría de ANTES de su próximo combate. Sin mirar el
// combate real, el aviso saltaba en 6 de las 52 peleas programadas (0 con la
// regla vieja), dos de ellas del UFC 332 del 3-oct: la página decía a la vez
// «Combate programado» y «esta pelea no se daría en la realidad».
describe("isHypotheticalMatchup", () => {
  it("different divisions with no bout between them → hypothetical", () => {
    expect(isHypotheticalMatchup("Welterweight", "Bantamweight", [])).toBe(true);
  });

  // Johnny Walker (6836) es #13 del semipesado y pelea en el PESADO contra Mick
  // Parkin (7054), fight 15816, UFC 332. Hay combate firmado: no es hipotético.
  it("different divisions but a SCHEDULED bout between them → not hypothetical (Walker–Parkin)", () => {
    const booked = fight({ fightId: 15816, winnerId: null, method: null, weightClass: "Heavyweight" });
    expect(isHypotheticalMatchup("Light Heavyweight", "Heavyweight", [booked])).toBe(false);
  });

  // Rafael Dos Anjos (7141): su último combate DISPUTADO fue en el wélter y el
  // del sábado contra Alexander Hernandez (6691), fight 17153, es en el ligero.
  it("the one moving back down to a booked bout does not trigger it either (Dos Anjos–Hernandez)", () => {
    const booked = fight({ fightId: 17153, winnerId: null, method: null, weightClass: "Lightweight" });
    const old = fight({ fightId: 900, winnerId: 7141, method: "KO/TKO", weightClass: "Lightweight" });
    expect(isHypotheticalMatchup("Welterweight", "Lightweight", [old, booked])).toBe(false);
  });

  // Solo lo quita un combate FIRMADO. Uno ya disputado no: el aviso habla de
  // hoy («no se daría»), y la revancha de dos que ya no comparten división
  // sigue siendo inventada aunque se cruzaran hace años.
  it("an old COMPLETED bout does not cancel it: a rematch across today's divisions is still invented", () => {
    const past = fight({ winnerId: RED_ID, method: "Decision - Unanimous", weightClass: "Light Heavyweight" });
    expect(isHypotheticalMatchup("Heavyweight", "Middleweight", [past])).toBe(true);
  });

  // Una victoria con el método aún en NULL (espn_live_results, la noche de la
  // velada) ya es un combate disputado, no uno programado.
  it("a win still missing its method is completed, not booked", () => {
    const justWon = fight({ winnerId: RED_ID, method: null });
    expect(isHypotheticalMatchup("Heavyweight", "Middleweight", [justWon])).toBe(true);
  });

  // Shevchenko (6260) contra Natalia Silva (7003): las dos, peso mosca.
  it("same division → never hypothetical (Shevchenko–Silva)", () => {
    expect(isHypotheticalMatchup("Women's Flyweight", "Women's Flyweight", [])).toBe(false);
  });

  it("compares NORMALISED labels: a title bout is the same division", () => {
    expect(isHypotheticalMatchup("Lightweight Title Bout", "Lightweight", [])).toBe(false);
  });

  it("with an unknown division it cannot claim anything", () => {
    expect(isHypotheticalMatchup(null, "Lightweight", [])).toBe(false);
    expect(isHypotheticalMatchup("Lightweight", null, [])).toBe(false);
  });
});
