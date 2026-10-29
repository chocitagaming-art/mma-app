import { expect, test, type Locator, type Page } from "@playwright/test";

import { esperarHidratacion, expectNoHorizontalOverflow, fakeYouTubeEmbeds } from "./helpers";

// ── Los botones hablan como la cabecera (dueño, 29-oct-2026) ─────────────────
//
// «me doy cuenta que las letras de "Más noticias y vídeos", "Próximas
// carteleras" y etc., es decir botones, no llevan nuestra tipografía de letra
// estilo UFC». La de la cabecera: Saira Condensed, en mayúsculas, seminegrita.
// Vive en buttonVariants (src/components/ui/button.tsx, con su test unitario);
// aquí se MIDE en las páginas de verdad:
//
//   · la fuente calculada es Saira Condensed y el texto va en mayúsculas;
//   · el cuerpo no encoge: 15 px como mínimo (16 en los CTA grandes), porque
//     unas mayúsculas condensadas a 14 px se leen más pequeñas que el Archivo
//     de antes;
//   · ninguna etiqueta se sale de su botón ni la página desborda, del móvil de
//     360 a la pantalla de 1920 (cada proyecto barre sus tres anchos);
//   · cada letra de cada botón la dibuja Saira. La «→» no está en su
//     subconjunto latino: caía en la Arial de reserva, fina y 2,5 px por
//     debajo de las mayúsculas. Ahora es un icono, centrado con el botón.
//
// Los CTA de la portada salen de la base de producción (el último evento, el
// próximo): si un día faltan, ese botón se salta con su motivo.

const ANCHOS: Record<string, number[]> = {
  movil: [360, 390, 414],
  tablet: [768, 820, 1024],
  escritorio: [1280, 1440, 1920],
};

const anchosDe = (proyecto: string) => ANCHOS[proyecto.split("-")[0]] ?? [];

type Medida = {
  family: string;
  transform: string;
  size: number;
  weight: number;
  visible: boolean;
  clipped: boolean;
  outside: boolean;
  text: string;
  hasSvg: boolean;
  svgOffset: number | null;
  missingGlyphs: string[];
};

// Mide el elemento que lleva el estilo: el <button data-slot="button"> de
// dentro de un <Link><Button>, o el propio enlace/botón hecho a mano.
async function medir(target: Locator): Promise<Medida> {
  return target.evaluate((root) => {
    const el =
      (root.matches('[data-slot="button"]') ? root : root.querySelector('[data-slot="button"]')) ??
      root;
    const cs = getComputedStyle(el);
    const r = el.getBoundingClientRect();
    const svg = el.querySelector("svg");
    const s = svg?.getBoundingClientRect();
    // A glyph comes from Saira when the same text measures the same with two
    // different fallbacks behind it: with a missing glyph, each fallback
    // paints its own.
    const ctx = document.createElement("canvas").getContext("2d")!;
    const width = (font: string, ch: string) => {
      ctx.font = font;
      return ctx.measureText(ch).width;
    };
    const label = (el.textContent ?? "").toUpperCase().replace(/\s+/g, "");
    const missingGlyphs = [...new Set(label)].filter(
      (ch) =>
        width(`600 40px "Saira Condensed", monospace`, ch) !==
        width(`600 40px "Saira Condensed", serif`, ch),
    );
    return {
      family: cs.fontFamily,
      transform: cs.textTransform,
      size: parseFloat(cs.fontSize),
      weight: Number(cs.fontWeight),
      visible: r.width > 0 && r.height > 0,
      clipped: el.scrollWidth > el.clientWidth + 1,
      outside: r.left < -1 || r.right > window.innerWidth + 1,
      text: el.textContent ?? "",
      hasSvg: Boolean(svg),
      svgOffset: s && s.height > 0 ? Math.abs(s.top + s.height / 2 - (r.top + r.height / 2)) : null,
      missingGlyphs,
    };
  });
}

async function expectVozUfc(target: Locator, nombre: string, minSize = 15): Promise<Medida> {
  const m = await medir(target);
  expect(m.family, `${nombre}: la fuente no es Saira Condensed (${m.family})`).toContain("Saira");
  expect(m.transform, `${nombre}: no va en mayúsculas`).toBe("uppercase");
  expect(m.weight, `${nombre}: peso ${m.weight}, por debajo de seminegrita`).toBeGreaterThanOrEqual(600);
  expect(m.size, `${nombre}: cuerpo de ${m.size} px, más pequeño que el del Archivo de antes`).toBeGreaterThanOrEqual(minSize);
  if (m.visible) {
    expect(m.clipped, `${nombre}: la etiqueta «${m.text}» se sale de su botón`).toBe(false);
    expect(m.outside, `${nombre}: el botón se sale de la pantalla`).toBe(false);
    expect(m.missingGlyphs, `${nombre}: letras que Saira no dibuja`).toEqual([]);
  }
  return m;
}

// Los CTA con flecha: la flecha es un icono, no la «→» de texto, y va
// centrada en vertical con el botón (las mayúsculas de Saira ya lo están).
function expectFlechaIcono(m: Medida, nombre: string) {
  expect(m.text, `${nombre}: lleva la «→» de texto, que Saira no tiene`).not.toContain("→");
  expect(m.hasSvg, `${nombre}: sin el icono de flecha`).toBe(true);
  if (m.visible) {
    expect(m.svgOffset, `${nombre}: la flecha no va centrada con el botón`).not.toBeNull();
    expect(m.svgOffset!, `${nombre}: la flecha va ${m.svgOffset} px descentrada`).toBeLessThanOrEqual(1);
  }
}

async function abrir(page: Page, ruta: string) {
  const respuesta = await page.goto(ruta, { waitUntil: "load" });
  expect(respuesta?.status(), `HTTP en ${ruta}`).toBeLessThan(400);
  await esperarHidratacion(page);
  await page.evaluate(async () => {
    await document.fonts.load('600 16px "Saira Condensed"');
    await document.fonts.ready;
  });
}

test.beforeEach(async ({ page }) => {
  await fakeYouTubeEmbeds(page);
});

test("portada: los CTA de la home en Saira, mayúsculas y con su flecha centrada, de punta a punta del proyecto", async ({
  page,
}, testInfo) => {
  await abrir(page, "/");
  const feed = page.locator("section[data-home-feed]");
  const ctas: { nombre: string; target: Locator; flecha: boolean; minSize: number }[] = [
    { nombre: "Más noticias y vídeos", target: feed.getByRole("link", { name: /Más noticias y vídeos/ }), flecha: true, minSize: 16 },
    { nombre: "Próximas carteleras", target: feed.getByRole("link", { name: /Próximas carteleras/ }), flecha: true, minSize: 16 },
    { nombre: "Ver clasificación", target: page.getByRole("link", { name: /Ver clasificación/, includeHidden: true }), flecha: true, minSize: 16 },
    { nombre: "Explorar plantilla", target: page.getByRole("button", { name: "Explorar plantilla" }), flecha: false, minSize: 16 },
    { nombre: "Predecir una pelea", target: page.getByRole("link", { name: "Predecir una pelea" }), flecha: false, minSize: 16 },
  ];
  const resultados = page.getByRole("link", { name: /Ver resultados completos/ });
  if ((await resultados.count()) > 0) {
    ctas.push({ nombre: "Ver resultados completos", target: resultados, flecha: true, minSize: 16 });
  } else {
    testInfo.annotations.push({ type: "info", description: "sin último evento en la base: «Ver resultados completos» no sale" });
  }
  const cartelera = page.getByRole("link", { name: /Ver cartelera/ });
  if ((await cartelera.count()) > 0) {
    ctas.push({ nombre: "Ver cartelera", target: cartelera.first(), flecha: true, minSize: 16 });
  }

  for (const ancho of anchosDe(testInfo.project.name)) {
    await page.setViewportSize({ width: ancho, height: 900 });
    for (const cta of ctas) {
      await expect(cta.target, `${cta.nombre} a ${ancho}`).toHaveCount(1);
      const m = await expectVozUfc(cta.target, `${cta.nombre} a ${ancho} px`, cta.minSize);
      if (cta.flecha) expectFlechaIcono(m, `${cta.nombre} a ${ancho} px`);
    }
    await expectNoHorizontalOverflow(page, `portada a ${ancho} px`);
  }
});

test("las acentuadas en mayúscula las dibuja Saira, y la «→» no", async ({ page }) => {
  await abrir(page, "/");
  const cobertura = await page.evaluate(() => {
    const ctx = document.createElement("canvas").getContext("2d")!;
    const desde = (ch: string) => {
      ctx.font = `600 40px "Saira Condensed", monospace`;
      const mono = ctx.measureText(ch).width;
      ctx.font = `600 40px "Saira Condensed", serif`;
      return mono === ctx.measureText(ch).width;
    };
    return Object.fromEntries([..."ÁÉÍÓÚÑÜ→"].map((ch) => [ch, desde(ch)]));
  });
  // Las de la lengua, todas en Saira.
  for (const ch of "ÁÉÍÓÚÑÜ") expect(cobertura[ch], `«${ch}» no está en Saira`).toBe(true);
  // La flecha no: por eso ningún botón la escribe como texto.
  expect(cobertura["→"], "la «→» ya está en Saira: el icono sobraría").toBe(false);
});

test("/fighters: «Restablecer filtros» y la paginación, en la misma voz", async ({ page }, testInfo) => {
  await abrir(page, "/fighters");
  const restablecer = page.getByRole("button", { name: /Restablecer filtros/ });
  const siguiente = page.getByRole("link", { name: "Ir a la página siguiente" });
  for (const ancho of anchosDe(testInfo.project.name)) {
    await page.setViewportSize({ width: ancho, height: 900 });
    await expectVozUfc(restablecer, `Restablecer filtros a ${ancho} px`);
    await expectVozUfc(siguiente, `Siguiente (paginación) a ${ancho} px`);
    await expectNoHorizontalOverflow(page, `/fighters a ${ancho} px`);
  }
});

test("/tendencias: las pestañas y «Cargar más», que eran IBM Plex Mono", async ({ page }, testInfo) => {
  await abrir(page, "/tendencias");
  const activa = page.locator('nav[aria-label="Tipo de contenido"] a[aria-current="page"]');
  await expect(activa).toHaveCount(1);
  const cargar = page.getByRole("link", { name: "Cargar más" });
  const hayMas = (await cargar.count()) > 0;
  if (!hayMas) testInfo.annotations.push({ type: "info", description: "/tendencias no tiene más que cargar hoy" });
  for (const ancho of anchosDe(testInfo.project.name)) {
    await page.setViewportSize({ width: ancho, height: 900 });
    // The tabs match the P4P/Salón tabs: 14 px, like the nav.
    await expectVozUfc(activa, `pestaña activa a ${ancho} px`, 14);
    if (hayMas) await expectVozUfc(cargar, `Cargar más a ${ancho} px`);
    await expectNoHorizontalOverflow(page, `/tendencias a ${ancho} px`);
  }
});

test("ficha del próximo evento: «Ver el combate» y compañía, que eran IBM Plex Mono", async ({ page }, testInfo) => {
  await abrir(page, "/");
  const cartelera = page.getByRole("link", { name: /Ver cartelera/ });
  test.skip((await cartelera.count()) === 0, "no hay próximo evento en la base");
  const href = await cartelera.first().getAttribute("href");
  expect(href).toMatch(/^\/eventos\/\d+$/);
  await abrir(page, href!);
  const verCombate = page.getByRole("button", { name: /Ver el combate/ });
  await expect(verCombate).toHaveCount(1);
  const entradas = page.getByRole("link", { name: /^Entradas$/ });
  const hayEntradas = (await entradas.count()) > 0;
  for (const ancho of anchosDe(testInfo.project.name)) {
    await page.setViewportSize({ width: ancho, height: 900 });
    await expectVozUfc(verCombate, `Ver el combate a ${ancho} px`);
    if (hayEntradas) await expectVozUfc(entradas, `Entradas a ${ancho} px`);
    await expectNoHorizontalOverflow(page, `${href} a ${ancho} px`);
  }
});

test("/contacto, /ufc-hoy y /en-vivo: el envío y los CTA de la velada", async ({ page }, testInfo) => {
  await abrir(page, "/contacto");
  await expectVozUfc(page.getByRole("button", { name: /Enviar mensaje/ }), "Enviar mensaje", 16);

  // /ufc-hoy: «Ver la velada» (o «Seguirlo en directo» si está en el aire).
  await abrir(page, "/ufc-hoy");
  const velada = page.getByRole("link", { name: /^(Ver la velada|Seguirlo en directo)$/ });
  if ((await velada.count()) > 0) {
    for (const ancho of anchosDe(testInfo.project.name)) {
      await page.setViewportSize({ width: ancho, height: 900 });
      await expectVozUfc(velada.first(), `/ufc-hoy a ${ancho} px`);
      await expectNoHorizontalOverflow(page, `/ufc-hoy a ${ancho} px`);
    }
  } else {
    testInfo.annotations.push({ type: "info", description: "/ufc-hoy sin velada candidata" });
  }

  // /en-vivo sin directo: «Próximo evento: …» lleva el nombre entero del
  // evento y PUEDE partirse en dos líneas (no es whitespace-nowrap).
  await abrir(page, "/en-vivo");
  const proximo = page.getByRole("link", { name: /^(Próximo evento: |Ver próximos eventos)/ });
  if ((await proximo.count()) > 0) {
    for (const ancho of anchosDe(testInfo.project.name)) {
      await page.setViewportSize({ width: ancho, height: 900 });
      await expectVozUfc(proximo.first(), `/en-vivo a ${ancho} px`);
      await expectNoHorizontalOverflow(page, `/en-vivo a ${ancho} px`);
    }
  } else {
    testInfo.annotations.push({ type: "info", description: "/en-vivo está en directo: sin el CTA de próximo evento" });
  }
});
