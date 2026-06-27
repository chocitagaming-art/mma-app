import { describe, expect, it } from "vitest";

import { computeRecentForm } from "@/lib/fighter-form";
import type { FighterHistoryItem } from "@/lib/types";

type FightOverrides = Partial<FighterHistoryItem> &
  Pick<FighterHistoryItem, "result">;

let nextFightId = 1;

// Minimal FighterHistoryItem factory. `method` defaults to a real value so a
// "draw" only counts as an unfought future bout when method is explicitly null.
function fight(overrides: FightOverrides): FighterHistoryItem {
  return {
    fightId: nextFightId++,
    eventId: null,
    eventName: null,
    eventDate: null,
    opponentId: null,
    opponentName: null,
    corner: "red",
    method: "Decision - Unanimous",
    endRound: null,
    endTime: null,
    weightClass: null,
    videoUrl: null,
    ...overrides,
  };
}

describe("computeRecentForm", () => {
  it("counts a current win streak from the most recent contested bouts", () => {
    const history = [
      fight({ result: "win" }),
      fight({ result: "win" }),
      fight({ result: "win" }),
      fight({ result: "loss" }),
    ];

    const form = computeRecentForm(history);

    expect(form.streakType).toBe("win");
    expect(form.streakCount).toBe(3);
  });

  it("stops the win streak at the first loss", () => {
    const history = [
      fight({ result: "win" }),
      fight({ result: "win" }),
      fight({ result: "loss" }),
      fight({ result: "win" }),
    ];

    const form = computeRecentForm(history);

    expect(form.streakType).toBe("win");
    expect(form.streakCount).toBe(2);
  });

  it("counts a current loss streak", () => {
    const history = [
      fight({ result: "loss" }),
      fight({ result: "loss" }),
      fight({ result: "win" }),
    ];

    const form = computeRecentForm(history);

    expect(form.streakType).toBe("loss");
    expect(form.streakCount).toBe(2);
  });

  it("breaks the streak on a draw / no-contest", () => {
    const history = [
      fight({ result: "draw", method: "Draw" }),
      fight({ result: "win" }),
      fight({ result: "win" }),
    ];

    const form = computeRecentForm(history);

    expect(form.streakType).toBe("none");
    expect(form.streakCount).toBe(0);
  });

  it("ignores the leading unfought future bout (draw + null method)", () => {
    const history = [
      fight({ result: "draw", method: null }),
      fight({ result: "win" }),
      fight({ result: "win" }),
    ];

    const form = computeRecentForm(history);

    expect(form.streakType).toBe("win");
    expect(form.streakCount).toBe(2);
    expect(form.lastFive.total).toBe(2);
    expect(form.lastFive.draws).toBe(0);
  });

  it("counts only the five most recent contested bouts in the last-five tally", () => {
    const history = [
      fight({ result: "draw", method: null }),
      fight({ result: "win" }),
      fight({ result: "loss" }),
      fight({ result: "win" }),
      fight({ result: "win" }),
      fight({ result: "nc" }),
      fight({ result: "win" }),
    ];

    const form = computeRecentForm(history);

    expect(form.lastFive.total).toBe(5);
    expect(form.lastFive.wins).toBe(3);
    expect(form.lastFive.losses).toBe(1);
    expect(form.lastFive.nc).toBe(1);
    expect(form.lastFive.draws).toBe(0);
  });

  it("breaks the streak on a leading no-contest", () => {
    const history = [
      fight({ result: "nc", method: "No Contest" }),
      fight({ result: "win" }),
      fight({ result: "win" }),
    ];

    const form = computeRecentForm(history);

    expect(form.streakType).toBe("none");
    expect(form.streakCount).toBe(0);
  });

  it("stops the streak at a real draw mid-sequence", () => {
    const history = [
      fight({ result: "win" }),
      fight({ result: "win" }),
      fight({ result: "draw", method: "Decision - Split Draw" }),
      fight({ result: "win" }),
    ];

    const form = computeRecentForm(history);

    expect(form.streakType).toBe("win");
    expect(form.streakCount).toBe(2);
  });

  it("handles an empty history", () => {
    const form = computeRecentForm([]);

    expect(form.streakType).toBe("none");
    expect(form.streakCount).toBe(0);
    expect(form.lastFive).toEqual({
      wins: 0,
      losses: 0,
      draws: 0,
      nc: 0,
      total: 0,
    });
  });
});
