import { expect, test as base, type Browser, type Locator, type Page } from "@playwright/test";

import { esperarHidratacion, fakeYouTubeEmbeds } from "./helpers";

// ── The hero short makes way for the home's slot when the visitor scrolls ──
//
// The owner, 21-oct-2026: «cuando pongo los shorts del hero, que se reproduzca
// como ahora, pero que cuando haga scroll hacia abajo y llegue al "UFC TV" en
// directo se pare el vídeo de arriba y se ponga automáticamente el directo sin
// pulsar». The rule is lib/playback-turn.ts's (table tests there, the browser
// wiring in turn-controller.test.ts); this is the served home page with a
// REAL scroll (the mouse wheel, not scrollIntoView), in Chromium AND WebKit
// (the owner looks on his iPhone), on a desktop and on a phone:
//   · the short plays at the top, as before;
//   · scrolled down to the slot: the short's iframe goes, the slot's mounts
//     with no click and muted (mute=1), and there is never more than ONE
//     YouTube iframe in the page, not even for a moment (watched on every DOM
//     change and every 40 ms);
//   · back up: the slot goes back to its poster and the short does not start
//     on its own; its poster shows the SAME short (it was cut, not ended),
//     and its ▶ plays that one again;
//   · a tall screen, the short still more than half in view: UFC TV waits
//     with its ▶, as before 21-oct-2026.
//
// The slot is UFC TV in a loop (UFC_TV_FIXTURE=loop, how playwright.config.ts
// starts its server) or UFC TV live (UFC_TV_FIXTURE=live, the owner's own
// case: a server started with it, PLAYWRIGHT_BASE_URL and the same variable
// here). 🪤 The production base may put the event's broadcast there instead
// (a live_video_id written by hand): it is the same automatic player, so the
// test runs against it and says so; only a slot silenced on purpose skips.
//
// No network: the shorts are canned (UFC_SHORTS_FIXTURE=list, fixShort-01
// lasts 15 s, longer than any of these scrolls) and every iframe loads the
// fake YouTube of helpers.ts. The live strip depends on the real calendar and
// is switched off.
//
// ⚠️ Y NADA de `test.only`: con CI=true, `forbidOnly` tumba la recolección.

type Motor = "chromium" | "webkit";

const test = base.extend<{ motor: Motor; pagina: Page }, { abrirWebkit: () => Promise<Browser> }>({
  motor: ["chromium", { option: true }],
  abrirWebkit: [
    async ({ playwright }, ofrecer) => {
      const lanzado: { webkit: Browser | null } = { webkit: null };
      await ofrecer(async () => {
        lanzado.webkit ??= await playwright.webkit.launch().catch((error: unknown) => {
          throw new Error(`No arranca WebKit: instálalo con «npx playwright install webkit». (${String(error)})`);
        });
        return lanzado.webkit;
      });
      await lanzado.webkit?.close();
    },
    { scope: "worker" },
  ],
  // A new context (and tab) per test: in WebKit a goto right after a client
  // navigation comes out «interrupted».
  pagina: async ({ motor, browser, abrirWebkit, baseURL }, ofrecer) => {
    const navegador = motor === "webkit" ? await abrirWebkit() : browser;
    // Sin service worker: el de la PWA sirve el CSS viejo (CLAUDE.md, trampas).
    const contexto = await navegador.newContext({
      baseURL,
      viewport: { width: 1280, height: 800 },
      serviceWorkers: "block",
    });
    const page = await contexto.newPage();
    await page.route("**/*", (route) => {
      if (route.request().url().startsWith(baseURL ?? "http://localhost")) return route.continue();
      return route.abort();
    });
    await page.route("**/api/live/now", (route) =>
      route.fulfill({ status: 200, json: { phase: "none", live: false, eventId: null, eventName: null, daysUntil: null } }),
    );
    // Last, so it wins over the catch-all for youtube-nocookie.com/embed.
    await fakeYouTubeEmbeds(page);
    await ofrecer(page);
    await contexto.close();
  },
});

const TV_FIXTURE = process.env.UFC_TV_FIXTURE === "live" ? "live" : "loop";

test.beforeEach(({}, testInfo) => {
  test.skip(testInfo.project.name !== "escritorio-light", "cada test fija su tamaño: basta un proyecto");
  test.skip(
    Boolean(process.env.PLAYWRIGHT_BASE_URL) &&
      (process.env.UFC_SHORTS_FIXTURE !== "list" || !["loop", "live"].includes(process.env.UFC_TV_FIXTURE ?? "")),
    "con PLAYWRIGHT_BASE_URL hacen falta UFC_SHORTS_FIXTURE=list y UFC_TV_FIXTURE=loop (o live)",
  );
});

const FIRST_SHORT = "fixShort-01";

const hero = (page: Page) => page.locator('[data-turn="hero"]');
// The home's slot: ONE of the three automatic players (home-live-slot.tsx).
const slot = (page: Page) => page.locator('[data-turn="evento"], [data-turn="tv-directo"], [data-turn="tv-bucle"]');
const heroPoster = (page: Page) =>
  hero(page).getByRole("button", { name: /^Toca para (ver|reproducir)\. Short de la UFC: / });
const youtubeIframes = (page: Page) => page.locator('iframe[src^="https://www.youtube-nocookie.com/embed/"]');

/** Load the home at this size, hydrated, with the slot's player there (or skip). */
async function openHome(page: Page, width: number, height: number): Promise<string> {
  await page.setViewportSize({ width, height });
  await page.goto("/");
  await esperarHidratacion(page);
  await expect(heroPoster(page)).toBeVisible();

  const silenced = page.locator("[data-live-slot]");
  await expect(slot(page).or(silenced).first()).toBeAttached();
  if ((await silenced.count()) > 0) {
    const reason = await silenced.getAttribute("data-live-slot");
    test.skip(true, `el hueco se calla a propósito (${reason}): no hay a quién ceder`);
  }
  const id = (await slot(page).getAttribute("data-turn")) ?? "";
  if (id === "evento") {
    test.info().annotations.push({
      type: "hueco",
      description: "el directo de la velada (live_video_id de la base), no UFC TV: la misma regla",
    });
  } else {
    // A UFC TV that is not the fixture: the server was started without it.
    await expect(
      page.locator("section[data-ufc-tv]"),
      `UFC TV no está en ${TV_FIXTURE}: ¿el server se arrancó sin UFC_TV_FIXTURE=${TV_FIXTURE}?`,
    ).toHaveAttribute("data-ufc-tv", TV_FIXTURE);
    expect(id).toBe(TV_FIXTURE === "live" ? "tv-directo" : "tv-bucle");
  }
  return id;
}

// Counts the YouTube iframes, and the moments the short's and the slot's are
// both there, on EVERY DOM change (and every 40 ms): a swap that painted two
// for an instant between two checks is caught too.
async function watchIframes(page: Page) {
  await page.evaluate(() => {
    const w = window as unknown as { __max: number; __both: number; __samples: number };
    w.__max = 0;
    w.__both = 0;
    w.__samples = 0;
    const count = () => {
      const all = document.querySelectorAll('iframe[src^="https://www.youtube-nocookie.com/embed/"]').length;
      const inHero = document.querySelectorAll('[data-turn="hero"] iframe').length;
      w.__max = Math.max(w.__max, all);
      if (inHero > 0 && all > inHero) w.__both += 1;
      w.__samples += 1;
    };
    new MutationObserver(count).observe(document.body, { childList: true, subtree: true });
    window.setInterval(count, 40);
    count();
  });
}

async function watched(page: Page) {
  return page.evaluate(() => {
    const w = window as unknown as { __max: number; __both: number; __samples: number };
    return { max: w.__max, both: w.__both, samples: w.__samples };
  });
}

/** What share of this box is visible under the sticky header (0-1). */
async function visibleShare(page: Page, locator: Locator): Promise<number> {
  return locator.evaluate((el) => {
    const header = document.querySelector("header")!.getBoundingClientRect();
    const box = el.getBoundingClientRect();
    const top = Math.max(box.top, Math.max(0, header.bottom));
    const bottom = Math.min(box.bottom, window.innerHeight);
    const left = Math.max(box.left, 0);
    const right = Math.min(box.right, document.documentElement.clientWidth);
    return (Math.max(0, bottom - top) * Math.max(0, right - left)) / (box.width * box.height);
  });
}

/**
 * A real scroll: mouse wheel notches, with the pointer on the page's left
 * gutter (never over an iframe, which would take the wheel), until `done`.
 */
async function wheelUntil(page: Page, deltaY: number, done: () => Promise<boolean>, what: string) {
  const viewport = page.viewportSize()!;
  await page.mouse.move(6, Math.round(viewport.height / 2));
  for (let step = 0; step < 120; step += 1) {
    if (await done()) return;
    await page.mouse.wheel(0, deltaY);
    // Each notch is a short pause, as a hand on the wheel: well under the
    // 400 ms dwell, so nothing passed on the way may start.
    await page.waitForTimeout(80);
  }
  throw new Error(`el scroll no llegó: ${what}`);
}

for (const motor of ["chromium", "webkit"] as const) {
  test.describe(`el short del hero cede al hueco de la portada · ${motor}`, () => {
    test.use({ motor });

    for (const [name, width, height] of [
      ["escritorio", 1280, 800],
      ["móvil", 390, 844],
    ] as const) {
      test(`${name} ${width}x${height}: al bajar hasta UFC TV el short se quita y UFC TV arranca solo, mudo, uno a la vez; al subir, el póster enseña el mismo short y no arranca solo`, async ({
        pagina: page,
      }) => {
        test.setTimeout(90_000);
        const slotId = await openHome(page, width, height);
        await watchIframes(page);

        // As now: the visitor's ▶ plays the poster's short, here.
        await expect(hero(page).locator(":scope > a")).toHaveAttribute(
          "href",
          `https://www.youtube.com/shorts/${FIRST_SHORT}`,
        );
        await heroPoster(page).click();
        await expect(hero(page)).toHaveAttribute("data-turn-state", "playing-user");
        await expect(hero(page).locator("iframe")).toHaveAttribute("src", new RegExp(`/embed/${FIRST_SHORT}\\?`));
        await expect(slot(page)).toHaveAttribute("data-turn-state", "poster");

        // Down with the wheel until the slot is in full view under the header.
        await wheelUntil(page, 120, async () => (await visibleShare(page, slot(page))) > 0.98, "UFC TV entero a la vista");
        const heroShare = await visibleShare(page, hero(page));
        test.info().annotations.push({
          type: "scroll",
          description: `${slotId} entero a la vista con el short al ${Math.round(heroShare * 100)} % (y=${await page.evaluate(() => Math.round(window.scrollY))})`,
        });
        expect(heroShare, "the short is still more than half in view: this is not the case under test").toBeLessThanOrEqual(0.5);

        // No click: the slot starts on its own, muted, and the short is gone.
        await expect(slot(page)).toHaveAttribute("data-turn-state", "playing-auto", { timeout: 5_000 });
        await expect(hero(page)).toHaveAttribute("data-turn-state", "poster");
        await expect(hero(page).locator("iframe")).toHaveCount(0);
        await expect(youtubeIframes(page)).toHaveCount(1);
        const src = new URL((await slot(page).locator("iframe").getAttribute("src"))!);
        expect(src.searchParams.get("mute"), `mute=1 in ${src}`).toBe("1");
        expect(src.searchParams.get("autoplay"), `autoplay=1 in ${src}`).toBe("1");

        // Back up to the top, with the wheel.
        await wheelUntil(page, -160, async () => (await page.evaluate(() => window.scrollY)) <= 0, "arriba del todo");
        await expect(slot(page)).toHaveAttribute("data-turn-state", "poster");
        // Far longer than the dwell, in full view: the short stays its poster.
        await page.waitForTimeout(2_000);
        await expect(hero(page)).toHaveAttribute("data-turn-state", "poster");
        await expect(youtubeIframes(page)).toHaveCount(0);
        // The same short, not the next one: it was cut, it did not end.
        await expect(hero(page).locator(":scope > a")).toHaveAttribute(
          "href",
          `https://www.youtube.com/shorts/${FIRST_SHORT}`,
        );
        await expect(heroPoster(page)).toHaveAccessibleName(/Short de la UFC: Fixture short one/);

        const watch = await watched(page);
        expect(watch.samples, "the iframe watcher never ran").toBeGreaterThan(0);
        expect(watch.max, "two YouTube iframes at once at some moment").toBe(1);
        expect(watch.both, "the short and the slot mounted together at some moment").toBe(0);

        // Ready for a tap: its ▶ plays that same short again.
        await heroPoster(page).click();
        await expect(hero(page)).toHaveAttribute("data-turn-state", "playing-user");
        await expect(hero(page).locator("iframe")).toHaveAttribute("src", new RegExp(`/embed/${FIRST_SHORT}\\?`));
        await expect(youtubeIframes(page)).toHaveCount(1);
      });
    }

    // Rule 2 of 21-oct-2026: only a short half or more out of view makes way.
    test("pantalla alta: con el short del visitante a más de la mitad a la vista, UFC TV espera con su ▶", async ({
      pagina: page,
    }) => {
      // Tall enough to see the hero and the slot at once, with no scroll.
      await openHome(page, 1280, 2400);
      await expect(slot(page)).toHaveAttribute("data-turn-state", "playing-auto");
      await heroPoster(page).click();
      await expect(hero(page)).toHaveAttribute("data-turn-state", "playing-user");
      await expect(slot(page)).toHaveAttribute("data-turn-state", "poster");
      expect(await visibleShare(page, hero(page))).toBeGreaterThan(0.5);
      expect(await visibleShare(page, slot(page))).toBeGreaterThan(0.5);
      await page.waitForTimeout(2_000);
      await expect(hero(page)).toHaveAttribute("data-turn-state", "playing-user");
      await expect(slot(page)).toHaveAttribute("data-turn-state", "poster");
      await expect(youtubeIframes(page)).toHaveCount(1);
    });
  });
}
