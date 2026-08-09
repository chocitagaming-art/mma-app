import { describe, expect, it } from "vitest";

import {
  classifyDirectMatchup,
  describeMatchupTies,
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
