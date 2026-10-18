import { readFileSync } from "node:fs";
import path from "node:path";

import { expect, test as base, type Browser, type Page } from "@playwright/test";

// ── R5: caras más nítidas (aprobado por el dueño el 18-oct-2026) ──────────
//
// Las caras de ufc.com que guardamos son el estilo
// event_results_athlete_headshot, de 256×160. Detrás, en la MISMA ruta sin
// «/styles/<estilo>/s3», está el original de 500×325 o 520×325
// (src/lib/headshot-hd.ts). La URL se cambia AL PINTARLA, sin tocar la base.
// Lo que se vigila aquí, que es lo que decidió el dueño:
//   · La versión grande SOLO donde la cara se ve grande: las tarjetas de
//     /fighters (con srcset, así que un móvil 1x sigue bajando la de 256) y la
//     cara grande de la ficha (xl).
//   · 🪤 La reserva EN CADENA: si el original falla, vuelve la cara guardada,
//     NO la silueta. Antes de R5, un fallo saltaba directo a la silueta.
//   · Las caras pequeñas (filas de evento) siguen con la de 256: el peso de
//     una velada no sube.
//
// 🪤 Las fotos externas se sirven ENLATADAS con su medida real (256×160 la
// guardada y 500×325 el original), y el original se reconoce por la URL: un
// /images/ de ufc.com SIN /styles/.
//
// Corre en Chromium Y en WebKit (el dueño mira en un iPhone). Un solo proyecto
// (escritorio-light): cada test fija su pantalla y su densidad de píxeles.

type Motor = "chromium" | "webkit";
type Pantalla = { width: number; height: number; dpr: number };
type Abrir = (pantalla: Pantalla, opciones?: { originalRoto?: boolean }) => Promise<Page>;

const FIXTURES = path.join(__dirname, "fixtures");
const FOTO_GUARDADA = readFileSync(path.join(FIXTURES, "luchadores-headshot-256x160.png"));
const FOTO_ORIGINAL = readFileSync(path.join(FIXTURES, "headshot-hd-500x325.png"));
const FOTO_ESPN = readFileSync(path.join(FIXTURES, "careo-headshot.png"));

// El original: /images/ de ufc.com sin /styles/ (2026-05/… o image/fighter_images/…).
const ORIGINAL = /^https:\/\/www\.ufc\.com\/images\/(?!styles\/)(\d{4}-\d{2}|image)\//;
const GUARDADA = /\/images\/styles\/event_results_athlete_headshot\//;

// Heath Herring: cara de ufc.com (estilo event_results, con «&amp;» en la URL
// guardada) y SIN foto de cuerpo, así que su ficha pinta la cara grande (xl).
// Consulta de solo lectura del 18-oct-2026.
const FICHA_SIN_CUERPO = "/fighters/8638";
// Una velada con cartelera completa: 26 caras pequeñas (size sm).
const EVENTO = "/eventos/1089";

const test = base.extend<
  { motor: Motor; abrir: Abrir; pedidas: { original: string[]; abortadas: string[] } },
  { abrirWebkit: () => Promise<Browser> }
>({
  motor: ["chromium", { option: true }],
  abrirWebkit: [
    async ({ playwright }, ofrecer) => {
      const lanzado: { webkit: Browser | null } = { webkit: null };
      await ofrecer(async () => {
        lanzado.webkit ??= await playwright.webkit.launch().catch((error: unknown) => {
          throw new Error(
            `No arranca WebKit: instálalo con «npx playwright install webkit». (${String(error)})`,
          );
        });
        return lanzado.webkit;
      });
      await lanzado.webkit?.close();
    },
    { scope: "worker" },
  ],
  pedidas: async ({}, ofrecer) => {
    await ofrecer({ original: [], abortadas: [] });
  },
  // Contexto nuevo por pantalla y SIN service worker (el de la PWA sirve el CSS
  // viejo) ni caché compartida: cada srcset se elige desde cero.
  abrir: async ({ motor, browser, abrirWebkit, baseURL, pedidas }, ofrecer) => {
    const navegador = motor === "webkit" ? await abrirWebkit() : browser;
    const contextos: { close: () => Promise<void> }[] = [];
    await ofrecer(async (pantalla, opciones = {}) => {
      const contexto = await navegador.newContext({
        baseURL,
        colorScheme: "light",
        viewport: { width: pantalla.width, height: pantalla.height },
        deviceScaleFactor: pantalla.dpr,
        serviceWorkers: "block",
      });
      contextos.push(contexto);
      const page = await contexto.newPage();
      await page.route("**/*", (route) => {
        const peticion = route.request();
        const url = peticion.url();
        if (url.startsWith(baseURL ?? "http://localhost")) return route.continue();
        if (peticion.resourceType() !== "image") return route.abort();
        if (ORIGINAL.test(url)) {
          pedidas.original.push(url);
          if (opciones.originalRoto) {
            pedidas.abortadas.push(url);
            return route.fulfill({ status: 404, contentType: "text/plain", body: "" });
          }
          return route.fulfill({ status: 200, contentType: "image/png", body: FOTO_ORIGINAL });
        }
        return route.fulfill({
          status: 200,
          contentType: "image/png",
          body: url.includes("espncdn.com") ? FOTO_ESPN : FOTO_GUARDADA,
        });
      });
      await page.route("**/api/live/now", (route) =>
        route.fulfill({ status: 200, json: { phase: "none" } }),
      );
      return page;
    });
    for (const contexto of contextos) await contexto.close();
  },
});

test.beforeEach(({}, testInfo) => {
  test.skip(
    testInfo.project.name !== "escritorio-light",
    "cada test fija su pantalla y recorre los dos motores: basta un proyecto",
  );
});

type Cara = {
  src: string; // el atributo src: la URL guardada en la base
  srcset: string | null;
  actual: string; // currentSrc: lo que el navegador ha elegido y bajado
  ancho: number; // ancho REAL en píxeles del fichero bajado
  alt: string;
};

// Las caras de una zona, cuando TODAS han terminado de cargar (las de las
// tarjetas entran con loading="lazy": se recorre la página para que entren).
//
// 🪤 Con srcset, naturalWidth NO es el ancho del fichero: es el ancho dividido
// por su densidad (500w pintado a 207 px → naturalWidth 207). El ancho real se
// lee abriendo currentSrc en una imagen aparte, que sale de la caché.
// 🪤 Y nada de guardar los elementos: cuando el original falla, React cambia el
// <img> por otro, y un handle viejo queda «not attached to the DOM».
async function caras(pagina: Page, selector: string): Promise<Cara[]> {
  await expect(pagina.locator(selector).first()).toBeAttached();
  await pagina.evaluate(async () => {
    for (let y = 0; y < document.body.scrollHeight; y += 300) {
      window.scrollTo(0, y);
      await new Promise((r) => setTimeout(r, 50));
    }
    window.scrollTo(0, 0);
  });
  await expect
    .poll(() =>
      pagina.evaluate(
        (sel) =>
          [...document.querySelectorAll<HTMLImageElement>(sel)].every(
            (img) => img.complete && img.naturalWidth > 0,
          ),
        selector,
      ),
    )
    .toBe(true);
  return pagina.evaluate(async (sel) => {
    const lista = [...document.querySelectorAll<HTMLImageElement>(sel)];
    return Promise.all(
      lista.map(async (img) => {
        const sonda = new Image();
        sonda.src = img.currentSrc;
        await sonda.decode().catch(() => undefined);
        return {
          src: img.getAttribute("src") ?? "",
          srcset: img.getAttribute("srcset"),
          actual: img.currentSrc,
          ancho: sonda.naturalWidth,
          alt: img.alt,
        };
      }),
    );
  }, selector);
}

const CARAS_TARJETA = '[data-testid="roster-card-photo"] img';
// La cara de Heath Herring en SU ficha (las de sus rivales, pequeñas, no).
const CARA_FICHA = 'main img[alt="Foto de Heath Herring"], main img[alt^="Silueta de Heath Herring"]';

for (const motor of ["chromium", "webkit"] as const) {
  test.describe(motor, () => {
    test.use({ motor });

    test("las tarjetas de /fighters piden el original en retina y la de 256 en un móvil 1x", async ({
      abrir,
    }) => {
      // Retina (iPhone, 2x): la foto se pinta a ~180 px → hacen falta ~360.
      const retina = await abrir({ width: 390, height: 844, dpr: 2 });
      await retina.goto("/fighters");
      const enRetina = (await caras(retina, CARAS_TARJETA)).filter((c) => GUARDADA.test(c.src));
      expect(
        enRetina.length,
        `[${motor}] la primera página de /fighters tiene caras de ufc.com del estilo event_results`,
      ).toBeGreaterThan(0);
      for (const cara of enRetina) {
        expect(cara.srcset, `[${motor}] ${cara.alt}: srcset con la guardada y el original`).toMatch(
          / 256w, https:\/\/www\.ufc\.com\/images\/.+ 500w$/,
        );
        expect(cara.actual, `[${motor}] ${cara.alt} a 2x: baja el original`).toMatch(ORIGINAL);
        expect(cara.ancho, `[${motor}] ${cara.alt} a 2x: naturalWidth`).toBeGreaterThanOrEqual(500);
      }

      // Móvil 1x: con ~180 px pintados, la de 256 sobra. Que no suba el peso.
      const normal = await abrir({ width: 390, height: 844, dpr: 1 });
      await normal.goto("/fighters");
      const en1x = (await caras(normal, CARAS_TARJETA)).filter((c) => GUARDADA.test(c.src));
      expect(en1x.length, `[${motor}] caras de ufc.com a 1x`).toBeGreaterThan(0);
      for (const cara of en1x) {
        expect(cara.actual, `[${motor}] ${cara.alt} a 1x: sigue con la de 256`).toMatch(GUARDADA);
        expect(cara.ancho, `[${motor}] ${cara.alt} a 1x: naturalWidth`).toBe(256);
      }
    });

    test("la cara grande de la ficha (sin foto de cuerpo) pide el original", async ({ abrir }) => {
      // xl: caja de 224 px, foto pintada a 358 → el original incluso a 1x.
      const pagina = await abrir({ width: 1280, height: 900, dpr: 1 });
      await pagina.goto(FICHA_SIN_CUERPO);
      const [cara] = await caras(pagina, CARA_FICHA);
      expect(cara.alt, `[${motor}] la ficha pinta una foto, no la silueta`).toMatch(/^Foto de /);
      expect(cara.src, `[${motor}] la URL guardada es del estilo event_results`).toMatch(GUARDADA);
      expect(cara.actual, `[${motor}] baja el original`).toMatch(ORIGINAL);
      expect(cara.actual, `[${motor}] sin la query ni el «&amp;» de la guardada`).not.toContain("?");
      expect(cara.ancho, `[${motor}] naturalWidth`).toBeGreaterThanOrEqual(500);
    });

    test("con el original roto, la cara vuelve a la guardada y NO a la silueta", async ({
      abrir,
      pedidas,
    }) => {
      const ficha = await abrir({ width: 1280, height: 900, dpr: 1 }, { originalRoto: true });
      await ficha.goto(FICHA_SIN_CUERPO);
      await expect
        .poll(() => pedidas.abortadas.length, {
          message: `[${motor}] la ficha intentó bajar el original (si no, la reserva no se ha probado)`,
        })
        .toBeGreaterThan(0);
      await expect(ficha.locator('main img[alt^="Foto de "]').first()).toHaveAttribute(
        "src",
        GUARDADA,
      );
      const [cara] = await caras(ficha, CARA_FICHA);
      expect(cara.alt, `[${motor}] ficha: sigue siendo una foto`).toMatch(/^Foto de /);
      expect(cara.actual, `[${motor}] ficha: la URL guardada`).toMatch(GUARDADA);
      expect(cara.ancho, `[${motor}] ficha: la de 256`).toBe(256);

      // Y en las tarjetas (retina, donde piden el original).
      const antes = pedidas.abortadas.length;
      const lista = await abrir({ width: 390, height: 844, dpr: 2 }, { originalRoto: true });
      await lista.goto("/fighters");
      const tarjetas = await caras(lista, CARAS_TARJETA);
      expect(
        pedidas.abortadas.length - antes,
        `[${motor}] las tarjetas intentaron bajar el original`,
      ).toBeGreaterThan(0);
      const deUfc = tarjetas.filter((c) => GUARDADA.test(c.src));
      expect(deUfc.length, `[${motor}] caras de ufc.com en las tarjetas`).toBeGreaterThan(0);
      for (const cara of deUfc) {
        expect(cara.alt, `[${motor}] ${cara.alt}: no es la silueta`).toMatch(/^Foto de /);
        expect(cara.actual, `[${motor}] ${cara.alt}: vuelve a la guardada`).toMatch(GUARDADA);
        expect(cara.ancho, `[${motor}] ${cara.alt}: la de 256`).toBe(256);
      }
      const siluetas = await lista.locator('[data-testid="roster-card-photo"] img[alt^="Silueta de "]').count();
      expect(siluetas, `[${motor}] ninguna tarjeta acaba en la silueta`).toBe(0);
    });

    test("las caras pequeñas de una velada siguen con la de 256, también a 3x", async ({
      abrir,
      pedidas,
    }) => {
      const pagina = await abrir({ width: 390, height: 844, dpr: 3 });
      await pagina.goto(EVENTO);
      const filas = await caras(pagina, '[data-bout-corner] img[alt^="Foto de "]');
      const deUfc = filas.filter((c) => GUARDADA.test(c.src));
      expect(deUfc.length, `[${motor}] la cartelera tiene caras de ufc.com`).toBeGreaterThan(0);
      for (const cara of deUfc) {
        expect(cara.srcset, `[${motor}] ${cara.alt}: sin srcset`).toBeNull();
        expect(cara.actual, `[${motor}] ${cara.alt}: la de 256`).toMatch(GUARDADA);
      }
      expect(pedidas.original, `[${motor}] ningún original en toda la página del evento`).toEqual([]);
    });
  });
}
