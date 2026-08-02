import { test, expect } from "@playwright/test";

// ── Fase 13 · "que el buscador encuentre" ──────────────────────────────────
//
// Hasta hoy la suite E2E tenía UN solo `.click()` en 402 tests y CERO `.fill()`:
// se comprobaba que las páginas respondían, no que hicieran lo que dicen. Aquí
// se teclea de verdad en los tres buscadores de la web y se comprueba que
// encuentran Y que llevan a donde deben.
//
// ⚠️ REGLA ESTRUCTURAL DE TODO EL FICHERO — UNA SOLA PETICIÓN REAL POR ENDPOINT
// El freno es 5 peticiones/10 s + 20/60 s POR BUCKET Y POR IP
// (src/lib/maestro/security.ts:72-75), y en el megatest local las tres corridas
// salen de la misma IP de loopback, así que el presupuesto es de la CORRIDA
// ENTERA, no de este fichero. Por eso:
//   · el guard de proyecto de abajo (si no, los 6 proyectos multiplican por 6),
//   · `mode: "serial"` (si no, los 3 workers disparan la ráfaga a la vez),
//   · y todo lo que no sea "¿encuentra de verdad?" se sirve con `page.route`.
// Gasto de este fichero: search 1 (navegador) + 1 (?q=jon) · fighters-search 1 ·
// eventos-search 1. Con lo que ya gasta api.spec.ts: search 3/5, el resto 2/5.
// Cuidado: `retries: 1` (playwright.config.ts:32) DUPLICA el gasto de un test
// que falle, y el reintento tiene MENOS cupo que el intento original.
//
// ⚠️ Y NADA de `test.only`: con CI=true, `forbidOnly` no ejecuta solo ese test,
// hace fallar la recolección entera — y smoke-prod.yml abriría un Issue.

test.describe.configure({ mode: "serial" });

test.beforeEach(({}, testInfo) => {
  test.skip(
    testInfo.project.name !== "escritorio-light",
    "todos estos tests golpean rutas con freno: se corren en un solo proyecto",
  );
});

// Ids ESTABLES, los mismos que ya usa el resto de la suite. Anclarse a "el
// primer resultado de una búsqueda popular" sería frágil: los nombres de los
// 2.856 luchadores cambian con cada ingesta.
const OLIVEIRA = { id: 6493, nombre: "Charles Oliveira" };
const GAMROT = { id: 6495, nombre: "Mateusz Gamrot" };
const SALKILLD = { id: 6344, nombre: "Quillan Salkilld" };
const EVENTO_306 = { id: 357, nombre: "UFC 306" };

const SIN_RESULTADOS = { fighters: [], events: [], news: [] };

function luchadorFalso(id: number, name: string) {
  return { type: "fighter", id, name, headshotUrl: null, nationality: "Brazil" };
}

// ── 1. Buscador global de la portada ───────────────────────────────────────

test("el buscador de la portada encuentra a Charles Oliveira y lleva a su ficha", async ({
  page,
}) => {
  // ESTA es la única petición real a /api/search del fichero. Medido contra
  // producción: `?q=Charles Oliveira` devuelve EXACTAMENTE un luchador (6493) y
  // ni un evento ni una noticia, así que el listbox trae una sola opción.
  await page.goto("/");

  // `fill` en vez de `pressSequentially` a propósito: un solo evento de cambio
  // dispara UN debounce (300 ms) y por tanto UNA petición. Teclear letra a letra
  // podría disparar varias y agotar el bucket.
  const buscador = page.getByRole("combobox");
  await buscador.fill(OLIVEIRA.nombre);

  const listbox = page.getByRole("listbox", { name: "Resultados de búsqueda" });
  await expect(listbox).toBeVisible();

  const opcion = listbox.getByRole("option", { name: new RegExp(OLIVEIRA.nombre, "i") });
  await expect(opcion).toBeVisible();

  // Encontrar Y navegar: lo segundo es lo que de verdad pide el sprint.
  await opcion.click();
  await page.waitForURL(`**/fighters/${OLIVEIRA.id}`);
  await expect(
    page.getByRole("heading", { name: new RegExp(OLIVEIRA.nombre, "i"), level: 1 }),
  ).toBeVisible();
});

test("el buscador de la portada dice que no hay nada cuando no hay nada", async ({ page }) => {
  // Sin red real: lo que se prueba es el CABLEADO de la UI, no el backend.
  await page.route("**/api/search*", (route) => route.fulfill({ json: SIN_RESULTADOS }));

  await page.goto("/");
  await page.getByRole("combobox").fill("zzzzzzzz");

  // Texto literal de search-hero.tsx:441.
  await expect(page.getByText("No se encontraron resultados")).toBeVisible();
});

test("el buscador de la portada se maneja con el teclado", async ({ page }) => {
  // Las líneas 168-216 de search-hero.tsx (flechas, Escape, Enter y la reapertura
  // con ArrowDown) no tenían ni una prueba. Van con `page.route` porque miden
  // comportamiento del navegador, no la búsqueda: cuesta 0 peticiones.
  await page.route("**/api/search*", (route) =>
    route.fulfill({
      json: {
        fighters: [
          luchadorFalso(OLIVEIRA.id, OLIVEIRA.nombre),
          luchadorFalso(GAMROT.id, GAMROT.nombre),
          luchadorFalso(SALKILLD.id, SALKILLD.nombre),
        ],
        events: [],
        news: [],
      },
    }),
  );

  await page.goto("/");
  const buscador = page.getByRole("combobox");
  await buscador.fill("da igual, va mockeado");

  const opciones = page.getByRole("option");
  await expect(opciones).toHaveCount(3);

  // Al llegar resultados nuevos NO queda ninguna opción activa
  // (search-hero.tsx:89): el teclado parte de cero.
  await expect(buscador).not.toHaveAttribute("aria-activedescendant", /./);

  const idPrimera = await opciones.nth(0).getAttribute("id");
  const idSegunda = await opciones.nth(1).getAttribute("id");

  await buscador.press("ArrowDown");
  await expect(buscador).toHaveAttribute("aria-activedescendant", idPrimera!);
  await expect(opciones.nth(0)).toHaveAttribute("aria-selected", "true");

  await buscador.press("ArrowDown");
  await expect(buscador).toHaveAttribute("aria-activedescendant", idSegunda!);

  await buscador.press("Escape");
  await expect(buscador).toHaveAttribute("aria-expanded", "false");
  await expect(page.getByRole("listbox")).toHaveCount(0);

  // Con el listbox cerrado pero resultados aún en memoria, ArrowDown lo reabre
  // en la primera opción (la rama de la guarda, search-hero.tsx:171-175).
  await buscador.press("ArrowDown");
  await expect(buscador).toHaveAttribute("aria-expanded", "true");
  await expect(buscador).toHaveAttribute("aria-activedescendant", idPrimera!);

  // Y Enter sobre la opción activa navega (search-hero.tsx:200-207).
  await buscador.press("Enter");
  await page.waitForURL(`**/fighters/${OLIVEIRA.id}`);
});

// ── 2. Combobox de luchador de /enfrentamiento ─────────────────────────────

test("elegir un luchador en /enfrentamiento escribe su esquina en la URL", async ({ page }) => {
  // Única petición real a /api/fighters/search.
  await page.goto("/enfrentamiento");

  // NO usar el placeholder: los dos comboboxes tienen "Buscar luchador..."
  // idéntico y sería una violación de strict mode. El nombre accesible sale de
  // un <label for> ("Esquina roja" / "Esquina azul").
  const esquinaRoja = page.getByRole("combobox", { name: "Esquina roja" });
  await esquinaRoja.fill("oliveira");

  // Por nombre y no `.first()`: medido, `?q=oliveira` devuelve 10 luchadores y
  // Charles Oliveira es el SEGUNDO.
  const opcion = page
    .getByRole("listbox", { name: "Resultados de búsqueda para Esquina roja" })
    .getByRole("option", { name: new RegExp(OLIVEIRA.nombre, "i") });
  await expect(opcion).toBeVisible();
  await opcion.click();

  // La URL la escribe el padre con router.REPLACE (matchup-client.tsx:71), no
  // con push: ningún test puede apoyarse aquí en el botón atrás del navegador.
  await page.waitForURL(new RegExp(`\\?red=${OLIVEIRA.id}$`));
  await expect(esquinaRoja).toHaveValue(OLIVEIRA.nombre);
});

// ── 3. Buscador de eventos de /eventos ─────────────────────────────────────

test("el buscador de eventos salta a la ficha del evento", async ({ page }) => {
  // Única petición real a /api/eventos/search. Medido: `?q=UFC 306` devuelve
  // EXACTAMENTE una fila, el evento 357.
  await page.goto("/eventos");

  const buscador = page.getByRole("combobox", { name: "Buscar evento por nombre" });
  await buscador.fill(EVENTO_306.nombre);

  const opcion = page
    .getByRole("listbox", { name: "Resultados de búsqueda de eventos" })
    .getByRole("option", { name: new RegExp(EVENTO_306.nombre, "i") });
  await expect(opcion).toBeVisible();
  await opcion.click();

  await page.waitForURL(`**/eventos/${EVENTO_306.id}`);
});

// ── 4. El mínimo de 3 caracteres, como CONTRATO ────────────────────────────

test("una búsqueda de menos de 3 caracteres devuelve vacío, no un error", async ({ request }) => {
  // Al usuario se le presenta como "no hay nada" (el listbox pinta el estado
  // vacío), pero por debajo tiene que ser un 200 con las tres listas vacías: un
  // 400 rompería el buscador mientras se teclea.
  //
  // `?q=jo` no gasta cupo: normalizeSearchQuery corta en search/route.ts:32-34,
  // OCHO líneas antes del checkRateLimit del :42.
  const corta = await request.get("/api/search?q=jo");
  expect(corta.status()).toBe(200);
  expect(await corta.json()).toEqual({ fighters: [], events: [], news: [] });

  // Y con el mínimo cumplido tiene que encontrar de verdad. Esta sí gasta 1.
  const valida = await request.get("/api/search?q=jon");
  expect(valida.status()).toBe(200);
  const body = (await valida.json()) as { fighters: unknown[] };
  expect(
    body.fighters.length,
    "con 3 caracteres la búsqueda debe devolver luchadores",
  ).toBeGreaterThan(0);
});
