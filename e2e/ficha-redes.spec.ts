import { test as base, expect, type Browser, type Page } from "@playwright/test";

import { expectNoHorizontalOverflow } from "./helpers";

// R6 — Instagram and X on the fighter page, in a real browser (Chromium and
// WebKit, at 390 and 1280).
//
// The data is whatever the database has, so both cases are decided per page:
//   · a page WITH profiles: the list, its links and the JSON-LD sameAs agree;
//   · a page WITHOUT them: nothing is drawn and nothing is published.
// Until mma-ingesta's migration 032 and the first fill, no page has profiles
// and the "with" case skips SAYING WHY (the markup of that case is pinned in
// node by src/components/fighter/fighter-social-links.test.ts). A skip without
// a reason would be a hole dressed as green.

type Engine = "chromium" | "webkit";

// Volkanovski (both profiles on ufc.com, 18-oct), Jon Jones, Royce Gracie
// (retired) and ChangHo Lee (no ufc.com data at all: never any profile).
const FIGHTER_IDS = [7029, 7127, 8742, 6324];

const WIDTHS = [390, 1280];

const INSTAGRAM = /^https:\/\/www\.instagram\.com\/[a-z0-9._]{1,30}\/$/;
const X = /^https:\/\/x\.com\/[A-Za-z0-9_]{1,15}$/;
// Any link to those networks, in whatever form, anywhere in the page.
const ANY_SOCIAL =
  'a[href*="instagram.com"], a[href*="//x.com"], a[href*="twitter.com"]';

const test = base.extend<{ engine: Engine; page2: Page }, { launchWebkit: () => Promise<Browser> }>({
  engine: ["chromium", { option: true }],
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
  page2: async ({ engine, browser, launchWebkit, baseURL }, provide) => {
    const navigator = engine === "webkit" ? await launchWebkit() : browser;
    const context = await navigator.newContext({ baseURL, serviceWorkers: "block" });
    const page = await context.newPage();
    // The live strip depends on the real calendar.
    await page.route("**/api/live/now", (route) =>
      route.fulfill({ status: 200, json: { phase: "none" } }),
    );
    await provide(page);
    await context.close();
  },
});

type PageSocials = {
  id: number;
  name: string;
  list: number;
  links: Array<{
    href: string | null;
    target: string | null;
    rel: string | null;
    label: string | null;
    width: number;
    height: number;
  }>;
  anySocial: number;
  sameAs: string[] | null;
};

async function readSocials(page: Page, id: number): Promise<PageSocials> {
  const response = await page.goto(`/fighters/${id}`);
  expect(response?.status(), `/fighters/${id} responde`).toBe(200);
  const name = (await page.locator("h1").first().textContent())?.trim() ?? "";
  const list = page.getByTestId("fighter-social-links");
  const anchors = list.locator("a");
  const links = [];
  for (let index = 0; index < (await anchors.count()); index += 1) {
    const anchor = anchors.nth(index);
    const box = await anchor.boundingBox();
    links.push({
      href: await anchor.getAttribute("href"),
      target: await anchor.getAttribute("target"),
      rel: await anchor.getAttribute("rel"),
      label: await anchor.getAttribute("aria-label"),
      width: box?.width ?? 0,
      height: box?.height ?? 0,
    });
  }
  const sameAs = await page.evaluate(() => {
    for (const script of document.querySelectorAll('script[type="application/ld+json"]')) {
      try {
        const data = JSON.parse(script.textContent ?? "") as { "@type"?: string; sameAs?: string[] };
        if (data["@type"] === "Person") return data.sameAs ?? null;
      } catch {
        // Not ours.
      }
    }
    return null;
  });
  return {
    id,
    name,
    list: await list.count(),
    links,
    anySocial: await page.locator(ANY_SOCIAL).count(),
    sameAs,
  };
}

for (const engine of ["chromium", "webkit"] as const) {
  for (const width of WIDTHS) {
    test.describe(`${engine} · ${width} px`, () => {
      test.use({ engine });

      test("ficha CON redes: pinta los enlaces correctos y los publica en sameAs", async ({
        page2,
      }) => {
        await page2.setViewportSize({ width, height: 900 });
        const withSocials: PageSocials[] = [];
        for (const id of FIGHTER_IDS) {
          const socials = await readSocials(page2, id);
          if (socials.list > 0) withSocials.push(socials);
        }
        test.skip(
          withSocials.length === 0,
          `Ninguna de las fichas ${FIGHTER_IDS.join(", ")} tiene redes: la base aún no tiene ` +
            "instagram_url/x_url (migración 032 de mma-ingesta sin aplicar o sin el primer " +
            "relleno). El marcado de este caso lo fija fighter-social-links.test.ts.",
        );

        for (const socials of withSocials) {
          const where = `/fighters/${socials.id} (${socials.name})`;
          expect(socials.list, `${where}: una sola lista`).toBe(1);
          expect(socials.links.length, `${where}: Instagram y/o X`).toBeGreaterThan(0);
          expect(socials.links.length).toBeLessThanOrEqual(2);
          for (const link of socials.links) {
            const network = link.href && INSTAGRAM.test(link.href) ? "Instagram" : "X";
            expect(
              link.href && (INSTAGRAM.test(link.href) || X.test(link.href)),
              `${where}: ${link.href} tiene la forma guardada`,
            ).toBeTruthy();
            expect(link.target, where).toBe("_blank");
            expect(link.rel, where).toBe("noopener noreferrer");
            expect(link.label, where).toBe(`${network} de ${socials.name}`);
            // 44×44 px hit area.
            expect(link.width, `${where}: ancho táctil`).toBeGreaterThanOrEqual(44);
            expect(link.height, `${where}: alto táctil`).toBeGreaterThanOrEqual(44);
          }
          // Instagram first; and no other social link anywhere (the @ufc trap).
          if (socials.links.length === 2) {
            expect(socials.links[0].href, `${where}: Instagram primero`).toMatch(INSTAGRAM);
            expect(socials.links[1].href, `${where}: X después`).toMatch(X);
          }
          expect(socials.anySocial, `${where}: solo los de la lista`).toBe(socials.links.length);
          expect(socials.sameAs, `${where}: sameAs = los enlaces pintados`).toEqual(
            socials.links.map((link) => link.href),
          );
        }
        await expectNoHorizontalOverflow(page2, `ficha con redes a ${width} px`);
      });

      test("ficha SIN redes: no pinta nada y no publica sameAs", async ({ page2 }) => {
        await page2.setViewportSize({ width, height: 900 });
        const without: PageSocials[] = [];
        for (const id of FIGHTER_IDS) {
          const socials = await readSocials(page2, id);
          if (socials.list === 0) without.push(socials);
        }
        test.skip(
          without.length === 0,
          `Todas las fichas ${FIGHTER_IDS.join(", ")} tienen redes: ChangHo Lee (6324) no ` +
            "tiene datos de ufc.com, revisa de dónde le han llegado.",
        );

        for (const socials of without) {
          const where = `/fighters/${socials.id} (${socials.name})`;
          expect(socials.links, where).toEqual([]);
          expect(socials.anySocial, `${where}: ningún enlace a Instagram, X o Twitter`).toBe(0);
          expect(socials.sameAs, `${where}: sin sameAs en el JSON-LD`).toBeNull();
        }
        await expectNoHorizontalOverflow(page2, `ficha sin redes a ${width} px`);
      });
    });
  }
}
