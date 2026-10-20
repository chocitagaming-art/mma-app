import { expect, test, type Page } from "@playwright/test";

import { esperarHidratacion, expectNoHorizontalOverflow, fakeYouTubeEmbeds } from "./helpers";

// ── Ficha del evento: el careo y el pesaje, en la columna del directo ──────
// Tarea 9 del BACKLOG. Medido en producción el 15-oct (3c4be45): a 1024, 1280 y
// 1920 el careo y el vídeo del pesaje empezaban 96 px a la izquierda del
// directo y del póster. En móvil y tablet no había descuadre y no debe haberlo.
// 🪤 EL DIRECTO NO SE PUEDE PROVOCAR AQUÍ (depende de la ventana real de la
// velada): se mide contra el PÓSTER, que vive en su misma columna
// (lib/live-player-column.ts: «alineado con su póster»).
// /eventos/1098 tiene careo y pesaje con vídeo y título, 24 pesos y póster
// (base, 15-oct). Si pierde alguno, el test se pone ROJO, no se salta.
//
// ── Y la línea del récord de la cartelera, sin partirse en el móvil ──────
// Visto en producción el 15-oct a 390 px en la 1098: «28-7-0 -» / «118 GANA»,
// «15-» / «6-1». Un «-118» partido se lee como «+118». Cada pieza de la línea
// (récord, cuota, GANA) puede bajar entera a la siguiente línea, pero nunca
// partirse por dentro ni salirse de la columna de su esquina.
//
// ── Y lo plegado no se mide ──────
// 🪤 Chromium (149) da caja de verdad a lo que hay dentro de un <details>
// cerrado (content-visibility: hidden), y la medida lo contaba. Hoy cae dentro
// de su esquina (21-oct, 1097: 18 piezas medidas, 2 de ellas plegadas), pero
// el 15-oct el «9-3-0» de Horth, plegado en la 1089, salió «fuera» en una
// medida a mano. Es una guarda: lo que no se ve no puede dar un rojo (ni
// invitar a relajar la tolerancia). La 1089 ya se celebró y las canceladas
// solo se pintan en eventos futuros (BE7): /eventos/1097 (UFC 335, 12-dic-2026)
// pliega una (base, 21-oct). Cuando se celebre, el test se pone ROJO: elige
// otro evento futuro con una cancelada.

const EVENTO = "/eventos/1098";
const EVENTO_CANCELADA = "/eventos/1097";
const ESCRITORIO = [1024, 1280, 1920];
const SIN_CAMBIO = [390, 768];
const MOVILES = [360, 375, 390];
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

type Caja = { left: number; right: number };
type Medida = { contenido: Caja; poster: Caja; bloques: Record<string, Caja> };

async function abrir(page: Page): Promise<void> {
  await page.goto(EVENTO);
  for (const rotulo of ["Careo oficial", "Pesaje oficial"]) {
    await expect(
      page.getByRole("heading", { level: 2, name: rotulo, exact: true }),
      `${EVENTO} ya no pinta «${rotulo}»: elige otro evento con careo, pesaje y póster`,
    ).toBeVisible();
  }
  await expect(page.getByRole("img", { name: /^Póster de / })).toBeVisible();
  await esperarHidratacion(page);
  await page.evaluate(() => document.fonts.ready);
}

async function asentar(page: Page, width: number): Promise<void> {
  await page.setViewportSize({ width, height: 900 });
  await page.evaluate(
    () => new Promise<void>((ok) => requestAnimationFrame(() => requestAnimationFrame(() => ok()))),
  );
}

async function medir(page: Page, width: number): Promise<Medida> {
  await asentar(page, width);
  return page.evaluate(() => {
    const caja = (el: Element | null | undefined, que: string) => {
      if (!el) throw new Error(`no encuentro ${que}`);
      const r = el.getBoundingClientRect();
      if (r.width === 0) throw new Error(`${que} sin caja`); // sin caja = verde falso
      return { left: r.left, right: r.right };
    };
    const seccion = (rotulo: string) => {
      const h2 = [...document.querySelectorAll("h2")].find((h) => h.textContent?.trim() === rotulo);
      return { h2, sec: h2?.closest("section") };
    };
    const careo = seccion("Careo oficial");
    const pesaje = seccion("Pesaje oficial");
    const cont = careo.sec?.parentElement as HTMLElement; // el max-w-5xl de la página
    const estilo = getComputedStyle(cont);
    const c = cont.getBoundingClientRect();
    const video = (sec?: Element | null) =>
      sec?.querySelector('button[aria-label^="Reproducir"], iframe');
    return {
      contenido: {
        left: c.left + parseFloat(estilo.paddingLeft),
        right: c.right - parseFloat(estilo.paddingRight),
      },
      poster: caja(document.querySelector('img[alt^="Póster de"]'), "el póster"),
      bloques: {
        "el rótulo del careo": caja(careo.h2, "el rótulo del careo"),
        "el vídeo del careo": caja(video(careo.sec), "el vídeo del careo"),
        "el rótulo del pesaje": caja(pesaje.h2, "el rótulo del pesaje"),
        "el vídeo del pesaje": caja(video(pesaje.sec), "el vídeo del pesaje"),
        // El marco con borde, no la <table> (que va 1 px por dentro).
        "la tabla del pesaje": caja(pesaje.sec?.querySelector("table")?.parentElement, "la tabla del pesaje"),
      },
    };
  });
}

test(`${EVENTO} en escritorio: careo y pesaje en la columna del directo (768 px, centrada)`, async ({ page }) => {
  await abrir(page);
  for (const width of ESCRITORIO) {
    const m = await medir(page, width);
    // Si la columna no dejara hueco a los lados, el test no probaría nada.
    expect(m.poster.left - m.contenido.left, `a ${width}: el póster ya no deja margen`).toBeGreaterThan(30);
    const centro = (m.contenido.left + m.contenido.right) / 2;
    for (const [que, c] of Object.entries(m.bloques)) {
      expect.soft(Math.abs(c.left - m.poster.left),
        `a ${width}: ${que} empieza en x=${c.left.toFixed(1)}; el directo y el póster, en x=${m.poster.left.toFixed(1)}`,
      ).toBeLessThanOrEqual(TOLERANCIA_PX);
      expect.soft(Math.abs(c.right - m.poster.right),
        `a ${width}: ${que} acaba en x=${c.right.toFixed(1)}; el directo y el póster, en x=${m.poster.right.toFixed(1)}`,
      ).toBeLessThanOrEqual(TOLERANCIA_PX);
      expect.soft(Math.abs((c.left + c.right) / 2 - centro), `a ${width}: ${que} no está centrado`)
        .toBeLessThanOrEqual(TOLERANCIA_PX);
    }
    await expectNoHorizontalOverflow(page, `${EVENTO} a ${width}`);
  }
});

test(`${EVENTO} en móvil y tablet: careo y pesaje a todo el ancho, como antes`, async ({ page }) => {
  await abrir(page);
  for (const width of SIN_CAMBIO) {
    const m = await medir(page, width);
    for (const [que, c] of Object.entries(m.bloques)) {
      expect.soft(Math.abs(c.left - m.contenido.left), `a ${width}: ${que} ya no empieza en el borde`)
        .toBeLessThanOrEqual(TOLERANCIA_PX);
      expect.soft(Math.abs(c.right - m.contenido.right), `a ${width}: ${que} ya no llega al borde`)
        .toBeLessThanOrEqual(TOLERANCIA_PX);
    }
    await expectNoHorizontalOverflow(page, `${EVENTO} a ${width}`);
  }
});

type Lineas = { revisadas: number; ocultas: number; ganas: number; partidas: string[]; fuera: string[] };

// Solo hace falta la cartelera (no el careo ni el pesaje de los otros tests).
async function abrirCartelera(page: Page, evento: string): Promise<void> {
  await page.goto(evento);
  await expect(page.locator('[data-testid="bout-row"]').first()).toBeVisible();
  await esperarHidratacion(page);
  await page.evaluate(() => document.fonts.ready);
}

async function medirLineas(page: Page, width: number): Promise<Lineas> {
  await asentar(page, width);
  return page.evaluate(() => {
    // Cada pieza de la segunda línea de una esquina (texto suelto o span)
    // tiene que caber en UNA línea (se cuentan las alturas distintas de sus
    // fragmentos: un texto que se parte da dos) y quedarse DENTRO de la
    // columna de texto de su esquina. 🪤 Lo segundo es lo que cazó la
    // revisión del 15-oct: con nowrap en todas las piezas y sin espacio entre
    // ellas, la línea entera no saltaba nunca y pisaba el «VS» o la foto
    // azul, sin desbordar el documento (la tarjeta lleva overflow-hidden).
    const fragmentos = (nodo: Node) => {
      const rango = document.createRange();
      rango.selectNodeContents(nodo);
      return [...rango.getClientRects()].filter((r) => r.width > 0);
    };
    const partidas: string[] = [];
    const fuera: string[] = [];
    let revisadas = 0;
    let ocultas = 0;
    let ganas = 0;
    for (const esquina of document.querySelectorAll("[data-bout-corner]")) {
      // Plegada o sin pintar: no se ve, no cuenta (ver el encabezado). El
      // selector va aparte de checkVisibility() para no depender de cómo
      // pliegue cada navegador el <details>.
      if (esquina.closest("details:not([open])") || !esquina.checkVisibility()) {
        ocultas += 1;
        continue;
      }
      const lado = esquina.getAttribute("data-bout-corner");
      const columna = esquina.lastElementChild?.getBoundingClientRect();
      const linea = esquina.querySelectorAll("p")[1];
      if (!columna || !linea) continue;
      for (const nodo of linea.childNodes) {
        const texto = nodo.textContent?.trim() ?? "";
        const rects = fragmentos(nodo);
        if (!texto || rects.length === 0) continue; // sin caja no cuenta como revisada
        revisadas += 1;
        if (texto === "GANA") ganas += 1;
        if (new Set(rects.map((r) => Math.round(r.top))).size > 1) partidas.push(`«${texto}» (${lado})`);
        const sale = rects.some((r) => r.left < columna.left - 1 || r.right > columna.right + 1);
        if (sale) fuera.push(`«${texto}» (${lado})`);
      }
    }
    return { revisadas, ocultas, ganas, partidas, fuera };
  });
}

async function expectLineasEnteras(page: Page, m: Lineas, que: string): Promise<void> {
  expect.soft(m.partidas, `${que}: piezas partidas en dos líneas`).toEqual([]);
  expect.soft(m.fuera, `${que}: piezas que se salen de su esquina (pisan el VS o la foto)`).toEqual([]);
  await expectNoHorizontalOverflow(page, que);
}

test(`${EVENTO} en el móvil: el récord, la cuota y GANA nunca se parten por dentro ni se salen de su esquina`, async ({ page }) => {
  await abrirCartelera(page, EVENTO);
  for (const width of MOVILES) {
    const m = await medirLineas(page, width);
    // Sin piezas o sin ningún GANA, el test no estaría mirando lo que se rompía.
    expect(m.revisadas, `a ${width}: no encuentro las líneas del récord`).toBeGreaterThan(20);
    expect(m.ganas, `a ${width}: ${EVENTO} ya no tiene ganadores que pintar`).toBeGreaterThan(5);
    await expectLineasEnteras(page, m, `${EVENTO} a ${width}`);
  }
});

test(`${EVENTO_CANCELADA} en el móvil: la cancelada plegada no se mide; desplegada, cumple lo mismo`, async ({ page }) => {
  await abrirCartelera(page, EVENTO_CANCELADA);
  const plegado = page.locator("details", { has: page.locator("[data-bout-corner]") });
  await expect(plegado, `${EVENTO_CANCELADA} ya no pliega canceladas: elige otro evento futuro con una`).toHaveCount(1);
  const esquinas = await plegado.locator("[data-bout-corner]").count();
  const cerrado = new Map<number, number>();
  for (const width of MOVILES) {
    const m = await medirLineas(page, width);
    // Exactamente las de la cancelada: ni una visible de menos, ni una plegada de más.
    expect(m.ocultas, `a ${width}: se está midiendo lo plegado`).toBe(esquinas);
    expect(m.revisadas, `a ${width}: no encuentro las líneas del récord`).toBeGreaterThan(10);
    cerrado.set(width, m.revisadas);
    await expectLineasEnteras(page, m, `${EVENTO_CANCELADA} plegada a ${width}`);
  }
  // Abierta ya se ve: entra en la medida y tiene que cumplir lo mismo.
  await plegado.locator("summary").click();
  await expect(plegado).toHaveAttribute("open", "");
  for (const width of MOVILES) {
    const m = await medirLineas(page, width);
    expect(m.ocultas, `a ${width}: con el <details> abierto aún salta esquinas`).toBe(0);
    expect(m.revisadas - (cerrado.get(width) ?? 0), `a ${width}: la cancelada abierta no se mide`)
      .toBeGreaterThanOrEqual(esquinas);
    await expectLineasEnteras(page, m, `${EVENTO_CANCELADA} desplegada a ${width}`);
  }
});
