import { describe, expect, it } from "vitest";

import {
  classifyDirectMatchup,
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

  it("classifies winner NULL + method registered as a real draw", () => {
    expect(
      classifyDirectMatchup(
        fight({ winnerId: null, method: "Decision - Split Draw" }),
        RED_ID,
        BLUE_ID,
      ),
    ).toBe("draw");
  });

  it("classifies winner NULL + method NULL as a scheduled bout, not a draw", () => {
    expect(
      classifyDirectMatchup(fight({ winnerId: null, method: null }), RED_ID, BLUE_ID),
    ).toBe("scheduled");
  });
});

describe("splitDirectMatchups", () => {
  it("separates scheduled bouts from completed fights preserving order", () => {
    const upcoming = fight({ fightId: 12840, winnerId: null, method: null });
    const won = fight({ fightId: 10001, winnerId: RED_ID, method: "Decision - Unanimous" });
    const drew = fight({ fightId: 10002, winnerId: null, method: "Draw" });

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
        fight({ fightId: 11000, winnerId: RED_ID, method: "Decision - Unanimous" }),
      ],
      RED_ID,
      BLUE_ID,
    );

    expect(summary).toEqual({ redWins: 1, blueWins: 0, draws: 0 });
  });

  it("still counts real draws (winner NULL with method)", () => {
    const summary = summarizeDirectMatchups(
      [
        fight({ winnerId: null, method: "Decision - Majority Draw" }),
        fight({ winnerId: BLUE_ID, method: "Submission" }),
      ],
      RED_ID,
      BLUE_ID,
    );

    expect(summary).toEqual({ redWins: 0, blueWins: 1, draws: 1 });
  });
});
