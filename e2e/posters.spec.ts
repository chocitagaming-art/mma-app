import { expect, test, type Locator, type Page } from "@playwright/test";

import { fakeYouTubeEmbeds } from "./helpers";

// ── The players' posters: a real link, and the keyboard focus ──────────────
//
// The hero short, UFC TV and the event's live broadcast show a poster (▶)
// until the turn manager mounts their <iframe> (components/playback). Two
// things fixed before shipping the shorts (BACKLOG, «Desplegar los shorts»):
//
//   (3) Without the page's JavaScript the poster was a <button> that did
//       nothing. It is now a real link to the video on YouTube; with
//       JavaScript the click is intercepted and the player mounts here.
//       Measured on 30-sep-2026 on a local build: with JavaScript OFF the
//       home, /en-vivo and the event page stay in their loading skeleton (the
//       content streams into hidden blocks that only an inline script shows:
//       BACKLOG «La portada sin JavaScript se queda en el esqueleto»), so the
//       link is in the HTML but out of sight there. Where it shows and works
//       TODAY is JavaScript on but the app's bundles not there (slow network,
//       blocked, failed): the content shows, React never runs, and the ▶ was
//       dead. Both are tested below.
//   (5) A poster started with the keyboard is replaced by the iframe, and the
//       focus fell on <body>. It now goes into the player it mounted, but only
//       for a keyboard start: a focused iframe is how the turn manager spots a
//       player the visitor touched, so an automatic mount must never get it.
//
// No network: the shorts and UFC TV are canned (UFC_SHORTS_FIXTURE=list,
// UFC_TV_FIXTURE=loop) and every iframe loads the fake YouTube of helpers.ts.
// The live broadcast depends on the real calendar (no fixture forces it): its
// poster is the same component as UFC TV's (live-embed-player.tsx), and its
// server HTML is pinned in src/lib/live-embed-callsites.test.ts.
//
// ⚠️ Y NADA de `test.only`: con CI=true, `forbidOnly` tumba la recolección.

const FIRST_SHORT_URL = "https://www.youtube.com/shorts/fixShort-01";
const WATCH_URL = /^https:\/\/www\.youtube\.com\/watch\?v=([A-Za-z0-9_-]{11})$/;
const TV_POSTER = "Toca para ver. UFC TV · Peleas completas";

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
  await page.route("**/api/live/now", (route) =>
    route.fulfill({ status: 200, json: { phase: "none" } }),
  );
  // Last, so it wins over the catch-all for youtube-nocookie.
  await fakeYouTubeEmbeds(page);
});

const hero = (page: Page) => page.locator('[data-turn="hero"]');
const tv = (page: Page) => page.locator("section[data-ufc-tv] [data-turn]");
// The poster is the only thing the server renders inside the turn's box.
const posterOf = (slot: Locator) => slot.locator(":scope > a");

async function openHome(page: Page, width = 1280, height = 800) {
  await page.setViewportSize({ width, height });
  await page.goto("/");
  await expect(hero(page)).toBeVisible();
  await expect(page.locator("section[data-ufc-tv]")).toHaveAttribute("data-ufc-tv", "loop");
}

async function focusByKeyboard(page: Page, target: Locator) {
  await target.focus();
  await page.keyboard.press("Shift+Tab");
  await page.keyboard.press("Tab");
  expect(
    await target.evaluate((el) => el === document.activeElement && el.matches(":focus-visible")),
    "the poster did not get the keyboard focus",
  ).toBe(true);
}

/** Is the focus on this slot's iframe (the player it mounted)? */
function focusIsOnPlayer(slot: Locator): Promise<boolean> {
  return slot.evaluate((el) => {
    const iframe = el.querySelector("iframe");
    return iframe !== null && document.activeElement === iframe;
  });
}

// ── (3) A real link ───────────────────────────────────────────────────────

test.describe("sin JavaScript", () => {
  test.use({ javaScriptEnabled: false });

  test("los pósters son enlaces a YouTube, en otra pestaña (hoy tapados por el esqueleto)", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto("/");

    const heroPoster = posterOf(hero(page));
    await expect(heroPoster).toHaveAttribute("href", FIRST_SHORT_URL);
    const tvPoster = posterOf(tv(page));
    await expect(tvPoster).toHaveAttribute("href", WATCH_URL);
    for (const poster of [heroPoster, tvPoster]) {
      await expect(poster).toHaveAttribute("target", "_blank");
      await expect(poster).toHaveAttribute("rel", "noopener noreferrer");
      // Without JavaScript it is what it does: a link, not a button.
      expect(await poster.getAttribute("role")).toBeNull();
    }
    await expect(page.locator("iframe")).toHaveCount(0);

    // The measurement of 30-sep-2026, as a note and not as an assert (it is a
    // bug of its own, and this test must not freeze it): is the poster seen?
    const seen = await tvPoster.isVisible();
    test.info().annotations.push({
      type: "info",
      description: `sin JavaScript el póster de UFC TV ${seen ? "SÍ" : "NO"} se ve (el esqueleto de loading.tsx)`,
    });
  });
});

test("con JavaScript pero sin los bundles, el póster abre el vídeo en YouTube", async ({
  page,
  context,
}) => {
  // The app's bundles never arrive: the inline scripts of the streaming still
  // move the content into place, but React never hydrates it.
  await page.route(/\/_next\/static\/chunks\/.+\.js(\?.*)?$/, (route) => route.abort());
  // YouTube itself, for the tab the link opens (a context route reaches it).
  await context.route("https://www.youtube.com/**", (route) =>
    route.fulfill({
      status: 200,
      contentType: "text/html; charset=utf-8",
      body: "<!doctype html><title>YouTube (e2e stub)</title>",
    }),
  );
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto("/");

  const poster = tv(page).getByRole("link", { name: TV_POSTER });
  await poster.scrollIntoViewIfNeeded();
  await expect(poster).toBeVisible();
  const href = await poster.getAttribute("href");
  expect(href).toMatch(WATCH_URL);

  const [tab] = await Promise.all([context.waitForEvent("page"), poster.click()]);
  await expect(tab).toHaveURL(href!);
  // Nothing was mounted here: without React the turn manager does not exist.
  await expect(tv(page)).toHaveAttribute("data-turn-state", "poster");
  await expect(page.locator("iframe")).toHaveCount(0);
});

test("con JavaScript, el clic monta el reproductor aquí, del primer vídeo del enlace", async ({
  page,
  context,
}) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await openHome(page);
  const slot = tv(page);
  await slot.evaluate((el) => el.scrollIntoView({ block: "center" }));
  // Hydrated: the click plays here, so it is announced as a button now.
  const poster = slot.getByRole("button", { name: /^Toca para reproducir\. UFC TV · Peleas completas$/ });
  await expect(poster).toBeVisible();
  const watch = WATCH_URL.exec((await poster.getAttribute("href")) ?? "");
  expect(watch, "the poster lost its link to YouTube").not.toBeNull();

  let opened = false;
  context.on("page", () => {
    opened = true;
  });
  await poster.click();
  await expect(slot).toHaveAttribute("data-turn-state", "playing-user");
  // The same video the link opens is the first of the loop's iframe.
  const src = await slot.locator("iframe").getAttribute("src");
  expect(new URL(src!).pathname).toBe(`/embed/${watch![1]}`);
  await page.waitForTimeout(300);
  expect(opened, "the click opened YouTube as well as playing here").toBe(false);
});

// ── (5) The keyboard focus ────────────────────────────────────────────────

for (const key of ["Enter", "Space"] as const) {
  test(`${key} en el póster de UFC TV: el foco entra en el reproductor que monta`, async ({
    page,
  }) => {
    // Reduced motion: nothing starts on its own, so the poster waits for us.
    await page.emulateMedia({ reducedMotion: "reduce" });
    await openHome(page);
    const slot = tv(page);
    await slot.evaluate((el) => el.scrollIntoView({ block: "center" }));
    const poster = slot.getByRole("button", { name: /^Toca para reproducir\. UFC TV/ });

    let opened = false;
    page.context().on("page", () => {
      opened = true;
    });
    await focusByKeyboard(page, poster);
    await page.keyboard.press(key);
    await expect(slot).toHaveAttribute("data-turn-state", "playing-user");
    await expect.poll(() => focusIsOnPlayer(slot), { message: "the focus is not on the player" }).toBe(true);
    // A keyboard start is not a trip to YouTube as well.
    await page.waitForTimeout(300);
    expect(opened, `${key} opened YouTube as well as playing here`).toBe(false);
  });
}

test("Enter en el póster del short del hero: el foco entra en el short que monta", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await openHome(page);
  const slot = hero(page);
  // The hero takes no start until the headline's font and its intro are done
  // (shorts-hero.tsx): its frame drops animate-rise then.
  await expect(page.getByTestId("hero-short").locator("..")).not.toHaveClass(/animate-rise/);
  const poster = slot.getByRole("button", { name: /^Toca para reproducir\. Short de la UFC: / });

  await focusByKeyboard(page, poster);
  await page.keyboard.press("Enter");
  await expect(slot).toHaveAttribute("data-turn-state", "playing-user");
  await expect.poll(() => focusIsOnPlayer(slot), { message: "the focus is not on the short" }).toBe(true);
});

test("con el ratón el foco no se mueve al reproductor", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await openHome(page);
  const slot = tv(page);
  await slot.evaluate((el) => el.scrollIntoView({ block: "center" }));

  await slot.getByRole("button", { name: /^Toca para reproducir\. UFC TV/ }).click();
  await expect(slot).toHaveAttribute("data-turn-state", "playing-user");
  await page.waitForTimeout(300);
  expect(await focusIsOnPlayer(slot), "a mouse start moved the focus into the player").toBe(false);
});

test("un montaje automático nunca se lleva el foco", async ({ page }) => {
  await openHome(page);
  // The hero plays on its own; UFC TV waits below the fold.
  await expect(hero(page)).toHaveAttribute("data-turn-state", "playing-auto");
  const next = page.getByRole("button", { name: "Siguiente short" });
  await next.focus();

  // A scroll (not the keyboard) brings UFC TV in: an automatic mount.
  await tv(page).evaluate((el) => el.scrollIntoView({ block: "center" }));
  await expect(tv(page)).toHaveAttribute("data-turn-state", "playing-auto");
  await page.waitForTimeout(300);
  expect(await next.evaluate((el) => el === document.activeElement)).toBe(true);
  expect(await focusIsOnPlayer(tv(page))).toBe(false);
});
