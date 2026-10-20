import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  formatUfcDebut,
  resolveUfcDebut,
  UFC_EVENTS_COVERAGE_START,
} from "@/lib/fighter-highlights";
import { formatDate } from "@/lib/format";
import type { FighterHistoryItem, FighterUpcomingBout } from "@/lib/types";

// «DEBUT EN UFC» COMES FROM OUR FIGHTS, NOT FROM UFC.COM (owner, 21-oct-2026).
//
// Until now the page printed fighters.octagon_debut as ufc.com serves it, and
// the 21-oct measurement (2,892 fighters) found it wrong or missing on 1,541:
// 1,176 with no date, 222 one or two days late (ufc.com's time zone), 78
// earlier than the UFC debut (Contender Series, Strikeforce, Road to UFC,
// bookings that fell through), 51 with the date ufc.com printed on the day its
// page broke, 9 later and 5 with a date for someone who has never fought in
// the UFC. The rule that leaves 6 wrong (R2), all of them holes in `fights`:
//
//   1. the first UFC fight actually fought in `fights`, Road to UFC excluded;
//   2. except when ufc.com says before 1995-04-07: UFC 1-4 are not in `events`,
//      so for those 16 veterans ufc.com is the only source (Royce Gracie);
//   3. never fought but booked: that bout's date, «(programado)»;
//   4. nothing: no row.
//
// Every test below is red against what the page did before (the date as is).
// The fighter ids and dates are real, read-only from the database on 21-oct.

// 🪤 THE TIME ZONE IS PINNED, AND CHECKED. History dates are a DATE column that
// node-postgres turns into a Date at LOCAL midnight; formatDate prints in UTC,
// so on the laptop (Europe/Madrid) Luque's 12-jul-2015 printed as «11 jul
// 2015». In UTC (CI, Vercel) the bug does not show, which is why the TZ is
// forced here instead of trusting the machine. Node re-reads process.env.TZ on
// assignment; the first test proves it took effect, so this can never pass
// vacuously on a UTC runner.
const MADRID = "Europe/Madrid";
let previousTz: string | undefined;

beforeAll(() => {
  previousTz = process.env.TZ;
  process.env.TZ = MADRID;
});

afterAll(() => {
  if (previousTz === undefined) {
    delete process.env.TZ;
  } else {
    process.env.TZ = previousTz;
  }
});

let nextFightId = 1;

type FightOverrides = Partial<FighterHistoryItem> &
  Pick<FighterHistoryItem, "eventDate">;

// A `fights` row as getFighterDetail maps it (history comes newest first).
function fight(overrides: FightOverrides): FighterHistoryItem {
  return {
    fightId: nextFightId++,
    eventId: null,
    eventName: null,
    opponentId: null,
    opponentName: null,
    corner: "red",
    result: "win",
    method: "U-DEC",
    endRound: 3,
    endTime: "5:00",
    weightClass: null,
    videoUrl: null,
    eventTier: "fight_night",
    fightStatus: null,
    ...overrides,
  };
}

type Booking = Pick<FighterUpcomingBout, "eventDate" | "eventTier">;

function booked(eventDate: string, eventTier: Booking["eventTier"] = "numbered"): Booking {
  return { eventDate, eventTier };
}

// What node-postgres builds from a DATE column: midnight in the process zone.
function pgDate(year: number, month: number, day: number): Date {
  return new Date(year, month - 1, day);
}

describe("resolveUfcDebut", () => {
  it("runs with the time zone pinned to Europe/Madrid", () => {
    // Summer time in Madrid is UTC+2: local midnight is 22:00 Z the day before.
    expect(pgDate(2015, 7, 12).getTimezoneOffset()).toBe(-120);
    expect(pgDate(2015, 7, 12).toISOString()).toBe("2015-07-11T22:00:00.000Z");
  });

  it("takes the FIRST fight fought, although history comes newest first (6514 Luque)", () => {
    // Luque has no octagon_debut at all: today the row is not drawn.
    const debut = resolveUfcDebut({
      history: [
        fight({ eventDate: "2024-08-03" }),
        fight({ eventDate: "2018-09-15" }),
        fight({ eventDate: "2015-07-12", eventTier: "tuf_finale", result: "loss" }),
      ],
      upcomingBouts: [],
      octagonDebut: null,
    });
    expect(debut).toEqual({ date: "2015-07-12", scheduled: false });
  });

  it("ignores ufc.com from 1995 on when it disagrees (6932 Ige's Contender Series)", () => {
    // ufc.com counts his DWCS of 2017-07-25 as the debut; UFC 220 was 2018-01-20.
    expect(
      resolveUfcDebut({
        history: [fight({ eventDate: "2019-06-08" }), fight({ eventDate: "2018-01-20" })],
        upcomingBouts: [],
        octagonDebut: "2017-07-25",
      }),
    ).toEqual({ date: "2018-01-20", scheduled: false });

    // And the day-late dates (222 of them): ufc.com 2-oct, the event 1-oct.
    expect(
      resolveUfcDebut({
        history: [fight({ eventDate: "2011-10-01" })],
        upcomingBouts: [],
        octagonDebut: "2011-10-02",
      }),
    ).toEqual({ date: "2011-10-01", scheduled: false });
  });

  it("keeps ufc.com before 1995-04-07 even with later fights (8742 Royce Gracie)", () => {
    // UFC 1-4 are not in `events`: his first fight there is UFC 5 (1995-04-07).
    expect(UFC_EVENTS_COVERAGE_START).toBe("1995-04-07");
    expect(
      resolveUfcDebut({
        history: [fight({ eventDate: "2006-05-27" }), fight({ eventDate: "1995-04-07" })],
        upcomingBouts: [],
        octagonDebut: "1993-11-12",
      }),
    ).toEqual({ date: "1993-11-12", scheduled: false });

    // 8989 Trent Jenkins fought UFC 1 only: no fight of ours, ufc.com's date stands.
    expect(
      resolveUfcDebut({ history: [], upcomingBouts: [], octagonDebut: "1993-11-12" }),
    ).toEqual({ date: "1993-11-12", scheduled: false });
  });

  it("shows NOTHING for the broken ufc.com page: today's date and no fight (364 Almeida)", () => {
    // The broken page prints the day it is generated. 51 fighters carry one;
    // Almeida has 2026-07-10 and not a single UFC fight.
    expect(
      resolveUfcDebut({ history: [], upcomingBouts: [], octagonDebut: "2026-07-10" }),
    ).toBeNull();
    expect(
      resolveUfcDebut({ history: [], upcomingBouts: [], octagonDebut: "2026-10-21" }),
    ).toBeNull();
  });

  it("replaces the broken page's date when there are fights (8994 Howard)", () => {
    expect(
      resolveUfcDebut({
        history: [fight({ eventDate: "1995-09-08" })],
        upcomingBouts: [],
        octagonDebut: "2026-07-10",
      }),
    ).toEqual({ date: "1995-09-08", scheduled: false });
  });

  it("ignores a cancelled fight", () => {
    expect(
      resolveUfcDebut({
        history: [
          fight({ eventDate: "2023-03-04" }),
          fight({ eventDate: "2022-11-12", fightStatus: "cancelled" }),
        ],
        upcomingBouts: [],
        octagonDebut: "2022-11-12",
      }),
    ).toEqual({ date: "2023-03-04", scheduled: false });
  });

  it("does not count Road to UFC as the debut (6860 Saeteurn)", () => {
    // His only fight in `fights` is Road to UFC 4.6; ufc.com calls that his debut.
    expect(
      resolveUfcDebut({
        history: [fight({ eventDate: "2025-08-22", eventTier: "road_to_ufc" })],
        upcomingBouts: [],
        octagonDebut: "2025-08-22",
      }),
    ).toBeNull();

    // With a UFC fight after it, the debut is that one.
    expect(
      resolveUfcDebut({
        history: [
          fight({ eventDate: "2026-02-07" }),
          fight({ eventDate: "2025-08-22", eventTier: "road_to_ufc" }),
        ],
        upcomingBouts: [],
        octagonDebut: "2025-08-22",
      }),
    ).toEqual({ date: "2026-02-07", scheduled: false });
  });

  it("counts a first fight that ended without a winner (NC, overturned, draw)", () => {
    expect(
      resolveUfcDebut({
        history: [
          fight({ eventDate: "2021-05-01" }),
          fight({ eventDate: "2020-02-15", result: "nc", method: "Overturned" }),
        ],
        upcomingBouts: [],
        octagonDebut: null,
      }),
    ).toEqual({ date: "2020-02-15", scheduled: false });
  });

  it("never takes a regional fight or a scheduled placeholder for the debut", () => {
    // The page passes `history` (UFC only), but if anyone ever passes the merged
    // table, an ESPN row (Contender Series included) is not a UFC fight.
    expect(
      resolveUfcDebut({
        history: [
          fight({ eventDate: "2018-01-20" }),
          fight({ eventDate: "2017-07-25", origin: "espn", eventTier: undefined }),
          // A bout with no winner and no method is scheduled, not fought.
          fight({ eventDate: "2016-01-01", result: "draw", method: null }),
        ],
        upcomingBouts: [],
        octagonDebut: null,
      }),
    ).toEqual({ date: "2018-01-20", scheduled: false });
  });

  it("never fought but booked: the bout's date, «(programado)» (9147 Chopurov)", () => {
    const debut = resolveUfcDebut({
      history: [],
      upcomingBouts: [booked("2026-10-24"), booked("2027-01-17")],
      octagonDebut: "2026-10-21",
    });
    expect(debut).toEqual({ date: "2026-10-24", scheduled: true });
    expect(formatUfcDebut(debut!)).toBe("24 oct 2026 (programado)");
  });

  it("a fought fight beats a booking, and a booked Road to UFC is no debut", () => {
    expect(
      resolveUfcDebut({
        history: [fight({ eventDate: "2026-08-08" })],
        upcomingBouts: [booked("2026-10-24")],
        octagonDebut: null,
      }),
    ).toEqual({ date: "2026-08-08", scheduled: false });

    expect(
      resolveUfcDebut({
        history: [],
        upcomingBouts: [booked("2026-11-14", "road_to_ufc")],
        octagonDebut: "2026-11-14",
      }),
    ).toBeNull();
  });

  it("nothing at all: no debut, so the page draws no row", () => {
    expect(resolveUfcDebut({ history: [], upcomingBouts: [], octagonDebut: null })).toBeNull();
    expect(
      resolveUfcDebut({ history: [], upcomingBouts: [booked("")], octagonDebut: undefined }),
    ).toBeNull();
  });

  it("reads the calendar day of a pg Date in Madrid, before and after unstable_cache", () => {
    // The trap, as it was: the pg Date straight into formatDate.
    const fromPg = pgDate(2015, 7, 12);
    expect(formatDate(fromPg as unknown as string)).toBe("11 jul 2015");

    // A cache miss hands over the Date itself; a hit, its JSON (an ISO instant).
    const fromCache = JSON.parse(JSON.stringify(fromPg)) as string;
    expect(fromCache).toBe("2015-07-11T22:00:00.000Z");

    for (const eventDate of [fromPg as unknown as string, fromCache]) {
      const debut = resolveUfcDebut({
        history: [fight({ eventDate: "2024-08-03" }), fight({ eventDate })],
        upcomingBouts: [],
        octagonDebut: null,
      });
      expect(debut).toEqual({ date: "2015-07-12", scheduled: false });
      expect(formatUfcDebut(debut!)).toBe("12 jul 2015");
    }
  });
});

// WHO READS octagon_debut. The rule only holds if no page prints the raw value
// again: the column keeps arriving (the pre-1995 branch needs it), so a new
// `formatDate(fighter.octagonDebut)` anywhere would bring back the 1,541. As in
// event-tier-callsites.test.ts, a call site is only caught by READING THE
// SOURCE. Test files are left out, this one included.
const SRC = new URL("../", import.meta.url);

function sourceFiles(relative: string): string[] {
  const found: string[] = [];
  for (const entry of readdirSync(fileURLToPath(new URL(relative, SRC)), {
    withFileTypes: true,
  })) {
    const child = `${relative}${entry.name}`;
    if (entry.isDirectory()) {
      found.push(...sourceFiles(`${child}/`));
    } else if (/\.tsx?$/.test(entry.name) && !/\.(test|spec)\.tsx?$/.test(entry.name)) {
      found.push(child);
    }
  }
  return found;
}

function read(relative: string): string {
  return readFileSync(fileURLToPath(new URL(relative, SRC)), "utf8");
}

describe("octagonDebut call sites", () => {
  it("only the type, the mapper, the helper and the fighter page mention it", () => {
    const mentioning = sourceFiles("")
      .filter((file) => /\boctagonDebut\b/.test(read(file)))
      .sort();
    expect(mentioning).toEqual([
      "app/fighters/[id]/page.tsx",
      "lib/fighter-highlights.ts",
      "lib/queries/fighters.mappers.ts",
      "lib/types.ts",
    ]);
  });

  it("the fighter page only hands it to resolveUfcDebut", () => {
    const page = read("app/fighters/[id]/page.tsx");
    expect(page.match(/fighter\.octagonDebut\b/g)).toHaveLength(1);
    expect(page).toMatch(/resolveUfcDebut\(\{[^}]*octagonDebut: fighter\.octagonDebut[^}]*\}\)/);
  });
});
