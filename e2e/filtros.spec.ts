import { test, expect } from "@playwright/test";

// ── Fase 13 · "que los filtros filtren" ────────────────────────────────────
//
// Aquí no se comprueba que la página responda: se comprueba que el filtro
// CAMBIA lo que se ve. Cada test asserta CONTENIDO (qué filas salen y en qué
// orden), no forma, para que romper la consulta lo ponga en rojo.
//
// ⚠️ UN SOLO PROYECTO, aunque aquí no haya rutas con freno. Dos razones medidas:
//   1. `/fighters?q=...` rellena solo el buscador de la barra de filtros desde la
//      URL y dispara un fetch a /api/fighters/search sin que nadie toque nada
//      (fighters-filter-bar.tsx:59-60 + :78-99). En los 6 proyectos serían 6
//      peticiones al mismo bucket contra un cupo de 5/10 s.
//   2. Un filtro no depende del viewport: correrlo 6 veces multiplicaría por 6
//      las consultas a Neon sin añadir ni una señal nueva.
//
// ⚠️ Y NADA de `test.only`: con CI=true, `forbidOnly` tumba la recolección entera.
//
// Aquí NO se pone `mode: "serial"` (buscadores.spec.ts sí lo lleva): este fichero
// gasta UNA sola petición con freno en toda la corrida (la que dispara solo el
// buscador prerrellenado de ?q=zzzzz), así que no hay ráfaga que espaciar. Y en
// serie, el primer rojo se lleva por delante los tests siguientes sin ejecutarlos,
// que es justo la visibilidad que hace falta al auditar.

test.beforeEach(({}, testInfo) => {
  test.skip(
    testInfo.project.name !== "escritorio-light",
    "los filtros no dependen del viewport: un solo proyecto",
  );
});

// Cada tarjeta de /fighters es UN <Link> que envuelve la tarjeta entera
// (fighter-roster-card.tsx, rediseño del 17-oct), así que hay exactamente un
// <a href="/fighters/N"> por resultado. Verificado en producción: 8 para
// ?nationality=Spain.
//
// La tarjeta solo PINTA bandera y categoría, pero lleva la nacionalidad (cruda,
// "Spain") y la guardia (traducida, "Zurda") en un texto sr-only que también
// lee el lector de pantalla: está en el textContent, y por eso los asertos de
// contenido de abajo siguen valiendo tal cual.
const FILAS = 'a[href^="/fighters/"]';

// "Mostrando <n> de <total> luchadores", con punto de millares es-ES desde el
// 17-oct (formatCount: "2.892"). Antes era "of" y sin punto; e2e/luchadores.spec.ts
// vigila que no vuelva. Por eso el número se lee con puntos y se le quitan.
const RESUMEN = /Mostrando\s+[\d.]+\s+de\s+[\d.]+\s+luchadores/;
async function leerResumen(texto: string) {
  const m = texto.match(/Mostrando\s+([\d.]+)\s+de\s+([\d.]+)\s+luchadores/);
  expect(m, `no se encontró el resumen en: ${texto.slice(0, 120)}`).not.toBeNull();
  const numero = (s: string) => Number(s.replaceAll(".", ""));
  return { mostrados: numero(m![1]), total: numero(m![2]) };
}

test("/fighters filtra por nacionalidad y ordena por victorias", async ({ page }) => {
  await page.goto("/fighters?nationality=Spain&sort=wins");

  const resumen = page.getByText(RESUMEN);
  await expect(resumen).toBeVisible();
  const { mostrados, total } = await leerResumen((await resumen.textContent()) ?? "");

  const filas = page.locator(FILAS);
  // INVARIANTE, no foto fija: el número del resumen tiene que ser el de filas
  // pintadas. No se codifica "8" a propósito — una ingesta puede añadir un
  // luchador español y eso no es una regresión.
  await expect(filas).toHaveCount(mostrados);
  expect(mostrados).toBeGreaterThan(0);

  // Primer detector de que el filtro se aplica: el total es una fracción pequeña
  // de la plantilla (2.856 luchadores hoy). Si alguien anula el bloque
  // `if (filters.nationality)` de fighters.list.ts:170-173, esto se dispara.
  expect(total, "el filtro de nacionalidad no está recortando nada").toBeLessThan(200);

  // Segundo detector, independiente del primero: TODAS las filas son españolas.
  // Se asserta "Spain" (valor crudo de la BD) y no "España": el texto sr-only
  // de la tarjeta lleva `fighter.nationality` sin traducir.
  const textos = await filas.allTextContents();
  for (const [i, texto] of textos.entries()) {
    expect(texto, `la fila ${i} no es española`).toContain("Spain");
  }

  // Y el orden: las victorias del récord "V-D-E" no pueden crecer al bajar.
  const victorias = textos.map((t) => {
    const m = t.match(/(\d+)-(\d+)-(\d+)/);
    expect(m, `sin récord legible en la fila: ${t.slice(0, 80)}`).not.toBeNull();
    return Number(m![1]);
  });
  for (let i = 1; i < victorias.length; i += 1) {
    expect(
      victorias[i],
      `orden roto: ${victorias[i - 1]} victorias antes que ${victorias[i]}`,
    ).toBeLessThanOrEqual(victorias[i - 1]);
  }
});

test("/fighters sin resultados lo dice, y no se queda en blanco", async ({ page }) => {
  await page.goto("/fighters?q=zzzzz");

  const resumen = page.getByText(RESUMEN);
  const { mostrados, total } = await leerResumen((await resumen.textContent()) ?? "");
  expect(mostrados).toBe(0);
  expect(total).toBe(0);
  await expect(page.locator(FILAS)).toHaveCount(0);

  // 🪤 NO assertar "No se encontraron luchadores": ese texto existe DOS veces en
  // esta página, y la segunda aparece SOLA. El buscador de la barra de filtros
  // se prerrellena desde ?q= y abre su popup al recibir la lista vacía, así que
  // ~300 ms después de hidratar hay dos coincidencias y el aserto sería flaky
  // por carrera, no por interacción. Este otro texto solo existe en el estado
  // vacío de la página (fighters/page.tsx).
  await expect(
    page.getByText("Intenta ampliar tu búsqueda o quitar uno de los filtros activos."),
  ).toBeVisible();
});

test("/fighters filtra por guardia", async ({ page }) => {
  await page.goto("/fighters?stance=Southpaw");

  const filas = page.locator(FILAS);
  await expect(filas.first()).toBeVisible();

  // La guardia se pinta traducida (format.ts:84-90): Southpaw → "Zurda",
  // Orthodox → "Ortodoxa". Ninguna fila puede decir "Ortodoxa".
  for (const [i, texto] of (await filas.allTextContents()).entries()) {
    expect(texto, `la fila ${i} es ortodoxa con el filtro de zurdos`).not.toContain("Ortodoxa");
    expect(texto, `la fila ${i} no dice Zurda`).toContain("Zurda");
  }
});

test("elegir una nacionalidad en el desplegable filtra de verdad", async ({ page }) => {
  // Esto es lo que rompe la frase del sprint ("hoy no se hace ni un clic"): el
  // resto de tests llega por URL, este LO PULSA.
  await page.goto("/fighters");

  const antes = await leerResumen(
    (await page.getByText(RESUMEN).textContent()) ?? "",
  );

  // El id del trigger está escrito a mano en el código (fighters-filter-bar.tsx:252)
  // y es de los pocos anclajes estables: los ids de los inputs los genera useId()
  // y son opacos. El Select es de @base-ui, no un <select> nativo, así que
  // selectOption() no vale: hay que abrir y pulsar la opción.
  await page.locator("#filter-nationality").click();
  await page.getByRole("option", { name: "Spain", exact: true }).click();

  await page.waitForURL(/nationality=Spain/);
  const despues = await leerResumen(
    (await page.getByText(RESUMEN).textContent()) ?? "",
  );
  expect(despues.total, "pulsar el filtro no cambió el total").toBeLessThan(antes.total);
  // `toContainText` y no `toHaveText`: el trigger de base-ui mete el chevron
  // como TEXTO dentro del botón, así que su textContent es "Spain▼".
  await expect(page.locator("#filter-nationality")).toContainText("Spain");
});

// 🚫 NO se prueba el filtro de categoría de peso comparando con la columna que se
// pinta, y no es un descuido. El filtro es un `exists(... fights.weight_class = $n)`
// sobre TODO el historial (fighters.list.ts:175-182) mientras la columna muestra
// `latest_weight_class`, que además excluye las canceladas y despriorizsa los
// catch weight (y desde el 28-sep-2026 manda la división de su RANKING si está
// rankeado: src/lib/queries/current-weight-class.ts). Medido en producción: con ?weightClass=Welterweight, 3 de las 12
// filas de la primera página muestran otra categoría. Assertar "todas las filas
// dicen Peso Welter" sería un test rojo por una diferencia INTENCIONADA.

test("/eventos filtra por año", async ({ page }) => {
  await page.goto("/eventos?view=pasados&anio=2019");

  // El trigger del año solo existe en la vista de pasados (eventos/page.tsx:204).
  // `toContainText` por el chevron que base-ui mete como texto ("2019▼").
  await expect(page.locator("#filter-anio")).toContainText("2019");
  await expect(page.getByText(/Eventos de\s+2019/)).toBeVisible();

  const tarjetas = page.locator('a[href^="/eventos/"]');
  const textos = await tarjetas.allTextContents();
  expect(textos.length, "sin tarjetas que comprobar").toBeGreaterThan(0);
  for (const [i, texto] of textos.entries()) {
    // La fecha se pinta como "21 dic 2019": el año está en el texto de la tarjeta.
    expect(texto, `la tarjeta ${i} no es de 2019: ${texto.slice(0, 70)}`).toContain("2019");
  }
});

// El dueño, el 30-oct-2026: los Road To UFC (2 combates, sin póster ni sede)
// fuera de la lista de /eventos, «solo los Road to UFC». En la base, dos: el
// 1094 (28-ago-2026) y el 317 (22-ago-2025). Se recorren TODAS las páginas de su
// año, porque la paginación cambia con cada velada. Y su ficha sigue abriendo:
// la enlazan las fichas de sus luchadores (e2e/historial-espn.spec.ts).
test("/eventos no enseña los Road To UFC, y su ficha sigue abriendo", async ({ page }) => {
  for (const [anio, id] of [
    [2026, 1094],
    [2025, 317],
  ] as const) {
    const vistos: string[] = [];
    for (let pagina = 1; pagina <= 10; pagina++) {
      await page.goto(`/eventos?view=pasados&anio=${anio}&page=${pagina}`);
      const hrefs = await page
        .locator('a[href^="/eventos/"]')
        .evaluateAll((as) => as.map((a) => a.getAttribute("href") ?? ""));
      const propios = hrefs.filter((h) => /^\/eventos\/\d+$/.test(h));
      if (propios.length === 0) break;
      vistos.push(...propios);
    }
    expect(vistos.length, `/eventos de ${anio}: sin tarjetas que mirar`).toBeGreaterThan(10);
    expect(vistos, `/eventos de ${anio} enseña el Road To UFC ${id}`).not.toContain(`/eventos/${id}`);
  }
  await page.goto("/eventos/1094");
  await expect(page.getByRole("heading", { level: 1 })).toContainText("Road To UFC");
});

test("las pestañas de /eventos cambian de vista", async ({ page }) => {
  await page.goto("/eventos");

  // Son <Link>, no `role="tab"` (eventos/page.tsx:74-91).
  const pasados = page.getByRole("link", { name: "Pasados" });
  const proximos = page.getByRole("link", { name: "Próximos" });
  await expect(proximos).toHaveAttribute("aria-current", "page");

  await pasados.click();
  await page.waitForURL(/\?view=pasados/);

  // 🪤 Aserto ENCADENADO al enlace y nunca `locator('[aria-current="page"]')`:
  // hay CUATRO nodos con ese atributo en esta página (el enlace "Eventos" del
  // nav de escritorio, el del nav móvil, la pestaña y la página del paginador),
  // así que un locator por el atributo suelto viola strict mode.
  await expect(page.getByRole("link", { name: "Pasados" })).toHaveAttribute(
    "aria-current",
    "page",
  );
  await expect(page.getByRole("link", { name: "Próximos" })).not.toHaveAttribute(
    "aria-current",
    "page",
  );

  // Y la vista cambia de verdad: el filtro de año solo existe en "Pasados".
  await expect(page.locator("#filter-anio")).toBeVisible();
});
