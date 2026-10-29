import { readFileSync } from "node:fs";
import path from "node:path";

import { expect, test, type Page, type Request } from "@playwright/test";

import { esperarHidratacion, expectNoHorizontalOverflow, fakeYouTubeEmbeds } from "./helpers";

// ── Las caras grandes en la cartelera: /eventos/[id], /ufc-hoy y /en-vivo ────
//
// El dueño, el 30-oct-2026: las caras grandes del «Último evento» de la portada
// (72 px en el móvil y 96 desde 640, con el original de ufc.com, la cara encima
// del nombre por debajo de 1024) también en la cartelera de /eventos/[id], en
// /ufc-hoy y en /en-vivo. Las «Peleas canceladas» de la ficha, pequeñas. Lo que
// se vigila aquí, con la página servida de verdad:
//   · /eventos/1093 (UFC 333: fijo, con resultados, TÍTULO, FOTN, POTN y GANA),
//     de 360 a 1920: caras de 72/96, cada pieza dentro de su esquina, el
//     resultado y las insignias dentro del centro, el chevron con la altura de
//     su fila y sin desbordar. Un nombre que no cabe nunca tiene la cara al
//     lado, y desde 414 no se corta ninguno.
//   · El próximo evento (con rankings): cada ranking pegado a su nombre. Con la
//     esquina apilada y el nombre con flex-1, el «#12» se iba a 27-135 px,
//     debajo del VS (/eventos/1099, 29-oct).
//   · Las canceladas, plegadas, siguen a 36/48 px.
//   · /ufc-hoy y /en-vivo, con las caras grandes. /en-vivo es el marcador del
//     directo: el chip de estado encima de cada fila, el panel del combate en
//     curso abierto, y el refresco de cada 20 s no mueve nada.
//   · El esqueleto de carga de la ficha cae donde cae la página: el póster, la
//     primera fila y la caja de las caras.
//
// 🪤 /ufc-hoy, /en-vivo y el próximo evento cambian cada semana: se buscan por
// estructura, y cuando no hay qué medir el test se SALTA diciendo por qué
// (nunca «no encontré nada» callado). La 1093 es fija: si pierde algo, ROJO.
//
// Todo corre en UN proyecto (escritorio-light): cada test fija sus anchos y el
// tema no cambia ninguna medida.

const FIXTURES = path.join(__dirname, "fixtures");
const FOTO_GUARDADA = readFileSync(path.join(FIXTURES, "luchadores-headshot-256x160.png"));
const FOTO_ORIGINAL = readFileSync(path.join(FIXTURES, "headshot-hd-500x325.png"));
const FOTO_ESPN = readFileSync(path.join(FIXTURES, "careo-headshot.png"));

const ORIGINAL = /^https:\/\/www\.ufc\.com\/images\/(?!styles\/)/;
const GUARDADA = /\/images\/styles\/event_results_athlete_headshot\//;

const EVENTO_FIJO = "/eventos/1093";
const ANCHOS = [360, 390, 414, 768, 820, 1024, 1280, 1440, 1920];
const ANCHOS_CORTOS = [360, 390, 414, 768, 1024, 1280];
// sm de Tailwind: desde aquí, caras de 96 y chevron de 40.
const SM = 640;
const LADO = (ancho: number) => (ancho >= SM ? 96 : 72);
const LADO_PEQUENO = (ancho: number) => (ancho >= SM ? 48 : 36);
const CHEVRON = (ancho: number) => (ancho >= SM ? 40 : 36);
// (72 − 2) × 1,6 y (96 − 2) × 1,6: el ancho al que se pinta la cara de ufc.com.
const SIZES = "(min-width: 640px) 150px, 112px";
// Desde aquí no se corta ningún nombre en la 1093. Medido el 30-oct con el
// cambio: a 360 y 390 se cortan dos (Volkanovski 98/125 y 113/125 px,
// Yakhyaev 118/135 y 133/135), con la cara ENCIMA, no al lado; con la fila de
// siempre eran 19 y 11.
const SIN_CORTES_DESDE = 414;
// gap-1.5 entre el nombre y su ranking: 6 px. Con flex-1 eran 27-135.
const RANGO_MAX_PX = 8;
const TOLERANCIA_PX = 1;

test.use({ serviceWorkers: "block" });

test.beforeEach(async ({ page, baseURL }, testInfo) => {
  test.skip(
    testInfo.project.name !== "escritorio-light",
    "cada test fija sus anchos y el tema no cambia la geometría: basta un proyecto",
  );
  // Las fotos de fuera, ENLATADAS con su medida real: la geometría no depende de la red.
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
  await fakeYouTubeEmbeds(page);
});

async function asentar(page: Page, width: number): Promise<void> {
  await page.setViewportSize({ width, height: 900 });
  await page.evaluate(
    () => new Promise<void>((ok) => requestAnimationFrame(() => requestAnimationFrame(() => ok()))),
  );
}

async function abrir(page: Page, url: string): Promise<boolean> {
  await page.goto(url);
  await esperarHidratacion(page);
  // 🪤 React deja el contenido unos cientos de ms en div[hidden][id^="S:"]:
  // se espera a una fila VISIBLE, o a que la página diga que no hay ninguna.
  const fila = page.locator('[data-testid="bout-row"]:visible').first();
  try {
    await fila.waitFor({ state: "visible", timeout: 8_000 });
  } catch {
    return false;
  }
  await page.evaluate(() => document.fonts.ready);
  return true;
}

type Cara = {
  donde: string;
  ancho: number;
  alto: number;
  src: string;
  srcset: string | null;
  sizes: string | null;
};
type Medida = {
  filas: number;
  caras: Cara[];
  fallos: string[];
  cortados: { donde: string; visible: number; total: number; caraAlLado: boolean }[];
  rangos: { donde: string; hueco: number }[];
  chevrons: number;
  insignias: Record<"TÍTULO" | "FOTN" | "POTN" | "GANA", number>;
};

// Toda la geometría de las filas de la página, en una pasada por el DOM.
// `zona`: la cartelera (fuera de <details>) o las canceladas (dentro).
async function medir(page: Page, zona: "cartelera" | "canceladas"): Promise<Medida> {
  return page.evaluate(
    ({ zona, tolerancia, anchoChevron }) => {
      const fallos: string[] = [];
      const caras: Cara[] = [];
      const cortados: Medida["cortados"] = [];
      const rangos: Medida["rangos"] = [];
      const insignias = { TÍTULO: 0, FOTN: 0, POTN: 0, GANA: 0 };
      let chevrons = 0;
      const caja = (el: Element) => el.getBoundingClientRect();
      const dentro = (a: DOMRect, b: DOMRect) =>
        a.left >= b.left - tolerancia &&
        a.right <= b.right + tolerancia &&
        a.top >= b.top - tolerancia &&
        a.bottom <= b.bottom + tolerancia;
      const pisa = (a: DOMRect, b: DOMRect) =>
        Math.min(a.right, b.right) - Math.max(a.left, b.left) > tolerancia &&
        Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top) > tolerancia;
      const fragmentos = (nodo: Node) => {
        const rango = document.createRange();
        rango.selectNodeContents(nodo);
        return [...rango.getClientRects()].filter((r) => r.width > 0);
      };
      const filas = [...document.querySelectorAll<HTMLElement>('[data-testid="bout-row"]')].filter(
        (fila) =>
          (zona === "canceladas" ? fila.closest("details[open]") : !fila.closest("details")) &&
          fila.checkVisibility(),
      );
      for (const fila of filas) {
        const estiloFila = getComputedStyle(fila);
        const rFila = caja(fila);
        const contenido = new DOMRect(
          rFila.left + parseFloat(estiloFila.paddingLeft),
          rFila.top,
          rFila.width - parseFloat(estiloFila.paddingLeft) - parseFloat(estiloFila.paddingRight),
          rFila.height,
        );
        const centro = fila.children[1] as HTMLElement | undefined;
        const esquinas = [...fila.querySelectorAll<HTMLElement>("[data-bout-corner]")];
        if (!centro || esquinas.length !== 2) {
          fallos.push(`fila sin sus dos esquinas y su centro: «${fila.textContent?.slice(0, 60)}»`);
          continue;
        }
        const nombres = esquinas.map(
          (e) => e.querySelector("p span.truncate")?.textContent?.trim() ?? "?",
        );
        const combate = `${nombres[0]} vs ${nombres[1]}`;
        const rCentro = caja(centro);
        if (!dentro(rCentro, contenido)) fallos.push(`${combate}: el centro se sale de la fila`);
        // El resultado, el peso, TÍTULO, FOTN y la píldora: dentro del centro.
        for (const pieza of centro.children) {
          if (!(pieza as HTMLElement).checkVisibility()) continue;
          const r = caja(pieza);
          if (r.width === 0) continue;
          if (!dentro(r, rCentro)) {
            fallos.push(`${combate}: «${pieza.textContent?.trim()}» se sale del centro`);
          }
          if (esquinas.some((e) => pisa(r, caja(e)))) {
            fallos.push(`${combate}: «${pieza.textContent?.trim()}» pisa una esquina`);
          }
        }
        // Las dos caras de la fila arrancan a la misma altura.
        const [arribaRoja, arribaAzul] = esquinas.map((e) => caja(e.firstElementChild ?? e).top);
        if (Math.abs(arribaRoja - arribaAzul) > tolerancia) {
          fallos.push(`${combate}: las caras no arrancan a la misma altura (${(arribaAzul - arribaRoja).toFixed(1)} px)`);
        }
        // El chevron (EventBoutDisclosure): hermano del enlace, con la altura de la fila.
        const tira = fila.parentElement?.parentElement;
        const boton = tira?.querySelector<HTMLElement>(":scope > button");
        if (boton) {
          chevrons += 1;
          const rBoton = caja(boton);
          if (Math.abs(rBoton.height - rFila.height) > tolerancia) {
            fallos.push(`${combate}: el chevron mide ${rBoton.height.toFixed(1)} px de alto y su fila ${rFila.height.toFixed(1)}`);
          }
          if (Math.abs(rBoton.top - rFila.top) > tolerancia) {
            fallos.push(`${combate}: el chevron no arranca a la altura de su fila`);
          }
          if (Math.abs(rBoton.width - anchoChevron) > 0.5) {
            fallos.push(`${combate}: el chevron mide ${rBoton.width.toFixed(1)} px de ancho (debe ${anchoChevron})`);
          }
        }
        for (const insignia of fila.querySelectorAll<HTMLElement>("span[title], span.text-win")) {
          if (!insignia.checkVisibility()) continue;
          const texto = insignia.textContent?.trim().toUpperCase() ?? "";
          if (texto in insignias) insignias[texto as keyof typeof insignias] += 1;
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
          const spanNombre = lineaNombre.querySelector<HTMLElement>("span.truncate");
          const caraAlLado =
            Math.min(rCabeza.bottom, rTexto.bottom) - Math.max(rCabeza.top, rTexto.top) > tolerancia;
          if (spanNombre && spanNombre.scrollWidth > spanNombre.clientWidth) {
            cortados.push({ donde, visible: spanNombre.clientWidth, total: spanNombre.scrollWidth, caraAlLado });
          }
          // El ranking (#12, «C»): el <span> que sigue al nombre en su línea.
          const rango = spanNombre?.nextElementSibling as HTMLElement | null;
          if (spanNombre && rango && /^(#\d+|C)$/.test(rango.textContent?.trim() ?? "")) {
            const rNombre = caja(spanNombre);
            const rRango = caja(rango);
            const hueco = lado === "blue" ? rNombre.left - rRango.right : rRango.left - rNombre.right;
            rangos.push({ donde, hueco });
            if (!dentro(rRango, rEsquina)) fallos.push(`${donde}: el ranking se sale de su esquina`);
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
          const img = cabeza.querySelector("img");
          caras.push({
            donde,
            ancho: rCabeza.width,
            alto: rCabeza.height,
            src: img?.getAttribute("src") ?? "",
            srcset: img?.getAttribute("srcset") ?? null,
            sizes: img?.getAttribute("sizes") ?? null,
          });
        }
      }
      return { filas: filas.length, caras, fallos, cortados, rangos, chevrons, insignias };
    },
    { zona, tolerancia: TOLERANCIA_PX, anchoChevron: CHEVRON(page.viewportSize()?.width ?? 0) },
  );
}

/** Las comprobaciones de la fila grande a un ancho: caras de 72/96 con su
 *  original, cada pieza en su sitio, los nombres y sin desbordar. */
async function comprobarFilasGrandes(page: Page, donde: string, width: number): Promise<Medida> {
  await asentar(page, width);
  const m = await medir(page, "cartelera");
  const lado = LADO(width);
  expect(m.filas, `${donde} a ${width}: sin filas`).toBeGreaterThan(0);
  expect(m.caras, `${donde} a ${width}: no se midieron las dos caras de cada fila`).toHaveLength(m.filas * 2);
  expect.soft(m.fallos, `${donde} a ${width}: piezas fuera de su sitio`).toEqual([]);
  for (const cara of m.caras) {
    expect.soft(cara.ancho, `${donde} a ${width}: ${cara.donde} mide ${cara.ancho} px de ancho`).toBeCloseTo(lado, 0);
    expect.soft(cara.alto, `${donde} a ${width}: ${cara.donde} mide ${cara.alto} px de alto`).toBeCloseTo(lado, 0);
  }
  for (const cara of m.caras.filter((c) => GUARDADA.test(c.src))) {
    expect.soft(cara.srcset, `${donde}: ${cara.donde} sin el original en el srcset`).toMatch(
      / 256w, https:\/\/www\.ufc\.com\/images\/(?!styles\/).+ 500w$/,
    );
    expect.soft(cara.sizes, `${donde}: ${cara.donde}: sizes`).toBe(SIZES);
  }
  // Un nombre que no cabe NUNCA tiene la cara al lado comiéndole el ancho.
  for (const corte of m.cortados.filter((c) => c.caraAlLado)) {
    expect.soft(corte, `${donde} a ${width}: ${corte.donde} se corta con la cara al lado`).toBeUndefined();
  }
  for (const rango of m.rangos) {
    expect
      .soft(rango.hueco, `${donde} a ${width}: el ranking de ${rango.donde} queda a ${rango.hueco.toFixed(1)} px de su nombre`)
      .toBeLessThanOrEqual(RANGO_MAX_PX);
  }
  await expectNoHorizontalOverflow(page, `${donde} a ${width}`);
  return m;
}

test(`${EVENTO_FIJO} (UFC 333, con resultados): caras grandes y todo en su sitio, de 360 a 1920`, async ({
  page,
}) => {
  expect(await abrir(page, EVENTO_FIJO), `${EVENTO_FIJO} no pinta su cartelera`).toBe(true);
  for (const width of ANCHOS) {
    const m = await comprobarFilasGrandes(page, EVENTO_FIJO, width);
    expect.soft(m.chevrons, `${EVENTO_FIJO} a ${width}: filas sin chevron`).toBe(m.filas);
    // La 1093 tiene de todo: si algo falta, la prueba no ha medido lo que dice.
    for (const [insignia, cuantas] of Object.entries(m.insignias)) {
      expect.soft(cuantas, `${EVENTO_FIJO} a ${width}: ningún ${insignia} a la vista`).toBeGreaterThan(0);
    }
    if (width >= SIN_CORTES_DESDE) {
      expect.soft(m.cortados, `${EVENTO_FIJO} a ${width}: nombres cortados`).toEqual([]);
    }
    console.log(
      `${EVENTO_FIJO} a ${width}: ${m.filas} filas, ${m.cortados.length} nombres cortados` +
        (m.cortados.length ? ` (${m.cortados.map((c) => `${c.donde} ${c.visible}/${c.total}`).join(", ")})` : ""),
    );
  }
});

/** El próximo evento, por el «Ver cartelera» del «PRÓXIMO EVENTO» de la portada. */
async function proximoEvento(page: Page): Promise<string | null> {
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  const enlace = page
    .locator("section", { has: page.getByText("PRÓXIMO EVENTO", { exact: true }) })
    .getByRole("link", { name: /Ver cartelera/ });
  if ((await enlace.count()) === 0) return null;
  const href = await enlace.first().getAttribute("href");
  expect(href, "el enlace «Ver cartelera» no lleva a un evento").toMatch(/^\/eventos\/\d+$/);
  return href;
}

test("el próximo evento (con rankings): cada ranking pegado a su nombre, de 360 a 1280", async ({ page }) => {
  const href = await proximoEvento(page);
  test.skip(href === null, "la portada no tiene próximo evento: no hay rankings que medir");
  expect(await abrir(page, href!), `${href} no pinta su cartelera`).toBe(true);
  let vistos = 0;
  for (const width of ANCHOS_CORTOS) {
    const m = await comprobarFilasGrandes(page, href!, width);
    vistos += m.rangos.length;
  }
  test.skip(vistos === 0, `${href} no enseña ningún ranking: no hay hueco que medir`);
});

test("las «Peleas canceladas» de un evento futuro siguen pequeñas (36/48 px)", async ({ page }) => {
  // La de la semana, si tiene; si no, la primera de «Próximos» que tenga.
  await page.goto("/eventos");
  const enlaces = await page.locator('a[href^="/eventos/"]').evaluateAll((as) =>
    [...new Set(as.map((a) => a.getAttribute("href") ?? ""))].filter((h) => /^\/eventos\/\d+$/.test(h)),
  );
  let conCanceladas: string | null = null;
  for (const href of enlaces.slice(0, 10)) {
    await page.goto(href);
    if ((await page.locator("summary", { hasText: "Peleas canceladas" }).count()) > 0) {
      conCanceladas = href;
      break;
    }
  }
  test.skip(conCanceladas === null, "ningún evento de «Próximos» tiene peleas canceladas");
  expect(await abrir(page, conCanceladas!)).toBe(true);
  await page.locator("summary", { hasText: "Peleas canceladas" }).click();
  for (const width of [390, 1280]) {
    await asentar(page, width);
    const m = await medir(page, "canceladas");
    expect(m.filas, `${conCanceladas} a ${width}: no se ven las canceladas al abrirlas`).toBeGreaterThan(0);
    expect.soft(m.fallos, `${conCanceladas} a ${width}: canceladas fuera de su sitio`).toEqual([]);
    for (const cara of m.caras) {
      expect.soft(cara.ancho, `${conCanceladas} a ${width}: cancelada ${cara.donde}`).toBeCloseTo(LADO_PEQUENO(width), 0);
      expect.soft(cara.srcset, `${conCanceladas}: cancelada ${cara.donde} sin original`).toBeNull();
    }
    // Y la cartelera de al lado, grande.
    const cartelera = await medir(page, "cartelera");
    for (const cara of cartelera.caras) {
      expect.soft(cara.ancho, `${conCanceladas} a ${width}: ${cara.donde}`).toBeCloseTo(LADO(width), 0);
    }
  }
});

test("/ufc-hoy: la cartelera de la velada con las caras grandes", async ({ page }) => {
  const hayFilas = await abrir(page, "/ufc-hoy");
  test.skip(!hayFilas, "/ufc-hoy no tiene velada candidata: no pinta cartelera");
  for (const width of ANCHOS_CORTOS) {
    await comprobarFilasGrandes(page, "/ufc-hoy", width);
  }
  const m = await medir(page, "cartelera");
  if (!m.caras.some((c) => GUARDADA.test(c.src))) {
    test.info().annotations.push({
      type: "aviso",
      description: "/ufc-hoy no tiene caras de ufc.com del estilo event_results: el srcset no se ha probado",
    });
  }
});

// ── /en-vivo, el marcador del directo ──
// Solo hay filas desde 24 h antes de la velada (fase «pre») hasta que el cron
// la cierra. En directo (fase «live») cada fila lleva su chip, el combate en
// curso llega con el panel ABIERTO y la página se refresca cada 20 s.

type BloqueEnVivo = {
  chip: string;
  chipEncima: boolean;
  filaTop: number;
  abierto: boolean | null;
  panelAlto: number;
};

async function bloquesEnVivo(page: Page): Promise<BloqueEnVivo[]> {
  return page.evaluate(() =>
    [...document.querySelectorAll<HTMLElement>('[data-testid="bout-row"]')]
      .filter((fila) => fila.checkVisibility())
      .map((fila) => {
        // El bloque de cada combate: la franja del chip y, debajo, la fila.
        const bloque = fila.closest("section > div > div") as HTMLElement;
        const franja = bloque.firstElementChild as HTMLElement;
        const boton = fila.parentElement?.parentElement?.querySelector<HTMLElement>(":scope > button");
        const panel = boton ? document.getElementById(boton.getAttribute("aria-controls") ?? "") : null;
        return {
          chip: franja.textContent?.trim() ?? "",
          chipEncima: franja.getBoundingClientRect().bottom <= fila.getBoundingClientRect().top + 1,
          filaTop: Math.round(fila.getBoundingClientRect().top + window.scrollY),
          abierto: boton ? boton.getAttribute("aria-expanded") === "true" : null,
          panelAlto: panel ? panel.getBoundingClientRect().height : 0,
        };
      }),
  );
}

test("/en-vivo: el marcador con las caras grandes, el chip encima, el panel en curso abierto y el refresco quieto", async ({
  page,
}) => {
  test.setTimeout(120_000);
  const hayFilas = await abrir(page, "/en-vivo");
  test.skip(!hayFilas, "/en-vivo sin velada (fuera de las 24 h previas y del directo): no pinta filas");
  let enCurso = 0;
  for (const width of ANCHOS_CORTOS) {
    await comprobarFilasGrandes(page, "/en-vivo", width);
    const bloques = await bloquesEnVivo(page);
    expect(bloques.length, `/en-vivo a ${width}: filas sin su bloque`).toBeGreaterThan(0);
    enCurso += bloques.filter((b) => b.chip.startsWith("En curso")).length;
    for (const b of bloques) {
      expect.soft(b.chipEncima, `/en-vivo a ${width}: el chip «${b.chip}» no va encima de su fila`).toBe(true);
      if (b.chip.startsWith("En curso")) {
        expect.soft(b.abierto, `/en-vivo a ${width}: el combate en curso llega con el panel cerrado`).toBe(true);
        expect.soft(b.panelAlto, `/en-vivo a ${width}: el panel en curso no se ve`).toBeGreaterThan(0);
      }
    }
  }
  const enDirecto = await page.getByText("En directo", { exact: true }).count();
  // Entre combate y combate (o en la media hora antes del primero) no hay
  // ninguno «En curso»: es legítimo, pero entonces el panel abierto no se ha
  // probado, y se dice.
  console.log(`/en-vivo: ${enDirecto ? "en directo" : "fase previa"}, ${enCurso / ANCHOS_CORTOS.length} combate(s) en curso`);
  if (enDirecto && enCurso === 0) {
    test.info().annotations.push({
      type: "aviso",
      description: "/en-vivo en directo sin ningún combate «En curso»: el panel abierto no se ha probado",
    });
  }
  if (enDirecto === 0) {
    // Fase previa (las 24 h antes): las filas ya se han medido arriba; el
    // refresco es de 90 s y no hay directo que mover. Se dice, no se salta:
    // lo de arriba SÍ se ha comprobado.
    test.info().annotations.push({
      type: "aviso",
      description: "/en-vivo en fase previa: el refresco de 20 s del directo no se ha medido",
    });
    return;
  }

  // El refresco del directo (AutoRefresh, router.refresh cada 20 s): con la
  // fila grande, nada se mueve si no cambia nada.
  await asentar(page, 390);
  const antes = await bloquesEnVivo(page);
  const refresco = page.waitForRequest(
    (peticion: Request) => new URL(peticion.url()).pathname === "/en-vivo" && peticion.headers()["rsc"] === "1",
    { timeout: 45_000 },
  );
  await (await refresco).response();
  await page.waitForTimeout(1_000);
  const despues = await bloquesEnVivo(page);
  expect(despues.map((b) => b.chip), "el refresco cambió los chips (¿cambió el directo de verdad?)").toEqual(
    antes.map((b) => b.chip),
  );
  expect(despues.map((b) => b.filaTop), "el refresco movió las filas").toEqual(antes.map((b) => b.filaTop));
  expect(despues.map((b) => b.abierto), "el refresco abrió o cerró paneles").toEqual(antes.map((b) => b.abierto));
});

// ── El esqueleto de carga de la ficha, contra la página que llega ──
// De «Próximos» se pincha la primera velada con la navegación RSC RETENIDA (la
// cabecera rsc, sin next-router-prefetch): mientras, se ve loading.tsx. Se mide
// y se suelta.
//
// 🪤 TOLERANCIA DECLARADA de la primera fila: el esqueleto no sabe qué evento
// llega, y la cabecera real cambia con él (un nombre de una o dos líneas, el
// lema de una a tres, la emisión, los horarios por tramo). Medido el 30-oct en
// los seis eventos de «Próximos»: a 390 la primera fila cae entre y=692 y
// y=785 (93 px de un evento a otro); a 768, entre 846 y 894; a 1280, entre 869
// y 897. El esqueleto se dibuja con la cabecera de una Fight Night con
// preliminares (el caso de casi todas las semanas), y la tolerancia cubre la
// mitad de ese abanico con margen. Antes de este cambio el salto era de 175 px
// a 390 y de 534 a 1280.
const TOLERANCIA_PRIMERA_FILA: Record<number, number> = { 390: 60, 768: 40, 1280: 30 };
// La altura de una fila: la real crece si el récord parte de línea (140-158 px
// a 390); el esqueleto dibuja la de una línea.
const TOLERANCIA_ALTO_FILA = 20;

type MedidaCarga = {
  poster: { left: number; top: number; width: number; height: number } | null;
  primeraFila: number | null;
  altoFila: number | null;
  cara: number | null;
  chevron: number | null;
};

async function medirCarga(page: Page, que: "esqueleto" | "real"): Promise<MedidaCarga> {
  return page.evaluate((que) => {
    const visible = (el: Element) => (el as HTMLElement).checkVisibility();
    const filas = [
      ...document.querySelectorAll<HTMLElement>(
        que === "real" ? '[data-testid="bout-row"]' : '[class*="grid-cols-[1fr_auto_1fr]"]:not([data-testid="bout-row"])',
      ),
    ].filter((f) => visible(f) && !f.closest("details"));
    const fila = filas[0];
    const poster = [
      ...document.querySelectorAll(que === "real" ? 'img[alt^="Póster de"]' : '[class*="aspect-[16/9]"]'),
    ].find(visible);
    const r = poster?.getBoundingClientRect();
    const cara = fila?.querySelector(":scope > div > :first-child")?.getBoundingClientRect();
    const chevron = fila?.parentElement?.nextElementSibling?.getBoundingClientRect();
    return {
      poster: r
        ? { left: r.left, top: r.top + window.scrollY, width: r.width, height: r.height }
        : null,
      primeraFila: fila ? fila.getBoundingClientRect().top + window.scrollY : null,
      altoFila: fila ? fila.getBoundingClientRect().height : null,
      cara: cara ? cara.width : null,
      chevron: chevron ? chevron.width : null,
    };
  }, que);
}

test("el esqueleto de la ficha cae donde cae la página: póster, primera fila y caras, a 390, 768 y 1280", async ({
  page,
}) => {
  for (const width of [390, 768, 1280]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/eventos");
    const tarjeta = page.locator('a[href^="/eventos/"]').filter({ hasNotText: /^$/ }).first();
    test.skip((await tarjeta.count()) === 0, "«Próximos» no tiene ninguna velada que abrir");
    const href = (await tarjeta.getAttribute("href")) ?? "";
    expect(href).toMatch(/^\/eventos\/\d+$/);
    await esperarHidratacion(page);

    // Se retiene la navegación a la ficha hasta haber medido el esqueleto.
    let soltar = () => {};
    const suelta = new Promise<void>((ok) => {
      soltar = ok;
    });
    await page.route(`**${href}*`, async (route) => {
      const cabeceras = route.request().headers();
      if (cabeceras["rsc"] && !cabeceras["next-router-prefetch"]) await suelta;
      return route.continue();
    });
    await tarjeta.scrollIntoViewIfNeeded();
    await page.waitForTimeout(800); // que llegue el prefetch del esqueleto
    await tarjeta.click();
    await expect(
      page.locator('[class*="grid-cols-[1fr_auto_1fr]"]:not([data-testid="bout-row"]):visible').first(),
      `${href} a ${width}: no sale el esqueleto de la ficha`,
    ).toBeVisible();
    await page.evaluate(() => window.scrollTo(0, 0));
    const esqueleto = await medirCarga(page, "esqueleto");
    soltar();
    await expect(page.locator('[data-testid="bout-row"]:visible').first()).toBeVisible();
    await esperarHidratacion(page);
    await page.evaluate(() => document.fonts.ready);
    await page.evaluate(() => window.scrollTo(0, 0));
    const real = await medirCarga(page, "real");
    await page.unroute(`**${href}*`);

    const donde = `${href} a ${width}`;
    console.log(`${donde}: esqueleto ${JSON.stringify(esqueleto)} · real ${JSON.stringify(real)}`);
    expect(esqueleto.poster, `${donde}: el esqueleto sin póster`).not.toBeNull();
    expect(real.poster, `${donde}: la ficha sin póster (elige otra velada)`).not.toBeNull();
    for (const k of ["left", "top", "width", "height"] as const) {
      expect.soft(Math.abs(esqueleto.poster![k] - real.poster![k]), `${donde}: póster, ${k}`).toBeLessThanOrEqual(1);
    }
    expect.soft(esqueleto.cara, `${donde}: la cara del esqueleto`).toBeCloseTo(real.cara ?? 0, 0);
    expect.soft(esqueleto.chevron, `${donde}: la columna del chevron`).toBeCloseTo(real.chevron ?? 0, 0);
    expect
      .soft(Math.abs((esqueleto.altoFila ?? 0) - (real.altoFila ?? 0)), `${donde}: alto de la primera fila`)
      .toBeLessThanOrEqual(TOLERANCIA_ALTO_FILA);
    expect(
      Math.abs((esqueleto.primeraFila ?? 0) - (real.primeraFila ?? 0)),
      `${donde}: la primera fila del esqueleto en y=${esqueleto.primeraFila} y la real en y=${real.primeraFila}`,
    ).toBeLessThanOrEqual(TOLERANCIA_PRIMERA_FILA[width]);
  }
});
