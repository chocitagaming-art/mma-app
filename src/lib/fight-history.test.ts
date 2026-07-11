import { describe, expect, it } from "vitest";

import { mergeFightHistories } from "@/lib/fight-history";
import type { FighterHistoryItem } from "@/lib/types";

type FightOverrides = Partial<FighterHistoryItem>;

// Factoría mínima de FighterHistoryItem (espeja fighter-form.test.ts).
function fight(overrides: FightOverrides): FighterHistoryItem {
  return {
    fightId: 1,
    eventId: null,
    eventName: null,
    eventDate: null,
    opponentId: null,
    opponentName: null,
    corner: "red",
    result: "win",
    method: "U-DEC",
    endRound: 3,
    endTime: "5:00",
    weightClass: null,
    videoUrl: null,
    ...overrides,
  };
}

function espnFight(overrides: FightOverrides): FighterHistoryItem {
  return fight({
    corner: undefined,
    origin: "espn",
    promotion: "Bellator",
    ...overrides,
  });
}

describe("mergeFightHistories", () => {
  it("devuelve el historial UFC intacto cuando no hay filas espn", () => {
    const ufc = [fight({ fightId: 10, eventDate: "2024-01-01" })];
    expect(mergeFightHistories(ufc, [])).toBe(ufc);
  });

  it("intercala por fecha descendente las dos fuentes", () => {
    const ufc = [
      fight({ fightId: 1, eventDate: "2026-05-09" }),
      fight({ fightId: 2, eventDate: "2025-11-01" }),
    ];
    const espn = [
      espnFight({ fightId: 100, eventDate: "2026-01-15" }),
      espnFight({ fightId: 101, eventDate: "2023-11-17" }),
    ];
    const merged = mergeFightHistories(ufc, espn);
    expect(merged.map((item) => item.fightId)).toEqual([1, 100, 2, 101]);
  });

  it("manda las fechas nulas o rotas al final", () => {
    const ufc = [fight({ fightId: 1, eventDate: null })];
    const espn = [
      espnFight({ fightId: 100, eventDate: "2020-06-01" }),
      espnFight({ fightId: 101, eventDate: "no-es-fecha" }),
    ];
    const merged = mergeFightHistories(ufc, espn);
    expect(merged[0].fightId).toBe(100);
    expect(merged.slice(1).map((item) => item.fightId)).toEqual([1, 101]);
  });

  it("a fecha igual conserva el orden de cada fuente (sort estable)", () => {
    const ufc = [
      fight({ fightId: 1, eventDate: "2024-03-02" }),
      fight({ fightId: 2, eventDate: "2024-03-02" }),
    ];
    const espn = [espnFight({ fightId: 100, eventDate: "2024-03-02" })];
    const merged = mergeFightHistories(ufc, espn);
    expect(merged.map((item) => item.fightId)).toEqual([1, 2, 100]);
  });

  it("no muta los arrays de entrada", () => {
    const ufc = [fight({ fightId: 1, eventDate: "2020-01-01" })];
    const espn = [espnFight({ fightId: 100, eventDate: "2024-01-01" })];
    mergeFightHistories(ufc, espn);
    expect(ufc.map((item) => item.fightId)).toEqual([1]);
    expect(espn.map((item) => item.fightId)).toEqual([100]);
  });
});
