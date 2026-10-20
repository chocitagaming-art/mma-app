import { test, expect, type Page } from "@playwright/test";

import { formatDate } from "../src/lib/format";

// «Debut en UFC» on the fighter page comes from OUR fights, not from ufc.com's
// octagon_debut (owner, 21-oct-2026; rule in resolveUfcDebut). The unit tests
// prove the rule; this proves the page wires the right data into it: the
// history with its event tier, the bookings, and the date shapes pg really
// hands over (a Date at local midnight, which formatDate alone printed a day
// early on any server east of Greenwich).
//
// ⚠️ THE EXPECTATIONS ARE FIXED, read-only from the database on 21-oct-2026,
// NOT read from the page. Only the formatting comes from formatDate, so a
// change of format does not break this and a change of DAY does. The fighters
// are STABLE ones: retired, or with no UFC fight booked. Nothing here hangs on
// this week's card. Against production before the change (b5f73f0) Ige, Luque,
// Almeida and Saeteurn are red; Royce Gracie is green there too, and is here so
// that a "fights only" rule can never move him to 1995.
//
// ⚠️ WAIT FOR THE PAGE TO SHOW. The page streams: when goto() resolves, the
// content may still be in a hidden <div id="S:…">. An "absent row" check taken
// then would pass on an empty page, so every check waits for the h1 and for
// another bio row first.

type Case = {
  id: number;
  name: string;
  // "YYYY-MM-DD", or null: the page must draw no «Debut en UFC» row at all.
  debut: string | null;
  why: string;
};

const CASES: Case[] = [
  {
    id: 8742,
    name: "Royce Gracie",
    debut: "1993-11-12",
    why: "UFC 1 is not in `events` (they start at UFC 5, 1995-04-07): ufc.com's date stands",
  },
  {
    id: 6932,
    name: "Dan Ige",
    debut: "2018-01-20",
    why: "ufc.com says 2017-07-25, his Contender Series; his UFC debut is UFC 220, 2018-01-20",
  },
  {
    id: 6514,
    name: "Vicente Luque",
    debut: "2015-07-12",
    why: "ufc.com has no date; his first UFC fight is the TUF 21 Finale, 2015-07-12",
  },
  {
    id: 364,
    name: "Estefani Almeida",
    debut: null,
    why: "ufc.com's broken page left 2026-07-10, and she has not a single UFC fight",
  },
  {
    id: 6860,
    name: "Terrance Saeteurn",
    debut: null,
    why: "his only fight in `fights` is Road to UFC 4.6 (2025-08-22), and that is no UFC debut",
  },
];

test.beforeEach(({}, testInfo) => {
  test.skip(
    testInfo.project.name !== "escritorio-light",
    "es una comprobación de datos, no de maquetación: basta un proyecto",
  );
});

async function openFighter(page: Page, fighter: Case): Promise<void> {
  const response = await page.goto(`/fighters/${fighter.id}`);
  expect(response?.status(), `/fighters/${fighter.id} responde`).toBe(200);
  const heading = page.locator("h1").first();
  await expect(heading).toBeVisible();
  await expect(heading).toContainText(fighter.name);
  // The bio row is out: «Altura» is always drawn, with or without a value.
  await expect(page.locator("p").filter({ hasText: /^Altura$/ }).first()).toBeVisible();
}

for (const fighter of CASES) {
  test(`«Debut en UFC» de ${fighter.name} (${fighter.id})`, async ({ page }) => {
    await openFighter(page, fighter);

    const label = page.locator("p").filter({ hasText: /^Debut en UFC$/ });

    if (fighter.debut === null) {
      await expect(label, `${fighter.name} no debe tener fila: ${fighter.why}`).toHaveCount(0);
      return;
    }

    await expect(label, `falta la fila «Debut en UFC» de ${fighter.name}`).toHaveCount(1);
    const value = label.locator("xpath=following-sibling::p[1]");
    expect((await value.textContent())?.trim(), fighter.why).toBe(formatDate(fighter.debut));
  });
}
