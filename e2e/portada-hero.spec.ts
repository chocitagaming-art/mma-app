import { expect, test as base, type Browser, type BrowserContext, type Page } from "@playwright/test";

import { esperarHidratacion, expectNoHorizontalOverflow, fakeYouTubeEmbeds } from "./helpers";

// ── Portada: hero siempre oscuro, sin avatar y contadores en una fila ──────
//
// El rediseño del 17-oct-2026, validado por el dueño sobre un prototipo
// (docs ARCHIVO/planes/rediseno-2026-10-17, apartados 1-3):
//   1. El hero va SIEMPRE en oscuro, también con el tema claro, con la foto
//      del pabellón detrás; lo que viene después sigue el tema elegido.
//   2. La marca de agua del avatar (body::after) sale SOLO de la portada.
//   3. En el móvil, los cuatro contadores en una fila de ~78 px (antes, 2×2 y
//      250 px), y los miles con punto en todos los tamaños: 2.892, nunca
//      «2,892» (la coma del en-US de Vercel) ni «2892» (es-ES por defecto).
// Y de paso: el desplegable del buscador del hero ya no se corta en el borde
// de abajo del hero (overflow-hidden lo cortaba tras cinco resultados).
//
// Chromium Y WebKit: WebKit se lanza a mano (los proyectos de
// playwright.config.ts son todos Chromium), como en careo-fotos.spec.ts. Cada
// test abre sus propios tamaños y temas, así que basta UN proyecto.
//
// 🪤 Contextos con serviceWorkers: "block": el de la PWA sirve el CSS viejo y
// se mediría la portada de antes.

type Motor = "chromium" | "webkit";
type Tema = "light" | "dark";
type Abrir = (tema: Tema, width: number, height?: number) => Promise<Page>;

const ANCHOS = [360, 390, 768, 1024, 1280, 1920];

// Lo que pintan los tokens de globals.css: --background y --foreground de .dark,
// y el --card del tema claro.
const FONDO_OSCURO = "rgb(11, 11, 13)";
const TEXTO_OSCURO = "rgb(250, 250, 250)";
const POPOVER_OSCURO = "rgb(22, 22, 25)";

const test = base.extend<{ motor: Motor; abrir: Abrir }, { abrirWebkit: () => Promise<Browser> }>({
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
  abrir: async ({ motor, browser, abrirWebkit, baseURL }, ofrecer) => {
    const navegador = motor === "webkit" ? await abrirWebkit() : browser;
    const contextos: BrowserContext[] = [];
    await ofrecer(async (tema, width, height = 900) => {
      const contexto = await navegador.newContext({
        baseURL,
        colorScheme: tema,
        viewport: { width, height },
        serviceWorkers: "block",
      });
      contextos.push(contexto);
      const page = await contexto.newPage();
      // Fuera de casa no se sale: ni fotos de ufc.com ni nada de terceros.
      await page.route("**/*", (route) => {
        const url = route.request().url();
        return url.startsWith(baseURL ?? "http://localhost") ? route.continue() : route.abort();
      });
      // Registradas DESPUÉS del comodín, estas ganan.
      // La franja «En directo» depende del calendario real.
      await page.route("**/api/live/now", (route) =>
        route.fulfill({ status: 200, json: { phase: "none" } }),
      );
      await fakeYouTubeEmbeds(page);
      return page;
    });
    for (const contexto of contextos) await contexto.close();
  },
});

test.beforeEach(({}, testInfo) => {
  test.skip(
    testInfo.project.name !== "escritorio-light",
    "cada test abre sus propios tamaños y temas: basta un proyecto",
  );
});

async function abrirPortada(page: Page): Promise<void> {
  await page.goto("/", { waitUntil: "load" });
  await esperarHidratacion(page);
}

/** La sección del hero: la única con el h1 «Inteligencia de combate». */
function hero(page: Page) {
  return page.locator("section").filter({ has: page.locator("h1") }).first();
}

/** La franja de los cuatro contadores. */
function contadores(page: Page) {
  return page
    .locator("section")
    .filter({ has: page.getByText("Registros de stats", { exact: true }) })
    .last();
}

/** Luminancia relativa (0 negro, 1 blanco) de un `rgb(...)`/`rgba(...)`. */
function luminancia(color: string): number {
  const partes = /rgba?\(([\d.]+),\s*([\d.]+),\s*([\d.]+)/.exec(color);
  if (!partes) throw new Error(`color que este test no sabe leer: ${color}`);
  const canal = (valor: string) => {
    const c = Number(valor) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * canal(partes[1]) + 0.7152 * canal(partes[2]) + 0.0722 * canal(partes[3]);
}

for (const motor of ["chromium", "webkit"] as const) {
  test.describe(motor, () => {
    test.use({ motor });

    test("con el tema claro el hero sale oscuro, con el pabellón detrás, y lo de después sigue claro", async ({
      abrir,
    }) => {
      for (const width of [390, 1280]) {
        for (const tema of ["light", "dark"] as const) {
          const donde = `[${motor}] ${width} px, tema ${tema}`;
          // The phone gets its own crop (the LCP, see globals.css). AVIF where
          // the browser decodes it and webp elsewhere: Playwright's WebKit on
          // Windows has no AVIF and takes the webp from the image-set().
          const movil = width < 768;
          const foto = movil ? "/hero/arena-movil.v" : "/hero/arena.v";
          const fotoPedida = movil
            ? /^\/hero\/arena-movil\.v\d+\.(avif|webp)$/
            : /^\/hero\/arena\.v\d+\.(avif|webp)$/;
          const page = await abrir(tema, width);
          await abrirPortada(page);
          const seccion = hero(page);

          const medida = await seccion.evaluate((el) => {
            const estilo = getComputedStyle(el);
            const capa = getComputedStyle(el, "::before");
            const degradados = getComputedStyle(el, "::after");
            const input = el.querySelector<HTMLElement>('[role="combobox"]');
            const titular = el.querySelector("h1");
            return {
              fondo: estilo.backgroundColor,
              esquema: estilo.colorScheme,
              texto: titular ? getComputedStyle(titular).color : "",
              capaImagen: capa.backgroundImage,
              capaEncuadre: capa.backgroundPosition,
              capaOpacidad: capa.opacity,
              capaZ: capa.zIndex,
              capaPosicion: capa.position,
              degradadosImagen: degradados.backgroundImage,
              degradadosZ: degradados.zIndex,
              inputTexto: input ? getComputedStyle(input).color : "",
            };
          });
          expect(medida.fondo, `${donde}: fondo del hero`).toBe(FONDO_OSCURO);
          expect(medida.texto, `${donde}: color del titular`).toBe(TEXTO_OSCURO);
          expect(medida.inputTexto, `${donde}: texto del buscador del hero`).toBe(TEXTO_OSCURO);
          // Native controls (the dropdown's scrollbar, the caret) dark as well,
          // not only the tokens.
          expect(medida.esquema, `${donde}: color-scheme del hero`).toBe("dark");
          // La foto es una capa decorativa DETRÁS del contenido.
          expect(medida.capaImagen, `${donde}: imagen de la capa`).toContain(foto);
          expect(medida.capaPosicion, `${donde}: capa absoluta`).toBe("absolute");
          expect(medida.capaZ, `${donde}: capa detrás del contenido`).toBe("-1");
          expect(Number(medida.capaOpacidad), `${donde}: opacidad de la foto`).toBeCloseTo(
            movil ? 0.75 : 0.7,
            2,
          );
          // The framing: on the phone higher (center 25 %), so the photo stays
          // in the top part.
          expect(medida.capaEncuadre, `${donde}: encuadre de la foto`).toBe(movil ? "50% 25%" : "50% 40%");
          // Over the photo, the fades to the background colour. On the phone,
          // the top-to-bottom one (180deg, the default, which the browsers
          // serialize WITHOUT the angle) that reaches the solid background at
          // 72 % is what leaves the search box and the buttons on plain dark:
          // without it the mesh crossed the search text.
          expect(medida.degradadosZ, `${donde}: degradados detrás del contenido`).toBe("-1");
          expect(medida.degradadosImagen, `${donde}: degradado izquierda→derecha`).toContain(
            "linear-gradient(90deg",
          );
          if (movil) {
            expect(medida.degradadosImagen, `${donde}: degradado vertical del móvil`).toMatch(
              /linear-gradient\((180deg, )?rgba\(0, 0, 0, 0\) 0%.*rgb\(11, 11, 13\) 72%\)$/,
            );
          } else {
            expect(medida.degradadosImagen, `${donde}: el de abajo a arriba`).toContain(
              "linear-gradient(0deg",
            );
          }

          // Cargada de verdad: el navegador la pidió (desde el CSS) y decodifica.
          const pedidas = () =>
            page.evaluate(() =>
              performance
                .getEntriesByType("resource")
                .map((entrada) => new URL(entrada.name).pathname)
                .filter((ruta) => ruta.startsWith("/hero/")),
            );
          await expect
            .poll(pedidas, { message: `${donde}: el navegador no pidió la foto del hero` })
            .toHaveLength(1);
          // Only ONE, the matching one: the phone never downloads the big
          // photo, and of the image-set only the format the browser takes.
          const [pedida] = await pedidas();
          expect(pedida, `${donde}: foto del hero descargada`).toMatch(fotoPedida);
          const tamano = await page.evaluate(async (src) => {
            const img = new Image();
            img.src = src;
            await img.decode();
            return { w: img.naturalWidth, h: img.naturalHeight };
          }, pedida);
          expect(tamano.w, `${donde}: la foto no decodifica`).toBeGreaterThan(700);
          // A year of immutable cache (next.config.ts): it is the LCP element,
          // and with /public's default max-age=0 every visit revalidated it.
          const respuesta = await page.request.get(pedida);
          expect(respuesta.headers()["cache-control"], `${donde}: caché de la foto`).toContain("immutable");

          // Lo de después sigue el tema elegido: los contadores van sobre
          // --card, blanco en claro y casi negro en oscuro.
          const fondoContadores = await contadores(page).evaluate(
            (el) => getComputedStyle(el).backgroundColor,
          );
          if (tema === "light") {
            expect(luminancia(fondoContadores), `${donde}: contadores ${fondoContadores}`).toBeGreaterThan(0.9);
          } else {
            expect(luminancia(fondoContadores), `${donde}: contadores ${fondoContadores}`).toBeLessThan(0.05);
          }
          // Y la sección que sigue al hero no hereda el oscuro.
          const siguiente = await seccion.evaluate((el) => {
            const otro = el.nextElementSibling as HTMLElement | null;
            return otro
              ? { color: getComputedStyle(otro).color, dentroDeDark: Boolean(otro.closest(".dark")) }
              : null;
          });
          expect(siguiente, `${donde}: no hay nada detrás del hero`).not.toBeNull();
          if (tema === "light") {
            expect(siguiente!.dentroDeDark, `${donde}: la sección siguiente cae dentro de .dark`).toBe(false);
            expect(luminancia(siguiente!.color), `${donde}: texto de la sección siguiente`).toBeLessThan(0.1);
          }
          await page.context().close();
        }
      }
    });

    test("sin avatar en la portada; en /fighters sigue, también al llegar navegando desde la portada", async ({
      abrir,
    }) => {
      const marca = (page: Page) =>
        page.evaluate(() => {
          const estilo = getComputedStyle(document.body, "::after");
          return { display: estilo.display, imagen: estilo.backgroundImage };
        });

      for (const tema of ["light", "dark"] as const) {
        const donde = `[${motor}] tema ${tema}`;
        const page = await abrir(tema, 1280);
        await abrirPortada(page);
        expect((await marca(page)).display, `${donde}: avatar en la portada`).toBe("none");

        // Navegación de cliente (el formulario del hero hace router.push):
        // la raíz de la portada se desmonta y el avatar tiene que volver.
        await hero(page).getByRole("button", { name: "Explorar plantilla" }).click();
        await page.waitForURL(/\/fighters$/);
        await expect
          .poll(async () => (await marca(page)).display, {
            message: `${donde}: el avatar no vuelve al navegar a /fighters`,
          })
          .not.toBe("none");

        await page.context().close();

        // Y cargando las páginas de cero, cada una en una pestaña nueva. 🪤 Un
        // page.goto() justo después de la navegación de cliente lo corta en WebKit
        // el replaceState con el que Next hidrata («interrupted by another
        // navigation»): no es una segunda carga, la red pide UN documento.
        for (const ruta of ["/fighters", "/eventos"]) {
          const nueva = await abrir(tema, 1280);
          await nueva.goto(ruta, { waitUntil: "load" });
          const otra = await marca(nueva);
          expect(otra.display, `${donde}: avatar en ${ruta}`).not.toBe("none");
          expect(otra.imagen, `${donde}: imagen del avatar en ${ruta}`).toContain("hero-watermark.webp");
          await nueva.context().close();
        }
      }
    });

    test("contadores: una fila de cuatro y ≤ 100 px en el móvil, y miles con punto en todos los tamaños", async ({
      abrir,
    }) => {
      for (const width of ANCHOS) {
        const donde = `[${motor}] ${width} px`;
        const page = await abrir("light", width);
        await abrirPortada(page);
        const franja = contadores(page);
        await franja.scrollIntoViewIfNeeded();

        const medida = await franja.evaluate((el) => {
          const rejilla = el.firstElementChild as HTMLElement;
          const celdas = Array.from(rejilla.children) as HTMLElement[];
          return {
            alto: el.getBoundingClientRect().height,
            // offsetTop and NOT getBoundingClientRect: the tiles come in with a
            // staggered animate-rise (translateY), and mid-animation each one
            // is at a different height although they share a row.
            arribas: celdas.map((c) => c.offsetTop),
            numeros: celdas.map((c) => (c.querySelector("p")?.textContent ?? "").trim()),
          };
        });

        expect(medida.numeros, `${donde}: cuatro contadores`).toHaveLength(4);
        for (const numero of medida.numeros) {
          expect(numero, `${donde}: «${numero}» no es un número`).toMatch(/^[\d.]+$/);
          const valor = Number(numero.replace(/\./g, ""));
          if (valor >= 1000) {
            expect(numero, `${donde}: «${numero}» sin el punto de miles`).toMatch(/^\d{1,3}(\.\d{3})+$/);
          }
        }

        const filas = new Set(medida.arribas).size;
        if (width < 768) {
          expect(filas, `${donde}: contadores en ${filas} filas (arribas ${medida.arribas})`).toBe(1);
          expect(medida.alto, `${donde}: alto de la franja`).toBeLessThanOrEqual(100);
        } else if (width < 1024) {
          // Tablet: como siempre, 2×2.
          expect(filas, `${donde}: la tablet sigue en 2×2`).toBe(2);
        } else {
          // Escritorio: como siempre, una fila de cuatro grandes.
          expect(filas, `${donde}: escritorio en una fila`).toBe(1);
          expect(medida.alto, `${donde}: alto en escritorio`).toBeGreaterThan(100);
        }
        await page.context().close();
      }
    });

    test("el desplegable del buscador del hero cuelga por debajo del hero, oscuro y sin cortarse", async ({
      abrir,
    }) => {
      // Resultados enlatados: el buscador real gasta cupo del limitador, y aquí
      // solo importa que la lista sea más alta que lo que queda de hero.
      const resultados = {
        fighters: Array.from({ length: 6 }, (_, i) => ({
          id: 900_000 + i,
          name: `Luchador de prueba ${i + 1}`,
          headshotUrl: null,
          nationality: "España",
        })),
        events: Array.from({ length: 3 }, (_, i) => ({
          id: 900_100 + i,
          name: `Evento de prueba ${i + 1}`,
          eventDate: `2026-10-1${i}`,
          location: "Madrid",
        })),
        news: Array.from({ length: 3 }, (_, i) => ({
          id: 900_200 + i,
          url: `https://example.com/noticia-${i + 1}`,
          headline: `Noticia de prueba ${i + 1}`,
          source: "Prueba",
          publishedAt: `2026-10-1${i}`,
        })),
      };

      for (const width of [390, 1280]) {
        const donde = `[${motor}] ${width} px, tema claro`;
        const page = await abrir("light", width);
        await page.route("**/api/search?*", (route) =>
          route.fulfill({ status: 200, json: resultados }),
        );
        await abrirPortada(page);
        const seccion = hero(page);
        const buscador = seccion.getByRole("combobox");
        await buscador.click();
        await buscador.pressSequentially("prueba", { delay: 30 });
        const lista = page.getByRole("listbox", { name: "Resultados de búsqueda" });
        await expect(lista.getByRole("option")).toHaveCount(12);

        const medida = await seccion.evaluate((el) => {
          const caja = el.querySelector('[role="listbox"]')!.parentElement as HTMLElement;
          const r = caja.getBoundingClientRect();
          const finHero = el.getBoundingClientRect().bottom;
          // Un punto de la lista POR DEBAJO del hero (y dentro de la ventana):
          // ¿quién se ve ahí, la lista o lo que viene después?
          const y = Math.min(finHero + 40, r.bottom - 4, window.innerHeight - 4);
          const arriba = document.elementFromPoint(r.left + r.width / 2, y);
          return {
            finLista: r.bottom,
            finHero,
            yProbada: y,
            seVeLaLista: Boolean(arriba && caja.contains(arriba)),
            fondo: getComputedStyle(caja).backgroundColor,
          };
        });
        expect(medida.finLista, `${donde}: la lista no pasa del hero`).toBeGreaterThan(medida.finHero);
        expect(medida.yProbada, `${donde}: punto fuera del hero`).toBeGreaterThan(medida.finHero);
        expect(medida.seVeLaLista, `${donde}: la lista queda cortada o tapada bajo el hero`).toBe(true);
        expect(medida.fondo, `${donde}: fondo de la lista`).toBe(POPOVER_OSCURO);
        await page.context().close();
      }
    });

    test("la portada no desborda en horizontal de 360 a 1920, en claro y oscuro", async ({ abrir }) => {
      for (const width of ANCHOS) {
        for (const tema of ["light", "dark"] as const) {
          const page = await abrir(tema, width);
          await abrirPortada(page);
          await expectNoHorizontalOverflow(page, `[${motor}] portada a ${width} px, tema ${tema}`);
          await page.context().close();
        }
      }
    });
  });
}
