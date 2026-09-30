import { expect, test, type Locator, type Page } from "@playwright/test";

import { fakeYouTubeEmbeds, needsUfcTvLoop } from "./helpers";

// ── The home hero's shorts and the turn manager, in a real browser ─────────
//
// The owner's decision of 30-sep-2026 (night): the hero short NEVER starts on
// its own. The hero shows the poster of the most recent short; a short plays
// only when the visitor taps its ▶ or «Siguiente ›», and when it ends no other
// one starts (its poster shows the next short). UFC TV and the event's live
// broadcast still start on their own when they are seen, and make way when
// the visitor puts a short on: one player at a time.
//
// The rules are unit-tested in src/lib/playback-turn.test.ts and
// src/components/playback/turn-controller.test.ts; this is the other half:
// that the SERVED home page, with its real header, grid and streaming, keeps
// them (YouTube RMF and Developer Policies, DECISIONS.md 29-sep-2026):
//   · scrolling in jumps, at five viewports: the hero never mounts anything on
//     its own; never two autoplaying iframes at once (also watched between
//     stops), never an AUTOMATIC one with half or less in view below the
//     sticky header, never one under 200x200; and UFC TV does start alone;
//   · the ▶ plays the poster's short, «Siguiente ›» the one after the last
//     one played, and a short that ends untouched goes back to the poster of
//     the next one, which «Siguiente ›» plays too (none is skipped); one the
//     visitor touched INSIDE stays at its end;
//   · the ▶ works during the hero's entrance, with the headline's font still
//     on its way (until 30-sep-2026 it did nothing then);
//   · UFC TV makes way when the visitor puts a short on, and starts on its own
//     again when that short ends untouched, if it is seen;
//   · a hidden tab, a pagehide (the back/forward cache) and the mobile menu
//     take away the AUTOMATIC player only: what the visitor chose (a tap on a
//     poster, or inside a player) stays, also out of view as in PiP, and
//     nothing starts on its own meanwhile (DECISIONS.md, 30-sep-2026);
//   · prefers-reduced-motion: only posters, until a tap.
//
// No network: the shorts are canned (UFC_SHORTS_FIXTURE=list, ids
// «fixShort-NN», fixShort-01 lasts 15 s) and so is UFC TV (UFC_TV_FIXTURE=
// loop); every iframe loads the fake YouTube of e2e/helpers.ts. The live strip
// depends on the real calendar and is switched off. 🪤 Whether the home shows
// UFC TV at all is the PRODUCTION base's call: the tests that need it skip,
// with the reason, when it does not (needsUfcTvLoop).
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
// The frame's column (HeroFrame): it carries the entrance animation.
const heroFrame = (page: Page) => page.getByTestId("hero-short").locator("..");
// The poster's ▶ once React runs: before, it is a plain link to YouTube.
const heroPoster = (page: Page) =>
  hero(page).getByRole("button", { name: /^Toca para (ver|reproducir)\. Short de la UFC: / });
const nextButton = (page: Page) => page.getByRole("button", { name: "Siguiente short" });

async function heroShortId(page: Page): Promise<string | null> {
  const src = await hero(page).locator("iframe").getAttribute("src");
  return src ? new URL(src).pathname.split("/").pop() ?? null : null;
}

async function expectHeroShort(page: Page, id: string) {
  await expect(hero(page).locator("iframe")).toHaveAttribute("src", new RegExp(`/embed/${id}\\?`));
}

/** The short the poster shows: its link goes to that short on YouTube. */
async function expectHeroPosterShows(page: Page, id: string) {
  await expect(hero(page).locator(":scope > a")).toHaveAttribute(
    "href",
    `https://www.youtube.com/shorts/${id}`,
  );
}

/** Load the home page at this size and wait for the hero's frame. */
async function openHome(page: Page, width: number, height: number) {
  await page.setViewportSize({ width, height });
  await page.goto("/");
  await expect(hero(page)).toBeVisible();
}

// Counts autoplaying iframes, and the hero's, on EVERY DOM change (and every
// 40 ms), so a player mounted for a moment between two checks is caught too.
async function watchIframes(page: Page) {
  await page.evaluate(() => {
    const w = window as unknown as { __maxIframes: number; __heroIframes: number; __samples: number };
    w.__maxIframes = 0;
    w.__heroIframes = 0;
    w.__samples = 0;
    const count = () => {
      const n = document.querySelectorAll('iframe[src*="autoplay=1"]').length;
      const inHero = document.querySelectorAll('[data-turn="hero"] iframe').length;
      w.__maxIframes = Math.max(w.__maxIframes, n);
      w.__heroIframes = Math.max(w.__heroIframes, inHero);
      w.__samples += 1;
    };
    new MutationObserver(count).observe(document.body, { childList: true, subtree: true });
    window.setInterval(count, 40);
    count();
  });
}

async function watched(page: Page): Promise<{ max: number; hero: number; samples: number }> {
  return page.evaluate(() => {
    const w = window as unknown as { __maxIframes: number; __heroIframes: number; __samples: number };
    return { max: w.__maxIframes, hero: w.__heroIframes, samples: w.__samples };
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

// The page going into the back/forward cache and coming back as it was
// (persisted: true), dispatched to the provider's real listeners. Playwright's
// Chromium runs without that cache, so a real round trip cannot be made here.
async function pageTransition(page: Page, type: "pagehide" | "pageshow") {
  await page.evaluate((name) => {
    window.dispatchEvent(new PageTransitionEvent(name, { persisted: true }));
  }, type);
}

async function clickCenter(locator: Locator, page: Page) {
  const box = await locator.boundingBox();
  expect(box, "no box to click").not.toBeNull();
  await page.mouse.click(box!.x + box!.width / 2, box!.y + box!.height / 2);
}

// Marks the slot's current <iframe>. A remount is a NEW iframe (TurnSlot keys
// it on mountCount), so a marked one still there means it was never removed:
// the video, its sound or its PiP window went on.
async function markIframe(slot: Locator) {
  await slot.locator("iframe").evaluate((el) => el.setAttribute("data-e2e-mark", "same"));
}

function markedIframe(slot: Locator) {
  return slot.locator('iframe[data-e2e-mark="same"]');
}

// ── Scrolling in jumps (maqueta-shorts/pruebas/saltos.js) ──────────────────

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
  test(`a saltos a ${width}x${height}: el short del hero nunca arranca solo; UFC TV sí, con más de la mitad a la vista; uno a la vez, nunca bajo 200x200`, async ({
    page,
  }) => {
    test.setTimeout(240_000);
    await openHome(page, width, height);
    await needsUfcTvLoop(page);
    await watchIframes(page);
    // The hero is on the first screen at every one of these sizes, fully in
    // view for far longer than the dwell: it stays its poster.
    await page.waitForTimeout(1_500);
    await expect(hero(page)).toHaveAttribute("data-turn-state", "poster");

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
        if (f.turn === "hero") violations.push(`y=${y}: el short del hero montado sin que nadie lo pulsara`);
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
        `vistos ${[...seen].join(", ") || "ninguno"}, vigilante ${watch.max} máx y ` +
        `${watch.hero} del hero en ${watch.samples} muestras`,
    });
    expect(violations, violations.join("\n")).toEqual([]);
    expect(watch.samples, "the iframe watcher never ran").toBeGreaterThan(0);
    expect(watch.max, "two autoplaying iframes at once between two stops").toBeLessThanOrEqual(1);
    expect(watch.hero, "the hero mounted a short on its own between two stops").toBe(0);
    // UFC TV did play on the way, on its own: a run that mounted nothing at
    // all would pass every check above.
    expect(autoStops, "no automatic player at any stop").toBeGreaterThan(0);
    expect([...seen], "UFC TV never played on its own").toContain("tv-bucle:playing-auto");
  });
}

// ── The hero: its poster, its ▶, «Siguiente ›», the end of a short ──────────

test("al cargar, el hero enseña el póster del short más reciente y no monta nada, aunque se quede a la vista", async ({
  page,
}) => {
  await openHome(page, 1280, 800);
  await watchIframes(page);
  // Hydrated: the ▶ plays here, so it is announced as a button.
  await expect(heroPoster(page)).toBeVisible();
  await expect(heroPoster(page)).toHaveAccessibleName(/Short de la UFC: Fixture short one/);
  await expectHeroPosterShows(page, FIRST_SHORT);
  // Far longer than the 400 ms dwell, fully in view.
  await page.waitForTimeout(3_000);
  await expect(hero(page)).toHaveAttribute("data-turn-state", "poster");
  await expect(hero(page).locator("iframe")).toHaveCount(0);
  expect((await watched(page)).hero, "the hero mounted a short on its own").toBe(0);
  // «Siguiente ›» is shown once React runs (before, it would do nothing).
  await expect(nextButton(page)).toBeVisible();
});

test("pulsar el ▶ reproduce aquí el short del póster, del visitante y sin sonido (mute=1, medido)", async ({
  page,
}) => {
  await openHome(page, 1280, 800);
  await heroPoster(page).click();
  await expect(hero(page)).toHaveAttribute("data-turn-state", "playing-user");
  await expectHeroShort(page, FIRST_SHORT);
  const src = new URL((await hero(page).locator("iframe").getAttribute("src"))!);
  // mute=1: measured on 30-sep-2026 with the real YouTube, a strict autoplay
  // policy leaves an unmuted short black and stopped after the tap.
  expect(Object.fromEntries(src.searchParams)).toEqual({ autoplay: "1", mute: "1", playsinline: "1" });
  await expect(autoplaying(page)).toHaveCount(1);
  // Nothing animates over the player: the frame dropped its entrance class.
  await expect(heroFrame(page)).not.toHaveClass(/animate-rise/);
});

test("«Siguiente ›» reproduce el siguiente: al entrar, el de después del que enseña el póster; con uno sonando, el de después de ese", async ({
  page,
}) => {
  await openHome(page, 1280, 800);
  await expectHeroPosterShows(page, FIRST_SHORT);
  await nextButton(page).click();
  await expect(hero(page)).toHaveAttribute("data-turn-state", "playing-user");
  await expectHeroShort(page, SECOND_SHORT);
  await nextButton(page).click();
  await expectHeroShort(page, THIRD_SHORT);
  await expect(hero(page)).toHaveAttribute("data-turn-state", "playing-user");
  await expect(autoplaying(page)).toHaveCount(1);
});

test("al acabar un short sin tocarlo, vuelve al póster, que enseña el siguiente, y el hero no arranca nada solo", async ({
  page,
}) => {
  test.setTimeout(90_000);
  await openHome(page, 1280, 800);
  await heroPoster(page).click();
  await expectHeroShort(page, FIRST_SHORT);

  // Its timer: 15 s + 2.5 s from the iframe's load, plus margin. Until
  // 30-sep-2026 the next short started here on its own ("playing-auto").
  await expect(hero(page)).toHaveAttribute("data-turn-state", "poster", {
    timeout: FIRST_TIMER_MS + 10_000,
  });
  await expectHeroPosterShows(page, SECOND_SHORT);
  await expect(heroPoster(page)).toHaveAccessibleName(/Fixture short two/);
  // Fully in view for far longer than the dwell: nothing starts, and the
  // entrance animation does not replay.
  await page.waitForTimeout(3_000);
  await expect(hero(page)).toHaveAttribute("data-turn-state", "poster");
  await expect(hero(page).locator("iframe")).toHaveCount(0);
  await expect(heroFrame(page)).not.toHaveClass(/animate-rise/);

  // Its ▶ plays the one it shows.
  await heroPoster(page).click();
  await expectHeroShort(page, SECOND_SHORT);
});

// What the owner was told on 30-sep-2026 (night): when a short ends nothing
// starts, and to see more the visitor taps «Siguiente ›», which plays the
// next one. Until the review of that night it played the one AFTER the
// poster's, so letting each short end and tapping it skipped every other one.
test("al acabar un short, «Siguiente ›» reproduce el que enseña el póster, el siguiente: no se salta ninguno", async ({
  page,
}) => {
  test.setTimeout(90_000);
  await openHome(page, 1280, 800);
  await heroPoster(page).click();
  await expectHeroShort(page, FIRST_SHORT);
  await expect(hero(page)).toHaveAttribute("data-turn-state", "poster", {
    timeout: FIRST_TIMER_MS + 10_000,
  });
  await expectHeroPosterShows(page, SECOND_SHORT);

  await nextButton(page).click();
  await expect(hero(page)).toHaveAttribute("data-turn-state", "playing-user");
  await expectHeroShort(page, SECOND_SHORT);
  // And with that one playing, the one after it.
  await nextButton(page).click();
  await expectHeroShort(page, THIRD_SHORT);
  await expect(autoplaying(page)).toHaveCount(1);
});

test("un short tocado por dentro es del visitante: al acabar se queda como estaba", async ({ page }) => {
  test.setTimeout(90_000);
  await openHome(page, 1280, 800);
  await heroPoster(page).click();
  await expectHeroShort(page, FIRST_SHORT);
  const started = Date.now();

  // A tap INSIDE the player (sound, pause, full screen on the real one): the
  // window blurs and the iframe keeps the focus. Nothing is sent to YouTube.
  await page.waitForTimeout(1_500);
  await clickCenter(hero(page).locator("iframe"), page);
  await markIframe(hero(page));

  // Well past the moment an untouched short goes back to its poster.
  await page.waitForTimeout(Math.max(0, FIRST_TIMER_MS + 3_500 - (Date.now() - started)));
  await expect(hero(page)).toHaveAttribute("data-turn-state", "playing-user");
  await expect(markedIframe(hero(page))).toHaveCount(1);
  expect(await heroShortId(page)).toBe(FIRST_SHORT);

  // «Siguiente ›» still moves it on.
  await nextButton(page).click();
  await expectHeroShort(page, SECOND_SHORT);
});

// Until 30-sep-2026 the hero took no start until its headline's font had
// loaded and its entrance animation was over (up to 1.5 s, or the font's
// download on a slow network): the ▶ answered "not-ready" and did nothing.
// Now the poster is THE way to watch a short, and a tap never waits.
test("el ▶ del short funciona durante la entrada del hero, con la fuente del titular aún sin llegar", async ({
  page,
}) => {
  // The headline's font never arrives (a slow network)...
  await page.route(/\/_next\/static\/media\/[^/]+\.woff2$/, () => {
    // Never answered: document.fonts stays "loading".
  });
  // ...and the entrance animation lasts two minutes instead of 0.7 s.
  await page.addInitScript(() => {
    const add = () => {
      const style = document.createElement("style");
      style.textContent = ".animate-rise{animation-duration:120s!important}";
      document.head.append(style);
    };
    if (document.head) {
      add();
      return;
    }
    new MutationObserver((_, observer) => {
      if (!document.head) return;
      observer.disconnect();
      add();
    }).observe(document, { childList: true, subtree: true });
  });
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto("/", { waitUntil: "domcontentloaded" });

  // Hydrated (the poster is a button), and still in the entrance.
  const poster = heroPoster(page);
  await expect(poster).toBeVisible();
  await expect(heroFrame(page)).toHaveClass(/animate-rise/);
  expect(
    await heroFrame(page).evaluate((el) => el.getAnimations().some((a) => a.playState === "running")),
    "the entrance animation is not running any more",
  ).toBe(true);
  expect(await page.evaluate(() => document.fonts.status), "the headline's font arrived").toBe("loading");

  // A real tap on a poster still rising (a locator click would wait for it
  // to stop moving).
  await clickCenter(poster, page);
  await expect(hero(page)).toHaveAttribute("data-turn-state", "playing-user");
  await expectHeroShort(page, FIRST_SHORT);
  // Nothing animates over the player: the frame dropped the class at once.
  await expect(heroFrame(page)).not.toHaveClass(/animate-rise/);
});

// ── UFC TV and the visitor's short: one at a time ──────────────────────────
//
// UFC TV and the event's live broadcast are the same player
// (live-embed-player.tsx), so UFC TV stands for the Saturday broadcast here.

test("UFC TV arranca solo cuando se ve, se aparta si el visitante pone un short, y vuelve solo cuando ese short acaba sin tocarlo", async ({
  page,
}) => {
  test.setTimeout(90_000);
  // Tall enough to see the hero and UFC TV at once, with no scroll.
  await openHome(page, 1280, 2400);
  await needsUfcTvLoop(page);
  await watchIframes(page);
  await expect(tv(page)).toHaveAttribute("data-turn-state", "playing-auto");
  await expect(hero(page)).toHaveAttribute("data-turn-state", "poster");

  await heroPoster(page).click();
  await expect(hero(page)).toHaveAttribute("data-turn-state", "playing-user");
  await expect(tv(page)).toHaveAttribute("data-turn-state", "poster");
  // Fully in view for far longer than the dwell, UFC TV waits: the short is
  // the visitor's.
  await page.waitForTimeout(2_000);
  await expect(tv(page)).toHaveAttribute("data-turn-state", "poster");
  await expect(autoplaying(page)).toHaveCount(1);

  // The short ends untouched: back to its poster, and UFC TV, in view, starts
  // on its own in the same render.
  await expect(tv(page)).toHaveAttribute("data-turn-state", "playing-auto", {
    timeout: FIRST_TIMER_MS + 10_000,
  });
  await expect(hero(page)).toHaveAttribute("data-turn-state", "poster");
  await expectHeroPosterShows(page, SECOND_SHORT);
  await expect(autoplaying(page)).toHaveCount(1);
  const watch = await watched(page);
  expect(watch.max, "two autoplaying iframes at once").toBeLessThanOrEqual(1);
});

test("el short que el visitante pone sigue montado fuera de la vista, y UFC TV espera con su ▶ hasta que lo elige", async ({
  page,
}) => {
  await openHome(page, 1280, 800);
  await needsUfcTvLoop(page);
  await nextButton(page).click();
  await expect(hero(page)).toHaveAttribute("data-turn-state", "playing-user");
  await expectHeroShort(page, SECOND_SHORT);
  await markIframe(hero(page));

  // Out of view, as when the visitor scrolls with the short in PiP: it stays,
  // and UFC TV, fully in view for far longer than the dwell, does not start.
  await tv(page).evaluate((el) => el.scrollIntoView({ block: "center" }));
  await page.waitForTimeout(1_500);
  await expect(markedIframe(hero(page))).toHaveCount(1);
  await expect(hero(page)).toHaveAttribute("data-turn-state", "playing-user");
  await expect(tv(page)).toHaveAttribute("data-turn-state", "poster");
  await expect(autoplaying(page)).toHaveCount(1);

  // Picking UFC TV is picking another player: the short goes, one at a time.
  await tv(page).getByRole("button", { name: /^Toca para ver\. UFC TV/ }).click();
  await expect(tv(page)).toHaveAttribute("data-turn-state", "playing-user");
  await expect(hero(page)).toHaveAttribute("data-turn-state", "poster");
  await expect(autoplaying(page)).toHaveCount(1);
});

test("UFC TV tocado por dentro es del visitante: sigue con la pestaña oculta y fuera de la vista, hasta que pone un short", async ({
  page,
}) => {
  await openHome(page, 1280, 800);
  await needsUfcTvLoop(page);
  await tv(page).evaluate((el) => el.scrollIntoView({ block: "center" }));
  await expect(tv(page)).toHaveAttribute("data-turn-state", "playing-auto");
  // A tap INSIDE the automatic player (sound, full screen, PiP on the real one).
  await clickCenter(tv(page).locator("iframe"), page);
  await expect(tv(page)).toHaveAttribute("data-turn-state", "playing-user");
  await markIframe(tv(page));

  await setTabHidden(page, true);
  await page.waitForTimeout(1_500);
  await expect(markedIframe(tv(page))).toHaveCount(1);
  await setTabHidden(page, false);

  // Back to the top: UFC TV out of view, the hero fully in view.
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForTimeout(1_500);
  await expect(markedIframe(tv(page))).toHaveCount(1);
  await expect(hero(page)).toHaveAttribute("data-turn-state", "poster");
  await expect(autoplaying(page)).toHaveCount(1);

  // The visitor picks the short: UFC TV goes.
  await heroPoster(page).click();
  await expect(hero(page)).toHaveAttribute("data-turn-state", "playing-user");
  await expect(tv(page)).toHaveAttribute("data-turn-state", "poster");
  await expect(autoplaying(page)).toHaveCount(1);
});

// ── The hidden tab and the back/forward cache ──────────────────────────────

test("la pestaña oculta quita UFC TV, que vuelve solo; el short que puso el visitante sigue montado, el mismo iframe", async ({
  page,
}) => {
  await openHome(page, 1280, 800);
  await needsUfcTvLoop(page);

  // Automatic: gone while hidden, back on its own.
  await tv(page).evaluate((el) => el.scrollIntoView({ block: "center" }));
  await expect(tv(page)).toHaveAttribute("data-turn-state", "playing-auto");
  await setTabHidden(page, true);
  await expect(page.locator("iframe")).toHaveCount(0);
  await expect(tv(page)).toHaveAttribute("data-turn-state", "poster");
  await setTabHidden(page, false);
  await expect(tv(page)).toHaveAttribute("data-turn-state", "playing-auto");

  // The visitor's short: it stays while hidden (sound in the background,
  // PiP), and it is the same iframe when the tab comes back.
  await page.evaluate(() => window.scrollTo(0, 0));
  await heroPoster(page).click();
  await expect(hero(page)).toHaveAttribute("data-turn-state", "playing-user");
  await expectHeroShort(page, FIRST_SHORT);
  await markIframe(hero(page));
  await setTabHidden(page, true);
  await page.waitForTimeout(1_500);
  await expect(hero(page)).toHaveAttribute("data-turn-state", "playing-user");
  await expect(markedIframe(hero(page))).toHaveCount(1);
  await setTabHidden(page, false);
  await page.waitForTimeout(1_000);
  await expect(markedIframe(hero(page))).toHaveCount(1);
  await expect(autoplaying(page)).toHaveCount(1);
});

// A pagehide that is not a real unload: the page goes into the back/forward
// cache and may come back as it was. It is a hidden tab and nothing more.
test("un pagehide hacia la caché de atrás/adelante solo quita el automático: UFC TV tocado por dentro sigue, el mismo iframe", async ({
  page,
}) => {
  await openHome(page, 1280, 800);
  await needsUfcTvLoop(page);
  await tv(page).evaluate((el) => el.scrollIntoView({ block: "center" }));
  await expect(tv(page)).toHaveAttribute("data-turn-state", "playing-auto");

  // Automatic: gone on pagehide, back on its own on pageshow.
  await pageTransition(page, "pagehide");
  await expect(page.locator("iframe")).toHaveCount(0);
  await expect(tv(page)).toHaveAttribute("data-turn-state", "poster");
  await pageTransition(page, "pageshow");
  await expect(tv(page)).toHaveAttribute("data-turn-state", "playing-auto");

  // Touched inside: the same iframe through pagehide and pageshow.
  await clickCenter(tv(page).locator("iframe"), page);
  await expect(tv(page)).toHaveAttribute("data-turn-state", "playing-user");
  await markIframe(tv(page));
  await pageTransition(page, "pagehide");
  await page.waitForTimeout(1_500);
  await expect(tv(page)).toHaveAttribute("data-turn-state", "playing-user");
  await expect(markedIframe(tv(page))).toHaveCount(1);
  await pageTransition(page, "pageshow");
  await page.waitForTimeout(1_000);
  await expect(markedIframe(tv(page))).toHaveCount(1);
  await expect(autoplaying(page)).toHaveCount(1);
});

// ── The mobile menu (site-header.tsx, a blocker of the turn manager) ───────

test("a 390 px, el menú móvil quita UFC TV (automático), que vuelve al cerrarlo, pero no el short que el visitante puso", async ({
  page,
}) => {
  await openHome(page, 390, 844);
  await needsUfcTvLoop(page);
  // By aria-controls: its name goes from «Abrir menú» to «Cerrar menú».
  const hamburger = page.locator('button[aria-controls="mobile-nav"]');
  const menu = page.locator("#mobile-nav");

  // Automatic: the open menu takes it away; closed, it comes back on its own.
  await tv(page).evaluate((el) => el.scrollIntoView({ block: "center" }));
  await expect(tv(page)).toHaveAttribute("data-turn-state", "playing-auto");
  await hamburger.click();
  await expect(menu).toBeVisible();
  await expect(tv(page)).toHaveAttribute("data-turn-state", "poster");
  await expect(page.locator("iframe")).toHaveCount(0);
  await hamburger.click();
  await expect(menu).toBeHidden();
  await expect(tv(page)).toHaveAttribute("data-turn-state", "playing-auto");

  // The visitor's short: the menu leaves it playing, the same iframe, open
  // and closed.
  await page.evaluate(() => window.scrollTo(0, 0));
  await heroPoster(page).click();
  await expect(hero(page)).toHaveAttribute("data-turn-state", "playing-user");
  await markIframe(hero(page));
  await hamburger.click();
  await expect(menu).toBeVisible();
  await page.waitForTimeout(1_000);
  await expect(hero(page)).toHaveAttribute("data-turn-state", "playing-user");
  await expect(markedIframe(hero(page))).toHaveCount(1);
  await page.keyboard.press("Escape");
  await expect(menu).toBeHidden();
  await expect(markedIframe(hero(page))).toHaveCount(1);
  await expect(autoplaying(page)).toHaveCount(1);
});

// ── prefers-reduced-motion ─────────────────────────────────────────────────

test("con menos movimiento solo hay pósters, hasta que el visitante toca", async ({ page }) => {
  test.setTimeout(120_000);
  await page.emulateMedia({ reducedMotion: "reduce" });
  await openHome(page, 1280, 800);
  await needsUfcTvLoop(page);
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

// ── The keyboard focus ring on the posters (WCAG 2.4.7) ────────────────────
//
// The ▶ poster fills its TurnSlot box, and that box clips (overflow-hidden).
// The global :focus-visible ring (globals.css) is drawn 2 px OUTSIDE the
// element, so on these posters it was clipped away whole: focused, matching
// :focus-visible, and nothing on screen. The hero's poster is the only way to
// start a short, so the ring has to be drawn INSIDE the box. Checked on the
// painted pixels, not on the CSS.

/** Share of each edge of the box that has ring-red pixels in its 4 px band. */
async function ringCoverage(page: Page, slot: Locator) {
  const png = (await slot.screenshot()).toString("base64");
  return page.evaluate(async (data) => {
    const img = new Image();
    img.src = `data:image/png;base64,${data}`;
    await img.decode();
    const canvas = document.createElement("canvas");
    canvas.width = img.width;
    canvas.height = img.height;
    const ctx = canvas.getContext("2d")!;
    ctx.drawImage(img, 0, 0);
    const { data: px, width, height } = ctx.getImageData(0, 0, img.width, img.height);
    // --ring: #d20a0a in the light theme.
    const red = (x: number, y: number) => {
      const i = (y * width + x) * 4;
      return px[i] > 150 && px[i + 1] < 90 && px[i + 2] < 90;
    };
    const BAND = 4;
    const edge = (length: number, at: (pos: number, depth: number) => [number, number]) => {
      let hit = 0;
      for (let pos = 0; pos < length; pos += 1) {
        for (let d = 0; d < BAND; d += 1) {
          const [x, y] = at(pos, d);
          if (red(x, y)) {
            hit += 1;
            break;
          }
        }
      }
      return hit / length;
    };
    return Math.min(
      edge(width, (x, d) => [x, d]),
      edge(width, (x, d) => [x, height - 1 - d]),
      edge(height, (y, d) => [d, y]),
      edge(height, (y, d) => [width - 1 - d, y]),
    );
  }, png);
}

async function focusByKeyboard(page: Page, button: Locator) {
  await button.focus();
  await page.keyboard.press("Shift+Tab");
  await page.keyboard.press("Tab");
  expect(
    await button.evaluate((el) => el === document.activeElement && el.matches(":focus-visible")),
    "the poster did not get the keyboard focus",
  ).toBe(true);
}

test("el anillo del foco del teclado se ve dentro del póster del short y del de UFC TV", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await openHome(page, 1280, 800);
  await needsUfcTvLoop(page);

  for (const slot of [hero(page), tv(page)]) {
    await slot.evaluate((el) => el.scrollIntoView({ block: "center" }));
    await expect(slot).toHaveAttribute("data-turn-state", "poster");
    const button = slot.getByRole("button", { name: /^Toca para reproducir\./ });

    // Unfocused: no red along the edges (so the check below means something).
    expect(await ringCoverage(page, slot), "red on the edges before any focus").toBeLessThan(0.1);

    await focusByKeyboard(page, button);
    expect(
      await ringCoverage(page, slot),
      "the focus ring is not painted inside the box on every edge",
    ).toBeGreaterThan(0.9);
    await button.blur();
  }
});

// «Siguiente ›» is a button outside the frame: the global ring, 2 px outside
// it, is not clipped by anything. Checked with the keyboard, on its style.
test("«Siguiente ›» se alcanza con el teclado y enseña el anillo del foco", async ({ page }) => {
  await openHome(page, 1280, 800);
  const next = nextButton(page);
  await expect(next).toBeVisible();
  await focusByKeyboard(page, next);
  const outline = await next.evaluate((el) => {
    const style = getComputedStyle(el);
    return { style: style.outlineStyle, width: parseFloat(style.outlineWidth) };
  });
  expect(outline.style, "no outline on the focused «Siguiente ›»").not.toBe("none");
  expect(outline.width).toBeGreaterThanOrEqual(2);
  // Enter plays the next short, as a click does.
  await page.keyboard.press("Enter");
  await expectHeroShort(page, SECOND_SHORT);
});
