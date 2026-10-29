import { expect, test, type Locator, type Page } from "@playwright/test";

import { esperarHidratacion, expectNoHorizontalOverflow, fakeYouTubeEmbeds } from "./helpers";

// ── «Mejores libra por libra» de la portada ───────────────────────────────
//
// Desde el 28-sep-2026 el bloque tiene dos pestañas, Masculino y Femenino, y el
// pie de cada tarjeta dice el total de peleas SEGÚN EL RÉCORD que la tarjeta
// enseña (29-1-0 → «30 peleas»). Aquí se prueba lo que solo se ve con la página
// servida de verdad: los roles ARIA, que el clic cambie de panel, el teclado y
// que el pie cuadre con el récord de su propia tarjeta.
//
// 🪤 SIN NOMBRES FIJOS: la base es la de producción y el ranking cambia cada
// semana. Todo se comprueba por estructura (6 tarjetas, enlaces distintos) y
// por coherencia interna (el pie contra el récord de al lado).
//
// Corre en los seis proyectos a propósito: el pie tiene que caber en UNA línea
// también a 390 px, y un salto de línea no lo caza el test de desbordamiento
// (ver comprobarPiesEnUnaLinea: se mide el ALTO del pie, no sus cajas).
//
// La lógica de las flechas está además en src/lib/tabs-keyboard.test.ts; la
// consulta, en src/lib/queries/featured-fighters.sql.test.ts.
//
// ⚠️ Y NADA de `test.only`: con CI=true, `forbidOnly` tumba la recolección.

/** Los `/fighters/<id>` distintos de un panel: cada tarjeta enlaza 3 veces. */
async function fichasDelPanel(panel: Locator): Promise<string[]> {
  const hrefs = await panel
    .locator('a[href^="/fighters/"]')
    .evaluateAll((enlaces) => enlaces.map((a) => a.getAttribute("href") ?? ""));
  return [...new Set(hrefs)];
}

/**
 * Cada pie contra el récord de SU tarjeta. Se lee con textContent, que no
 * depende de que el panel esté a la vista.
 */
async function comprobarPies(panel: Locator, nombre: string): Promise<void> {
  const tarjetas = panel.locator("[data-fighter-card]");
  await expect(tarjetas, `${nombre}: tarjetas`).toHaveCount(6);

  for (let i = 0; i < 6; i += 1) {
    const tarjeta = tarjetas.nth(i);
    const record = (
      await tarjeta
        .getByText("Récord", { exact: true })
        .locator("xpath=following-sibling::p[1]")
        .textContent()
    )?.trim();
    const partes = /^(\d+)-(\d+)-(\d+)$/.exec(record ?? "");
    const suma = partes ? Number(partes[1]) + Number(partes[2]) + Number(partes[3]) : 0;

    // Sin récord (nulo o 0-0-0) NI peleas UFC disputadas la tarjeta no pinta
    // contador, y es válido (fight-count.ts). 🪤 Se cuenta ANTES de leer:
    // textContent() sobre un localizador vacío espera al elemento hasta el
    // actionTimeout (15 s) y el test moriría por tiempo, no por una aserción.
    const pieLoc = tarjeta.locator("[data-fight-count]");
    if ((await pieLoc.count()) === 0) {
      expect(suma, `${nombre} #${i + 1}: sin contador junto al récord ${record}`).toBe(0);
      continue;
    }
    const pie = (await pieLoc.textContent())?.trim() ?? "";

    const total = /^(\d+) peleas?$/.exec(pie);
    if (partes && total) {
      // La regla del dueño: el número sale del MISMO récord que se enseña.
      expect(Number(total[1]), `${nombre} #${i + 1}: «${pie}» junto a ${record}`).toBe(suma);
    } else {
      // Sin récord legible, el respaldo tiene que decir que es solo UFC.
      expect(pie, `${nombre} #${i + 1}: pie «${pie}» con récord «${record}»`).toMatch(
        /^\d+ en UFC$/,
      );
    }
  }
}

/**
 * Ningún pie visible parte en dos líneas: el alto de su contenido (sin el
 * relleno) no pasa de UNA línea de texto.
 *
 * 🪤 Contar las cajas del contador (`getClientRects().length`) NO sirve, y así
 * estuvo la primera versión: el <span> es hijo directo de un flex, el navegador
 * lo convierte en bloque y un bloque da 1 caja aunque su texto ocupe dos
 * líneas. Medido el 29-sep-2026 forzando un pie largo a 390 px: el span daba
 * 1 caja con su texto en tres líneas (60 px de alto). Se mide el pie ENTERO porque, con el contador en
 * `whitespace-nowrap`, lo que cedería al faltar sitio son los enlaces.
 */
async function comprobarPiesEnUnaLinea(panel: Locator, nombre: string): Promise<void> {
  const pies = await panel.locator("[data-card-footer]").evaluateAll((nodos) =>
    nodos.map((pie) => {
      const estilo = getComputedStyle(pie);
      return {
        texto: (pie.textContent ?? "").replace(/\s+/g, " ").trim(),
        alto: pie.clientHeight - parseFloat(estilo.paddingTop) - parseFloat(estilo.paddingBottom),
        linea: parseFloat(estilo.lineHeight),
      };
    }),
  );
  expect(pies, `${nombre}: pies`).toHaveLength(6);
  for (const pie of pies) {
    // Media línea de margen: sobra para el redondeo y una segunda línea no cabe.
    expect(pie.alto, `${nombre}: el pie «${pie.texto}» parte en dos líneas`).toBeLessThan(
      pie.linea * 1.5,
    );
  }
}

// The home page, /en-vivo and the event pages mount YouTube players on their
// own (the turn manager): they get the fake YouTube of e2e/helpers.ts.
test.beforeEach(async ({ page }) => {
  await fakeYouTubeEmbeds(page);
});

test("el libra por libra alterna Masculino y Femenino, y cada pie cuadra con su récord", async ({
  page,
}) => {
  await page.goto("/");

  const lista = page.getByRole("tablist", { name: "Libra por libra" });
  await expect(lista).toBeVisible();
  await expect(lista.getByRole("tab")).toHaveCount(2);

  const masculino = lista.getByRole("tab", { name: "Masculino", exact: true });
  const femenino = lista.getByRole("tab", { name: "Femenino", exact: true });
  await expect(masculino).toHaveAttribute("aria-selected", "true");
  await expect(femenino).toHaveAttribute("aria-selected", "false");

  // El panel se busca por el aria-controls de su pestaña: así se prueba también
  // que la pestaña apunta al panel que toca.
  const panelM = page.locator(`#${await masculino.getAttribute("aria-controls")}`);
  const panelF = page.locator(`#${await femenino.getAttribute("aria-controls")}`);
  await expect(panelM).toHaveAttribute("role", "tabpanel");
  await expect(panelF).toHaveAttribute("role", "tabpanel");
  await expect(panelM).toBeVisible();
  await expect(panelF).toBeHidden();

  const fichasM = await fichasDelPanel(panelM);
  const fichasF = await fichasDelPanel(panelF);
  expect(fichasM, "masculino: 6 luchadores distintos").toHaveLength(6);
  expect(fichasF, "femenino: 6 luchadoras distintas").toHaveLength(6);
  expect(
    fichasF.filter((href) => fichasM.includes(href)),
    "el mismo luchador en los dos paneles",
  ).toEqual([]);

  await comprobarPies(panelM, "masculino");
  await comprobarPies(panelF, "femenino");
  await comprobarPiesEnUnaLinea(panelM, "masculino");

  // El clic antes de hidratar se pierde: se espera a la hidratación y, por si
  // la isla llega un instante después que next-themes, se reintenta el clic.
  await esperarHidratacion(page);
  await expect(async () => {
    await femenino.click();
    await expect(femenino).toHaveAttribute("aria-selected", "true", { timeout: 1_000 });
  }).toPass();

  await expect(masculino).toHaveAttribute("aria-selected", "false");
  await expect(panelF).toBeVisible();
  await expect(panelM).toBeHidden();
  await comprobarPiesEnUnaLinea(panelF, "femenino");

  // Teclado (WAI-ARIA, activación automática): ← vuelve al masculino y se lleva
  // el foco; solo la pestaña activa está en el orden del Tab.
  await femenino.press("ArrowLeft");
  await expect(masculino).toHaveAttribute("aria-selected", "true");
  await expect(masculino).toBeFocused();
  await expect(masculino).toHaveAttribute("tabindex", "0");
  await expect(femenino).toHaveAttribute("tabindex", "-1");
  await expect(panelM).toBeVisible();
  await expect(panelF).toBeHidden();
});

// ── Las caras, más grandes y nítidas, y los campeones en oro (29-oct-2026) ──
//
// El dueño: «ponemos las fotos de las cabezas más grandes y nítidas, tanto en
// masculino como en femenino», y el oro de los campeones de /fighters también
// aquí. La cara era un cuadrado de 64 px con la copia de 256 de ufc.com; ahora
// es la cara recortada en relieve, de pie sobre la línea de la cabecera como en
// /fighters y /clasificacion: una caja de 160×100 (la proporción 1,6:1 de la
// cara de ufc.com, que la llena) con el original de 500w en el srcset y
// `sizes` exacto. Son 3,9 veces el área de antes.
//
// Por debajo de 360 px la caja encoge a 120×75 (aún 2,2 veces el área de
// antes): a 320, con 160 px de cara, la columna del nombre se quedaba en 86 px
// y «MAKHACHEV» y «VOLKANOVSKI» se partían a mitad de palabra (revisión visual
// del 29-oct-2026). Con la cara grande los nombres largos SÍ pasan a dos líneas
// en el móvil y en la tableta («ALEXANDER / VOLKANOVSKI»), y es a propósito: es
// el precio de la cara grande que pidió el dueño, y se parten por las palabras.
// Lo que no se permite es partir una palabra.
//
// La etiqueta «Campeón» («Campeona» en la pestaña femenina) va encima del
// nombre, alineada con él, y no encima de la cara: ahí la cabeza se le metía
// debajo al crecer con el ratón.
//
// Los campeones se leen de /clasificacion, que es quien los publica: sin
// nombres fijos (ver arriba).

/** Los /fighters/<id> de los campeones que publica /clasificacion. */
async function campeonesPublicados(page: Page): Promise<Set<string>> {
  await page.goto("/clasificacion");
  const enlaces = page.locator('[data-testid="ranking-champion"] a[href^="/fighters/"]');
  await expect(enlaces.first()).toBeAttached();
  return new Set(await enlaces.evaluateAll((as) => as.map((a) => a.getAttribute("href") ?? "")));
}

/** La caja de la cara a un ancho de pantalla: 160×100, y 120×75 por debajo de 360. */
const cajaDeLaCara = (anchoPantalla: number) =>
  anchoPantalla < 360 ? { ancho: 120, alto: 75 } : { ancho: 160, alto: 100 };
const SIZES = "(max-width: 359.98px) 120px, 160px";
// Lo que crece la cara a cada lado con el ratón o el foco (scale 1.05).
const CRECE_POR_LADO = 0.025;
// La copia guardada de ufc.com, la que tiene original detrás (headshot-hd.ts).
const GUARDADA = /\/images\/styles\/event_results_athlete_headshot\//;

/** Lo que se mide de cada tarjeta de un panel VISIBLE. */
async function medirCaras(panel: Locator) {
  return panel.locator("[data-fighter-card]").evaluateAll((tarjetas, crece) =>
    tarjetas.map((t) => {
      const cabecera = t.querySelector<HTMLElement>("a");
      const caja = t.querySelector<HTMLElement>("[data-p4p-photo]");
      const img = caja?.querySelector("img");
      const etiqueta = t.querySelector<HTMLElement>("[data-champion-badge]");
      const c = cabecera?.getBoundingClientRect();
      const k = caja?.getBoundingClientRect();
      const lineaCabecera =
        c && cabecera ? c.bottom - parseFloat(getComputedStyle(cabecera).borderBottomWidth) : NaN;
      // Las palabras que una línea parte por la mitad: un Range por palabra, y
      // si sus rectángulos caen en dos alturas, se ha partido.
      const rotas = (p: HTMLElement) => {
        const malas: string[] = [];
        const textos = document.createTreeWalker(p, NodeFilter.SHOW_TEXT);
        for (let n = textos.nextNode(); n; n = textos.nextNode()) {
          const texto = n.textContent ?? "";
          for (const m of texto.matchAll(/\S+/g)) {
            const r = document.createRange();
            r.setStart(n, m.index);
            r.setEnd(n, m.index + m[0].length);
            const alturas = new Set([...r.getClientRects()].map((q) => Math.round(q.top)));
            if (alturas.size > 1) malas.push(m[0]);
          }
        }
        return malas;
      };
      // Los textos de la cabecera: ni cortados con «…» ni desbordados.
      const textos = cabecera
        ? [...cabecera.querySelectorAll<HTMLElement>("p")].map((p) => ({
            texto: (p.textContent ?? "").trim(),
            elipsis:
              getComputedStyle(p).textOverflow === "ellipsis" &&
              getComputedStyle(p).whiteSpace === "nowrap",
            desborda: p.scrollWidth > p.clientWidth + 1,
            rotas: rotas(p),
          }))
        : [];
      const barra = t.firstElementChild as HTMLElement | null;
      const e = etiqueta?.getBoundingClientRect();
      const nombre = cabecera?.querySelector("p")?.getBoundingClientRect();
      return {
        href: cabecera?.getAttribute("href") ?? "",
        marcador: t.getAttribute("data-champion"),
        etiqueta: etiqueta && etiqueta.offsetWidth > 0 ? (etiqueta.textContent ?? "").trim() : null,
        etiquetaPos:
          e && k && nombre
            ? {
                // Ni sobre la caja de la cara (en vertical) ni a su lado: lejos
                // incluso con la cara crecida por el ratón.
                sobreLaCara: e.bottom > k.top + 2 && e.right > k.left && e.left < k.right,
                aLaCara: e.left - (k.right + k.width * crece),
                // Encima del nombre, alineada con él, sin pisarlo.
                desalineada: Math.abs(e.left - nombre.left),
                pisaElNombre: e.bottom > nombre.top + 0.5,
              }
            : null,
        barra: barra ? getComputedStyle(barra).backgroundColor : "",
        caja: k ? { ancho: k.width, alto: k.height, abajo: k.bottom } : null,
        lineaCabecera,
        cabeceraAlto: c?.height ?? 0,
        src: img?.getAttribute("src") ?? "",
        srcset: img?.getAttribute("srcset") ?? null,
        sizes: img?.getAttribute("sizes") ?? null,
        imgAncho: img?.getBoundingClientRect().width ?? 0,
        textos,
      };
    }),
    CRECE_POR_LADO,
  );
}

/**
 * Las comprobaciones de un panel visible a un ancho de pantalla. Devuelve
 * cuántas caras HD y cuántos campeones ha visto.
 */
async function comprobarPanel(
  panel: Locator,
  nombre: "masculino" | "femenino",
  campeones: Set<string>,
  anchoPantalla: number,
) {
  const caja = cajaDeLaCara(anchoPantalla);
  const etiquetaEsperada = nombre === "femenino" ? "Campeona" : "Campeón";
  const tarjetas = await medirCaras(panel);
  expect(tarjetas, `${nombre} a ${anchoPantalla}: tarjetas`).toHaveLength(6);
  let hd = 0;
  let deOro = 0;
  for (const t of tarjetas) {
    const donde = `${nombre} a ${anchoPantalla} ${t.href}`;
    expect(t.caja, `${donde}: sin caja de la cara (data-p4p-photo)`).not.toBeNull();
    // El tamaño nuevo: de sobra el doble de área (64² eran 4.096).
    expect(t.caja!.ancho, `${donde}: ancho de la cara`).toBeCloseTo(caja.ancho, 0);
    expect(t.caja!.alto, `${donde}: alto de la cara`).toBeCloseTo(caja.alto, 0);
    expect(t.caja!.ancho * t.caja!.alto, `${donde}: área`).toBeGreaterThanOrEqual(2 * 64 * 64);
    // En relieve: de pie sobre la línea de la cabecera.
    expect(
      Math.abs(t.caja!.abajo - t.lineaCabecera),
      `${donde}: la cara no pisa la línea de la cabecera`,
    ).toBeLessThanOrEqual(1);
    // Nítida: la de ufc.com ofrece su original, con `sizes` exacto.
    if (GUARDADA.test(t.src)) {
      hd += 1;
      expect(t.srcset, `${donde}: srcset`).toMatch(/ 256w, https:\/\/www\.ufc\.com\/images\/.+ 500w$/);
      expect(t.sizes, `${donde}: sizes`).toBe(SIZES);
      expect(Math.abs(t.imgAncho - caja.ancho), `${donde}: se pinta a ${t.imgAncho} px`).toBeLessThanOrEqual(0.5);
    }
    // Ni «…», ni texto que se salga, ni palabras partidas por la mitad en la
    // cabecera (nombre, apodo, categoría).
    for (const p of t.textos) {
      expect(p.elipsis, `${donde}: «${p.texto}» se corta con …`).toBe(false);
      expect(p.desborda, `${donde}: «${p.texto}» se sale de su caja`).toBe(false);
      expect(p.rotas, `${donde}: «${p.texto}» parte palabras por la mitad`).toEqual([]);
    }
    if (campeones.has(t.href)) {
      deOro += 1;
      expect(t.marcador, `${donde}: campeón sin marcador`).toBe("true");
      expect(t.etiqueta, `${donde}: la etiqueta visible`).toBe(etiquetaEsperada);
      expect(t.etiquetaPos, `${donde}: sin etiqueta, cara o nombre que medir`).not.toBeNull();
      const pos = t.etiquetaPos!;
      expect(pos.sobreLaCara, `${donde}: la etiqueta tapa la cara`).toBe(false);
      expect(pos.aLaCara, `${donde}: la cara crecida se mete bajo la etiqueta`).toBeGreaterThanOrEqual(0);
      expect(pos.desalineada, `${donde}: la etiqueta no va alineada con el nombre`).toBeLessThanOrEqual(1);
      expect(pos.pisaElNombre, `${donde}: la etiqueta pisa el nombre`).toBe(false);
    } else {
      expect(t.marcador, `${donde}: no es campeón y lleva marcador`).toBeNull();
      expect(t.etiqueta, `${donde}: no es campeón y lleva la etiqueta`).toBeNull();
    }
  }
  return { tarjetas, hd, deOro };
}

/** La portada a un ancho, con la sección del libra por libra a la vista. */
async function abrirLibraPorLibra(page: Page) {
  await page.goto("/");
  const lista = page.getByRole("tablist", { name: "Libra por libra" });
  const masculino = lista.getByRole("tab", { name: "Masculino", exact: true });
  const femenino = lista.getByRole("tab", { name: "Femenino", exact: true });
  const panelM = page.locator(`#${await masculino.getAttribute("aria-controls")}`);
  const panelF = page.locator(`#${await femenino.getAttribute("aria-controls")}`);
  await panelM.scrollIntoViewIfNeeded();
  const verFemenino = async () => {
    await esperarHidratacion(page);
    await expect(async () => {
      await femenino.click();
      await expect(femenino).toHaveAttribute("aria-selected", "true", { timeout: 1_000 });
    }).toPass();
    await expect(panelF).toBeVisible();
  };
  return { panelM, panelF, verFemenino };
}

test("las caras del libra por libra, grandes y nítidas, y los campeones en oro", async ({
  page,
}, testInfo) => {
  const campeones = await campeonesPublicados(page);
  expect(campeones.size, "/clasificacion no publica campeones").toBeGreaterThan(0);

  const ancho = page.viewportSize()!.width;
  const { panelM, panelF, verFemenino } = await abrirLibraPorLibra(page);

  let hd = 0;
  let deOro = 0;
  const comprobar = async (panel: Locator, nombre: "masculino" | "femenino") => {
    const visto = await comprobarPanel(panel, nombre, campeones, ancho);
    const tarjetas = visto.tarjetas;
    hd += visto.hd;
    deOro += visto.deOro;
    // Con dos o tres columnas, las cabeceras de una fila miden lo mismo y los
    // datos de debajo quedan alineados: manda la cara, y un nombre en dos
    // líneas cabe a su lado.
    if (!testInfo.project.name.startsWith("movil")) {
      const altos = tarjetas.map((t) => Math.round(t.cabeceraAlto));
      expect(Math.max(...altos) - Math.min(...altos), `${nombre}: altos de cabecera ${altos}`).toBeLessThanOrEqual(1);
    }
    // La barra de arriba: dorada en los campeones, roja en los demás.
    const barras = new Map(tarjetas.map((t) => [t.marcador === "true", t.barra]));
    if (barras.has(true) && barras.has(false)) {
      expect(barras.get(true), `${nombre}: la barra del campeón es la de los demás`).not.toBe(
        barras.get(false),
      );
    }
  };

  await comprobar(panelM, "masculino");
  await verFemenino();
  await comprobar(panelF, "femenino");

  expect(hd, "ninguna cara de ufc.com con original: la nitidez no se ha probado").toBeGreaterThan(0);
  expect(deOro, "ningún campeón en el libra por libra: el oro no se ha probado").toBeGreaterThan(0);
  await expectNoHorizontalOverflow(page, "portada, libra por libra");
});

// Los móviles estrechos, por debajo de los 390 de los proyectos: 320 (el
// iPhone SE de primera generación, o un móvil de 400 con la letra al 125 %),
// 344 (la pantalla exterior del Galaxy Fold), 360 y 375. La geometría no
// depende del tema: un solo proyecto.
test("a 320, 344, 360 y 375 px, la cara encoge por debajo de 360 y ninguna palabra se parte", async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== "movil-light", "geometría: basta un proyecto");
  const campeones = await campeonesPublicados(page);
  let deOro = 0;
  for (const ancho of [320, 344, 360, 375]) {
    await page.setViewportSize({ width: ancho, height: 800 });
    const { panelM, panelF, verFemenino } = await abrirLibraPorLibra(page);
    deOro += (await comprobarPanel(panelM, "masculino", campeones, ancho)).deOro;
    await verFemenino();
    deOro += (await comprobarPanel(panelF, "femenino", campeones, ancho)).deOro;
    await expectNoHorizontalOverflow(page, `portada a ${ancho}, libra por libra`);
  }
  expect(deOro, "ningún campeón en el libra por libra: el oro no se ha probado").toBeGreaterThan(0);
});
