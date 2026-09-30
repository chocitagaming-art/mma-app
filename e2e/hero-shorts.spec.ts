import { expect, test, type Locator, type Page } from "@playwright/test";

import { fakeYouTubeEmbeds } from "./helpers";

// ── The home hero's shorts and the turn manager, in a real browser ─────────
//
// Ported from the owner's mockup (maqueta-shorts/pruebas/saltos.js and the
// timer half of pruebas/hoja-y-temporizador.js; the variant-B sheet did not
// ship). The rules themselves are unit-tested in src/lib/playback-turn.test.ts
// and src/components/playback/turn-controller.test.ts; this is the other half:
// that the SERVED home page, with its real header, grid and streaming, keeps
// them (YouTube RMF and Developer Policies, DECISIONS.md 29-sep-2026):
//   · scrolling in jumps, at five viewports: never two autoplaying iframes at
//     once (also watched between stops), never an AUTOMATIC one mounted with
//     half or less in view below the sticky header, never one under 200x200;
//   · «Pausar» stops the carousel, «Siguiente ›» moves it on, the timer moves
//     it on by itself, and a short the visitor touched INSIDE stays theirs;
//   · a hidden tab unmounts everything; what the visitor started waits for
//     «Seguir»;
//   · prefers-reduced-motion: only posters, until a tap.
//
// No network: the shorts are canned (UFC_SHORTS_FIXTURE=list, ids
// «fixShort-NN», fixShort-01 lasts 15 s) and so is UFC TV (UFC_TV_FIXTURE=
// loop); every iframe loads the fake YouTube of e2e/helpers.ts. The live strip
// depends on the real calendar and is switched off.
//
// ⚠️ Y NADA de `test.only`: con CI=true, `forbidOnly` tumba la recolección.

const FIRST_SHORT = "fixShort-01";
const SECOND_SHORT = "fixShort-02";
const THIRD_SHORT = "fixShort-03";
// fixShort-01: 15 s + 2.5 s from the iframe's load (shorts-carousel.ts).
const FIRST_TIMER_MS = 17_500;

test.beforeEach(async ({ page, baseURL }, testInfo) => {
  test.skip(
    testInfo.project.name !== "escritorio-light",
    "each test sets its own viewport and the theme changes nothing here: one project is enough",
  );
  // An external server (PLAYWRIGHT_BASE_URL) only counts when it was started
  // with the fixtures and Playwright is told so with the same variables; the
  // «fixShort-» and data-ufc-tv checks below still catch a lie.
  test.skip(
    Boolean(process.env.PLAYWRIGHT_BASE_URL) &&
      (process.env.UFC_SHORTS_FIXTURE !== "list" || process.env.UFC_TV_FIXTURE !== "loop"),
    "con PLAYWRIGHT_BASE_URL hacen falta UFC_SHORTS_FIXTURE=list y UFC_TV_FIXTURE=loop",
  );

  await page.route("**/*", (route) => {
    const request = route.request();
    if (request.url().startsWith(baseURL ?? "http://localhost")) return route.continue();
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
const autoplaying = (page: Page) => page.locator('iframe[src*="autoplay=1"]');

async function heroShortId(page: Page): Promise<string | null> {
  const src = await hero(page).locator("iframe").getAttribute("src");
  return src ? new URL(src).pathname.split("/").pop() ?? null : null;
}

async function expectHeroShort(page: Page, id: string) {
  await expect(hero(page).locator("iframe")).toHaveAttribute("src", new RegExp(`/embed/${id}\\?`));
}

/** Load the home page at this size and wait for the hero's frame. */
async function openHome(page: Page, width: number, height: number) {
  await page.setViewportSize({ width, height });
  await page.goto("/");
  await expect(hero(page)).toBeVisible();
}

// Counts autoplaying iframes on EVERY DOM change (and every 40 ms), so two
// players mounted together for a moment between two stops are caught too.
async function watchIframes(page: Page) {
  await page.evaluate(() => {
    const w = window as unknown as { __maxIframes: number; __samples: number };
    w.__maxIframes = 0;
    w.__samples = 0;
    const count = () => {
      const n = document.querySelectorAll('iframe[src*="autoplay=1"]').length;
      w.__maxIframes = Math.max(w.__maxIframes, n);
      w.__samples += 1;
    };
    new MutationObserver(count).observe(document.body, { childList: true, subtree: true });
    window.setInterval(count, 40);
    count();
  });
}

async function watched(page: Page): Promise<{ max: number; samples: number }> {
  return page.evaluate(() => {
    const w = window as unknown as { __maxIframes: number; __samples: number };
    return { max: w.__maxIframes, samples: w.__samples };
  });
}

// The hidden tab, as the browser reports it: headless Chromium keeps every tab
// "visible", so the property is overridden and the real event is dispatched to
// the provider's real listener (playback-turn-provider.tsx).
async function setTabHidden(page: Page, hidden: boolean) {
  await page.evaluate((isHidden) => {
    Object.defineProperty(document, "visibilityState", {
      configurable: true,
      get: () => (isHidden ? "hidden" : "visible"),
    });
    Object.defineProperty(document, "hidden", { configurable: true, get: () => isHidden });
    document.dispatchEvent(new Event("visibilitychange"));
  }, hidden);
}

async function clickCenter(locator: Locator, page: Page) {
  const box = await locator.boundingBox();
  expect(box, "no box to click").not.toBeNull();
  await page.mouse.click(box!.x + box!.width / 2, box!.y + box!.height / 2);
}

// ── Scrolling in jumps (pruebas/saltos.js) ─────────────────────────────────

const VIEWPORTS: [number, number][] = [
  [1440, 900],
  [1280, 800],
  [820, 1180],
  [390, 844],
  [360, 800],
];

type Stop = {
  y: number;
  frames: { turn: string | null; state: string | null; visible: number; w: number; h: number }[];
};

for (const [width, height] of VIEWPORTS) {
  test(`a saltos a ${width}x${height}: un solo reproductor, nunca automático a la mitad o menos, nunca bajo 200x200`, async ({
    page,
  }) => {
    test.setTimeout(240_000);
    await openHome(page, width, height);
    // The hero is on the first screen at every one of these sizes: it starts
    // on its own once the headline's font and the intro animation are done.
    await expect(hero(page)).toHaveAttribute("data-turn-state", "playing-auto");
    await expectHeroShort(page, FIRST_SHORT);
    await expect(page.locator("section[data-ufc-tv]")).toHaveAttribute("data-ufc-tv", "loop");
    await watchIframes(page);

    const maxScroll = await page.evaluate(
      () => document.documentElement.scrollHeight - window.innerHeight,
    );
    const step = Math.round(height * 0.37);
    const stops: number[] = [];
    for (let y = 0; y <= maxScroll; y += step) stops.push(y);
    stops.push(maxScroll);
    for (let y = maxScroll - Math.round(step / 2); y >= 0; y -= step) stops.push(y);
    stops.push(0);

    const violations: string[] = [];
    const seen = new Set<string>();
    let autoStops = 0;
    for (const y of stops) {
      await page.evaluate((top) => window.scrollTo(0, top), y);
      // Longer than the 400 ms dwell, as in the mockup's check.
      await page.waitForTimeout(800);
      const stop: Stop = await page.evaluate((top) => {
        // The same header the provider takes off the top (its default selector).
        const header = document.querySelector("header")!.getBoundingClientRect();
        const vw = document.documentElement.clientWidth;
        const vh = window.innerHeight;
        const frames = [...document.querySelectorAll<HTMLIFrameElement>('iframe[src*="autoplay=1"]')];
        return {
          y: top,
          frames: frames.map((f) => {
            const slot = f.closest<HTMLElement>("[data-turn]");
            const box = (slot ?? f).getBoundingClientRect();
            const visTop = Math.max(box.top, Math.max(0, header.bottom));
            const visBottom = Math.min(box.bottom, vh);
            const visLeft = Math.max(box.left, 0);
            const visRight = Math.min(box.right, vw);
            const visible =
              (Math.max(0, visBottom - visTop) * Math.max(0, visRight - visLeft)) /
              (box.width * box.height);
            const r = f.getBoundingClientRect();
            return {
              turn: slot?.dataset.turn ?? null,
              state: slot?.dataset.turnState ?? null,
              visible: Math.round(visible * 1000) / 1000,
              w: r.width,
              h: r.height,
            };
          }),
        };
      }, y);

      if (stop.frames.length > 1) violations.push(`y=${y}: ${stop.frames.length} iframes a la vez`);
      for (const f of stop.frames) {
        seen.add(`${f.turn}:${f.state}`);
        if (f.turn == null) violations.push(`y=${y}: un iframe con autoplay fuera del turnero`);
        if (f.w < 200 || f.h < 200) {
          violations.push(`y=${y}: ${f.turn} montado a ${f.w}x${f.h}, menos de 200x200`);
        }
        if (f.state === "playing-auto") {
          autoStops += 1;
          if (f.visible <= 0.5) {
            violations.push(`y=${y}: ${f.turn} automático con solo ${f.visible} a la vista`);
          }
        }
      }
    }

    const watch = await watched(page);
    test.info().annotations.push({
      type: "info",
      description:
        `${width}x${height}: ${stops.length} paradas, ${autoStops} con automático, ` +
        `vistos ${[...seen].join(", ") || "ninguno"}, vigilante ${watch.max} máx en ${watch.samples} muestras`,
    });
    expect(violations, violations.join("\n")).toEqual([]);
    expect(watch.samples, "the iframe watcher never ran").toBeGreaterThan(0);
    expect(watch.max, "two autoplaying iframes at once between two stops").toBeLessThanOrEqual(1);
    // Both did play on the way, each on its own: a run that mounted nothing
    // at all would pass every check above.
    expect(autoStops, "no automatic player at any stop").toBeGreaterThan(0);
    expect([...seen], "the hero never played on its own").toContain("hero:playing-auto");
    expect([...seen], "UFC TV never played on its own").toContain("tv-bucle:playing-auto");
  });
}

// ── The carousel: «Pausar», «Siguiente ›», the timer, a touched short ─────

test("«Pausar» para el carrusel y «Seguir» vuelve al mismo short, ya del visitante", async ({
  page,
}) => {
  await openHome(page, 1280, 800);
  await expect(hero(page)).toHaveAttribute("data-turn-state", "playing-auto");
  await expectHeroShort(page, FIRST_SHORT);

  await page.getByRole("button", { name: "Pausar", exact: true }).click();
  await expect(hero(page)).toHaveAttribute("data-turn-state", "poster");
  await expect(hero(page).locator("iframe")).toHaveCount(0);
  await expect(hero(page).getByRole("button", { name: /^En pausa · toca para seguir\./ })).toBeVisible();
  // Paused means paused: well past the dwell, fully in view, nothing starts.
  await page.waitForTimeout(1_500);
  await expect(hero(page)).toHaveAttribute("data-turn-state", "poster");
  await expect(autoplaying(page)).toHaveCount(0);

  await page.getByRole("button", { name: "Seguir", exact: true }).click();
  await expect(hero(page)).toHaveAttribute("data-turn-state", "playing-user");
  await expectHeroShort(page, FIRST_SHORT);
  await expect(page.getByRole("button", { name: "Pausar", exact: true })).toBeVisible();
});

test("«Siguiente ›» monta el siguiente short, como del visitante", async ({ page }) => {
  await openHome(page, 1280, 800);
  await expect(hero(page)).toHaveAttribute("data-turn-state", "playing-auto");
  await expectHeroShort(page, FIRST_SHORT);

  await page.getByRole("button", { name: "Siguiente short" }).click();
  await expect(hero(page)).toHaveAttribute("data-turn-state", "playing-user");
  await expectHeroShort(page, SECOND_SHORT);
  await expect(autoplaying(page)).toHaveCount(1);
});

test("sin tocarlo, el temporizador pasa al siguiente short por su cuenta", async ({ page }) => {
  test.setTimeout(90_000);
  await openHome(page, 1280, 800);
  await expect(hero(page)).toHaveAttribute("data-turn-state", "playing-auto");
  await expectHeroShort(page, FIRST_SHORT);

  // Duration + 2.5 s from the iframe's load, plus margin.
  await expect(hero(page).locator("iframe")).toHaveAttribute(
    "src",
    new RegExp(`/embed/${SECOND_SHORT}\\?`),
    { timeout: FIRST_TIMER_MS + 10_000 },
  );
  // A new automatic start: it needed rule 1 again, and it still holds.
  await expect(hero(page)).toHaveAttribute("data-turn-state", "playing-auto");
  await expect(autoplaying(page)).toHaveCount(1);
});

test("un short tocado por dentro es del visitante: el temporizador no lo cambia", async ({ page }) => {
  test.setTimeout(90_000);
  await openHome(page, 1280, 800);
  await expect(hero(page)).toHaveAttribute("data-turn-state", "playing-auto");
  await expectHeroShort(page, FIRST_SHORT);
  const started = Date.now();

  // A tap INSIDE the player (sound, pause, full screen on the real one): the
  // window blurs and the iframe keeps the focus. Nothing is sent to YouTube.
  await page.waitForTimeout(1_500);
  await clickCenter(hero(page).locator("iframe"), page);
  await expect(hero(page)).toHaveAttribute("data-turn-state", "playing-user");

  // Well past the moment the untouched carousel would have moved on.
  await page.waitForTimeout(Math.max(0, FIRST_TIMER_MS + 3_500 - (Date.now() - started)));
  await expect(hero(page)).toHaveAttribute("data-turn-state", "playing-user");
  expect(await heroShortId(page)).toBe(FIRST_SHORT);

  // «Siguiente ›» still moves it on.
  await page.getByRole("button", { name: "Siguiente short" }).click();
  await expectHeroShort(page, SECOND_SHORT);
});

// ── The hidden tab ─────────────────────────────────────────────────────────

test("la pestaña oculta desmonta todo; el automático vuelve solo y el del visitante espera a «Seguir»", async ({
  page,
}) => {
  await openHome(page, 1280, 800);
  await expect(hero(page)).toHaveAttribute("data-turn-state", "playing-auto");

  // Automatic: gone while hidden, back on its own.
  await setTabHidden(page, true);
  await expect(page.locator("iframe")).toHaveCount(0);
  await expect(hero(page)).toHaveAttribute("data-turn-state", "poster");
  await setTabHidden(page, false);
  await expect(hero(page)).toHaveAttribute("data-turn-state", "playing-auto");
  // Every mount is a new iframe that takes the carousel's next short.
  await expectHeroShort(page, SECOND_SHORT);

  // The visitor's: gone while hidden, and back it WAITS, fully in view.
  await page.getByRole("button", { name: "Siguiente short" }).click();
  await expect(hero(page)).toHaveAttribute("data-turn-state", "playing-user");
  await expectHeroShort(page, THIRD_SHORT);
  await setTabHidden(page, true);
  await expect(page.locator("iframe")).toHaveCount(0);
  await setTabHidden(page, false);
  await page.waitForTimeout(1_500);
  await expect(hero(page)).toHaveAttribute("data-turn-state", "poster");
  await expect(autoplaying(page)).toHaveCount(0);
  const seguir = hero(page).getByRole("button", { name: /^Seguir\. Short de la UFC: / });
  await expect(seguir).toBeVisible();

  // Its tap brings back the same short.
  await seguir.click();
  await expect(hero(page)).toHaveAttribute("data-turn-state", "playing-user");
  await expectHeroShort(page, THIRD_SHORT);
});

test("la pestaña oculta también desmonta UFC TV", async ({ page }) => {
  await openHome(page, 1280, 800);
  const block = page.locator("section[data-ufc-tv]");
  await expect(block).toHaveAttribute("data-ufc-tv", "loop");
  await tv(page).evaluate((el) => el.scrollIntoView({ block: "center" }));
  await expect(tv(page)).toHaveAttribute("data-turn-state", "playing-auto");
  await expect(hero(page)).toHaveAttribute("data-turn-state", "poster");

  await setTabHidden(page, true);
  await expect(page.locator("iframe")).toHaveCount(0);
  await setTabHidden(page, false);
  await expect(tv(page)).toHaveAttribute("data-turn-state", "playing-auto");
  await expect(autoplaying(page)).toHaveCount(1);
});

// ── prefers-reduced-motion ─────────────────────────────────────────────────

test("con menos movimiento solo hay pósters, hasta que el visitante toca", async ({ page }) => {
  test.setTimeout(120_000);
  await page.emulateMedia({ reducedMotion: "reduce" });
  await openHome(page, 1280, 800);
  await watchIframes(page);
  await expect(
    hero(page).getByRole("button", { name: /^Toca para reproducir\. Short de la UFC: / }),
  ).toBeVisible();

  // Down the whole page and back: nothing ever starts on its own.
  const maxScroll = await page.evaluate(
    () => document.documentElement.scrollHeight - window.innerHeight,
  );
  for (let y = 0; y <= maxScroll; y += 400) {
    await page.evaluate((top) => window.scrollTo(0, top), y);
    await page.waitForTimeout(500);
  }
  await tv(page).evaluate((el) => el.scrollIntoView({ block: "center" }));
  await page.waitForTimeout(1_000);
  await expect(tv(page)).toHaveAttribute("data-turn-state", "poster");
  await expect(tv(page).getByRole("button", { name: /^Toca para reproducir\. / })).toBeVisible();
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForTimeout(1_000);
  await expect(hero(page)).toHaveAttribute("data-turn-state", "poster");
  expect((await watched(page)).max, "something started on its own with reduced motion").toBe(0);

  // A tap is the visitor's play.
  await hero(page).getByRole("button", { name: /^Toca para reproducir\./ }).click();
  await expect(hero(page)).toHaveAttribute("data-turn-state", "playing-user");
  await expect(autoplaying(page)).toHaveCount(1);
});
