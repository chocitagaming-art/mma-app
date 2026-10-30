import { readFileSync } from "node:fs";
import path from "node:path";

import { expect, test, type Locator, type Page } from "@playwright/test";

import { esperarHidratacion, expectNoHorizontalOverflow, fakeYouTubeEmbeds } from "./helpers";

// ── Ficha del evento: la rueda de prensa, justo debajo del careo ───────────
// Decisión del dueño del 22-oct-2026: la ficha tenía sitio para el careo, el
// pesaje y el directo, pero no para la RUEDA DE PRENSA. Va en un sitio nuevo
// del evento (migración 033 de mma-ingesta: events.press_video_id y
// press_video_title), y se fija SOLO a mano con fijar_videos_evento.
//
// /eventos/1093 (UFC 333) lleva el vídeo que eligió el dueño: g3h-jwpkxJU, del
// canal «MMA Español». ⚠️ NO es el de la UFC (el oficial, en inglés, es
// DHLdj5yFWmw): es una resubida en español. Por eso se exige el TÍTULO REAL a
// la vista y como nombre del reproductor, que es lo único que dice qué es.
//
// Y tiene careo con vídeo (hVvIw8K754c, 22-oct), que es contra lo que se mide
// la columna: la rueda va en la MISMA caja que el careo, en cualquier ancho.
// Si el evento pierde el careo o la rueda, el test se pone ROJO, no se salta.
//
// 🪤 HASTA QUE SE APLIQUE LA 033 Y SE FIJE EL VÍDEO, ESTO ES ROJO EN PRODUCCIÓN
// a propósito: es la prueba de que el vídeo llega a la página.

const EVENTO = "/eventos/1093";
const VIDEO = "g3h-jwpkxJU";
const TITULO = "UFC 333: CONFERENCIA DE PRENSA COMPLETA EN ESPAÑOL";
const ANCHOS = [360, 390, 768, 1024, 1280, 1920];
const TOLERANCIA_PX = 1;

const PNG_RELLENO = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAACXBIWXMAAAPoAAAD6AG1e1JrAAAADUlEQVQImWNgYGBgAAAABQABh6FO1AAAAABJRU5ErkJggg==",
  "base64",
);

// El service worker de la PWA sirve el CSS viejo: mediría la maquetación de antes.
test.use({ serviceWorkers: "block" });

test.beforeEach(async ({ page, baseURL }, testInfo) => {
  test.skip(
    testInfo.project.name !== "escritorio-light",
    "cada test fija su viewport y el tema no cambia la geometría: basta un proyecto",
  );
  await page.route("**/*", (route) => {
    const peticion = route.request();
    if (peticion.url().startsWith(baseURL ?? "http://localhost")) return route.continue();
    return peticion.resourceType() === "image"
      ? route.fulfill({ status: 200, contentType: "image/png", body: PNG_RELLENO })
      : route.abort();
  });
  await page.route("**/api/live/now", (route) =>
    route.fulfill({ status: 200, json: { phase: "none" } }),
  );
  await fakeYouTubeEmbeds(page);
});

function seccion(page: Page, rotulo: string): { rotulo: Locator; seccion: Locator } {
  const h2 = page.getByRole("heading", { level: 2, name: rotulo, exact: true });
  return { rotulo: h2, seccion: h2.locator("xpath=ancestor::section[1]") };
}

async function abrir(page: Page): Promise<void> {
  await page.goto(EVENTO);
  await expect(
    seccion(page, "Careo oficial").rotulo,
    `${EVENTO} ya no pinta el careo: sin él no hay contra qué medir la columna`,
  ).toBeVisible();
  await expect(
    seccion(page, "Rueda de prensa").rotulo,
    `${EVENTO} no pinta «Rueda de prensa»: ¿está aplicada la 033 y fijado ${VIDEO}?`,
  ).toBeVisible();
  await esperarHidratacion(page);
  await page.evaluate(() => document.fonts.ready);
}

test(`${EVENTO}: la rueda de prensa, con el título real del vídeo y justo después del careo`, async ({ page }) => {
  await abrir(page);
  const rueda = seccion(page, "Rueda de prensa").seccion;

  // El título que pone el vídeo, a la vista y como nombre del ▶.
  await expect(rueda.getByText(TITULO, { exact: true })).toBeVisible();
  const play = rueda.getByRole("button", { name: `Reproducir: ${TITULO}`, exact: true });
  await expect(play).toBeVisible();
  // Y es ESE vídeo, no otro con el mismo nombre: la miniatura lleva el id.
  await expect(play.locator("img")).toHaveAttribute("src", new RegExp(`/vi/${VIDEO}/`));

  // Justo después del careo (hermanas en el DOM) y, si ya hay pesaje, antes que él.
  const orden = await page.evaluate(() => {
    const porRotulo = (texto: string) =>
      [...document.querySelectorAll("h2")]
        .find((h) => h.textContent?.trim() === texto)
        ?.closest("section") ?? null;
    const careo = porRotulo("Careo oficial");
    const rueda = porRotulo("Rueda de prensa");
    const pesaje = porRotulo("Pesaje oficial");
    return {
      justoDespues: careo?.nextElementSibling === rueda,
      antesDelPesaje:
        pesaje == null ||
        Boolean(rueda && rueda.compareDocumentPosition(pesaje) & Node.DOCUMENT_POSITION_FOLLOWING),
    };
  });
  expect(orden.justoDespues, "la rueda de prensa no va justo después del careo").toBe(true);
  expect(orden.antesDelPesaje, "la rueda de prensa va después del pesaje").toBe(true);

  // El mismo vídeo no se enseña dos veces en la página (careo, directo, pesaje).
  await expect(page.locator(`img[src*="${VIDEO}"], iframe[src*="${VIDEO}"]`)).toHaveCount(1);
});

test(`${EVENTO}: la rueda de prensa va en la misma caja que el careo, de 360 a 1920`, async ({ page }) => {
  await abrir(page);
  for (const width of ANCHOS) {
    await page.setViewportSize({ width, height: 900 });
    await page.evaluate(
      () => new Promise<void>((ok) => requestAnimationFrame(() => requestAnimationFrame(() => ok()))),
    );
    const m = await page.evaluate(() => {
      const caja = (el: Element | null | undefined, que: string) => {
        if (!el) throw new Error(`no encuentro ${que}`);
        const r = el.getBoundingClientRect();
        if (r.width === 0) throw new Error(`${que} sin caja`); // sin caja = verde falso
        return { left: r.left, right: r.right };
      };
      const sec = (texto: string) =>
        [...document.querySelectorAll("h2")]
          .find((h) => h.textContent?.trim() === texto)
          ?.closest("section");
      const careo = sec("Careo oficial");
      const rueda = sec("Rueda de prensa");
      const video = (s?: Element | null) => s?.querySelector('button[aria-label^="Reproducir"], iframe');
      return {
        careo: caja(video(careo), "el vídeo del careo"),
        bloques: {
          "el rótulo de la rueda": caja(rueda?.querySelector("h2"), "el rótulo de la rueda"),
          "el vídeo de la rueda": caja(video(rueda), "el vídeo de la rueda"),
          "el título de la rueda": caja(rueda?.querySelector("p"), "el título de la rueda"),
        },
      };
    });
    for (const [que, c] of Object.entries(m.bloques)) {
      expect.soft(Math.abs(c.left - m.careo.left),
        `a ${width}: ${que} empieza en x=${c.left.toFixed(1)}; el careo, en x=${m.careo.left.toFixed(1)}`,
      ).toBeLessThanOrEqual(TOLERANCIA_PX);
      expect.soft(Math.abs(c.right - m.careo.right),
        `a ${width}: ${que} acaba en x=${c.right.toFixed(1)}; el careo, en x=${m.careo.right.toFixed(1)}`,
      ).toBeLessThanOrEqual(TOLERANCIA_PX);
    }
    await expectNoHorizontalOverflow(page, `${EVENTO} a ${width}`);
  }
});

test(`${EVENTO}: el ▶ de la rueda de prensa monta ESE vídeo en su sitio, como el del careo`, async ({ page }) => {
  await abrir(page);
  const rueda = seccion(page, "Rueda de prensa").seccion;
  await rueda.getByRole("button", { name: `Reproducir: ${TITULO}`, exact: true }).click();
  const iframe = rueda.locator("iframe");
  await expect(iframe).toHaveAttribute("src", `https://www.youtube-nocookie.com/embed/${VIDEO}?autoplay=1`);
  await expect(iframe).toHaveAttribute("title", TITULO);
});

// La portada de los vídeos del evento: sddefault, y hqdefault de reserva. El
// 30-oct-2026 YouTube sirvió durante horas la portada VIEJA del pesaje de la
// 1099 en hqdefault (13 de 40) y la buena en sddefault (40 de 40). Un vídeo
// subido por debajo de 480p no tiene sddefault: YouTube contesta 404 con una
// imagen gris de 120×90, y la fachada tiene que caer a hqdefault, no quedarse
// en gris. El beforeEach contesta las imágenes de fuera con un PNG de 1×1:
// aquí la de sddefault lleva una de tamaño real (o el 404).
const FOTO_REAL = readFileSync(path.join(__dirname, "fixtures", "headshot-hd-500x325.png"));
const SDDEFAULT = /^https:\/\/i\.ytimg\.com\/vi\/[^/]+\/sddefault\.jpg/;

test(`${EVENTO}: la portada de los vídeos pide sddefault, y cae a hqdefault si YouTube no tiene ese tamaño`, async ({
  page,
}) => {
  await page.route(SDDEFAULT, (route) => route.fulfill({ status: 200, contentType: "image/png", body: FOTO_REAL }));
  await abrir(page);
  for (const rotulo of ["Careo oficial", "Rueda de prensa"]) {
    const portada = seccion(page, rotulo).seccion.locator("button img").first();
    await expect(portada, `${rotulo}: la portada no es la de sddefault`).toHaveAttribute("src", SDDEFAULT);
    await expect
      .poll(() => portada.evaluate((img: HTMLImageElement) => img.naturalWidth), { message: `${rotulo}: no cargó` })
      .toBe(500);
  }

  // Un vídeo sin sddefault: 404 y la imagen gris (aquí, el PNG de 1×1).
  await page.unroute(SDDEFAULT);
  await page.route(SDDEFAULT, (route) =>
    route.fulfill({ status: 404, contentType: "image/png", body: PNG_RELLENO }),
  );
  await page.reload();
  await abrir(page);
  for (const rotulo of ["Careo oficial", "Rueda de prensa"]) {
    const portada = seccion(page, rotulo).seccion.locator("button img").first();
    await expect(portada, `${rotulo}: sin sddefault no cayó a hqdefault`).toHaveAttribute(
      "src",
      /^https:\/\/i\.ytimg\.com\/vi\/[^/]+\/hqdefault\.jpg$/,
    );
  }
});
