import { readFileSync } from "node:fs";
import path from "node:path";

import { expect, test as base, type Browser, type Locator, type Page } from "@playwright/test";

import { esperarHidratacion, fakeYouTubeEmbeds } from "./helpers";

// ── Salón de la Fama: tarjetas doradas, la última promoción y «Ver combate» ──
//
// Rediseño del 17-oct (R7 y R8), con las decisiones del dueño del 18-oct:
//   · Relieve SOLO si la foto que se pinta es la que midió mma-ingesta y la
//     medida dice recorte (tabla photo_cutout). Si no, marco dorado. Cada
//     tarjeta lleva data-photo="cut|framed".
//   · Encima de las pestañas, la promoción más reciente («Clase de 2026»), y en
//     cada pestaña de la más nueva a la más vieja.
//   · «Ver combate» dentro del modal: póster propio, NADA de Google hasta el
//     clic, y el reproductor dentro del turnero (nunca dos a la vez).
//
// 🪤 La base de producción puede no tener aún la migración 031 (vídeos,
// photo_focus y photo_cutout): entonces todo va enmarcado y sin vídeo, y la
// página tiene que aguantar igual. Los asertos que necesitan esos datos se
// SALTAN diciendo por qué; lo que comprueba la reserva no se salta nunca.
//
// Corre en Chromium Y en WebKit (el dueño mira en su iPhone; el zoom de las
// fotos de ufc.com va con transform), como careo-fotos.spec.ts. Un solo
// proyecto: cada test fija su tamaño.
//
// Sin red: las imágenes externas se sirven con un PNG de prueba (si se
// cortaran, la foto caería a la silueta y la tarjeta a «framed»), y el
// reproductor es el YouTube falso de helpers.ts.

type Motor = "chromium" | "webkit";

const HEADSHOT = readFileSync(path.join(__dirname, "fixtures", "careo-headshot.png"));

// Lo que delataría que se habló con Google: el reproductor, la miniatura, el vídeo.
const GOOGLE = /youtube|ytimg|googlevideo|ggpht|doubleclick|google/;

const test = base.extend<
  { motor: Motor; pagina: Page; google: string[] },
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
  google: async ({}, ofrecer) => {
    await ofrecer([]);
  },
  pagina: async ({ motor, browser, abrirWebkit, baseURL, google }, ofrecer) => {
    const navegador = motor === "webkit" ? await abrirWebkit() : browser;
    // Sin service worker: el de la PWA sirve el CSS viejo (CLAUDE.md, trampas).
    const contexto = await navegador.newContext({
      baseURL,
      colorScheme: "dark",
      viewport: { width: 1280, height: 900 },
      serviceWorkers: "block",
    });
    const page = await contexto.newPage();
    page.on("request", (peticion) => {
      const url = peticion.url();
      if (!url.startsWith(baseURL ?? "http://localhost") && GOOGLE.test(new URL(url).hostname)) {
        google.push(url);
      }
    });
    await page.route("**/*", (route) => {
      const peticion = route.request();
      if (peticion.url().startsWith(baseURL ?? "http://localhost")) return route.continue();
      return peticion.resourceType() === "image"
        ? route.fulfill({ status: 200, contentType: "image/png", body: HEADSHOT })
        : route.abort();
    });
    await page.route("**/api/live/now", (route) => route.fulfill({ status: 200, json: { phase: "none" } }));
    // Registrado lo último: gana al comodín para youtube-nocookie.com/embed.
    await fakeYouTubeEmbeds(page);
    await ofrecer(page);
    await contexto.close();
  },
});

test.beforeEach(({}, testInfo) => {
  test.skip(
    testInfo.project.name !== "escritorio-light",
    "cada test fija su tamaño y su tema: basta un proyecto",
  );
});

const panel = (page: Page) => page.getByRole("tabpanel");
const clase = (page: Page) => page.locator("[data-hof-latest-class]");
const tarjeta = (raiz: Locator, nombre: string) => raiz.locator(`[data-hof-card="${nombre}"]`);
const pelea = (raiz: Locator, nombre: RegExp) =>
  raiz.locator("[data-hof-fight]").filter({ hasText: nombre });

/** Los años «Clase de N» de las tarjetas, en el orden en que se ven. */
async function anos(raiz: Locator): Promise<number[]> {
  const textos = await raiz.locator("[data-hof-card], [data-hof-fight]").allInnerTexts();
  return textos.map((t) => Number(t.match(/Clase de (\d{4})/)?.[1] ?? NaN));
}

function decreciente(lista: number[]): boolean {
  return lista.every((n, i) => i === 0 || lista[i - 1] >= n);
}

async function abrirSalon(page: Page, query = "") {
  await page.goto(`/salon-de-la-fama${query}`);
  await esperarHidratacion(page);
  await expect(page.getByRole("tab")).toHaveCount(4);
}

for (const motor of ["chromium", "webkit"] as const) {
  test.describe(`Salón de la Fama · ${motor}`, () => {
    test.use({ motor });

    test("la última promoción va arriba y cada pestaña de la más nueva a la más vieja", async ({ pagina }) => {
      await abrirSalon(pagina);

      // El bloque de la clase, encima de las pestañas.
      const bloque = clase(pagina);
      await expect(bloque).toBeVisible();
      const ano = Number(await bloque.getAttribute("data-hof-latest-class"));
      await expect(bloque.getByRole("heading", { level: 2 })).toHaveText(`Clase de ${ano}`);
      const enBloque = await anos(bloque);
      expect(enBloque.length).toBeGreaterThan(0);
      expect(enBloque.every((n) => n === ano)).toBe(true);
      const arribaBloque = (await bloque.boundingBox())!.y;
      const arribaPestanas = (await pagina.getByRole("tablist").boundingBox())!.y;
      expect(arribaBloque).toBeLessThan(arribaPestanas);

      // Ninguna promoción de las pestañas es más nueva que la del bloque.
      for (const [ala, consulta] of [
        ["Ala Moderna", ""],
        ["Ala Pionera", "?wing=pioneer"],
        ["Ala Contribuidora", "?wing=contributor"],
        ["Ala de Combate", "?wing=fight"],
      ] as const) {
        await abrirSalon(pagina, consulta);
        await expect(pagina.getByRole("tab", { name: ala })).toHaveAttribute("aria-selected", "true");
        const lista = await anos(panel(pagina));
        expect(lista.length, ala).toBeGreaterThan(0);
        expect(lista.some(Number.isNaN), `${ala}: tarjeta sin «Clase de»`).toBe(false);
        expect(decreciente(lista), `${ala}: ${lista.join(", ")}`).toBe(true);
        expect(Math.max(...lista)).toBeLessThanOrEqual(ano);
      }

      // El Ala de Combate son 11 carteles, cada uno con sus dos esquinas.
      await expect(panel(pagina).locator("[data-hof-fight]")).toHaveCount(11);
      await expect(panel(pagina).locator("[data-corner]")).toHaveCount(22);
    });

    test("cada tarjeta dice si va en relieve o enmarcada, y el marco mide 128 px", async ({ pagina }) => {
      await abrirSalon(pagina);
      const tarjetas = panel(pagina).locator("[data-hof-card]");
      const total = await tarjetas.count();
      expect(total).toBeGreaterThan(10);
      for (const modo of await tarjetas.evaluateAll((els) => els.map((e) => e.getAttribute("data-photo")))) {
        expect(["cut", "framed"]).toContain(modo);
      }

      // El marco dorado de las tarjetas normales: 128×128 (más el borde de 2 px,
      // que va por dentro: border-box).
      await abrirSalon(pagina, "?wing=pioneer");
      const marco = panel(pagina).locator('[data-hof-card][data-photo="framed"] .hof-photo').first();
      await expect(marco).toBeVisible();
      const caja = (await marco.boundingBox())!;
      expect(Math.round(caja.width)).toBe(128);
      expect(Math.round(caja.height)).toBe(128);

      // Una foto 16:9 de ufc.com con su punto de la cara lleva el zoom.
      const conZoom = panel(pagina).locator('.hof-photo--framed img[style*="--hof-zoom"]');
      if ((await conZoom.count()) > 0) {
        const transform = await conZoom.first().evaluate((img) => getComputedStyle(img).transform);
        expect(transform).not.toBe("none");
      }
    });

    test("relieve SOLO con la medida de photo_cutout (Gracie sí; Severn y Frye, enmarcados)", async ({ pagina }) => {
      await abrirSalon(pagina, "?wing=pioneer");
      const enRelieve = panel(pagina).locator('[data-photo="cut"]');
      if ((await enRelieve.count()) === 0) {
        // La reserva: sin la tabla, NADA en relieve. Esto se comprueba siempre.
        await expect(panel(pagina).locator('[data-hof-card][data-photo="framed"]')).toHaveCount(
          await panel(pagina).locator("[data-hof-card]").count(),
        );
        test.skip(true, "la base aún no tiene photo_cutout (migración 031 + measure_photo_cutout): todo va enmarcado, que es la reserva");
      }
      await expect(tarjeta(panel(pagina), "Royce Gracie")).toHaveAttribute("data-photo", "cut");
      // ufc.com, pero CON fondo: el error del prototipo, que lo ponía en relieve.
      await expect(tarjeta(panel(pagina), "Dan Severn")).toHaveAttribute("data-photo", "framed");
      // Sin foto en su ficha: el retrato oficial de ufc.com, enmarcado (no la silueta).
      const frye = tarjeta(panel(pagina), "Don Frye");
      await expect(frye).toHaveAttribute("data-photo", "framed");
      await expect(frye.getByRole("img", { name: "Foto de Don Frye" })).toBeVisible();

      // Recortes: la zona de 150 px (170 desde 1024) con la foto apoyada abajo.
      const zona = tarjeta(panel(pagina), "Royce Gracie").locator(".hof-card__stage");
      expect(Math.round((await zona.boundingBox())!.height)).toBe(170);

      // Forrest Griffin: foto local que SÍ es un recorte (el otro error del prototipo).
      await abrirSalon(pagina);
      await expect(tarjeta(panel(pagina), "Forrest Griffin")).toHaveAttribute("data-photo", "cut");
    });

    test("«Ver combate»: póster propio, nada de Google hasta el clic y un solo reproductor", async ({ pagina, google }) => {
      await abrirSalon(pagina, "?wing=fight");
      await pelea(panel(pagina), /Hughes vs\. Frank Trigg II/).click();
      const dialogo = pagina.getByRole("dialog");
      await expect(dialogo).toBeVisible();
      // Más ancho en el Ala de Combate: max-w-3xl (768 px).
      expect(Math.round((await dialogo.locator(":scope > div").boundingBox())!.width)).toBe(768);

      const caja = dialogo.locator("[data-turn]");
      if ((await caja.count()) === 0) {
        // La reserva: sin vídeo guardado, el botón de búsqueda de siempre.
        await expect(dialogo.getByRole("link", { name: "Ver combate" })).toHaveAttribute(
          "href",
          /^https:\/\/www\.youtube\.com\/results\?search_query=/,
        );
        await expect(pagina.locator("iframe")).toHaveCount(0);
        expect(google).toEqual([]);
        test.skip(true, "la base aún no tiene los vídeos del Ala de Combate (migración 031 + seed): queda la búsqueda en YouTube");
      }

      // Antes del clic: el póster, ni un iframe, ni una petición a Google.
      const poster = caja.getByRole("button", { name: /Ver combate · UFC 52/ });
      await expect(poster).toBeVisible();
      await expect(caja).toHaveAttribute("data-turn-state", "poster");
      await pagina.waitForTimeout(800);
      await expect(pagina.locator("iframe")).toHaveCount(0);
      expect(google).toEqual([]);

      await poster.click();
      await expect(caja).toHaveAttribute("data-turn-state", "playing-user");
      await expect(pagina.locator("iframe")).toHaveCount(1);
      await expect(dialogo.locator("iframe")).toHaveAttribute(
        "src",
        "https://www.youtube-nocookie.com/embed/E2fUq7gT8z4?autoplay=1&playsinline=1&start=6646",
      );

      // Cerrar quita el reproductor.
      await dialogo.getByRole("button", { name: "Cerrar" }).click();
      await expect(dialogo).toHaveCount(0);
      await expect(pagina.locator("iframe")).toHaveCount(0);

      // Otra pelea, del mismo maratón: su capítulo, y otra vez UNO solo.
      await pelea(panel(pagina), /Coleman vs\. Pete Williams/).click();
      await pagina.getByRole("dialog").getByRole("button", { name: /Ver combate/ }).click();
      await expect(pagina.locator("iframe")).toHaveCount(1);
      await expect(pagina.getByRole("dialog").locator("iframe")).toHaveAttribute(
        "src",
        /embed\/E2fUq7gT8z4\?autoplay=1&playsinline=1&start=3016&end=3909$/,
      );
      await pagina.keyboard.press("Escape");
      await expect(pagina.locator("iframe")).toHaveCount(0);
    });

    test("a 360 px el reproductor cabe (≥200×200) y suena aquí; con Enter el foco entra en él", async ({ pagina }) => {
      await pagina.setViewportSize({ width: 360, height: 800 });
      await abrirSalon(pagina, "?wing=fight");
      await pelea(panel(pagina), /Hughes vs\. Frank Trigg II/).click();
      const dialogo = pagina.getByRole("dialog");
      const caja = dialogo.locator("[data-turn]");
      test.skip((await caja.count()) === 0, "la base aún no tiene los vídeos del Ala de Combate (migración 031 + seed)");

      const medida = (await caja.boundingBox())!;
      expect(medida.width).toBeGreaterThanOrEqual(200);
      expect(medida.height).toBeGreaterThanOrEqual(200);

      const poster = caja.getByRole("button", { name: /Ver combate/ });
      await poster.focus();
      await pagina.keyboard.press("Enter");
      await expect(caja).toHaveAttribute("data-turn-state", "playing-user");
      // Dentro de la web, no en YouTube: ni pestaña nueva ni navegación.
      expect(pagina.context().pages()).toHaveLength(1);
      await expect
        .poll(() => pagina.evaluate(() => document.activeElement?.tagName))
        .toBe("IFRAME");
    });

    test("con «menos movimiento» las fotos no se animan", async ({ pagina }) => {
      await pagina.emulateMedia({ reducedMotion: "reduce" });
      await abrirSalon(pagina);
      const img = panel(pagina).locator(".hof-photo img").first();
      const duracion = await img.evaluate((el) => parseFloat(getComputedStyle(el).transitionDuration));
      expect(duracion).toBeLessThan(0.001);
      const tarjetaUno = panel(pagina).locator("[data-hof-card]").first();
      await tarjetaUno.hover();
      // Al pasar el ratón no crece (sin transform extra en las recortadas).
      const transform = await tarjetaUno
        .locator('.hof-photo--cut img')
        .evaluateAll((els) => els.map((el) => getComputedStyle(el).transform));
      for (const t of transform) expect(t).toBe("none");
    });
  });
}
