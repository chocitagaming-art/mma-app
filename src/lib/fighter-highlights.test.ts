import { describe, expect, it } from "vitest";

import {
  classifyFinish,
  computeAge,
  countFirstRoundFinishes,
  lastCompletedFight,
} from "@/lib/fighter-highlights";
import type { FighterHistoryItem } from "@/lib/types";

type FightOverrides = Partial<FighterHistoryItem> &
  Pick<FighterHistoryItem, "result">;

let nextFightId = 1;

// Factoría mínima de FighterHistoryItem (espeja fighter-form.test.ts).
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

describe("computeAge", () => {
  const now = new Date("2026-07-04T12:00:00Z");

  it("computes full years for a past birthday this year", () => {
    expect(computeAge("1991-02-27", now)).toBe(35);
  });

  it("does not count the year until the birthday passes", () => {
    expect(computeAge("1991-12-31", now)).toBe(34);
  });

  it("counts the birthday itself as already turned", () => {
    expect(computeAge("2000-07-04", now)).toBe(26);
  });

  it("handles the day before the birthday", () => {
    expect(computeAge("2000-07-05", now)).toBe(25);
  });

  it("accepts full ISO datetimes by using only the date part", () => {
    expect(computeAge("1991-02-27T00:00:00.000Z", now)).toBe(35);
  });

  it("accepts Date instances (pg puede parsear DATE a Date)", () => {
    expect(computeAge(new Date("1991-02-27T00:00:00Z"), now)).toBe(35);
  });

  it("returns null for missing or unparseable values", () => {
    expect(computeAge(null, now)).toBeNull();
    expect(computeAge(undefined, now)).toBeNull();
    expect(computeAge("not-a-date", now)).toBeNull();
  });

  it("returns null for future birth dates (datos corruptos)", () => {
    expect(computeAge("2030-01-01", now)).toBeNull();
  });
});

describe("classifyFinish", () => {
  it("classifies KO/TKO variants", () => {
    expect(classifyFinish("KO/TKO")).toBe("ko");
    expect(classifyFinish("TKO (punches)")).toBe("ko");
    expect(classifyFinish("Knockout")).toBe("ko");
  });

  it("classifies submission variants", () => {
    expect(classifyFinish("Submission (Rear-Naked Choke)")).toBe("submission");
    expect(classifyFinish("Guillotine Choke")).toBe("submission");
    expect(classifyFinish("Armbar")).toBe("submission");
  });

  it("does not treat decisions as finishes", () => {
    expect(classifyFinish("Decision - Unanimous")).toBeNull();
    expect(classifyFinish("Split Decision")).toBeNull();
  });

  it("does not match substrings like 'decked' or 'crowbar'", () => {
    // \b(?:ko|tko)\b exige palabra completa; 'lock' también va anclado.
    expect(classifyFinish("Decked by strikes")).toBeNull();
    expect(classifyFinish("Crowbar incident")).toBeNull();
  });

  it("returns null for DQ, unknown or missing methods", () => {
    expect(classifyFinish("DQ (illegal knee)")).toBeNull();
    expect(classifyFinish(null)).toBeNull();
    expect(classifyFinish(undefined)).toBeNull();
  });
});

describe("countFirstRoundFinishes", () => {
  it("counts round-1 wins by KO or submission only", () => {
    const history = [
      fight({ result: "win", endRound: 1, method: "KO/TKO" }),
      fight({
        result: "win",
        endRound: 1,
        method: "Submission (Rear-Naked Choke)",
      }),
      // Victoria en el asalto 1 pero por decisión (p. ej. anomalía de datos): no cuenta.
      fight({ result: "win", endRound: 1, method: "Decision - Unanimous" }),
      // Finalización pero en el 2º asalto: no cuenta.
      fight({ result: "win", endRound: 2, method: "KO/TKO" }),
      // Finalización del rival (derrota) en el 1er asalto: no cuenta.
      fight({ result: "loss", endRound: 1, method: "KO/TKO" }),
      // Sin round registrado: no cuenta.
      fight({ result: "win", endRound: null, method: "KO/TKO" }),
    ];

    expect(countFirstRoundFinishes(history)).toBe(2);
  });

  it("returns 0 for an empty history", () => {
    expect(countFirstRoundFinishes([])).toBe(0);
  });
});

describe("lastCompletedFight", () => {
  it("skips leading upcoming placeholders (draw + null method)", () => {
    const upcoming = fight({ result: "draw", method: null });
    const last = fight({ result: "win", method: "KO/TKO" });
    const older = fight({ result: "loss" });

    expect(lastCompletedFight([upcoming, last, older])).toBe(last);
  });

  it("returns the first row when it is already contested", () => {
    const last = fight({ result: "loss" });

    expect(lastCompletedFight([last, fight({ result: "win" })])).toBe(last);
  });

  it("keeps real draws (method present) as completed fights", () => {
    const drawFight = fight({ result: "draw", method: "Draw" });

    expect(lastCompletedFight([drawFight])).toBe(drawFight);
  });

  it("returns null when everything is upcoming or empty", () => {
    expect(lastCompletedFight([])).toBeNull();
    expect(
      lastCompletedFight([fight({ result: "draw", method: null })]),
    ).toBeNull();
  });
});
