import { readFileSync } from "node:fs";
import path from "node:path";

import { expect, test as base, type Browser, type Locator, type Page } from "@playwright/test";

import { esperarHidratacion, expectNoHorizontalOverflow, fakeYouTubeEmbeds, whyNoUfcTvLoop } from "./helpers";

// ── La portada: «Noticias y vídeos» (R10, decisiones del dueño del 18-oct) ──
//
//   · 9 piezas: 6 noticias + 3 vídeos (los de la antigua columna «Lo último
//     en vídeo»), mezcladas con la regla de /tendencias, en UNA rejilla a todo
//     el ancho: 1 columna en el móvil, 2 desde 640 px (se esconde la última
//     NOTICIA, nunca un vídeo: 4 filas llenas y los 3 vídeos), 3 desde 1024.
//     La columna de vídeos ya no existe.
//   · Ningún vídeo repetido (Next MMA estaba dos veces en la lista de canales).
//   · Los vídeos: miniatura y ▶, NADA del reproductor hasta el clic (se mira
//     en el registro de red: una captura de Playwright concede activación de
//     usuario y no prueba nada), y el modal dentro del turnero: «uno a la
//     vez». Al abrir un vídeo, el UFC TV o el short que tuviera puesto el
//     visitante vuelve a su póster y NO vuelve solo al cerrar; lo que arrancó
//     solo, sí.
//   · El reproductor del modal mide al menos 200×200 por dentro a 360 px; por
//     debajo de eso (una pantalla de 220 px) no se monta: «Ver en YouTube».
//   · Con el menú móvil abierto el vídeo se ve igual: el modal tapa también
//     al menú. El foco no sale del modal, y el ✕ se ve con el móvil en
//     horizontal (QA de R10).
//
// Corre en Chromium Y en WebKit (el dueño mira en su iPhone). Un solo
// proyecto: cada test fija su tamaño.
//
// 🪤 Los vídeos vienen de la API REAL de YouTube (no hay datos falsos para
// getUfcVideos): el día que no devuelva ninguno, los tests de vídeo se saltan
// con su motivo. Al leer la salida, mira cuántos se ejecutaron. UFC TV y los
// shorts del hero sí van enlatados (UFC_TV_FIXTURE=loop, UFC_SHORTS_FIXTURE=
// list); que la portada enseñe UFC TV lo decide la base de producción
// (whyNoUfcTvLoop), y sin él se salta solo lo que es de UFC TV.
//
// Sin red: las imágenes externas (fotos de noticias, miniaturas de YouTube) se
// sirven con un PNG de prueba y todo iframe carga el YouTube falso de helpers.

type Motor = "chromium" | "webkit";

const IMAGEN = readFileSync(path.join(__dirname, "fixtures", "careo-headshot.png"));

// Lo que cada página pidió al «YouTube» falso (fakeYouTubeEmbeds), en orden.
const PEDIDOS = new WeakMap<Page, string[]>();
const pedidos = (page: Page) => PEDIDOS.get(page) ?? [];

const test = base.extend<
  { motor: Motor; pagina: Page },
  { abrirWebkit: () => Promise<Browser> }
>({
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
      const peticion = route.request();
      if (peticion.url().startsWith(baseURL ?? "http://localhost")) return route.continue();
      return peticion.resourceType() === "image"
        ? route.fulfill({ status: 200, contentType: "image/png", body: IMAGEN })
        : route.abort();
    });
    await page.route("**/api/live/now", (route) =>
      route.fulfill({ status: 200, json: { phase: "none", live: false, eventId: null, eventName: null, daysUntil: null } }),
    );
    // Registrado lo último: gana al comodín para youtube-nocookie.com/embed.
    PEDIDOS.set(page, await fakeYouTubeEmbeds(page));
    await ofrecer(page);
    await contexto.close();
  },
});

test.beforeEach(({}, testInfo) => {
  test.skip(testInfo.project.name !== "escritorio-light", "cada test fija su tamaño: basta un proyecto");
  test.skip(
    Boolean(process.env.PLAYWRIGHT_BASE_URL) &&
      (process.env.UFC_SHORTS_FIXTURE !== "list" || process.env.UFC_TV_FIXTURE !== "loop"),
    "con PLAYWRIGHT_BASE_URL hacen falta UFC_SHORTS_FIXTURE=list y UFC_TV_FIXTURE=loop",
  );
});

const seccion = (page: Page) => page.locator("section[data-home-feed]");
const videos = (page: Page) => seccion(page).locator('[data-feed-item="video"]');
const facadeDe = (pieza: Locator) => pieza.locator('button[aria-label^="Reproducir: "]');
const dialogo = (page: Page) => page.getByRole("dialog");
const reproductorDelModal = (page: Page) => dialogo(page).locator("[data-turn]");
const tv = (page: Page) => page.locator("section[data-ufc-tv] [data-turn]");
const hero = (page: Page) => page.locator('[data-turn="hero"]');
const hamburguesa = (page: Page) => page.locator('button[aria-controls="mobile-nav"]');
const autoplay = (page: Page) => page.locator('iframe[src*="autoplay=1"]');

async function abrirPortada(page: Page, width: number, height = 900) {
  await page.setViewportSize({ width, height });
  await page.goto("/");
  await esperarHidratacion(page);
  await expect(seccion(page)).toBeAttached();
}

async function necesitaVideos(page: Page) {
  test.skip(
    (await videos(page).count()) === 0,
    "«Noticias y vídeos» no trae ningún vídeo hoy: la API real de YouTube no devolvió ninguno",
  );
}

async function necesitaUfcTv(page: Page) {
  const motivo = await whyNoUfcTvLoop(page);
  test.skip(motivo !== null, motivo ?? "");
}

/** Las columnas que se ven: cuántas posiciones x distintas tienen las piezas visibles. */
async function medirRejilla(page: Page) {
  return seccion(page).evaluate((el) => {
    const cards = [...el.querySelectorAll<HTMLElement>("[data-feed-item]")];
    const visibles = cards.filter((c) => c.getBoundingClientRect().width > 0 && getComputedStyle(c).display !== "none");
    const xs = new Set(visibles.map((c) => Math.round(c.getBoundingClientRect().left)));
    return {
      total: cards.length,
      visibles: visibles.length,
      columnas: xs.size,
      ancho: Math.round(visibles[0]?.getBoundingClientRect().width ?? 0),
      videos: cards.filter((c) => c.dataset.feedItem === "video").length,
      videosVisibles: visibles.filter((c) => c.dataset.feedItem === "video").length,
      ids: cards.map((c) => c.dataset.feedId ?? ""),
    };
  });
}

// Abre el vídeo con un clic de verdad, centrado antes a mano (sin que
// Playwright desplace nada por su cuenta).
async function abrirVideo(page: Page, pieza: Locator) {
  await pieza.evaluate((el) => el.scrollIntoView({ block: "center" }));
  await facadeDe(pieza).click();
  await expect(dialogo(page)).toBeVisible();
}

for (const motor of ["chromium", "webkit"] as const) {
  test.describe(`portada · Noticias y vídeos · ${motor}`, () => {
    test.use({ motor });

    test("9 piezas en una sola rejilla: 1 columna en el móvil, 2 en tablet (8 visibles), 3 desde 1024; sin la columna vieja", async ({
      pagina,
    }) => {
      await abrirPortada(pagina, 1280);
      await expect(seccion(pagina).getByRole("heading", { level: 2, name: "Noticias y vídeos" })).toBeVisible();
      // La columna «Lo último en vídeo» ya no existe, ni ningún aside en la sección.
      await expect(pagina.getByRole("heading", { name: "Lo último en vídeo", includeHidden: true })).toHaveCount(0);
      await expect(seccion(pagina).locator("aside")).toHaveCount(0);
      // «Más noticias y vídeos» lleva a /tendencias, que mezcla las dos cosas.
      const mas = seccion(pagina).getByRole("link", { name: /Más noticias y vídeos/ });
      await expect(mas).toHaveAttribute("href", "/tendencias");
      await expect(pagina.getByText("Más noticias →", { exact: true })).toHaveCount(0);

      const esperado: Record<number, { visibles: number; columnas: number }> = {
        360: { visibles: 9, columnas: 1 },
        390: { visibles: 9, columnas: 1 },
        768: { visibles: 8, columnas: 2 },
        1024: { visibles: 9, columnas: 3 },
        1280: { visibles: 9, columnas: 3 },
        1920: { visibles: 9, columnas: 3 },
      };
      const anchos: Record<number, number> = {};
      for (const [ancho, quiero] of Object.entries(esperado)) {
        const w = Number(ancho);
        await pagina.setViewportSize({ width: w, height: 900 });
        await expect.poll(async () => (await medirRejilla(pagina)).columnas, { message: `columnas a ${w}` }).toBe(quiero.columnas);
        const rejilla = await medirRejilla(pagina);
        expect(rejilla.total, `piezas en el HTML a ${w}`).toBe(9);
        expect(rejilla.visibles, `piezas visibles a ${w}`).toBe(quiero.visibles);
        expect(new Set(rejilla.ids).size, `piezas repetidas a ${w}: ${rejilla.ids.join(", ")}`).toBe(9);
        // Lo que se esconde a 2 columnas es una noticia: todos los vídeos se ven.
        expect(rejilla.videosVisibles, `vídeos visibles a ${w}`).toBe(rejilla.videos);
        anchos[w] = rejilla.ancho;
        await expectNoHorizontalOverflow(pagina, `portada a ${w} px (${motor})`);
      }
      // A 1920 se ve igual que a 1280: la portada se queda en 1280 px.
      expect(anchos[1920]).toBe(anchos[1280]);
    });

    test("6 noticias y 3 vídeos, sin ningún vídeo repetido", async ({ pagina }) => {
      await abrirPortada(pagina, 1280);
      await necesitaVideos(pagina);
      const ids = (await medirRejilla(pagina)).ids;
      const deVideo = ids.filter((id) => id.startsWith("v-"));
      expect(deVideo.length, `vídeos: ${deVideo.join(", ")}`).toBe(3);
      expect(ids.filter((id) => id.startsWith("n-")).length).toBe(6);
      expect(new Set(deVideo).size).toBe(deVideo.length);
    });

    test("nada del reproductor hasta el clic (registro de red); al abrir, un solo reproductor y del visitante", async ({
      pagina,
    }) => {
      await pagina.emulateMedia({ reducedMotion: "reduce" }); // UFC TV quieto: solo cuentan los vídeos.
      await abrirPortada(pagina, 1280);
      await necesitaVideos(pagina);
      const pieza = videos(pagina).first();
      const id = (await pieza.getAttribute("data-feed-id"))!.slice(2);
      await seccion(pagina).evaluate((el) => el.scrollIntoView({ block: "start" }));
      await pagina.waitForTimeout(1_000);
      expect(pedidos(pagina), "se pidió el reproductor antes del clic").toEqual([]);
      await expect(pagina.locator("iframe")).toHaveCount(0);

      await abrirVideo(pagina, pieza);
      await expect(reproductorDelModal(pagina)).toHaveAttribute("data-turn-state", "playing-user");
      await expect(pagina.locator("iframe")).toHaveCount(1);
      expect(pedidos(pagina).map((u) => new URL(u).pathname)).toEqual([`/embed/${id}`]);

      await pagina.keyboard.press("Escape");
      await expect(dialogo(pagina)).toHaveCount(0);
      await expect(pagina.locator("iframe")).toHaveCount(0);
      // El foco vuelve a la miniatura que lo abrió.
      await expect(facadeDe(pieza)).toBeFocused();
    });

    test("a 360 px el reproductor del modal mide al menos 200×200 por dentro y arranca", async ({ pagina }) => {
      await abrirPortada(pagina, 360, 740);
      await necesitaVideos(pagina);
      await abrirVideo(pagina, videos(pagina).first());
      await expect(reproductorDelModal(pagina)).toHaveAttribute("data-turn-state", "playing-user");
      const caja = await reproductorDelModal(pagina).evaluate((el) => ({
        ancho: el.clientWidth,
        alto: el.clientHeight,
        // Dentro de los 16 px de margen del modal (redondeo de subpíxel aparte).
        fuera:
          el.getBoundingClientRect().left < 15.5 || el.getBoundingClientRect().right > window.innerWidth - 15.5,
      }));
      expect(caja.ancho, "ancho por dentro del borde").toBeGreaterThanOrEqual(200);
      expect(caja.alto, "alto por dentro del borde").toBeGreaterThanOrEqual(200);
      expect(caja.fuera, "la caja se come el margen de 16 px o se sale de la pantalla").toBe(false);
    });

    test("en una pantalla de 220 px no cabe un reproductor legal: no se monta, y el póster lleva a YouTube", async ({
      pagina,
    }) => {
      await abrirPortada(pagina, 220, 700);
      await necesitaVideos(pagina);
      const pieza = videos(pagina).first();
      const id = (await pieza.getAttribute("data-feed-id"))!.slice(2);
      await abrirVideo(pagina, pieza);
      await expect(reproductorDelModal(pagina)).toHaveAttribute("data-turn-state", "poster");
      await expect(pagina.locator("iframe")).toHaveCount(0);
      expect(pedidos(pagina)).toEqual([]);
      // Un enlace (no un botón: solo puede abrir YouTube), y se anuncia en ese orden.
      const enlace = reproductorDelModal(pagina).getByRole("link", {
        name: "Ver en YouTube (se abre en otra pestaña)",
        exact: true,
      });
      await expect(enlace).toHaveAttribute("href", `https://www.youtube.com/watch?v=${id}`);
      await expect(enlace).toHaveAttribute("target", "_blank");
    });

    // El menú móvil solo se cierra al navegar, con Escape o al ensanchar: con
    // él abierto se puede bajar y tocar un vídeo. Antes el arranque salía
    // «blocked» y el póster «Ver en YouTube» no hacía nada (QA de R10).
    for (const ancho of [390, 768]) {
      test(`a ${ancho} px, con el menú móvil abierto, el vídeo se ve dentro del modal`, async ({ pagina }) => {
        await abrirPortada(pagina, ancho, 844);
        await necesitaVideos(pagina);
        await hamburguesa(pagina).click();
        await expect(pagina.locator("#mobile-nav")).toBeVisible();
        const pieza = videos(pagina).first();
        const id = (await pieza.getAttribute("data-feed-id"))!.slice(2);
        // Abajo de la pantalla, lejos del menú (que acaba hacia y=425).
        await pieza.evaluate((el) => el.scrollIntoView({ block: "end" }));
        await facadeDe(pieza).click();
        await expect(dialogo(pagina)).toBeVisible();
        await expect(reproductorDelModal(pagina)).toHaveAttribute("data-turn-state", "playing-user");
        expect(pedidos(pagina).map((u) => new URL(u).pathname)).toEqual([`/embed/${id}`]);
        await pagina.keyboard.press("Escape");
        await expect(dialogo(pagina)).toHaveCount(0);
        await expect(pagina.locator("iframe")).toHaveCount(0);
      });
    }

    test("el foco no sale del modal: lo de detrás queda inert y Tab da la vuelta dentro", async ({ pagina }) => {
      await pagina.emulateMedia({ reducedMotion: "reduce" });
      await abrirPortada(pagina, 1280);
      await necesitaVideos(pagina);
      await abrirVideo(pagina, videos(pagina).first());
      const cerrar = dialogo(pagina).getByRole("button", { name: "Cerrar vídeo" });
      await expect(cerrar).toBeFocused();
      await expect(pagina.locator("body > :not([role=dialog])").first()).toHaveJSProperty("inert", true);
      const dentro = () => pagina.evaluate(() => !!document.activeElement?.closest("[role=dialog]"));
      for (let i = 0; i < 6; i++) {
        await pagina.keyboard.press("Tab");
        expect(await dentro(), `Tab ${i + 1}`).toBe(true);
      }
      await cerrar.focus();
      await pagina.keyboard.press("Shift+Tab");
      expect(await dentro(), "Mayús+Tab desde el ✕").toBe(true);
      await cerrar.focus();
      await pagina.keyboard.press("Enter");
      await expect(dialogo(pagina)).toHaveCount(0);
      await expect(pagina.locator("body > *").first()).toHaveJSProperty("inert", false);
    });

    test("con el teclado, el anillo de foco del vídeo se ve ENCIMA de la miniatura", async ({ pagina }) => {
      // 18-oct: el anillo dibujado hacia dentro quedaba DEBAJO de la miniatura
      // (next/image con fill va posicionada y se pinta encima del contorno de su
      // padre), y el de fuera lo recortaba el overflow-hidden de la tarjeta:
      // con Tab no cambiaba ni un píxel. Se compara la fachada antes y después.
      await pagina.emulateMedia({ reducedMotion: "reduce" });
      await abrirPortada(pagina, 1280);
      await necesitaVideos(pagina);
      const pieza = videos(pagina).first();
      await pieza.evaluate((el) => el.scrollIntoView({ block: "center" }));
      const boton = facadeDe(pieza);
      await expect
        .poll(() => boton.locator("img").evaluate((img: HTMLImageElement) => img.complete && img.naturalWidth > 0))
        .toBe(true);
      await pagina.mouse.move(0, 0);
      const antes = await boton.screenshot({ animations: "disabled" });
      // Al botón por teclado (Mayús+Tab y Tab), para que cuente :focus-visible.
      await boton.focus();
      await pagina.keyboard.press("Shift+Tab");
      await pagina.keyboard.press("Tab");
      await expect(boton).toBeFocused();
      expect(await boton.evaluate((el) => el.matches(":focus-visible")), "foco de teclado").toBe(true);
      const anillo = await boton.evaluate((el) => {
        const after = getComputedStyle(el, "::after");
        return { sombra: after.boxShadow, z: after.zIndex, posicion: after.position };
      });
      expect(anillo.sombra, "el ::after dibuja el anillo").not.toBe("none");
      expect(anillo.posicion).toBe("absolute");
      expect(anillo.z, "el anillo va por encima de la miniatura").toBe("10");
      const despues = await boton.screenshot({ animations: "disabled" });
      expect(despues.equals(antes), "con el foco, la fachada tiene que cambiar (el anillo se ve)").toBe(false);
    });

    for (const [w, h] of [
      [844, 390],
      [740, 360],
      [667, 375],
    ] as const) {
      test(`móvil en horizontal (${w}×${h}): el ✕ del modal se ve entero`, async ({ pagina }) => {
        await abrirPortada(pagina, w, h);
        await necesitaVideos(pagina);
        await abrirVideo(pagina, videos(pagina).first());
        const caja = await dialogo(pagina)
          .getByRole("button", { name: "Cerrar vídeo" })
          .evaluate((b) => {
            const r = b.getBoundingClientRect();
            return { arriba: r.top, abajo: r.bottom };
          });
        expect(caja.arriba, "el ✕ se sale por arriba").toBeGreaterThanOrEqual(0);
        expect(caja.abajo).toBeLessThanOrEqual(h);
      });
    }

    test("uno a la vez: el UFC TV que arrancó solo se quita y VUELVE al cerrar", async ({ pagina }) => {
      await abrirPortada(pagina, 1280, 800);
      await necesitaUfcTv(pagina);
      await necesitaVideos(pagina);
      await expect(async () => {
        await tv(pagina).evaluate((el) => el.scrollIntoView({ block: "center" }));
        await expect(tv(pagina)).toHaveAttribute("data-turn-state", "playing-auto", { timeout: 2_000 });
      }).toPass({ timeout: 20_000 });
      // Sin desplazar: el clic por programa no mueve UFC TV de la pantalla.
      await facadeDe(videos(pagina).first()).evaluate((el) => (el as HTMLButtonElement).click());
      await expect(dialogo(pagina)).toBeVisible();
      await expect(tv(pagina)).toHaveAttribute("data-turn-state", "poster");
      await expect(autoplay(pagina)).toHaveCount(1);
      await pagina.keyboard.press("Escape");
      await expect(dialogo(pagina)).toHaveCount(0);
      await expect(async () => {
        await tv(pagina).evaluate((el) => el.scrollIntoView({ block: "center" }));
        await expect(tv(pagina)).toHaveAttribute("data-turn-state", "playing-auto", { timeout: 2_000 });
      }).toPass({ timeout: 20_000 });
    });

    test("uno a la vez: el UFC TV que puso el visitante vuelve a su póster y NO vuelve solo al cerrar", async ({
      pagina,
    }) => {
      // Con menos movimiento UFC TV no arranca solo: así se pone desde su póster.
      await pagina.emulateMedia({ reducedMotion: "reduce" });
      await abrirPortada(pagina, 1280, 800);
      await necesitaUfcTv(pagina);
      await necesitaVideos(pagina);
      await tv(pagina).evaluate((el) => el.scrollIntoView({ block: "center" }));
      await tv(pagina).getByRole("button", { name: /^Toca para reproducir\. UFC TV/ }).click();
      await expect(tv(pagina)).toHaveAttribute("data-turn-state", "playing-user");

      await facadeDe(videos(pagina).first()).evaluate((el) => (el as HTMLButtonElement).click());
      await expect(dialogo(pagina)).toBeVisible();
      await expect(tv(pagina)).toHaveAttribute("data-turn-state", "poster");
      await expect(pagina.locator("iframe")).toHaveCount(1);
      await expect(reproductorDelModal(pagina).locator("iframe")).toHaveCount(1);
      await pagina.keyboard.press("Escape");
      await expect(dialogo(pagina)).toHaveCount(0);

      // Ahora SÍ podría arrancar solo (movimiento normal, en el centro, más de
      // 400 ms): no lo hace, porque era del visitante.
      await pagina.emulateMedia({ reducedMotion: "no-preference" });
      await tv(pagina).evaluate((el) => el.scrollIntoView({ block: "center" }));
      await pagina.waitForTimeout(1_500);
      await expect(tv(pagina)).toHaveAttribute("data-turn-state", "poster");
      await expect(pagina.locator("iframe")).toHaveCount(0);
      // Y el visitante lo vuelve a poner cuando quiere.
      await tv(pagina).getByRole("button", { name: /^Toca para (ver|reproducir)\. UFC TV/ }).click();
      await expect(tv(pagina)).toHaveAttribute("data-turn-state", "playing-user");
    });

    test("uno a la vez: el short del hero vuelve a su póster al abrir un vídeo, y nunca hay dos con autoplay", async ({
      pagina,
    }) => {
      await pagina.emulateMedia({ reducedMotion: "reduce" });
      await abrirPortada(pagina, 390, 844);
      await necesitaVideos(pagina);
      // Cuenta en cada cambio del DOM (y cada 40 ms) los iframes con autoplay.
      await pagina.evaluate(() => {
        const w = window as unknown as { __max: number };
        w.__max = 0;
        const contar = () => {
          w.__max = Math.max(w.__max, document.querySelectorAll('iframe[src*="autoplay=1"]').length);
        };
        new MutationObserver(contar).observe(document.body, { childList: true, subtree: true });
        window.setInterval(contar, 40);
      });
      await hero(pagina).getByRole("button", { name: /^Toca para (ver|reproducir)\. Short de la UFC: / }).click();
      await expect(hero(pagina)).toHaveAttribute("data-turn-state", "playing-user");

      await facadeDe(videos(pagina).first()).evaluate((el) => (el as HTMLButtonElement).click());
      await expect(dialogo(pagina)).toBeVisible();
      await expect(hero(pagina)).toHaveAttribute("data-turn-state", "poster");
      await expect(reproductorDelModal(pagina)).toHaveAttribute("data-turn-state", "playing-user");
      await pagina.keyboard.press("Escape");
      await expect(dialogo(pagina)).toHaveCount(0);
      await pagina.waitForTimeout(1_000);
      await expect(hero(pagina)).toHaveAttribute("data-turn-state", "poster");
      const maximo = await pagina.evaluate(() => (window as unknown as { __max: number }).__max);
      expect(maximo, "dos reproductores con autoplay a la vez").toBe(1);
    });
  });
}
