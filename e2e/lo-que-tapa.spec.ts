import { expect, test, type Locator, type Page } from "@playwright/test";

import { fakeYouTubeEmbeds, needsUfcTvLoop } from "./helpers";

// ── What covers the page, and the turn manager ─────────────────────────────
//
// YouTube's rules: nothing in front of the player. The turn manager
// (components/playback) takes the AUTOMATIC player away while a blocker is
// open, and brings it back when it closes; what the visitor chose stays.
// Two blockers, fixed in the final review of the shorts branch:
//
//   · The videos lightbox (video-modal.tsx: the home's «Noticias y vídeos»,
//     /videos and /tendencias) covers the page with an 80 % black backdrop,
//     and UFC TV kept playing behind it. Since R10 (18-oct-2026, the owner:
//     «uno a la vez») its player is in the turn manager too: opening a video
//     also takes away the UFC TV the VISITOR had on, and that one does not
//     come back on its own when the modal closes (until then it went on
//     playing behind the modal: two players at once, and this file checked
//     exactly that). e2e/portada-noticias.spec.ts checks it in WebKit too.
//   · The mobile menu (site-header.tsx) did not close when the visitor left
//     with the logo or the EN VIVO chip: /en-vivo opened with the menu open,
//     every player blocked and the broadcast's ▶ dead until it was closed.
//
// No network: UFC TV is canned (UFC_TV_FIXTURE=loop) and every iframe loads
// the fake YouTube of helpers.ts.
//
// ⚠️ Y NADA de `test.only`: con CI=true, `forbidOnly` tumba la recolección.

test.beforeEach(async ({ page, baseURL }, testInfo) => {
  test.skip(
    testInfo.project.name !== "escritorio-light",
    "the viewport is set per test and the theme changes nothing here: one project is enough",
  );
  test.skip(
    Boolean(process.env.PLAYWRIGHT_BASE_URL) &&
      (process.env.UFC_SHORTS_FIXTURE !== "list" || process.env.UFC_TV_FIXTURE !== "loop"),
    "con PLAYWRIGHT_BASE_URL hacen falta UFC_SHORTS_FIXTURE=list y UFC_TV_FIXTURE=loop",
  );
  await page.route("**/*", (route) => {
    if (route.request().url().startsWith(baseURL ?? "http://localhost")) return route.continue();
    return route.abort();
  });
  // Last, so it wins over the catch-all for youtube-nocookie.
  await fakeYouTubeEmbeds(page);
});

const tv = (page: Page) => page.locator("section[data-ufc-tv] [data-turn]");
const dialog = (page: Page) => page.getByRole("dialog");
// The lightbox facades of the home's «Noticias y vídeos» (its video cards).
const videoFacade = (page: Page) => page.locator('button[aria-label^="Reproducir: "]').first();

// 🪤 The videos come from the REAL YouTube API (there is no fixture for
// getUfcVideos): a day it brings none, these skip. Read the skip reasons.
async function needsVideoColumn(page: Page) {
  test.skip(
    (await videoFacade(page).count()) === 0,
    "«Noticias y vídeos» de la portada no trae ningún vídeo hoy (la API de YouTube no devolvió ninguno)",
  );
}

async function clickCenter(locator: Locator, page: Page) {
  const box = await locator.boundingBox();
  expect(box, "no box to click").not.toBeNull();
  await page.mouse.click(box!.x + box!.width / 2, box!.y + box!.height / 2);
}

// Opened without scrolling: a click from Playwright would first scroll the
// facade into view, and UFC TV could leave the screen for that reason alone.
// Brought to the middle of the screen, it starts on its own. Again if the
// page still moves under it (the streamed blocks and images arrive late).
async function centerTvUntilItPlays(page: Page) {
  await expect(async () => {
    await tv(page).evaluate((el) => el.scrollIntoView({ block: "center" }));
    await expect(tv(page)).toHaveAttribute("data-turn-state", "playing-auto", { timeout: 2_000 });
  }).toPass({ timeout: 20_000 });
}

async function openVideoModal(page: Page) {
  await videoFacade(page).evaluate((el) => (el as HTMLButtonElement).click());
  await expect(dialog(page)).toBeVisible();
}

test.describe("el modal de vídeos", () => {
  test.beforeEach(async ({ page }) => {
    await page.route("**/api/live/now", (route) =>
      route.fulfill({ status: 200, json: { phase: "none", live: false, eventId: null, eventName: null, daysUntil: null } }),
    );
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto("/");
    await needsUfcTvLoop(page);
    await needsVideoColumn(page);
  });

  test("quita UFC TV automático mientras está abierto, y vuelve al cerrarlo", async ({ page }) => {
    await centerTvUntilItPlays(page);

    await openVideoModal(page);
    await expect(tv(page)).toHaveAttribute("data-turn-state", "poster");
    // Still in view, well past the 400 ms: nothing comes back behind it.
    await page.waitForTimeout(1_000);
    await expect(tv(page)).toHaveAttribute("data-turn-state", "poster");
    // The only player of the page is the one the visitor opened.
    await expect(page.locator("iframe")).toHaveCount(1);
    await expect(dialog(page).locator("iframe")).toHaveCount(1);

    await page.keyboard.press("Escape");
    await expect(dialog(page)).toHaveCount(0);
    // Closing sends the focus back to the facade, which may scroll: bring UFC
    // TV back to the middle.
    await centerTvUntilItPlays(page);
  });

  // Inverted on 18-oct-2026 (R10): it used to REQUIRE the visitor's UFC TV
  // to keep playing behind the modal.
  test("quita también el UFC TV que puso el visitante: uno solo a la vez, y al cerrar sigue en su póster", async ({
    page,
  }) => {
    await centerTvUntilItPlays(page);
    // A tap inside the player (sound, pause...): from now on it is theirs.
    await clickCenter(tv(page).locator("iframe"), page);
    await expect(tv(page)).toHaveAttribute("data-turn-state", "playing-user");

    await openVideoModal(page);
    await expect(tv(page)).toHaveAttribute("data-turn-state", "poster");
    await expect(dialog(page).locator("[data-turn]")).toHaveAttribute("data-turn-state", "playing-user");
    // The only player of the page is the one the visitor just opened.
    await expect(page.locator("iframe")).toHaveCount(1);
    await expect(dialog(page).locator("iframe")).toHaveCount(1);

    await page.keyboard.press("Escape");
    await expect(dialog(page)).toHaveCount(0);
    // In the middle of the screen again, far past the 400 ms: it does NOT
    // come back on its own (an automatic one would: the test above).
    await tv(page).evaluate((el) => el.scrollIntoView({ block: "center" }));
    await page.waitForTimeout(1_500);
    await expect(tv(page)).toHaveAttribute("data-turn-state", "poster");
    await expect(page.locator("iframe")).toHaveCount(0);
  });
});

test.describe("el menú móvil se cierra al navegar", () => {
  const hamburger = (page: Page) => page.locator('button[aria-controls="mobile-nav"]');
  const mobileMenu = (page: Page) => page.locator("#mobile-nav");
  const logo = (page: Page) => page.getByRole("link", { name: "MMA STATUS — inicio" });

  test.beforeEach(async ({ page }) => {
    // A night of an event: the header shows the EN VIVO chip.
    await page.route("**/api/live/now", (route) =>
      route.fulfill({
        status: 200,
        json: { phase: "live", live: true, eventId: 357, eventName: "UFC 306", daysUntil: 0 },
      }),
    );
    await page.setViewportSize({ width: 390, height: 844 });
  });

  async function openMenu(page: Page) {
    await hamburger(page).click();
    await expect(mobileMenu(page)).toBeVisible();
  }

  async function expectMenuClosed(page: Page) {
    await expect(mobileMenu(page)).toBeHidden();
    await expect(hamburger(page)).toHaveAttribute("aria-expanded", "false");
  }

  test("con el logo, desde otra página y desde la portada misma", async ({ page }) => {
    await page.goto("/eventos");
    await openMenu(page);
    await logo(page).click();
    await expect(page).toHaveURL(/\/$/);
    await expectMenuClosed(page);

    // Already on the home: the route does not change, the menu closes anyway.
    await openMenu(page);
    await logo(page).click();
    await expectMenuClosed(page);
  });

  test("con el chip EN VIVO: se llega a /en-vivo con el menú cerrado", async ({ page }) => {
    await page.goto("/");
    const chip = page.locator("header").getByRole("link", { name: "En vivo" });
    await expect(chip).toBeVisible();
    await openMenu(page);
    await chip.click();
    await expect(page).toHaveURL(/\/en-vivo$/);
    await expectMenuClosed(page);
  });
});
