import { readFileSync } from "node:fs";
import path from "node:path";

import { expect, test, type Locator, type Page } from "@playwright/test";

import { esperarHidratacion, expectNoHorizontalOverflow, fakeYouTubeEmbeds } from "./helpers";

// ── «Último evento» de la portada: las caras, grandes y nítidas ──────────────
//
// El dueño, el 29-oct-2026, con una captura de las filas del UFC 333 y las dos
// caras de cada esquina rodeadas: «vamos a hacer lo mismo con el inicio, que es
// lo primero que se ve: ponemos las fotos de las cabezas más grandes y
// nítidas». Lo que se vigila aquí, con la página servida de verdad:
//   · En la portada, cada cara mide 72 px en el móvil y 96 desde 640 px, y la
//     de ufc.com ofrece su original (srcset 256w/500w) con un `sizes` exacto.
//   · Cada pieza (cara, nombre, récord, cuota, GANA) queda DENTRO de su
//     esquina, la cara no pisa el texto, nada pisa el centro y el anillo del
//     ganador no lo corta la tarjeta. Sin desbordar la página.
//   · Las dos caras de cada fila arrancan a la misma altura, y un nombre que no
//     cabe NUNCA tiene la cara a su lado: la cara grande no le come el ancho.
//   · La ficha del mismo evento, con las MISMAS caras grandes (el dueño,
//     30-oct: la fila grande también en la cartelera de /eventos/[id], /ufc-hoy
//     y /en-vivo; lo mide además e2e/evento-caras.spec.ts) y las mismas reglas.
//
// 🪤 SIN NOMBRES FIJOS: el «Último evento» cambia cada semana. Todo se mide por
// estructura, y el evento de la ficha se saca del «Ver resultados completos».
//
// La geometría no depende del tema, pero corre en los seis proyectos: así se
// mide a los tres anchos de la configuración (390, 768 y 1280). Los otros seis
// anchos del barrido van en un solo proyecto.
//
// Que el navegador ELIJA el original a 3x (la nitidez de verdad) lo mira
// e2e/fotos-hd.spec.ts, en Chromium y WebKit; el marcado, también
// src/components/event-bout-row.test.ts.

const FIXTURES = path.join(__dirname, "fixtures");
const FOTO_GUARDADA = readFileSync(path.join(FIXTURES, "luchadores-headshot-256x160.png"));
const FOTO_ORIGINAL = readFileSync(path.join(FIXTURES, "headshot-hd-500x325.png"));
const FOTO_ESPN = readFileSync(path.join(FIXTURES, "careo-headshot.png"));

// El original: /images/ de ufc.com sin /styles/. La guardada: el estilo
// event_results, el único que tiene original que ofrecer (src/lib/headshot-hd.ts).
const ORIGINAL = /^https:\/\/www\.ufc\.com\/images\/(?!styles\/)/;
const GUARDADA = /\/images\/styles\/event_results_athlete_headshot\//;

// sm de Tailwind: desde aquí las caras pasan a su tamaño grande.
const SM = 640;
const LADO_PORTADA = (ancho: number) => (ancho >= SM ? 96 : 72);
// (72 − 2) × 1,6 y (96 − 2) × 1,6: el ancho al que se pinta la cara de
// ufc.com, que cubre su caja cuadrada (1 px de borde por lado).
const SIZES_PORTADA = "(min-width: 640px) 150px, 112px";
const OTROS_ANCHOS = [360, 414, 820, 1024, 1440, 1920];
const TOLERANCIA_PX = 1;

// El service worker de la PWA sirve el CSS viejo: mediría la maquetación de antes.
test.use({ serviceWorkers: "block" });

test.beforeEach(async ({ page, baseURL }) => {
  // Las fotos de fuera, ENLATADAS con su medida real (la de 256×160 de ufc.com,
  // su original de 500×325 y un PNG de ESPN): la geometría no depende de la red.
  await page.route("**/*", (route) => {
    const peticion = route.request();
    const url = peticion.url();
    if (url.startsWith(baseURL ?? "http://localhost")) return route.continue();
    if (peticion.resourceType() !== "image") return route.abort();
    const cuerpo = ORIGINAL.test(url)
      ? FOTO_ORIGINAL
      : url.includes("espncdn.com")
        ? FOTO_ESPN
        : FOTO_GUARDADA;
    return route.fulfill({ status: 200, contentType: "image/png", body: cuerpo });
  });
  await page.route("**/api/live/now", (route) =>
    route.fulfill({ status: 200, json: { phase: "none" } }),
  );
  // Después del comodín: el embed falso de YouTube tiene que ganarle.
  await fakeYouTubeEmbeds(page);
});

function ultimoEvento(page: Page): Locator {
  return page.locator("section", { has: page.getByText("ÚLTIMO EVENTO", { exact: true }) });
}

async function abrirPortada(page: Page): Promise<Locator> {
  await page.goto("/");
  const seccion = ultimoEvento(page);
  await expect(seccion, "la portada no tiene «Último evento» (o lo tiene dos veces)").toHaveCount(1);
  await expect(seccion.locator('[data-testid="bout-row"]').first()).toBeVisible();
  await esperarHidratacion(page);
  await page.evaluate(() => document.fonts.ready);
  return seccion;
}

async function asentar(page: Page, width: number): Promise<void> {
  await page.setViewportSize({ width, height: page.viewportSize()?.height ?? 900 });
  await page.evaluate(
    () => new Promise<void>((ok) => requestAnimationFrame(() => requestAnimationFrame(() => ok()))),
  );
}

type CaraMedida = {
  donde: string; // «Volkanovski (red)», para los mensajes
  ancho: number;
  alto: number;
  src: string;
  srcset: string | null;
  sizes: string | null;
  ganador: boolean;
  anillo: number; // grosor del anillo (box-shadow sin desenfoque), en px
};

type Medida = {
  filas: number;
  caras: CaraMedida[];
  // Cada problema de geometría, ya escrito para el mensaje del test.
  fallos: string[];
};

// Toda la geometría de las filas de un contenedor (la sección de la portada o
// la página del evento), en una sola pasada por el DOM.
async function medir(page: Page, ambito: "portada" | "evento"): Promise<Medida> {
  return page.evaluate(
    ({ ambito, tolerancia }) => {
      const raiz =
        ambito === "portada"
          ? [...document.querySelectorAll("section")].find((s) =>
              [...s.querySelectorAll("p")].some((p) => p.textContent?.trim() === "ÚLTIMO EVENTO"),
            )
          : document.body;
      if (!raiz) throw new Error("no encuentro el «Último evento»");
      const fallos: string[] = [];
      const caras: CaraMedida[] = [];
      const caja = (el: Element) => el.getBoundingClientRect();
      const dentro = (a: DOMRect, b: DOMRect) =>
        a.left >= b.left - tolerancia &&
        a.right <= b.right + tolerancia &&
        a.top >= b.top - tolerancia &&
        a.bottom <= b.bottom + tolerancia;
      const pisa = (a: DOMRect, b: DOMRect) =>
        Math.min(a.right, b.right) - Math.max(a.left, b.left) > tolerancia &&
        Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top) > tolerancia;
      // Los fragmentos de un nodo de texto o de un span (un texto partido da dos).
      // El ancho que el nombre NECESITA, con decimales. 🪤 scrollWidth y
      // clientWidth son enteros: un nombre cortado por medio píxel sale con
      // «…» y los dos dan lo mismo (Lebosnoyani en /eventos/1099 a 360:
      // 117,8 de 118,3 px, y scrollWidth = clientWidth = 118).
      const anchoNatural = (el: HTMLElement) => {
        const estilo = el.getAttribute("style");
        el.style.setProperty("width", "max-content");
        el.style.setProperty("max-width", "none");
        el.style.setProperty("flex", "none");
        const ancho = el.getBoundingClientRect().width;
        if (estilo === null) el.removeAttribute("style");
        else el.setAttribute("style", estilo);
        return ancho;
      };
      const fragmentos = (nodo: Node) => {
        const rango = document.createRange();
        rango.selectNodeContents(nodo);
        return [...rango.getClientRects()].filter((r) => r.width > 0);
      };
      const filas = [...raiz.querySelectorAll<HTMLElement>('[data-testid="bout-row"]')].filter(
        // Lo plegado no se ve y no se mide (ver e2e/evento-columna.spec.ts).
        (fila) => !fila.closest("details:not([open])") && fila.checkVisibility(),
      );
      for (const fila of filas) {
        const tarjeta = fila.closest(".overflow-hidden") ?? fila;
        const estiloFila = getComputedStyle(fila);
        const rFila = caja(fila);
        const contenido = new DOMRect(
          rFila.left + parseFloat(estiloFila.paddingLeft),
          rFila.top,
          rFila.width - parseFloat(estiloFila.paddingLeft) - parseFloat(estiloFila.paddingRight),
          rFila.height,
        );
        const centro = fila.children[1];
        const esquinas = [...fila.querySelectorAll<HTMLElement>("[data-bout-corner]")];
        if (!centro || esquinas.length !== 2) {
          fallos.push(`fila sin sus dos esquinas y su centro: «${fila.textContent?.slice(0, 60)}»`);
          continue;
        }
        const rCentro = caja(centro);
        // Las dos caras de la fila arrancan a la misma altura (lo mismo que
        // e2e/careo-fotos.spec.ts mide en la ficha del evento).
        const [arribaRoja, arribaAzul] = esquinas.map((e) => caja(e.firstElementChild ?? e).top);
        if (Math.abs(arribaRoja - arribaAzul) > tolerancia) {
          const [roja, azul] = esquinas.map(
            (e) => e.querySelector("p span.truncate")?.textContent?.trim() ?? "?",
          );
          fallos.push(
            `${roja} vs ${azul}: las caras no arrancan a la misma altura (${(arribaAzul - arribaRoja).toFixed(1)} px)`,
          );
        }
        for (const esquina of esquinas) {
          const lado = esquina.dataset.boutCorner ?? "?";
          const cabeza = esquina.firstElementChild as HTMLElement;
          const texto = esquina.lastElementChild as HTMLElement;
          const nombre = texto.querySelector("p span.truncate")?.textContent?.trim() ?? "?";
          const donde = `${nombre} (${lado})`;
          const rEsquina = caja(esquina);
          const rCabeza = caja(cabeza);
          const rTexto = caja(texto);
          if (rCabeza.width === 0 || rTexto.width === 0) {
            fallos.push(`${donde}: la cara o el texto no tienen caja`); // sin caja = verde falso
            continue;
          }
          if (!dentro(rEsquina, contenido)) fallos.push(`${donde}: la esquina se sale de la fila`);
          if (pisa(rEsquina, rCentro)) fallos.push(`${donde}: la esquina pisa el centro (VS)`);
          if (!dentro(rCabeza, rEsquina)) fallos.push(`${donde}: la cara se sale de su esquina`);
          if (!dentro(rTexto, rEsquina)) fallos.push(`${donde}: el texto se sale de su esquina`);
          if (pisa(rCabeza, rTexto)) fallos.push(`${donde}: la cara pisa el nombre o el récord`);
          const [lineaNombre, lineaRecord] = texto.querySelectorAll("p");
          if (!lineaNombre || !lineaRecord) {
            fallos.push(`${donde}: sin la línea del nombre o la del récord`);
            continue;
          }
          if (!dentro(caja(lineaNombre), rEsquina)) fallos.push(`${donde}: el nombre se sale de su esquina`);
          // 🪤 Un nombre cortado («ALEXANDER VOLKAN…») sigue DENTRO de su caja:
          // las comprobaciones de arriba no lo ven. En la fila grande (la
          // portada y, desde el 30-oct, la ficha), si un nombre no cabe, la
          // cara NO puede estar a su lado comiéndole el ancho: por eso la
          // esquina se apila por debajo de lg (ver ROW_LAYOUTS en
          // src/components/event-bout-row-layout.ts). Apilado, el nombre ya
          // tiene la esquina entera, más que en la fila de siempre, y cortarse
          // ahí no es nuevo (a 360-390 el estelar más largo aún no cabe del todo).
          const spanNombre = lineaNombre.querySelector<HTMLElement>("span.truncate");
          const caraAlLado =
            Math.min(rCabeza.bottom, rTexto.bottom) - Math.max(rCabeza.top, rTexto.top) > tolerancia;
          const visible = spanNombre?.getBoundingClientRect().width ?? 0;
          const total = spanNombre ? anchoNatural(spanNombre) : 0;
          if (total - visible > 0.01 && caraAlLado) {
            fallos.push(
              `${donde}: el nombre se corta con la cara al lado (${visible.toFixed(1)} de ${total.toFixed(1)} px)`,
            );
          }
          // Cada pieza de la línea del récord, entera y dentro de su esquina.
          for (const nodo of lineaRecord.childNodes) {
            const pieza = nodo.textContent?.trim() ?? "";
            const rects = fragmentos(nodo);
            if (!pieza || rects.length === 0) continue;
            if (new Set(rects.map((r) => Math.round(r.top))).size > 1) {
              fallos.push(`${donde}: «${pieza}» partido en dos líneas`);
            }
            if (rects.some((r) => !dentro(r, rTexto))) fallos.push(`${donde}: «${pieza}» se sale de su esquina`);
          }
          const estilo = getComputedStyle(cabeza);
          // El anillo de Tailwind es una sombra sin desenfoque: «color 0px 0px 0px Npx».
          const anillo = Math.max(
            0,
            ...[...estilo.boxShadow.matchAll(/0px 0px 0px (\d+(?:\.\d+)?)px/g)].map((m) => Number(m[1])),
          );
          const ganador = /(^| )ring-win( |$)/.test(cabeza.className);
          if (ganador && anillo > 0) {
            const rAnillo = new DOMRect(
              rCabeza.left - anillo,
              rCabeza.top - anillo,
              rCabeza.width + 2 * anillo,
              rCabeza.height + 2 * anillo,
            );
            if (!dentro(rAnillo, caja(tarjeta))) fallos.push(`${donde}: la tarjeta corta el anillo del ganador`);
          }
          const img = cabeza.querySelector("img");
          caras.push({
            donde,
            ancho: rCabeza.width,
            alto: rCabeza.height,
            src: img?.getAttribute("src") ?? "",
            srcset: img?.getAttribute("srcset") ?? null,
            sizes: img?.getAttribute("sizes") ?? null,
            ganador,
            anillo,
          });
        }
      }
      return { filas: filas.length, caras, fallos };
    },
    { ambito, tolerancia: TOLERANCIA_PX },
  );
}

// Las reglas de la fila grande, a un ancho: en la portada (su «Último evento»)
// o en la ficha del evento (toda su cartelera).
async function comprobar(page: Page, width: number, ambito: "portada" | "evento" = "portada"): Promise<void> {
  await asentar(page, width);
  const m = await medir(page, ambito);
  const lado = LADO_PORTADA(width);
  const donde = ambito === "portada" ? "la portada" : page.url().replace(/^https?:\/\/[^/]+/, "");
  expect(m.filas, `${donde} a ${width}: sin filas de cartelera`).toBeGreaterThan(0);
  expect(m.caras, `${donde} a ${width}: no se midieron las dos caras de cada fila`).toHaveLength(m.filas * 2);
  expect.soft(m.fallos, `${donde} a ${width}: piezas fuera de su sitio`).toEqual([]);
  for (const cara of m.caras) {
    expect.soft(cara.ancho, `${donde} a ${width}: ${cara.donde} mide ${cara.ancho} px de ancho`).toBeGreaterThanOrEqual(lado - 0.5);
    expect.soft(cara.alto, `${donde} a ${width}: ${cara.donde} mide ${cara.alto} px de alto`).toBeGreaterThanOrEqual(lado - 0.5);
    expect.soft(Math.abs(cara.ancho - cara.alto), `${donde} a ${width}: ${cara.donde} ya no es cuadrada`).toBeLessThanOrEqual(0.5);
    if (cara.ganador) {
      expect.soft(cara.anillo, `${donde} a ${width}: ${cara.donde} gana y no se le ve el anillo`).toBeGreaterThanOrEqual(2);
    }
  }
  // Las de ufc.com, con su original: la versión nítida.
  for (const cara of m.caras.filter((c) => GUARDADA.test(c.src))) {
    expect.soft(cara.srcset, `${donde} a ${width}: ${cara.donde} sin el original en el srcset`).toMatch(
      / 256w, https:\/\/www\.ufc\.com\/images\/(?!styles\/).+ 500w$/,
    );
    expect.soft(cara.sizes, `${donde} a ${width}: ${cara.donde}: sizes`).toBe(SIZES_PORTADA);
  }
  await expectNoHorizontalOverflow(page, `${donde} a ${width}`);
}

test("portada: las caras del «Último evento», grandes, con su original y todo dentro de su esquina", async ({
  page,
}) => {
  await abrirPortada(page);
  const width = page.viewportSize()?.width ?? 0;
  await comprobar(page, width);

  // Sin una sola cara de ufc.com no se habría probado el srcset: se dice, no
  // se da por bueno en silencio (un evento con todas de ESPN es legítimo).
  const m = await medir(page, "portada");
  const deUfc = m.caras.filter((c) => GUARDADA.test(c.src)).length;
  const ganadores = m.caras.filter((c) => c.ganador).length;
  if (deUfc === 0) {
    test.info().annotations.push({
      type: "aviso",
      description: "el «Último evento» no tiene caras de ufc.com del estilo event_results: el srcset no se ha probado",
    });
  }
  expect(ganadores, "ningún ganador en el «Último evento»: el anillo no se ha probado").toBeGreaterThan(0);
});

test("portada: el mismo barrido a 360, 414, 820, 1024, 1440 y 1920", async ({ page }, testInfo) => {
  test.skip(
    testInfo.project.name !== "escritorio-light",
    "cada ancho se fija a mano y el tema no cambia la geometría: basta un proyecto",
  );
  await abrirPortada(page);
  for (const width of OTROS_ANCHOS) {
    await comprobar(page, width);
  }
});

// Invertido a propósito el 30-oct (antes: «la ficha del mismo evento no cambia:
// sus caras siguen a 36/48 px y sin el original»): el dueño pidió la fila
// grande también en la cartelera de /eventos/[id].
async function abrirFichaDelUltimoEvento(page: Page): Promise<{ href: string; nombres: string[] }> {
  const seccion = await abrirPortada(page);
  const enlace = seccion.getByRole("link", { name: /Ver resultados completos/ });
  const href = await enlace.getAttribute("href");
  expect(href, "el «Ver resultados completos» no lleva a la ficha del evento").toMatch(/^\/eventos\/\d+$/);
  const nombres = await seccion.locator('[data-bout-corner] img[alt^="Foto de "]').evaluateAll((imgs) =>
    imgs.map((img) => img.getAttribute("alt") ?? ""),
  );
  await page.goto(href!);
  await expect(page.locator('[data-testid="bout-row"]:visible').first()).toBeVisible();
  await esperarHidratacion(page);
  await page.evaluate(() => document.fonts.ready);
  return { href: href!, nombres };
}

test("la ficha del mismo evento, con las mismas caras grandes y las mismas reglas", async ({ page }) => {
  const { href, nombres } = await abrirFichaDelUltimoEvento(page);
  // Las mismas caras que la portada están aquí: se compara lo mismo.
  const aqui = new Set(
    await page.locator('[data-bout-corner] img[alt^="Foto de "]').evaluateAll((imgs) =>
      imgs.map((img) => img.getAttribute("alt") ?? ""),
    ),
  );
  expect(nombres.filter((n) => !aqui.has(n)), `${href}: caras de la portada que no están en la ficha`).toEqual([]);
  await comprobar(page, page.viewportSize()?.width ?? 0, "evento");
});

test("la ficha del mismo evento: el mismo barrido a 360, 414, 820, 1024, 1440 y 1920", async ({ page }, testInfo) => {
  test.skip(
    testInfo.project.name !== "escritorio-light",
    "cada ancho se fija a mano y el tema no cambia la geometría: basta un proyecto",
  );
  await abrirFichaDelUltimoEvento(page);
  for (const width of OTROS_ANCHOS) {
    await comprobar(page, width, "evento");
  }
});
