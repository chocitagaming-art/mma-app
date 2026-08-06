import { test, expect, type Locator, type Page } from "@playwright/test";

// ── Volver al listado padre (6-ago) ────────────────────────────────────────
//
// EL ATAQUE ANTES DEL PARCHE. Medido en producción (be53baa) el 6-ago con
// peticiones HTTP crudas, contando anclas con el icono de flecha en el HTML
// SERVIDO:
//
//   /eventos/357    → 1 enlace de volver
//   /fighters/6493  → 0
//   /fights/3821    → 0   (y además CERO enlaces a /eventos/N: callejón sin
//                          salida; la ficha nombra "UFC 306" pero no lo enlaza)
//
// Así que hoy este fichero sale ROJO en los tres casos: dos por no existir el
// enlace y el de eventos porque su nombre accesible es "Eventos" a secas.
//
// POR QUÉ SE ASSERTA CONTENIDO Y NO EL CÓDIGO HTTP: `notFound()` devuelve 200 en
// esta versión de Next (ya está documentado en routes.spec.ts). Un volver roto
// que apuntara a /fighters/undefined pintaría la página de "no encontrado" con
// un 200 y `expect(status).toBeLessThan(400)` la daría por buena. Por eso cada
// caso trae una MARCA: un trozo de interfaz que solo existe en el listado padre
// y que la página de "no encontrado" no tiene.

type CasoVolver = {
  nombre: string;
  ficha: string;
  padre: string;
  // Marca del listado padre: interfaz que SOLO existe ahí. No vale el <h1>: la
  // página de "no encontrado" también tiene uno.
  marca: (page: Page) => Locator;
  descripcionMarca: string;
  // Enlaces a "hermanos" (otras fichas del mismo listado). Un listado real los
  // tiene; la página de "no encontrado" solo enlaza a "/".
  selectorHermanos: string;
  minimoHermanos: number;
};

// IDs ESTABLES que ya usa el resto de la suite (routes.spec.ts, seo.spec.ts):
// evento 357 (UFC 306), luchador 6493 (Charles Oliveira), combate 3821 (Merab
// vs O'Malley, que pertenece AL EVENTO 357 — comprobado el 6-ago: /eventos/357
// enlaza a /fights/3821, pero la vuelta no existía).
const CASOS: CasoVolver[] = [
  {
    nombre: "ficha de luchador → listado de luchadores",
    ficha: "/fighters/6493",
    padre: "/fighters",
    // "Restablecer filtros" vive en la tarjeta de filtros del listado y en
    // ningún otro sitio de la web (comprobado el 6-ago: 1 aparición en
    // /fighters, 0 en /fighters/6493).
    marca: (page) => page.getByRole("button", { name: /Restablecer filtros/i }),
    descripcionMarca: 'el botón "Restablecer filtros" del listado',
    selectorHermanos: 'main a[href^="/fighters/"]',
    minimoHermanos: 3,
  },
  {
    nombre: "ficha de combate → cartelera de su evento",
    ficha: "/fights/3821",
    // El padre ÚTIL de un combate es su velada, no el listado de eventos: es de
    // donde viene el que navega y donde están los demás combates de esa noche.
    padre: "/eventos/357",
    marca: (page) =>
      page.getByRole("heading", { name: /UFC 306/i, level: 1 }),
    descripcionMarca: "el título de la velada",
    selectorHermanos: 'main a[href^="/fights/"]',
    minimoHermanos: 3,
  },
  {
    nombre: "ficha de evento → listado de eventos",
    ficha: "/eventos/357",
    padre: "/eventos",
    // Las pestañas Próximos/Pasados son del listado y de nadie más. Se elige la
    // pestaña "Pasados" porque su href lleva el parámetro y no se confunde con
    // los "Eventos" del menú ni del pie.
    marca: (page) => page.locator('main a[href="/eventos?view=pasados"]'),
    descripcionMarca: 'la pestaña "Pasados" del listado',
    selectorHermanos: 'main a[href^="/eventos/"]',
    // A propósito 1 y no 3: la pestaña por defecto es "Próximos" y el número de
    // veladas anunciadas lo decide el calendario de la UFC, no nosotros. Poner
    // un umbral alto convertiría una semana floja en un rojo falso.
    minimoHermanos: 1,
  },
];

// El enlace se busca por su NOMBRE ACCESIBLE, que es como lo encuentra quien usa
// lector de pantalla o navegación por voz — no por su clase de Tailwind, que es
// un detalle de maquetación que puede cambiar sin que se rompa nada.
function enlaceDeVolver(page: Page) {
  return page.getByRole("link", { name: /^Volver a /i });
}

for (const caso of CASOS) {
  test(`volver: ${caso.nombre}`, async ({ page }) => {
    await page.goto(caso.ficha, { waitUntil: "load" });

    const volver = enlaceDeVolver(page);

    // UNO y solo uno. Dos enlaces de volver en la misma ficha significan que
    // alguien pegó el componente dos veces, y el usuario no sabría cuál sube.
    await expect(
      volver,
      `${caso.ficha} no tiene enlace de volver (o tiene más de uno)`,
    ).toHaveCount(1);

    // El destino es una ruta FIJA calculada en el servidor: tiene que estar en
    // el href ANTES de pulsarlo. Si el volver fuera router.back() no habría href
    // y este aserto sería imposible — que es justo la razón de la decisión.
    await expect(
      volver,
      `el volver de ${caso.ficha} no apunta a ${caso.padre}`,
    ).toHaveAttribute("href", caso.padre);

    await volver.click();

    // waitForURL con la ruta EXACTA: `**/fighters` también casaría con
    // /fighters/6493, y entonces "no haber navegado" pasaría por bueno.
    await page.waitForURL((url) => url.pathname === caso.padre);
    expect(
      new URL(page.url()).pathname,
      `el volver de ${caso.ficha} no acabó en ${caso.padre}`,
    ).toBe(caso.padre);

    // CONTENIDO, no código HTTP: esto es lo que distingue el listado de verdad
    // de una página de "no encontrado" servida con un 200.
    await expect(
      caso.marca(page).first(),
      `se llegó a ${caso.padre} pero no está ${caso.descripcionMarca}: ` +
        `¿es en realidad la página de "no encontrado"?`,
    ).toBeVisible();

    // Y que el listado tenga vecinos: la página de "no encontrado" solo enlaza
    // a "/", así que aquí se caería.
    const hermanos = await page.locator(caso.selectorHermanos).count();
    expect(
      hermanos,
      `${caso.padre} no lista fichas hermanas (${hermanos} enlaces): ` +
        `el volver lleva a un listado vacío`,
    ).toBeGreaterThanOrEqual(caso.minimoHermanos);
  });
}

// El nombre accesible NO puede ser solo "Eventos". Medido el 6-ago en
// producción: el <svg> de lucide va con aria-hidden="true", así que el nombre
// accesible del enlace de /eventos/357 era exactamente "Eventos" — idéntico al
// del menú de cabecera y al del pie. Quien navega con lector de pantalla oía
// tres enlaces llamados igual y ninguno decía que ese sube de nivel.
//
// El aserto exige además que el nombre CONTENGA la etiqueta visible (WCAG 2.5.3,
// Label in Name): si el nombre accesible fuera "Volver" a secas, quien navega
// por voz diría "pulsa Eventos" y no pasaría nada.
for (const caso of CASOS) {
  test(`el volver de ${caso.ficha} se anuncia como tal`, async ({ page }) => {
    await page.goto(caso.ficha, { waitUntil: "load" });

    const volver = enlaceDeVolver(page);
    await expect(volver).toHaveCount(1);

    const nombre = (await volver.getAttribute("aria-label")) ?? "";
    const visible = (await volver.innerText()).trim();

    expect(
      nombre,
      "el nombre accesible no dice que el enlace sube de nivel",
    ).toMatch(/^Volver a /i);

    expect(
      nombre.toLowerCase(),
      `el nombre accesible ("${nombre}") no contiene la etiqueta visible ` +
        `("${visible}"): incumple WCAG 2.5.3 y rompe la navegación por voz`,
    ).toContain(visible.toLowerCase());
  });
}

// EL AGUJERO QUE ABRE EL PARCHE, clavado. Un volver en una página de primer
// nivel —las que se alcanzan desde el menú en cualquier momento— es ruido: no
// hay "arriba" al que subir. Este test es el que impide que el parche se
// extienda por inercia a las 20 páginas restantes.
//
// Hoy sale VERDE (no hay ningún volver en ninguna de ellas) y su trabajo es
// seguir verde.
const PRIMER_NIVEL = [
  "/",
  "/fighters",
  "/eventos",
  "/clasificacion",
  "/tendencias",
  "/ufc-hoy",
  "/videos",
  "/gimnasios",
  "/salon-de-la-fama",
  "/enfrentamiento",
  "/maestro",
  "/en-vivo",
];

for (const ruta of PRIMER_NIVEL) {
  test(`${ruta} NO lleva enlace de volver`, async ({ page }, testInfo) => {
    // No depende del viewport ni del tema: con una pasada basta y así no se
    // multiplican por 6 doce cargas más contra Neon.
    test.skip(
      testInfo.project.name !== "escritorio-light",
      "la decisión de qué páginas llevan volver no depende del viewport",
    );

    await page.goto(ruta, { waitUntil: "load" });
    await expect(
      enlaceDeVolver(page),
      `${ruta} es una página de primer nivel (se llega desde el menú): ` +
        `un volver aquí es ruido, no ayuda`,
    ).toHaveCount(0);
  });
}
