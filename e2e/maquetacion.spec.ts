import { expect, test, type Page } from "@playwright/test";

import { expectNoHorizontalOverflow } from "./helpers";

// ── Geometría del hero de la portada, de UFC TV y de la foto de la ficha ────
//
// Los cambios de maquetación del 29-sep-2026, aprobados por el dueño con
// vistas previas:
//   · Portada, móvil (<768): el titular primero y el short a su derecha.
//     Antes el vídeo iba encima y llenaba la primera pantalla. Desde los
//     shorts de la UFC (variante A de la maqueta): 200 px, el mínimo de
//     YouTube, pegado al borde derecho.
//   · Portada, tablet (768-1023): dos columnas, como el escritorio.
//   · Portada, escritorio (≥1024): SIN CAMBIOS. Se prueba para que siga así.
//   · Ficha, tablet: la foto de cuerpo entero con tope de 400 px. A todo el
//     ancho (691 px a 820) la foto vertical de ufc.com se ampliaba hasta
//     enseñar solo la cabeza.
//   · Portada, UFC TV: más grande en escritorio, sin salirse de la pantalla,
//     y en móvil con el alto mínimo que pide YouTube. Ver su sección, abajo.
//
// Nada de esto lo caza el desbordamiento de routes.spec: un vídeo encima del
// titular o una foto a todo el ancho no desbordan nada. Aquí se mide la
// GEOMETRÍA: dónde cae cada caja y cuánto mide.
//
// Corre en UN proyecto: cada test fija su viewport y el tema no cambia ninguna
// medida. Y sin red de fuera: los shorts del hero salen enlatados
// (UFC_SHORTS_FIXTURE=list en playwright.config.ts) y su iframe se corta: se
// mide el MARCO del short (data-testid="hero-short"), esté el póster o el
// reproductor dentro,
// las imágenes de terceros se sirven con un PNG de relleno y el resto se corta.
// 🪤 La foto de la ficha se RELLENA, no se corta: si no carga, el componente
// cae al headshot y la caja que se mide deja de existir.
//
// ⚠️ Y NADA de `test.only`: con CI=true, `forbidOnly` tumba la recolección.

// PNG transparente de 1×1. La caja de la foto la fija el CSS, no la imagen.
const PNG_RELLENO = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAACXBIWXMAAAPoAAAD6AG1e1JrAAAADUlEQVQImWNgYGBgAAAABQABh6FO1AAAAABJRU5ErkJggg==",
  "base64",
);

// Ficha que ya usa el resto de la suite. Tiene foto athlete_bio_full_body de
// ufc.com (460×700), la que se ampliaba en tablet (comprobado el 29-sep-2026).
const FICHA = "/fighters/6493";

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
  // La franja «En directo» depende del calendario real y empujaría el hero
  // hacia abajo. Registrada DESPUÉS, esta ruta gana a la de arriba.
  await page.route("**/api/live/now", (route) =>
    route.fulfill({ status: 200, json: { phase: "none" } }),
  );
});

type Caja = { left: number; right: number; top: number; bottom: number; width: number };

type HeroMedido = {
  anchoUtil: number;
  alto: number;
  h1: Caja;
  // El TEXTO del titular, medido con un Range: la caja del h1 puede ser más
  // ancha que sus letras, o las letras salirse de la caja.
  textoH1: Caja;
  palabra: string;
  inteligencia: Caja;
  // null en móvil, donde el div del texto es `display: contents` y no tiene caja.
  bloqueTexto: Caja | null;
  video: Caja;
  // Borde derecho del contenido de la rejilla (sin su relleno).
  finRejilla: number;
  seccion: Caja;
};

/**
 * Carga la portada a ese tamaño y mide el hero.
 *
 * 🪤 Se espera a que el titular sea VISIBLE, no al `load`: nada más cargar, el
 * contenido que llega en streaming aún no tiene caja y todo mide 0 (visto el
 * 29-sep-2026). Y luego a que acaben las animaciones FINITAS: animate-rise
 * baja cada bloque 18 px durante 0,7 s, con retrasos de hasta 320 ms, y medir
 * a mitad daría los bordes movidos. El punto «en vivo» late sin fin: se ignora.
 */
async function medirHero(page: Page, width: number, height: number): Promise<HeroMedido> {
  await page.setViewportSize({ width, height });
  await page.goto("/");

  const h1 = page.getByRole("heading", { level: 1 });
  await expect(h1).toBeVisible();
  await expect(page.locator("section", { has: h1 }).getByTestId("hero-short")).toBeVisible();
  await page.waitForFunction(() =>
    document
      .getAnimations()
      .every(
        (a) => a.playState !== "running" || a.effect?.getComputedTiming().iterations === Infinity,
      ),
  );
  // Y a la fuente del titular: la de reserva mide un 14 % más y a 360 px
  // cambiaría las cajas (font-display: swap).
  await page.evaluate(() => document.fonts.ready);

  return h1.evaluate((titular) => {
    const caja = (r: DOMRect) => ({
      left: r.left,
      right: r.right,
      top: r.top,
      bottom: r.bottom,
      width: r.width,
    });
    const seccion = titular.closest("section") as HTMLElement;
    const rejilla = seccion.firstElementChild as HTMLElement;
    // The short's frame: the poster or the iframe sit inside it, at its size.
    const video = seccion.querySelector('[data-testid="hero-short"]') as HTMLElement;
    const bloque = titular.parentElement as HTMLElement;

    const rangoTitular = document.createRange();
    rangoTitular.selectNodeContents(titular);
    // «Inteligencia» es el primer texto del h1, antes del <br>.
    const nodoPalabra = Array.from(titular.childNodes).find(
      (nodo) => nodo.nodeType === Node.TEXT_NODE && nodo.textContent?.trim(),
    ) as Text;
    const rangoPalabra = document.createRange();
    rangoPalabra.selectNodeContents(nodoPalabra);

    return {
      anchoUtil: document.documentElement.clientWidth,
      alto: window.innerHeight,
      h1: caja(titular.getBoundingClientRect()),
      textoH1: caja(rangoTitular.getBoundingClientRect()),
      palabra: (nodoPalabra.textContent ?? "").trim().toUpperCase(),
      inteligencia: caja(rangoPalabra.getBoundingClientRect()),
      bloqueTexto:
        getComputedStyle(bloque).display === "contents"
          ? null
          : caja(bloque.getBoundingClientRect()),
      video: caja(video.getBoundingClientRect()),
      finRejilla:
        rejilla.getBoundingClientRect().right - parseFloat(getComputedStyle(rejilla).paddingRight),
      seccion: caja(seccion.getBoundingClientRect()),
    };
  });
}

test("portada 390×844: el short de 200 px va a la derecha del titular, pegado al borde, y el hero cabe en la primera pantalla", async ({
  page,
}) => {
  const m = await medirHero(page, 390, 844);

  expect(
    m.video.left,
    "el vídeo no está a la derecha del titular (¿vuelve a ir encima?)",
  ).toBeGreaterThan(m.textoH1.right);
  expect(
    Math.abs(m.video.top - m.h1.top),
    `el borde de arriba del vídeo (${m.video.top}) no casa con el del titular (${m.h1.top})`,
  ).toBeLessThanOrEqual(12);
  // 200 px: YouTube's minimum player (200x200). Not one pixel less.
  expect(Math.abs(m.video.width - 200), `ancho del short en móvil (${m.video.width})`).toBeLessThanOrEqual(0.5);
  expect(
    Math.abs(m.video.right - m.anchoUtil),
    `el short no está pegado al borde derecho (${m.video.right} de ${m.anchoUtil})`,
  ).toBeLessThanOrEqual(0.5);
  expect(m.h1.bottom, "el titular queda por debajo del pliegue").toBeLessThanOrEqual(m.alto);
  // Lo aprobado: el hero ENTERO en la primera pantalla, y asoma lo de debajo.
  expect(m.seccion.bottom, "el hero no cabe en la primera pantalla").toBeLessThan(m.alto);
  await expectNoHorizontalOverflow(page, "portada a 390×844");
});

test("portada 360×800: «INTELIGENCIA» cabe en su columna y deja el short de 200 px a su derecha", async ({
  page,
}) => {
  const m = await medirHero(page, 360, 800);

  expect(m.palabra, "el titular ha cambiado: revisa qué palabra medir").toBe("INTELIGENCIA");
  // El texto REAL, no la caja: es lo que se vería salirse.
  expect(m.inteligencia.right, "«INTELIGENCIA» se sale de su columna").toBeLessThanOrEqual(
    m.h1.right + 0.5,
  );
  expect(
    m.inteligencia.right,
    "«INTELIGENCIA» no deja sitio al vídeo a su derecha",
  ).toBeLessThanOrEqual(m.video.left);
  // La columna del texto es `1fr`: si la palabra no cupiera, empujaría el
  // vídeo fuera de la rejilla en vez de montarse. Eso también es un fallo.
  expect(m.video.right, "el titular empuja el vídeo fuera de la rejilla").toBeLessThanOrEqual(
    m.finRejilla + 0.5,
  );
  expect(Math.abs(m.video.width - 200), `ancho del short a 360 (${m.video.width})`).toBeLessThanOrEqual(0.5);
  await expectNoHorizontalOverflow(page, "portada a 360×800");
});

// 768 es el primer ancho de tablet y el más justo para «INTELIGENCIA» a 72 px.
for (const [width, height] of [
  [768, 1024],
  [820, 1180],
] as const) {
  test(`portada ${width}×${height}: dos columnas, texto a la izquierda y vídeo de ~280 px a la derecha`, async ({
    page,
  }) => {
    const m = await medirHero(page, width, height);

    expect(m.bloqueTexto, "el texto no es un bloque en tablet").not.toBeNull();
    const texto = m.bloqueTexto as Caja;
    expect(m.video.left, "el vídeo no está a la derecha del texto").toBeGreaterThanOrEqual(
      texto.right,
    );
    expect(Math.abs(m.video.width - 280), `ancho del short en tablet (${m.video.width})`).toBeLessThanOrEqual(0.5);
    expect(m.inteligencia.right, "«INTELIGENCIA» se sale de su columna").toBeLessThanOrEqual(
      texto.right + 0.5,
    );
    // Centrados en vertical el uno con el otro.
    expect(
      Math.abs((m.video.top + m.video.bottom) / 2 - (texto.top + texto.bottom) / 2),
      "el texto y el vídeo no están centrados en vertical",
    ).toBeLessThanOrEqual(2);
    await expectNoHorizontalOverflow(page, `portada a ${width}×${height}`);
  });
}

for (const [width, height] of [
  [1024, 768],
  [1280, 800],
] as const) {
  test(`portada ${width}×${height}: el escritorio de siempre, vídeo de 330 px a la derecha del texto`, async ({
    page,
  }) => {
    const m = await medirHero(page, width, height);

    expect(m.bloqueTexto, "el texto no es un bloque en escritorio").not.toBeNull();
    const texto = m.bloqueTexto as Caja;
    expect(m.video.left, "el vídeo no está a la derecha del texto").toBeGreaterThanOrEqual(
      texto.right,
    );
    expect(Math.abs(m.video.width - 330), `ancho del short en escritorio (${m.video.width})`).toBeLessThanOrEqual(0.5);
    expect(m.inteligencia.right, "«INTELIGENCIA» se sale de su columna").toBeLessThanOrEqual(
      texto.right + 0.5,
    );
    await expectNoHorizontalOverflow(page, `portada a ${width}×${height}`);

    if (width === 1280) {
      // «El escritorio de siempre» fijado con las cifras de main (d3f8fd1,
      // medidas el 29-sep-2026): un retoque del móvil sobre la misma rejilla
      // que mueva el escritorio tiene que ponerse en rojo aquí.
      const fijo = await page.getByRole("heading", { level: 1 }).evaluate((titular) => {
        const rejilla = (titular.closest("section") as HTMLElement).firstElementChild as HTMLElement;
        const estilo = getComputedStyle(rejilla);
        return {
          gap: parseFloat(estilo.columnGap),
          columnas: estilo.gridTemplateColumns.split(" ").map(parseFloat),
          h1: parseFloat(getComputedStyle(titular).fontSize),
        };
      });
      expect(fijo.gap, "hueco entre columnas en escritorio").toBe(24);
      expect(fijo.columnas, "proporción 1.05/0.95 en escritorio").toHaveLength(2);
      expect(Math.abs(fijo.columnas[0] - 625.8), "columna del texto en escritorio").toBeLessThanOrEqual(1);
      expect(Math.abs(fijo.columnas[1] - 566.2), "columna del vídeo en escritorio").toBeLessThanOrEqual(1);
      expect(fijo.h1, "tamaño del titular en escritorio").toBe(96);
      expect(m.video.width, "ancho del vídeo en escritorio").toBeCloseTo(330, 0);
    }
  });
}

type FotoMedida = { marco: Caja; columna: Caja };

/** Carga la ficha a ese tamaño y mide la caja de la foto y la de su columna. */
async function medirFotoFicha(
  page: Page,
  width: number,
  height: number,
): Promise<FotoMedida | null> {
  await page.setViewportSize({ width, height });
  await page.goto(FICHA);

  const foto = page.getByRole("img", { name: /^Foto de cuerpo entero de / });
  // Sin foto en la BD el componente pinta el headshot y no hay caja que medir.
  const hayFoto = await foto
    .waitFor({ state: "visible", timeout: 10_000 })
    .then(() => true)
    .catch(() => false);
  if (!hayFoto) return null;

  return foto.evaluate((img) => {
    const caja = (r: DOMRect) => ({
      left: r.left,
      right: r.right,
      top: r.top,
      bottom: r.bottom,
      width: r.width,
    });
    // La imagen va con `fill`: su padre es el marco y el de este, la columna.
    const marco = img.parentElement as HTMLElement;
    return {
      marco: caja(marco.getBoundingClientRect()),
      columna: caja((marco.parentElement as HTMLElement).getBoundingClientRect()),
    };
  });
}

test("ficha: la foto de cuerpo entero no pasa de 400 px en tablet, y en móvil y escritorio llena su columna", async ({
  page,
}) => {
  const tablet = await medirFotoFicha(page, 820, 1180);
  test.skip(
    tablet === null,
    `${FICHA} ya no tiene foto de cuerpo entero en la BD: elige otra ficha con foto de ufc.com`,
  );
  const { marco, columna } = tablet as FotoMedida;
  expect(marco.width, "la foto vuelve a ir a todo el ancho en tablet").toBeLessThanOrEqual(400.5);
  expect(marco.width, "la caja de la foto se ha encogido").toBeGreaterThanOrEqual(300);
  expect(
    Math.abs((marco.left + marco.right) / 2 - (columna.left + columna.right) / 2),
    "la foto no está centrada en su columna",
  ).toBeLessThanOrEqual(1);
  await expectNoHorizontalOverflow(page, `${FICHA} a 820×1180`);

  // Móvil y escritorio no cambian: la foto llena su columna, como siempre.
  for (const [width, height] of [
    [390, 844],
    [1280, 800],
  ] as const) {
    const medida = await medirFotoFicha(page, width, height);
    expect(medida, `${width}: la foto ha desaparecido`).not.toBeNull();
    const { marco: m, columna: c } = medida as FotoMedida;
    expect(Math.abs(m.width - c.width), `${width}: la foto no llena su columna`).toBeLessThanOrEqual(
      1,
    );
    expect(m.left, `${width}: la foto se sale de su columna`).toBeGreaterThanOrEqual(c.left - 0.5);
    expect(m.right, `${width}: la foto se sale de su columna`).toBeLessThanOrEqual(c.right + 0.5);
    await expectNoHorizontalOverflow(page, `${FICHA} a ${width}×${height}`);
  }
});

// ── UFC TV: más grande en la portada, y entero en la pantalla ───────────────
//
// Hasta el 29-sep-2026 medía 768 px en todas las pantallas de escritorio: el
// 63 % del carril de la portada. Ahora su columna depende del ALTO de la
// ventana, clamp(48rem, (100vh − 10rem) × 16/9, 64rem), escrita en
// src/lib/live-player-column.ts:
//   · En una ventana de escritorio normal, 1024 px: el tope.
//   · En una baja, lo que quepa: la cabecera, los rótulos y el vídeo entero
//     tienen que entrar en la pantalla. Los 10rem son la cabecera y los rótulos,
//     y aquí se mide que de verdad caben.
//   · Nunca menos de 768, lo que medía antes.
// Y en móvil, un visor de al menos 200 px de alto: la norma de YouTube.
//
// El webServer arranca con UFC_TV_FIXTURE=loop, así que es el bucle enlatado,
// sin red. El directo del EVENTO usa la misma columna en la portada, pero aquí
// no sale (depende de la ventana real de la velada): su ancho lo vigila
// src/lib/live-embed-callsites.test.ts.

type UfcTvMedido = {
  ventana: number;
  // La cabecera es sticky: al bajar, es lo que tapa la parte de arriba.
  cabecera: number;
  columna: { top: number; width: number };
  iframe: { bottom: number; width: number; height: number };
  // Lo de DENTRO del borde del iframe: el reproductor que mide YouTube.
  visor: { width: number; height: number };
};

/** Carga la portada a ese tamaño y mide el bloque de UFC TV. */
async function medirUfcTv(page: Page, width: number, height: number): Promise<UfcTvMedido> {
  test.skip(
    Boolean(process.env.PLAYWRIGHT_BASE_URL),
    "con PLAYWRIGHT_BASE_URL no hay UFC_TV_FIXTURE: el contenido depende del día",
  );
  await page.setViewportSize({ width, height });
  await page.goto("/");

  // 🪤 El hueco llega por streaming (va en <Suspense>): se espera al bloque, no
  // al `load`. Y se sale como en e2e/ufc-tv.spec.ts cuando la portada no pinta
  // UFC TV por el estado de la base, que es decisión del dueño y no un fallo.
  const bloque = page.locator("section[data-ufc-tv]");
  const huecoEvento = page.getByRole("heading", { name: "Retransmisión oficial" });
  const callado = page.locator("[data-live-slot]");
  await expect(bloque.or(huecoEvento).or(callado).first()).toBeAttached();

  const motivo = (await callado.count()) > 0 ? await callado.getAttribute("data-live-slot") : null;
  test.skip(
    motivo !== null,
    `el hueco se calla a propósito (${motivo}): lo manda events.live_video_id, no UFC TV`,
  );
  test.skip(
    (await huecoEvento.count()) > 0,
    "el próximo evento tiene live_video_id a mano: la portada enseña ese directo, no UFC TV",
  );

  // 🪤 ESTAR EN EL DOM NO ES TENER CAJA. React mete lo que llega por streaming
  // en un <div hidden> y solo después lo mueve a su sitio: medido nada más
  // aparecer, la columna medía 0 (visto el 29-sep-2026).
  await expect(bloque).toBeVisible();
  // Un servidor ya vivo en el 3100 (reuseExistingServer) sin UFC_TV_FIXTURE
  // mediría lo de YouTube de verdad: que falle con su motivo, no con una medida rara.
  await expect(bloque, "¿reuseExistingServer reutilizó un server sin UFC_TV_FIXTURE?").toHaveAttribute(
    "data-ufc-tv",
    "loop",
  );
  // Los rótulos cambian de alto con la fuente (font-display: swap).
  await page.evaluate(() => document.fonts.ready);
  const cabecera = await page
    .getByRole("banner")
    .evaluate((el) => el.getBoundingClientRect().height);

  const medida = await bloque.evaluate((seccion) => {
    const columna = (seccion.firstElementChild as HTMLElement).getBoundingClientRect();
    const iframe = seccion.querySelector("iframe") as HTMLIFrameElement;
    const caja = iframe.getBoundingClientRect();
    return {
      ventana: window.innerHeight,
      columna: { top: columna.top, width: columna.width },
      iframe: { bottom: caja.bottom, width: caja.width, height: caja.height },
      visor: { width: iframe.clientWidth, height: iframe.clientHeight },
    };
  });
  return { cabecera, ...medida };
}

/** El vídeo llena su columna y es 16:9 (en escritorio no manda el mínimo). */
function expectVideo169(m: UfcTvMedido, contexto: string) {
  expect(
    Math.abs(m.iframe.width - m.columna.width),
    `${contexto}: el vídeo (${m.iframe.width}) no llena su columna (${m.columna.width})`,
  ).toBeLessThanOrEqual(0.5);
  expect(
    Math.abs(m.iframe.height - (m.iframe.width * 9) / 16),
    `${contexto}: el vídeo no es 16:9 (${m.iframe.width}×${m.iframe.height})`,
  ).toBeLessThanOrEqual(1);
}

for (const [width, height, ancho, margen] of [
  [1280, 800, 1024, 1],
  [1366, 768, 1024, 1],
  [1440, 900, 1024, 1],
  [1920, 1080, 1024, 1],
  // (640 − 160) × 16/9 = 853,3: aquí ya manda el alto de la ventana.
  [1280, 640, 853.3, 2],
] as const) {
  test(`portada ${width}×${height}: UFC TV mide ${Math.round(ancho)} px y cabe entero bajo la cabecera`, async ({
    page,
  }) => {
    const m = await medirUfcTv(page, width, height);
    const contexto = `UFC TV a ${width}×${height}`;

    expect(
      Math.abs(m.columna.width - ancho),
      `${contexto}: la columna mide ${m.columna.width} y no ${ancho}`,
    ).toBeLessThanOrEqual(margen);
    expectVideo169(m, contexto);
    // Bajando hasta el bloque, la cabecera fija tapa su alto: lo que queda de
    // ventana tiene que tener sitio para los rótulos y el vídeo entero.
    const bloqueEntero = m.cabecera + (m.iframe.bottom - m.columna.top);
    expect(
      bloqueEntero,
      `${contexto}: cabecera (${m.cabecera}) + rótulos + vídeo no caben en ${m.ventana} px`,
    ).toBeLessThanOrEqual(m.ventana);
    await expectNoHorizontalOverflow(page, `portada a ${width}×${height}`);
  });
}

test("portada 1280×560: UFC TV nunca baja de los 768 px que medía antes", async ({ page }) => {
  // (560 − 160) × 16/9 = 711 < 768: manda el suelo, así que aquí no se exige
  // que quepa entero. En una ventana así, más pequeño que antes no.
  const m = await medirUfcTv(page, 1280, 560);
  expect(
    Math.abs(m.columna.width - 768),
    `la columna mide ${m.columna.width}: el suelo de 768 px no se respeta`,
  ).toBeLessThanOrEqual(1);
  expectVideo169(m, "UFC TV a 1280×560");
  await expectNoHorizontalOverflow(page, "portada a 1280×560");
});

for (const [width, height] of [
  [360, 800],
  [390, 844],
] as const) {
  test(`portada ${width}×${height}: el visor de UFC TV mide al menos 200 px de alto`, async ({
    page,
  }) => {
    // En 16:9 medía 183 px a 360 y 199 a 390, por debajo de los 200×200 que
    // pide YouTube para un reproductor incrustado.
    const m = await medirUfcTv(page, width, height);
    expect(m.visor.height, `alto del visor de UFC TV, dentro del borde, a ${width}`).toBeGreaterThanOrEqual(
      200,
    );
    expect(m.visor.width, `ancho del visor de UFC TV a ${width}`).toBeGreaterThanOrEqual(200);
    // El mínimo le da alto, no ancho: sigue llenando su columna.
    expect(
      Math.abs(m.iframe.width - m.columna.width),
      `a ${width}, el vídeo (${m.iframe.width}) no llena su columna (${m.columna.width})`,
    ).toBeLessThanOrEqual(0.5);
    await expectNoHorizontalOverflow(page, `portada a ${width}×${height}`);
  });
}
