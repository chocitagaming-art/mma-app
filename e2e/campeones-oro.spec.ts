import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

import { esperarHidratacion, expectNoHorizontalOverflow } from "./helpers";

// ── Los campeones actuales, en oro, en /fighters (el dueño, 29-oct-2026) ───
//
// «Bordear los cuadros donde están los CAMPEONES actuales y resaltarlos con un
// bordeado oro, solo a los actuales campeones y así con los que vayan
// llegando». Lo que se vigila:
//   · La tarjeta de un campeón actual lleva el marcador, la etiqueta visible
//     «Campeón» (el significado no va solo en el color) y el borde dorado; la
//     de cualquier otro, nada de eso. Una campeona lleva «Campeona».
//   · «Campeón» también en la descripción accesible del enlace.
//   · La etiqueta va montada en la línea sobre la que se apoya la foto, en el
//     centro, y no en una esquina de la foto: ahí tapaba el pelo de Natalia
//     Silva, Kayla Harrison y Carlos Ulberg entre 414 y 460 px, entre 640 y 700
//     y entre 1100 y 1175 (revisión visual del 29-oct-2026), y la cabeza se le
//     metía debajo al crecer con el ratón.
//   · El oro NO mueve la rejilla: mismo grosor de borde (el segundo píxel de
//     oro es un anillo que no ocupa sitio) y la misma zona de foto.
//   · Al pasar el ratón o con el foco del teclado sigue en oro y brilla más; no
//     se pone rojo.
//   · La etiqueta cumple el contraste AA en los dos temas.
//
// ── Y «Campeona» también en /clasificacion y en la ficha (el dueño, 30-oct-2026) ──
//
// Con la MISMA regla que las tarjetas (inferFighterGender: «women» en la
// división). Lo que se vigila:
//   · En /clasificacion, cada bloque de campeón dice «Campeona» en una división
//     femenina y «Campeón» en una masculina (la de su cabecera, «(F)»).
//   · La ficha de cada campeona dice «Campeona» en su insignia roja de la
//     cabecera, «El #1 (y la campeona) aparecen arriba.» y «Campeona» en los
//     puntos de su trayectoria; la de un campeón sigue diciendo «Campeón».
//
// 🪤 SIN NOMBRES FIJOS: el ranking cambia cada semana. Los campeones se leen de
// /clasificacion, que es quien los publica (sus bloques dorados), y se cruzan
// por el /fighters/<id> del enlace.
//
// Corre en los seis proyectos: el dorado se mide en claro y en oscuro, y la
// etiqueta a 390, 768 y 1280. Los dos de /clasificacion y la ficha, solo en
// movil-light: comparan textos, que no dependen ni del ancho ni del tema.
//
// 🪤 Los colores se pasan a RGB pintándolos en un <canvas>. Si el navegador no
// entendiera la sintaxis (oklch), fillStyle se quedaría con el color de antes y
// dos colores ilegibles saldrían «iguales»: la comparación pasaría sin mirar
// nada. Por eso se pinta primero un CENTINELA y, si sigue ahí, el test revienta.

const TARJETAS = '[data-testid="roster-card"]';
const CENTINELA = "#fe01fd";

/** «Campeona» si la categoría de la tarjeta es femenina («Peso Mosca (F)»). */
const etiquetaEsperada = (categoria: string) => (/\(F\)/.test(categoria) ? "Campeona" : "Campeón");

/** Los /fighters/<id> de los campeones que publica /clasificacion. */
async function campeonesPublicados(page: Page): Promise<Set<string>> {
  await page.goto("/clasificacion");
  const enlaces = page.locator('[data-testid="ranking-champion"] a[href^="/fighters/"]');
  await expect(enlaces.first()).toBeAttached();
  const hrefs = await enlaces.evaluateAll((as) => as.map((a) => a.getAttribute("href") ?? ""));
  return new Set(hrefs);
}

async function esperarTarjetas(page: Page) {
  await expect(page.locator(TARJETAS).first()).toBeVisible();
  // Las tarjetas entran con animate-rise (translateY escalonado): se mide en reposo.
  await expect
    .poll(() =>
      page.evaluate(() =>
        document
          .getAnimations()
          .filter((a) => (a as CSSAnimation).animationName === "rise-in")
          .every((a) => a.playState === "finished"),
      ),
    )
    .toBe(true);
}

type Medida = {
  href: string;
  marcador: string | null;
  etiqueta: string | null;
  categoria: string;
  /** La etiqueta, respecto de la línea de la foto, del centro y del apodo. */
  etiquetaPos: { sobreLaLinea: boolean; descentrada: number; dentro: boolean; libreDelTexto: boolean } | null;
  describe: string;
  borde: number[];
  bordeAncho: string;
  zonaAlto: number;
  alto: number;
  arriba: number;
};

/**
 * Cada tarjeta, con sus colores pasados a RGB por un <canvas>: así un token en
 * oklch (el oro) se compara con lo que pinta el navegador, sea cual sea la
 * forma en que serialice el color.
 */
async function medirTarjetas(page: Page): Promise<{ tarjetas: Medida[]; oro: number[]; borde: number[] }> {
  return page.evaluate(([selector, centinela]) => {
    const lienzo = document.createElement("canvas");
    lienzo.width = lienzo.height = 1;
    const ctx = lienzo.getContext("2d", { willReadFrequently: true })!;
    const aRgb = (color: string) => {
      ctx.clearRect(0, 0, 1, 1);
      ctx.fillStyle = centinela;
      ctx.fillStyle = color;
      if (ctx.fillStyle === centinela) throw new Error(`el navegador no entiende el color «${color}»`);
      ctx.fillRect(0, 0, 1, 1);
      return [...ctx.getImageData(0, 0, 1, 1).data].slice(0, 3);
    };
    const token = (nombre: string) => {
      const sonda = document.createElement("span");
      sonda.style.color = `var(${nombre}, rgb(1, 2, 3))`;
      document.body.appendChild(sonda);
      const color = getComputedStyle(sonda).color;
      sonda.remove();
      return aRgb(color);
    };
    const tarjetas = [...document.querySelectorAll<HTMLElement>(selector)].map((a) => {
      const etiqueta = a.querySelector<HTMLElement>("[data-champion-badge]");
      const zona = a.querySelector<HTMLElement>('[data-testid="roster-card-photo"]');
      const t = a.getBoundingClientRect();
      const e = etiqueta?.getBoundingClientRect();
      const z = zona?.getBoundingClientRect();
      // La primera línea de texto bajo la foto: el apodo (o su hueco).
      const apodo = zona?.nextElementSibling?.querySelector("p")?.getBoundingClientRect();
      const estilo = getComputedStyle(a);
      return {
        href: a.getAttribute("href") ?? "",
        marcador: a.getAttribute("data-champion"),
        etiqueta: etiqueta && etiqueta.offsetWidth > 0 ? (etiqueta.textContent ?? "").trim() : null,
        categoria: (a.querySelector('[id$="-details"] .truncate')?.textContent ?? "").trim(),
        etiquetaPos:
          e && z && apodo
            ? {
                // Montada en la línea: empieza por encima y acaba por debajo.
                sobreLaLinea: e.top < z.bottom - 2 && e.bottom > z.bottom,
                descentrada: Math.abs((e.left + e.right) / 2 - (t.left + t.right) / 2),
                dentro: e.left >= t.left && e.right <= t.right,
                libreDelTexto: e.bottom <= apodo.top + 0.5,
              }
            : null,
        describe: (a.getAttribute("aria-describedby") ?? "")
          .split(/\s+/)
          .map((id) => document.getElementById(id)?.textContent?.trim() ?? "")
          .join(" "),
        borde: aRgb(estilo.borderTopColor),
        bordeAncho: estilo.borderTopWidth,
        zonaAlto: zona?.getBoundingClientRect().height ?? 0,
        alto: t.height,
        arriba: Math.round(t.top),
      };
    });
    return { tarjetas, oro: token("--champion-gold"), borde: token("--border") };
  }, [TARJETAS, CENTINELA] as const);
}

const igual = (a: number[], b: number[]) => a.every((v, i) => Math.abs(v - b[i]) <= 2);

test("/fighters: los campeones actuales llevan el oro y la etiqueta, y nadie más", async ({ page }) => {
  const campeones = await campeonesPublicados(page);
  expect(campeones.size, "/clasificacion no publica campeones").toBeGreaterThan(0);

  let vistosCampeones = 0;
  let vistasCampeonas = 0;
  let vistosOtros = 0;
  // La primera página (por relevancia: los campeones primero) y la de más
  // victorias (veteranos): entre las dos salen campeones y no campeones.
  for (const ruta of ["/fighters", "/fighters?sort=wins"]) {
    await page.goto(ruta);
    await esperarTarjetas(page);
    await expectNoHorizontalOverflow(page, ruta);
    const { tarjetas, oro, borde } = await medirTarjetas(page);
    expect(tarjetas, `${ruta}: tarjetas`).toHaveLength(12);
    expect(oro, "el token --champion-gold no existe").not.toEqual([1, 2, 3]);

    for (const t of tarjetas) {
      const donde = `${ruta} ${t.href}`;
      // Un solo grosor de borde para todas: el oro no empuja la rejilla.
      expect(t.bordeAncho, `${donde}: grosor del borde`).toBe("1px");
      if (campeones.has(t.href)) {
        vistosCampeones += 1;
        const esperada = etiquetaEsperada(t.categoria);
        if (esperada === "Campeona") vistasCampeonas += 1;
        expect(t.marcador, `${donde}: campeón sin marcador`).toBe("true");
        expect(t.etiqueta, `${donde} (${t.categoria}): la etiqueta visible`).toBe(esperada);
        expect(t.etiquetaPos, `${donde}: sin etiqueta, foto o apodo que medir`).not.toBeNull();
        const pos = t.etiquetaPos!;
        expect(pos.sobreLaLinea, `${donde}: la etiqueta no va montada en la línea de la foto`).toBe(true);
        expect(pos.descentrada, `${donde}: la etiqueta no va en el centro`).toBeLessThanOrEqual(1);
        expect(pos.dentro, `${donde}: la etiqueta se sale de la tarjeta`).toBe(true);
        expect(pos.libreDelTexto, `${donde}: la etiqueta pisa el apodo`).toBe(true);
        expect(t.describe, `${donde}: el lector no oye «${esperada}»`).toMatch(new RegExp(`^${esperada}\\b`));
        expect(igual(t.borde, oro), `${donde}: borde ${t.borde} en vez del oro ${oro}`).toBe(true);
      } else {
        vistosOtros += 1;
        expect(t.marcador, `${donde}: no es campeón y lleva marcador`).toBeNull();
        expect(t.etiqueta, `${donde}: no es campeón y lleva la etiqueta`).toBeNull();
        expect(t.describe, `${donde}: no es campeón y el lector oye «Campeón»`).not.toMatch(/Campe(ón|ona)/);
        expect(igual(t.borde, borde), `${donde}: borde ${t.borde} en vez del normal ${borde}`).toBe(true);
      }
    }

    // La rejilla no se mueve: todas las zonas de foto miden lo mismo y, en
    // cada fila, todas las tarjetas tienen el mismo alto.
    const zonas = new Set(tarjetas.map((t) => Math.round(t.zonaAlto)));
    expect([...zonas], `${ruta}: zonas de foto de altos distintos`).toHaveLength(1);
    const filas = new Map<number, number[]>();
    for (const t of tarjetas) filas.set(t.arriba, [...(filas.get(t.arriba) ?? []), t.alto]);
    for (const [arriba, altos] of filas) {
      expect(Math.max(...altos) - Math.min(...altos), `${ruta}, fila en y=${arriba}: altos ${altos}`).toBeLessThanOrEqual(1);
    }
  }
  expect(vistosCampeones, "ningún campeón en las páginas mirada").toBeGreaterThan(0);
  expect(vistasCampeonas, "ninguna campeona: «Campeona» no se ha probado").toBeGreaterThan(0);
  expect(vistosOtros, "ningún no campeón en las páginas miradas").toBeGreaterThan(0);
});

test("/fighters: al pasar el ratón y con el teclado, el campeón sigue en oro y brilla más", async ({
  page,
}, testInfo) => {
  test.skip(!testInfo.project.name.startsWith("escritorio"), "el hover de verdad es del escritorio");
  await page.goto("/fighters");
  await esperarTarjetas(page);
  const campeon = page.locator(`${TARJETAS}[data-champion="true"]`).first();
  await expect(campeon, "la primera página no trae campeones").toBeVisible();

  const estado = () =>
    campeon.evaluate((a, centinela) => {
      const lienzo = document.createElement("canvas");
      lienzo.width = lienzo.height = 1;
      const ctx = lienzo.getContext("2d", { willReadFrequently: true })!;
      const aRgb = (color: string) => {
        ctx.clearRect(0, 0, 1, 1);
        ctx.fillStyle = centinela;
        ctx.fillStyle = color;
        if (ctx.fillStyle === centinela) throw new Error(`el navegador no entiende el color «${color}»`);
        ctx.fillRect(0, 0, 1, 1);
        return [...ctx.getImageData(0, 0, 1, 1).data].slice(0, 3).join(",");
      };
      const estilo = getComputedStyle(a);
      // El desenfoque más grande de la sombra: el halo dorado.
      const halos = [...estilo.boxShadow.matchAll(/(-?[\d.]+)px (-?[\d.]+)px ([\d.]+)px/g)].map((m) => Number(m[3]));
      return {
        borde: aRgb(estilo.borderTopColor),
        barra: aRgb(getComputedStyle(a, "::after").backgroundColor),
        barraTransform: getComputedStyle(a, "::after").transform,
        halo: Math.max(0, ...halos),
        primario: aRgb(getComputedStyle(document.documentElement).getPropertyValue("--primary")),
        oro: aRgb(getComputedStyle(document.documentElement).getPropertyValue("--champion-gold")),
      };
    }, CENTINELA);

  const reposo = await estado();
  expect(reposo.borde, "en reposo el borde es el oro").toBe(reposo.oro);
  expect(reposo.halo, "en reposo ya tiene su halo dorado").toBeGreaterThan(0);

  await campeon.hover();
  await expect.poll(async () => (await estado()).barraTransform).toBe("matrix(1, 0, 0, 1, 0, 0)");
  await expect.poll(async () => (await estado()).halo, { message: "el halo no crece" }).toBeGreaterThan(reposo.halo);
  const encima = await estado();
  expect(encima.borde, "al pasar el ratón el borde se pone rojo").not.toBe(encima.primario);
  expect(encima.borde, "al pasar el ratón el borde deja el oro").toBe(encima.oro);
  expect(encima.barra, "la barra que se enciende abajo no es la dorada").toBe(encima.oro);

  // Con el TECLADO (ver luchadores.spec.ts: Shift antes del foco enciende
  // :focus-visible también en WebKit).
  await page.mouse.move(1, 1);
  await expect.poll(async () => (await estado()).halo).toBe(reposo.halo);
  await page.keyboard.press("Shift");
  await campeon.focus();
  await expect.poll(async () => (await estado()).halo, { message: "el foco no enciende el halo" }).toBeGreaterThan(reposo.halo);
  expect((await estado()).borde, "con el foco el borde deja el oro").toBe(reposo.oro);
});

/**
 * Cada etiqueta «Campeón» que casa con `selector`: su texto contra su PROPIO
 * fondo, con los colores que resuelve el navegador (un <canvas> pasa cualquier
 * sintaxis CSS, oklch incluido, a RGB).
 */
async function medirEtiquetas(page: Page, selector: string) {
  return page.locator(selector).evaluateAll((nodos, centinela) => {
    const lienzo = document.createElement("canvas");
    lienzo.width = lienzo.height = 1;
    const ctx = lienzo.getContext("2d", { willReadFrequently: true })!;
    const aRgba = (color: string) => {
      ctx.clearRect(0, 0, 1, 1);
      ctx.fillStyle = centinela;
      ctx.fillStyle = color;
      if (ctx.fillStyle === centinela) throw new Error(`el navegador no entiende el color «${color}»`);
      ctx.fillRect(0, 0, 1, 1);
      const [r, g, b, a] = ctx.getImageData(0, 0, 1, 1).data;
      return [r, g, b, a / 255];
    };
    const lum = ([r, g, b]: number[]) => {
      const f = (v: number) => {
        const c = v / 255;
        return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
      };
      return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
    };
    return nodos.map((n) => {
      const estilo = getComputedStyle(n);
      const texto = aRgba(estilo.color);
      const fondo = aRgba(estilo.backgroundColor);
      const [claro, oscuro] = [lum(texto), lum(fondo)].sort((a, b) => b - a);
      return {
        opaco: fondo[3] === 1,
        ratio: Math.round(((claro + 0.05) / (oscuro + 0.05)) * 100) / 100,
        tamano: parseFloat(estilo.fontSize),
      };
    });
  }, CENTINELA);
}

type BloqueDeCampeon = {
  division: string;
  /** La cabecera de su tarjeta: «Peso Gallo (F)». */
  categoria: string;
  /** El texto «Campeón» / «Campeona» del bloque, o null si no lo tiene. */
  etiqueta: string | null;
  href: string | null;
};

/** Cada bloque de campeón de /clasificacion, con la cabecera de su tarjeta. */
async function bloquesDeCampeon(page: Page): Promise<BloqueDeCampeon[]> {
  await page.goto("/clasificacion");
  // 🪤 En streaming, React deja el contenido unos cientos de ms en un div
  // oculto fuera de <main>: se espera a que el primer bloque SE VEA en <main>
  // (la página no tiene más Suspense: entra todo a la vez).
  await expect(page.locator('main [data-testid="ranking-champion"]').first()).toBeVisible();
  return page.locator('main [data-testid="ranking-card"]').evaluateAll((tarjetas) =>
    tarjetas
      .filter((t) => t.querySelector('[data-testid="ranking-champion"]'))
      .map((t) => {
        const bloque = t.querySelector('[data-testid="ranking-champion"]')!;
        const etiqueta = [...bloque.querySelectorAll("p")].find((p) =>
          /^Campe(ón|ona)$/.test(p.textContent?.trim() ?? ""),
        );
        return {
          division: t.getAttribute("data-division") ?? "",
          categoria: t.querySelector("h3")?.textContent?.trim() ?? "",
          etiqueta: etiqueta?.textContent?.trim() ?? null,
          href: bloque.querySelector('a[href^="/fighters/"]')?.getAttribute("href") ?? null,
        };
      }),
  );
}

test("/clasificacion: «Campeona» en las divisiones femeninas y «Campeón» en las masculinas", async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== "movil-light", "compara textos: no depende del ancho ni del tema");
  const bloques = await bloquesDeCampeon(page);
  const mujeres = bloques.filter((b) => etiquetaEsperada(b.categoria) === "Campeona");
  // Sin una de cada, el test pasaría sin haber mirado la mitad de la regla.
  expect(mujeres.length, "ninguna división femenina con campeona: «Campeona» no se ha probado").toBeGreaterThan(0);
  expect(bloques.length - mujeres.length, "ninguna división masculina con campeón").toBeGreaterThan(0);
  for (const b of bloques) {
    expect(b.etiqueta, `${b.division} (${b.categoria}): la etiqueta del campeón`).toBe(etiquetaEsperada(b.categoria));
  }
});

test("la ficha de cada campeona dice «Campeona» (insignia, frase y trayectoria), y la de un campeón «Campeón»", async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== "movil-light", "compara textos: no depende del ancho ni del tema");
  test.setTimeout(120_000);
  const bloques = (await bloquesDeCampeon(page)).filter((b) => b.href);
  const campeonas = bloques.filter((b) => etiquetaEsperada(b.categoria) === "Campeona");
  // El control: UN campeón (el primero que publica /clasificacion).
  const campeon = bloques.find((b) => etiquetaEsperada(b.categoria) === "Campeón");
  expect(campeonas.length, "/clasificacion no publica ninguna campeona con ficha").toBeGreaterThan(0);
  expect(campeon, "/clasificacion no publica ningún campeón con ficha").toBeDefined();

  for (const b of [...campeonas, campeon!]) {
    const esperada = etiquetaEsperada(b.categoria);
    const otra = esperada === "Campeona" ? "Campeón" : "Campeona";
    const donde = `${b.href} (${b.categoria})`;
    await page.goto(b.href!);
    // La insignia roja de la cabecera: una sola, y en su género.
    const insignia = page.locator('main [data-slot="badge"]').filter({ hasText: /^Campe(ón|ona)$/ });
    await expect(insignia, `${donde}: insignias de campeón`).toHaveCount(1);
    await expect(insignia, `${donde}: la insignia`).toHaveText(esperada);
    // La frase de «Trayectoria de ranking».
    const articulo = esperada === "Campeona" ? "la campeona" : "el campeón";
    await expect(page.locator("main"), `${donde}: la frase de la trayectoria`).toContainText(
      `El #1 (y ${articulo}) aparecen arriba.`,
    );
    // Los puntos de la trayectoria (el <title> de cada uno): alguno de campeón,
    // y ninguno del otro género.
    const puntos = await page
      .locator("main svg circle > title")
      .evaluateAll((ts) => ts.map((t) => t.textContent ?? ""));
    expect(
      puntos.filter((p) => p.includes(` — ${esperada} (`)).length,
      `${donde}: ningún punto «${esperada}» en la trayectoria (${puntos.length} puntos)`,
    ).toBeGreaterThan(0);
    expect(
      puntos.filter((p) => p.includes(` — ${otra} (`)),
      `${donde}: puntos «${otra}» en la trayectoria`,
    ).toEqual([]);
  }
});

test("la etiqueta «Campeón» cumple el contraste AA, en /fighters y en la portada", async ({ page }) => {
  const tema = test.info().project.name.endsWith("-dark") ? "dark" : "light";
  const medidas: { donde: string; opaco: boolean; ratio: number; tamano: number }[] = [];

  await page.goto("/fighters");
  await esperarTarjetas(page);
  await esperarHidratacion(page);
  await expect(page.locator("html")).toHaveClass(new RegExp(`(^|\\s)${tema}(\\s|$)`));

  // axe, por si alguna etiqueta incumple de forma que él sí sabe decidir.
  const { violations } = await new AxeBuilder({ page })
    .include('[data-testid="roster-grid"]')
    .withRules(["color-contrast"])
    .analyze();
  const deEtiquetas = violations.flatMap((v) =>
    v.nodes
      .filter((n) => n.html.includes("data-champion-badge"))
      .map((n) => `${v.id}: ${n.failureSummary ?? n.html}`),
  );
  expect(deEtiquetas, deEtiquetas.join("\n")).toEqual([]);

  // 🪤 Y lo que axe NO decide: deja la etiqueta en `incomplete` («the
  // background could not be determined due to a pseudo element») por el
  // ::after de la tarjeta, la barra que se enciende abajo. La etiqueta lleva
  // un fondo propio y OPACO justo para que su contraste no dependa de lo que
  // haya detrás: se mide su texto contra ese fondo.
  for (const m of await medirEtiquetas(page, `${TARJETAS} [data-champion-badge]`)) {
    medidas.push({ donde: "/fighters", ...m });
  }

  // La portada: las dos pestañas (la oculta también tiene sus colores).
  await page.goto("/");
  await esperarHidratacion(page);
  for (const m of await medirEtiquetas(page, "[data-fighter-card] [data-champion-badge]")) {
    medidas.push({ donde: "portada", ...m });
  }

  expect(medidas.filter((m) => m.donde === "/fighters").length, "/fighters sin etiquetas").toBeGreaterThan(0);
  expect(medidas.filter((m) => m.donde === "portada").length, "portada sin etiquetas").toBeGreaterThan(0);
  for (const [i, m] of medidas.entries()) {
    expect(m.opaco, `${m.donde} etiqueta ${i}: su fondo no es opaco, la medida no vale`).toBe(true);
    // Texto pequeño (11 px): AA pide 4,5.
    expect(m.tamano, `${m.donde} etiqueta ${i}: tamaño`).toBeLessThan(18.66);
    expect(m.ratio, `${m.donde} etiqueta ${i}: contraste ${m.ratio}:1 en ${tema}`).toBeGreaterThanOrEqual(4.5);
  }
});
