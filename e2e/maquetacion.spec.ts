import { expect, test, type Page } from "@playwright/test";

import { expectNoHorizontalOverflow } from "./helpers";

// ── Geometría del hero de la portada y de la foto de la ficha ───────────────
//
// Los cambios de maquetación del 29-sep-2026, aprobados por el dueño con
// vistas previas:
//   · Portada, móvil (<768): el titular primero y el vídeo PEQUEÑO a su
//     derecha. Antes el vídeo iba encima y llenaba la primera pantalla.
//   · Portada, tablet (768-1023): dos columnas, como el escritorio.
//   · Portada, escritorio (≥1024): SIN CAMBIOS. Se prueba para que siga así.
//   · Ficha, tablet: la foto de cuerpo entero con tope de 400 px. A todo el
//     ancho (691 px a 820) la foto vertical de ufc.com se ampliaba hasta
//     enseñar solo la cabeza.
//
// Nada de esto lo caza el desbordamiento de routes.spec: un vídeo encima del
// titular o una foto a todo el ancho no desbordan nada. Aquí se mide la
// GEOMETRÍA: dónde cae cada caja y cuánto mide.
//
// Corre en UN proyecto: cada test fija su viewport y el tema no cambia ninguna
// medida. Y sin red de fuera: los vídeos del hero son locales (/public/videos),
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
  await expect(page.locator("section", { has: h1 }).locator("video")).toBeVisible();
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
    const video = seccion.querySelector("video") as HTMLVideoElement;
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

test("portada 390×844: el vídeo pequeño va a la derecha del titular y el hero cabe en la primera pantalla", async ({
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
  expect(m.video.width, "ancho del vídeo en móvil").toBeGreaterThanOrEqual(110);
  expect(m.video.width, "ancho del vídeo en móvil").toBeLessThanOrEqual(130);
  expect(m.h1.bottom, "el titular queda por debajo del pliegue").toBeLessThanOrEqual(m.alto);
  // Lo aprobado: el hero ENTERO en la primera pantalla, y asoma lo de debajo.
  expect(m.seccion.bottom, "el hero no cabe en la primera pantalla").toBeLessThan(m.alto);
  await expectNoHorizontalOverflow(page, "portada a 390×844");
});

test("portada 360×800: «INTELIGENCIA» cabe en su columna y deja el vídeo a su derecha", async ({
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
    expect(m.video.width, "ancho del vídeo en tablet").toBeGreaterThanOrEqual(260);
    expect(m.video.width, "ancho del vídeo en tablet").toBeLessThanOrEqual(300);
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
    expect(m.video.width, "ancho del vídeo en escritorio").toBeGreaterThanOrEqual(300);
    expect(m.video.width, "ancho del vídeo en escritorio").toBeLessThanOrEqual(340);
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
