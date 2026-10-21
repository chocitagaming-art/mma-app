import { readFileSync } from "node:fs";
import path from "node:path";

import { expect, test as base, type Browser, type Page } from "@playwright/test";

import { expectNoHorizontalOverflow } from "./helpers";

// ── /clasificacion: caras grandes en relieve y el campeón con su marco dorado ──
//
// Lo pidió el dueño el 21-oct-2026: «ya que remodelamos el chip de luchadores,
// con fotos más grandes y nítidas, vamos a hacer lo mismo con el chip de
// clasificación, y seguimos manteniendo la foto del campeón con el borde dorado
// y dándole su importancia». Lo que se vigila, con cifras FIJAS del diseño
// (ranking-division-card.tsx) y no deducidas de lo que pinta la página:
//   · La cara de cada fila mide 75 px de alto (antes, un cuadrado de 36) y la
//     del campeón 120 (antes, 68 dentro de su marco de 72).
//   · El campeón conserva el marco dorado: el color de su borde es ámbar.
//   · Cada cara de ufc.com ofrece la guardada (256) y el original (500), y el
//     navegador baja el original SOLO donde hace falta: en las filas a 3x y en
//     el campeón a 2x y 3x. A 1x, ningún original en toda la página.
//   · Sin desbordamiento de 360 a 1920 y ningún nombre cortado; tampoco el
//     texto del bloque del campeón («Campeón», el apodo, el récord).
//   · La foto no repite el nombre al lector de pantalla: lo dice el enlace.
//   · En oscuro el marco sigue dorado (amber-400), no solo en claro.
//   · El foco de teclado dibuja un anillo de 2 px alrededor de TODA la fila.
//   · WebKit pinta la página entera: un drop-shadow en la <img> dentro de la
//     animación de entrada dejaba un cuadro de 32×32 sin pintar en la esquina
//     de cada tarjeta (blanco en oscuro). Las cuentas de geometría no lo ven.
//
// 🪤 Los selectores valen para la versión de antes Y para la de ahora (filas =
// `main ol > li`, caras = img con alt «Foto de…» o «Silueta de…», campeón = el
// bloque con el texto «Campeón»): contra producción, el test tiene que fallar
// por lo que mide, no por un data-testid que entonces no existía.
//
// 🪤 Las fotos externas se sirven ENLATADAS con su medida real: 256×160 la
// guardada de ufc.com, 500×325 su original (un /images/ de ufc.com SIN
// /styles/) y 350×254 la de ESPN (la de verdad es 600×436, la misma forma).
//
// Corre en Chromium Y en WebKit (el dueño mira en un iPhone). Un solo proyecto
// (escritorio-light): cada test fija su pantalla y su densidad de píxeles.

type Motor = "chromium" | "webkit";
type Pantalla = { width: number; height: number; dpr: number; tema?: "light" | "dark" };
type Abierta = { pagina: Page; originales: string[] };
type Abrir = (pantalla: Pantalla) => Promise<Abierta>;

const FIXTURES = path.join(__dirname, "fixtures");
const FOTO_GUARDADA = readFileSync(path.join(FIXTURES, "luchadores-headshot-256x160.png"));
const FOTO_ORIGINAL = readFileSync(path.join(FIXTURES, "headshot-hd-500x325.png"));
const FOTO_ESPN = readFileSync(path.join(FIXTURES, "careo-headshot.png"));

const ORIGINAL = /^https:\/\/www\.ufc\.com\/images\/(?!styles\/)(\d{4}-\d{2}|image)\//;
const GUARDADA = /\/images\/styles\/event_results_athlete_headshot\//;
const SRCSET_HD = / 256w, https:\/\/www\.ufc\.com\/images\/(?!styles\/).+ 500w$/;

// Del 360 del móvil más estrecho al 1920 de un monitor grande, pasando por
// cada corte de la rejilla: 1 columna, 2 (md), 2 con más margen (lg), 3 (xl).
// 600 y 1240: los dos tramos en que TODAS las tarjetas son anchas (nombre de
// fila a 22 px y el campeón al lado de la foto), una columna y dos.
const ANCHOS = [360, 390, 600, 768, 1024, 1240, 1280, 1920];

// El diseño pinta 75 y 120 px; el margen absorbe el redondeo de subpíxel.
const ALTO_MIN_CARA_FILA = 72;
const ALTO_MIN_CARA_CAMPEON = 110;

// Los culpables de un fallo, sin inundar la salida: los 5 primeros y la cuenta.
function resumen(culpables: string[]): string[] {
  return culpables.length <= 5 ? culpables : [...culpables.slice(0, 5), `… y ${culpables.length - 5} más`];
}

const test = base.extend<{ motor: Motor; abrir: Abrir }, { abrirWebkit: () => Promise<Browser> }>({
  motor: ["chromium", { option: true }],
  // WebKit se lanza a mano y una sola vez por worker: los proyectos de
  // playwright.config.ts son todos Chromium.
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
  // Contexto nuevo por pantalla y SIN service worker (el de la PWA sirve el CSS
  // viejo) ni caché compartida: cada srcset se elige desde cero.
  abrir: async ({ motor, browser, abrirWebkit, baseURL }, ofrecer) => {
    const navegador = motor === "webkit" ? await abrirWebkit() : browser;
    const contextos: { close: () => Promise<void> }[] = [];
    await ofrecer(async (pantalla) => {
      const contexto = await navegador.newContext({
        baseURL,
        colorScheme: pantalla.tema ?? "light",
        viewport: { width: pantalla.width, height: pantalla.height },
        deviceScaleFactor: pantalla.dpr,
        serviceWorkers: "block",
      });
      contextos.push(contexto);
      const pagina = await contexto.newPage();
      const originales: string[] = [];
      await pagina.route("**/*", (route) => {
        const peticion = route.request();
        const url = peticion.url();
        if (url.startsWith(baseURL ?? "http://localhost")) return route.continue();
        if (peticion.resourceType() !== "image") return route.abort();
        if (ORIGINAL.test(url)) {
          originales.push(url);
          return route.fulfill({ status: 200, contentType: "image/png", body: FOTO_ORIGINAL });
        }
        return route.fulfill({
          status: 200,
          contentType: "image/png",
          body: url.includes("espncdn.com") ? FOTO_ESPN : FOTO_GUARDADA,
        });
      });
      // Registrada DESPUÉS del comodín, gana: la franja «En directo» depende
      // del calendario real.
      await pagina.route("**/api/live/now", (route) =>
        route.fulfill({ status: 200, json: { phase: "none" } }),
      );
      return { pagina, originales };
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

type CaraMedida = {
  nombre: string;
  zona: "fila" | "campeon";
  alto: number;
  // ¿Está dentro de un aria-hidden? (El enlace del nombre ya dice quién es.)
  oculta: boolean;
  // Color del primer borde visible entre la cara y su bloque, como [h, s, a]
  // (tono en grados, saturación y opacidad de 0 a 1), o null si no hay borde.
  borde: [number, number, number] | null;
  // El nombre: cuántas líneas ocupa entero, cuántas enseña y si algo de él se
  // sale de su caja o queda debajo de la columna de movimiento.
  lineas: number;
  lineasVisibles: number;
  cortado: boolean;
  pisaMovimiento: boolean;
  // Solo el campeón: los textos de su bloque (fuera del nombre) que no caben
  // en su caja, a lo ancho (una elipsis) o a lo alto (un line-clamp).
  recortes: string[];
};

// Mide las caras de las filas y de los campeones, y sus nombres, en UN solo
// evaluate. Con la maquetación hecha basta: las cajas de las fotos tienen su
// tamaño por CSS aunque la imagen no haya llegado (loading="lazy").
function medir(pagina: Page): Promise<CaraMedida[]> {
  return pagina.evaluate(() => {
    const CARA = 'img[alt^="Foto de "], img[alt^="Silueta de "]';
    const lienzo = document.createElement("canvas").getContext("2d", { willReadFrequently: true });

    function hsa(color: string): [number, number, number] | null {
      if (!lienzo) return null;
      lienzo.clearRect(0, 0, 1, 1);
      lienzo.fillStyle = color;
      lienzo.fillRect(0, 0, 1, 1);
      const [r, g, b, a] = lienzo.getImageData(0, 0, 1, 1).data;
      const max = Math.max(r, g, b);
      const min = Math.min(r, g, b);
      const d = max - min;
      let h = 0;
      if (d > 0) {
        if (max === r) h = 60 * (((g - b) / d) % 6);
        else if (max === g) h = 60 * ((b - r) / d + 2);
        else h = 60 * ((r - g) / d + 4);
      }
      if (h < 0) h += 360;
      return [Math.round(h), max === 0 ? 0 : d / max, a / 255];
    }

    function bordeHasta(desde: Element, tope: Element): [number, number, number] | null {
      for (let el: Element | null = desde; el && el !== tope; el = el.parentElement) {
        const estilo = getComputedStyle(el);
        if (parseFloat(estilo.borderTopWidth) >= 1.5) return hsa(estilo.borderTopColor);
      }
      return null;
    }

    // Líneas que ocupa el TEXTO del nombre (las que no caben en un line-clamp
    // siguen maquetadas, solo ocultas). Solo nodos de texto: la bandera que
    // iba dentro del enlace en la versión de antes contaría como otra línea.
    function lineasDe(el: Element): number {
      const tops: number[] = [];
      const recorrido = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
      for (let nodo = recorrido.nextNode(); nodo; nodo = recorrido.nextNode()) {
        if (!nodo.textContent?.trim()) continue;
        const rango = document.createRange();
        rango.selectNodeContents(nodo);
        for (const r of rango.getClientRects()) if (r.width > 0) tops.push(r.top);
      }
      tops.sort((a, b) => a - b);
      return tops.filter((top, i) => i === 0 || top - tops[i - 1] > 4).length;
    }

    function nombre(bloque: Element, img: HTMLImageElement, zona: "fila" | "campeon") {
      const enlace =
        bloque.querySelector<HTMLElement>('a[href^="/fighters/"]') ??
        bloque.querySelector<HTMLElement>("span.truncate, span.line-clamp-2");
      const movimiento = zona === "fila" ? bloque.querySelector('[role="img"]') : null;
      const cajaNombre = enlace?.getBoundingClientRect();
      const cajaMovimiento = movimiento?.getBoundingClientRect();
      const cortados = enlace
        ? [enlace, ...enlace.querySelectorAll("*")].filter(
            (el) => el.scrollWidth > el.clientWidth + 1 && getComputedStyle(el).display !== "inline",
          )
        : [];
      const visibles = enlace ? Math.round(enlace.getBoundingClientRect().height / (parseFloat(getComputedStyle(enlace).lineHeight) || 1)) : 0;
      return {
        nombre: (enlace?.textContent ?? img.alt).trim(),
        lineas: enlace ? lineasDe(enlace) : 0,
        lineasVisibles: visibles,
        cortado: cortados.length > 0,
        pisaMovimiento:
          cajaNombre != null && cajaMovimiento != null && cajaNombre.right > cajaMovimiento.left + 0.5,
      };
    }

    // Elementos con texto propio del bloque (no el nombre, que se mide
    // aparte) cuyo contenido se sale de su caja: a lo ancho siempre; a lo alto
    // solo con line-clamp (un texto con leading-none asoma por arriba y por
    // abajo sin estar cortado). Los `inline` no tienen caja que medir.
    function recortesDe(bloque: Element): string[] {
      const enlace = bloque.querySelector('a[href^="/fighters/"]');
      return [...bloque.querySelectorAll<HTMLElement>("*")]
        .filter((el) => !enlace?.contains(el) && !el.contains(enlace))
        .filter((el) => [...el.childNodes].some((n) => n.nodeType === Node.TEXT_NODE && n.textContent?.trim()))
        .filter((el) => getComputedStyle(el).display !== "inline")
        .filter((el) => {
          const clamp = getComputedStyle(el).getPropertyValue("-webkit-line-clamp");
          const conClamp = clamp !== "" && clamp !== "none";
          return el.scrollWidth > el.clientWidth + 1 || (conClamp && el.scrollHeight > el.clientHeight + 1);
        })
        .map((el) => el.textContent?.trim() ?? "");
    }

    const medidas: CaraMedida[] = [];
    for (const fila of document.querySelectorAll("main ol > li")) {
      const img = fila.querySelector<HTMLImageElement>(CARA);
      if (!img) continue;
      medidas.push({
        zona: "fila",
        alto: img.getBoundingClientRect().height,
        oculta: img.closest('[aria-hidden="true"]') != null,
        borde: null,
        recortes: [],
        ...nombre(fila, img, "fila"),
      });
    }
    const etiquetas = [...document.querySelectorAll("main p")].filter(
      (p) => p.textContent?.trim() === "Campeón",
    );
    for (const etiqueta of etiquetas) {
      let bloque: Element | null = etiqueta.parentElement;
      while (bloque && !bloque.querySelector(CARA)) bloque = bloque.parentElement;
      const img = bloque?.querySelector<HTMLImageElement>(CARA);
      if (!bloque || !img) continue;
      medidas.push({
        zona: "campeon",
        alto: img.getBoundingClientRect().height,
        oculta: img.closest('[aria-hidden="true"]') != null,
        borde: bordeHasta(img, bloque),
        recortes: recortesDe(bloque),
        ...nombre(bloque, img, "campeon"),
      });
    }
    return medidas;
  });
}

// Dorado: tono ámbar (amber-400 es 43°, amber-500 38°, amber-700 26°; el rojo
// de la marca es 0° y el gris no tiene saturación), saturado y casi opaco.
function sinMarcoDorado(campeones: CaraMedida[]): string[] {
  return campeones
    .filter(
      (m) => m.borde == null || m.borde[0] < 25 || m.borde[0] > 55 || m.borde[1] < 0.6 || m.borde[2] < 0.6,
    )
    .map((m) => `${m.nombre} (${m.borde ? `${m.borde[0]}° s${m.borde[1].toFixed(2)} a${m.borde[2].toFixed(2)}` : "sin borde"})`);
}

// Píxeles SIN PINTAR (alfa < 10) de una captura. Se decodifica en una página
// en blanco aparte (about:blank, sin la CSP del sitio): un PNG con un canvas.
async function sinPintar(decodificador: Page, captura: Buffer): Promise<number> {
  return decodificador.evaluate(async (b64) => {
    const img = new Image();
    img.src = `data:image/png;base64,${b64}`;
    await img.decode();
    const lienzo = document.createElement("canvas");
    lienzo.width = img.width;
    lienzo.height = img.height;
    const ctx = lienzo.getContext("2d");
    if (!ctx) return -1;
    ctx.drawImage(img, 0, 0);
    const datos = ctx.getImageData(0, 0, lienzo.width, lienzo.height).data;
    let n = 0;
    for (let i = 3; i < datos.length; i += 4) if (datos[i] < 10) n++;
    return n;
  }, captura.toString("base64"));
}

type CaraCargada = {
  zona: "fila" | "campeon";
  nombre: string;
  src: string;
  srcset: string | null;
  actual: string; // currentSrc: lo que el navegador ha elegido y bajado
  ancho: number; // ancho REAL del fichero bajado
};

// Recorre la página para que entren todas las caras (loading="lazy"), espera a
// que TODAS hayan cargado y lee qué fichero eligió cada una.
// 🪤 Con srcset, naturalWidth NO es el ancho del fichero (es el ancho dividido
// por su densidad): el real se lee abriendo currentSrc en una imagen aparte,
// que sale de la caché.
async function cargarCaras(pagina: Page): Promise<CaraCargada[]> {
  const CARAS = 'main img[alt^="Foto de "], main img[alt^="Silueta de "]';
  await expect(pagina.locator(CARAS).first()).toBeAttached();
  await pagina.evaluate(async () => {
    for (let y = 0; y < document.body.scrollHeight; y += 500) {
      window.scrollTo(0, y);
      await new Promise((r) => setTimeout(r, 40));
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
        CARAS,
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
        // Campeón: su bloque es el que tiene el texto «Campeón» (en una fila no está).
        const enFila = img.closest("ol > li") != null;
        return {
          zona: (enFila ? "fila" : "campeon") as "fila" | "campeon",
          nombre: img.alt,
          src: img.getAttribute("src") ?? "",
          srcset: img.getAttribute("srcset"),
          actual: img.currentSrc,
          ancho: sonda.naturalWidth,
        };
      }),
    );
  }, CARAS);
}

for (const motor of ["chromium", "webkit"] as const) {
  test.describe(motor, () => {
    test.use({ motor });

    test("de 360 a 1920: caras grandes, campeón con marco dorado, nombres enteros y sin desbordamiento", async ({
      abrir,
    }) => {
      test.setTimeout(120_000);
      for (const ancho of ANCHOS) {
        const { pagina } = await abrir({ width: ancho, height: 900, dpr: 1 });
        await pagina.goto("/clasificacion");
        const donde = `[${motor} ${ancho}]`;
        // Con la página en streaming (un servidor sin la caché del ISR), el
        // esqueleto de loading.tsx va primero: se mide cuando están las listas.
        await expect
          .poll(() => pagina.locator("main ol > li").count(), { message: `${donde} las listas` })
          .toBeGreaterThanOrEqual(150);
        await expectNoHorizontalOverflow(pagina, `/clasificacion ${donde}`);

        const medidas = await medir(pagina);
        const filas = medidas.filter((m) => m.zona === "fila");
        const campeones = medidas.filter((m) => m.zona === "campeon");
        // 14 listas de hasta 15 y 12 campeones (11 hoy, con un título vacante):
        // con menos, la página no ha pintado la clasificación entera.
        expect(filas.length, `${donde} filas con cara`).toBeGreaterThanOrEqual(150);
        expect(campeones.length, `${donde} campeones con cara`).toBeGreaterThanOrEqual(8);

        const filasBajas = filas
          .filter((m) => m.alto < ALTO_MIN_CARA_FILA)
          .map((m) => `${m.nombre} (${m.alto.toFixed(1)} px)`);
        expect.soft(resumen(filasBajas), `${donde} caras de fila de menos de ${ALTO_MIN_CARA_FILA} px`).toEqual([]);

        const campeonesBajos = campeones
          .filter((m) => m.alto < ALTO_MIN_CARA_CAMPEON)
          .map((m) => `${m.nombre} (${m.alto.toFixed(1)} px)`);
        expect
          .soft(resumen(campeonesBajos), `${donde} caras de campeón de menos de ${ALTO_MIN_CARA_CAMPEON} px`)
          .toEqual([]);

        expect.soft(resumen(sinMarcoDorado(campeones)), `${donde} campeones sin el marco dorado`).toEqual([]);

        const cortados = medidas
          .filter((m) => m.cortado || m.lineas > m.lineasVisibles || m.pisaMovimiento)
          .map((m) => `${m.nombre} (${m.lineas}/${m.lineasVisibles} líneas${m.cortado ? ", se sale" : ""}${m.pisaMovimiento ? ", pisa el movimiento" : ""})`);
        expect.soft(resumen(cortados), `${donde} nombres cortados o encima del movimiento`).toEqual([]);

        const recortes = campeones.flatMap((m) => m.recortes.map((texto) => `${m.nombre}: «${texto}»`));
        expect.soft(resumen(recortes), `${donde} textos cortados en el bloque del campeón`).toEqual([]);

        // El lector de pantalla oye el nombre UNA vez (el enlace), no también
        // el alt de la foto: la cara va dentro de un aria-hidden. No depende
        // del ancho: basta mirarlo en el primero.
        if (ancho === ANCHOS[0]) {
          const visibles = medidas.filter((m) => !m.oculta).map((m) => m.nombre);
          expect
            .soft(resumen(visibles), `${donde} caras que repiten el nombre al lector de pantalla`)
            .toEqual([]);
        }
        await pagina.context().close();
      }
    });

    test("cada cara de ufc.com baja la copia que necesita: la de 256 a 1x, el original en el campeón a 2x y en todo a 3x", async ({
      abrir,
    }) => {
      test.setTimeout(120_000);
      for (const dpr of [1, 2, 3]) {
        const { pagina, originales } = await abrir({ width: 390, height: 844, dpr });
        await pagina.goto("/clasificacion");
        const deUfc = (await cargarCaras(pagina)).filter((c) => GUARDADA.test(c.src));
        const donde = `[${motor} 390@${dpr}x]`;
        const campeones = deUfc.filter((c) => c.zona === "campeon");
        const filas = deUfc.filter((c) => c.zona === "fila");
        expect(campeones.length, `${donde} campeones con cara de ufc.com (event_results)`).toBeGreaterThan(0);
        expect(filas.length, `${donde} filas con cara de ufc.com (event_results)`).toBeGreaterThan(0);

        for (const cara of deUfc) {
          expect(
            cara.srcset ?? "(sin srcset)",
            `${donde} ${cara.nombre}: srcset con la guardada y el original`,
          ).toMatch(SRCSET_HD);
        }
        // Nitidez = px del fichero / px pintados × DPR. Fila: 120 px de ancho;
        // campeón: 192. La de 256 basta mientras ancho × DPR ≤ 256.
        const quiereOriginal = (c: CaraCargada) => (c.zona === "campeon" ? dpr >= 2 : dpr >= 3);
        for (const cara of deUfc) {
          if (quiereOriginal(cara)) {
            expect(cara.actual, `${donde} ${cara.zona} ${cara.nombre}: baja el original`).toMatch(ORIGINAL);
            expect(cara.ancho, `${donde} ${cara.zona} ${cara.nombre}: ancho del fichero`).toBeGreaterThanOrEqual(500);
          } else {
            expect(cara.actual, `${donde} ${cara.zona} ${cara.nombre}: sigue con la de 256`).toMatch(GUARDADA);
            expect(cara.ancho, `${donde} ${cara.zona} ${cara.nombre}: ancho del fichero`).toBe(256);
          }
        }
        if (dpr === 1) {
          expect(originales, `${donde} ningún original en toda la página a 1x`).toEqual([]);
        }
        await pagina.context().close();
      }
    });

    test("en oscuro: el marco del campeón sigue dorado y el texto de su bloque cabe", async ({ abrir }) => {
      test.setTimeout(60_000);
      // 390: la tarjeta estrecha (el nombre bajo la foto); 1280: las tres
      // columnas (estrecha también) y la pareja libra por libra (ancha).
      for (const ancho of [390, 1280]) {
        const { pagina } = await abrir({ width: ancho, height: 900, dpr: 1, tema: "dark" });
        await pagina.goto("/clasificacion");
        const donde = `[${motor} ${ancho} oscuro]`;
        await expect(pagina.locator("html"), `${donde} el tema`).toHaveClass(/(^|\s)dark(\s|$)/);
        await expect
          .poll(() => pagina.locator("main ol > li").count(), { message: `${donde} las listas` })
          .toBeGreaterThanOrEqual(150);
        const campeones = (await medir(pagina)).filter((m) => m.zona === "campeon");
        expect(campeones.length, `${donde} campeones con cara`).toBeGreaterThanOrEqual(8);
        expect.soft(resumen(sinMarcoDorado(campeones)), `${donde} campeones sin el marco dorado`).toEqual([]);
        const recortes = campeones.flatMap((m) => m.recortes.map((texto) => `${m.nombre}: «${texto}»`));
        expect.soft(resumen(recortes), `${donde} textos cortados en el bloque del campeón`).toEqual([]);
        await pagina.context().close();
      }
    });

    test("el foco de teclado rodea la fila entera con un anillo de 2 px", async ({ abrir }) => {
      const { pagina } = await abrir({ width: 390, height: 844, dpr: 1 });
      await pagina.goto("/clasificacion");
      const enlace = pagina.locator('main ol > li a[href^="/fighters/"]').first();
      await expect(enlace).toBeVisible();
      // Foco por script: WebKit, como Safari, no lleva el Tab a los enlaces.
      // Sin un clic antes, los dos motores lo tratan como de teclado
      // (:focus-visible), y se comprueba abajo.
      await enlace.focus();
      const anillo = await enlace.evaluate((a) => {
        const estilo = getComputedStyle(a, "::after");
        const fila = a.closest("li")?.getBoundingClientRect();
        return {
          deTeclado: a.matches(":focus-visible"),
          contenido: estilo.content,
          grosor: estilo.outlineWidth,
          trazo: estilo.outlineStyle,
          ancho: parseFloat(estilo.width) || 0,
          alto: parseFloat(estilo.height) || 0,
          anchoFila: fila?.width ?? 0,
        };
      });
      const donde = `[${motor} 390]`;
      expect(anillo.deTeclado, `${donde} el enlace de la fila 1 tiene :focus-visible`).toBe(true);
      // El anillo de toda la web (globals.css, :focus-visible) es de 2 px.
      expect.soft(anillo.grosor, `${donde} grosor del anillo`).toBe("2px");
      expect.soft(anillo.trazo, `${donde} trazo del anillo`).toBe("solid");
      // Dibujado en el ::after estirado del enlace: la fila entera, no el texto.
      expect.soft(anillo.contenido, `${donde} el ::after del enlace existe`).not.toBe("none");
      expect.soft(anillo.ancho, `${donde} ancho del anillo (fila: ${anillo.anchoFila} px)`).toBeGreaterThanOrEqual(anillo.anchoFila - 2);
      expect.soft(anillo.alto, `${donde} alto del anillo`).toBeGreaterThanOrEqual(ALTO_MIN_CARA_FILA);
      await pagina.context().close();
    });

    if (motor === "webkit") {
      test("WebKit pinta la página entera: ningún cuadro sin pintar al bajar", async ({ abrir }) => {
        test.setTimeout(90_000);
        for (const pantalla of [
          { width: 1280, height: 900, dpr: 1 },
          { width: 390, height: 844, dpr: 2 },
        ]) {
          const { pagina } = await abrir({ ...pantalla, tema: "dark" });
          const decodificador = await pagina.context().newPage();
          await pagina.goto("/clasificacion");
          await expect.poll(() => pagina.locator("main ol > li").count()).toBeGreaterThanOrEqual(150);
          const huecos: string[] = [];
          // Las 4 primeras pantallas: la libra por libra y las primeras
          // divisiones con campeón (el cuadro salía en TODAS las tarjetas).
          for (let n = 0; n < 4; n++) {
            await pagina.evaluate((y) => window.scrollTo(0, y), n * pantalla.height);
            // Con las caras de la pantalla ya pintadas y la entrada acabada:
            // el cuadro aparecía al pintar la cara, no antes.
            await expect
              .poll(() =>
                pagina.evaluate(() =>
                  [...document.querySelectorAll<HTMLImageElement>("main img")]
                    .filter((img) => {
                      const caja = img.getBoundingClientRect();
                      return caja.bottom > 0 && caja.top < innerHeight;
                    })
                    .every((img) => img.complete),
                ),
              )
              .toBe(true);
            await pagina.evaluate(() =>
              Promise.all(
                document
                  .getAnimations()
                  .filter((a) => a.effect?.getTiming().iterations !== Infinity)
                  .map((a) => a.finished.catch(() => undefined)),
              ),
            );
            const sinPintarAqui = await sinPintar(decodificador, await pagina.screenshot());
            if (sinPintarAqui !== 0) huecos.push(`pantalla ${n + 1}: ${sinPintarAqui} px`);
          }
          expect
            .soft(huecos, `[webkit ${pantalla.width}@${pantalla.dpr}x oscuro] píxeles sin pintar`)
            .toEqual([]);
          await pagina.context().close();
        }
      });
    }
  });
}
