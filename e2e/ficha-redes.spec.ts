import { test as base, expect, type Browser, type Page } from "@playwright/test";

import { expectNoHorizontalOverflow } from "./helpers";

// R6 — Instagram and X on the fighter page, in a real browser (Chromium and
// WebKit, light and dark, 360 to 1920 px).
//
// ⚠️ THE EXPECTATIONS ARE FIXED, NOT READ FROM THE PAGE. An earlier version
// sorted the pages into "with" and "without" profiles by looking at what the
// page itself drew, so against a build without R6 it went green (the "with"
// case skipped and every page counted as "without"). The values below are the
// database's, read-only, on 18-oct-2026 (fighters.instagram_url / x_url, from
// the ufc.com Person.sameAs). If ufc.com changes one, update it here.
//
// ⚠️ WAIT FOR THE PAGE TO SHOW. The fighter page streams: when goto() resolves
// the content is still inside a hidden <div id="S:…"> behind the skeleton, so a
// boundingBox() taken then reads 0×0. Every read waits for the visible h1.

type Engine = "chromium" | "webkit";
type Theme = "light" | "dark";
type Network = "instagram" | "x";

type Expected = {
  id: number;
  name: string;
  links: Array<{ network: Network; href: string }>;
};

const EXPECTED: Expected[] = [
  {
    id: 7029,
    name: "Alexander Volkanovski",
    links: [
      { network: "instagram", href: "https://www.instagram.com/alexvolkanovski/" },
      { network: "x", href: "https://x.com/alexvolkanovski" },
    ],
  },
  // Only Instagram.
  {
    id: 6782,
    name: "Cody Chovancek",
    links: [{ network: "instagram", href: "https://www.instagram.com/chovancekmma/" }],
  },
  // Only X (retired).
  {
    id: 8742,
    name: "Royce Gracie",
    links: [{ network: "x", href: "https://x.com/roycegraciemma" }],
  },
  // None: nothing drawn, nothing published.
  { id: 4361, name: "Cristian Perez", links: [] },
];

const LABEL: Record<Network, string> = { instagram: "Instagram", x: "X" };

// The owner's QA widths.
const WIDTHS = [360, 390, 768, 1024, 1280, 1920];

// Any link to those networks, in whatever form, anywhere in the page.
const ANY_SOCIAL =
  'a[href*="instagram.com"], a[href*="//x.com"], a[href*="twitter.com"]';

const test = base.extend<
  { engine: Engine; theme: Theme; page2: Page },
  { launchWebkit: () => Promise<Browser> }
>({
  engine: ["chromium", { option: true }],
  theme: ["light", { option: true }],
  // WebKit is launched by hand, once per worker: the projects in
  // playwright.config.ts are all Chromium.
  launchWebkit: [
    async ({ playwright }, provide) => {
      const launched: { webkit: Browser | null } = { webkit: null };
      await provide(async () => {
        launched.webkit ??= await playwright.webkit.launch().catch((error: unknown) => {
          throw new Error(
            `No arranca WebKit: instálalo con «npx playwright install webkit». (${String(error)})`,
          );
        });
        return launched.webkit;
      });
      await launched.webkit?.close();
    },
    { scope: "worker" },
  ],
  // Fresh context per test and no service worker: the PWA's one serves stale CSS.
  page2: async ({ engine, theme, browser, launchWebkit, baseURL }, provide) => {
    const navigator = engine === "webkit" ? await launchWebkit() : browser;
    const context = await navigator.newContext({
      baseURL,
      serviceWorkers: "block",
      colorScheme: theme,
    });
    const page = await context.newPage();
    // The live strip depends on the real calendar.
    await page.route("**/api/live/now", (route) =>
      route.fulfill({ status: 200, json: { phase: "none" } }),
    );
    await provide(page);
    await context.close();
  },
});

// Each test sets its own engine, theme and widths: one project is enough
// (the megatest runs all six).
test.beforeEach(({}, testInfo) => {
  test.skip(
    testInfo.project.name !== "escritorio-light",
    "cada test fija su motor, su tema y sus anchos: basta un proyecto",
  );
});

async function openFighter(page: Page, fighter: Expected): Promise<void> {
  const response = await page.goto(`/fighters/${fighter.id}`);
  expect(response?.status(), `/fighters/${fighter.id} responde`).toBe(200);
  // Streaming: wait until the content replaces the skeleton.
  const heading = page.locator("h1").first();
  await expect(heading).toBeVisible();
  await expect(heading).toContainText(fighter.name);
}

async function readSameAs(page: Page): Promise<string[] | null | "no-person"> {
  return page.evaluate(() => {
    for (const script of document.querySelectorAll('script[type="application/ld+json"]')) {
      try {
        const data = JSON.parse(script.textContent ?? "") as {
          "@type"?: string;
          sameAs?: string[];
        };
        if (data["@type"] === "Person") return data.sameAs ?? null;
      } catch {
        // Not ours.
      }
    }
    return "no-person" as const;
  });
}

async function expectSocials(page: Page, fighter: Expected): Promise<void> {
  const where = `/fighters/${fighter.id} (${fighter.name})`;
  const list = page.getByTestId("fighter-social-links");
  const sameAs = await readSameAs(page);
  expect(sameAs, `${where}: la ficha emite su Person`).not.toBe("no-person");

  if (fighter.links.length === 0) {
    await expect(list, `${where}: sin redes no se pinta la fila`).toHaveCount(0);
    await expect(page.locator(ANY_SOCIAL), `${where}: ningún enlace a esas redes`).toHaveCount(0);
    expect(sameAs, `${where}: sin sameAs en el JSON-LD`).toBeNull();
    return;
  }

  await expect(list, `${where}: una sola fila de redes`).toHaveCount(1);
  await expect(list).toBeVisible();
  await expect(list).toHaveAttribute("role", "list");
  await expect(list).toHaveAttribute("aria-label", `Redes sociales de ${fighter.name}`);

  const anchors = list.locator("a");
  await expect(anchors, `${where}: exactamente sus redes`).toHaveCount(fighter.links.length);
  for (const [index, expected] of fighter.links.entries()) {
    const anchor = anchors.nth(index);
    await expect(anchor, `${where}: ${expected.network} en su sitio`).toHaveAttribute(
      "href",
      expected.href,
    );
    await expect(anchor).toHaveAttribute("target", "_blank");
    await expect(anchor).toHaveAttribute("rel", "noopener noreferrer");
    await expect(anchor).toHaveAttribute(
      "aria-label",
      `${LABEL[expected.network]} de ${fighter.name} (se abre en otra pestaña)`,
    );
  }
  // And no other social link anywhere (the @ufc footer trap).
  await expect(page.locator(ANY_SOCIAL), `${where}: solo los de la fila`).toHaveCount(
    fighter.links.length,
  );
  expect(sameAs, `${where}: sameAs = sus redes, en el mismo orden`).toEqual(
    fighter.links.map((link) => link.href),
  );
}

for (const engine of ["chromium", "webkit"] as const) {
  for (const theme of ["light", "dark"] as const) {
    test.describe(`${engine} · ${theme}`, () => {
      test.use({ engine, theme });

      test("cada ficha pinta exactamente las redes de la base y las publica en sameAs", async ({
        page2,
      }) => {
        await page2.setViewportSize({ width: 390, height: 844 });
        for (const fighter of EXPECTED) {
          await openFighter(page2, fighter);
          await expectSocials(page2, fighter);
          await expectNoHorizontalOverflow(page2, `/fighters/${fighter.id} a 390 px (${theme})`);
        }
      });
    });
  }

  test.describe(`${engine} · anchos`, () => {
    test.use({ engine });

    test("de 360 a 1920 px: 44×44 táctiles, bajo el nombre y sin desbordar", async ({ page2 }) => {
      const [volkanovski] = EXPECTED;
      await page2.setViewportSize({ width: WIDTHS[0], height: 900 });
      await openFighter(page2, volkanovski);
      const heading = page2.locator("h1").first();
      const anchors = page2.getByTestId("fighter-social-links").locator("a");
      await expect(anchors).toHaveCount(2);

      for (const width of WIDTHS) {
        await page2.setViewportSize({ width, height: 900 });
        const headingBox = await heading.boundingBox();
        expect(headingBox, `h1 visible a ${width} px`).not.toBeNull();
        for (let index = 0; index < 2; index += 1) {
          await expect(anchors.nth(index)).toBeVisible();
          const box = await anchors.nth(index).boundingBox();
          expect(box, `enlace ${index} medible a ${width} px`).not.toBeNull();
          // 44×44 px hit area on every width.
          expect(box!.width, `ancho táctil a ${width} px`).toBeGreaterThanOrEqual(44);
          expect(box!.height, `alto táctil a ${width} px`).toBeGreaterThanOrEqual(44);
          // Under the name (and so under the nickname and the record).
          expect(box!.y, `los iconos van bajo el nombre a ${width} px`).toBeGreaterThan(
            headingBox!.y + headingBox!.height,
          );
          // Inside the viewport, horizontally.
          expect(box!.x).toBeGreaterThanOrEqual(0);
          expect(box!.x + box!.width).toBeLessThanOrEqual(width);
        }
        await expectNoHorizontalOverflow(page2, `/fighters/7029 a ${width} px`);
      }
    });
  });
}
