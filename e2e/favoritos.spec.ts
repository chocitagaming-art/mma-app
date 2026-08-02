import { test, expect } from "@playwright/test";

// ── Fase 13B · "que los favoritos sobrevivan a recargar" ───────────────────
//
// Es literalmente una de las tres frases del sprint. La lógica pura de
// `lib/favorites.ts` ya tiene 9 tests de vitest (`src/lib/favorites.test.ts`) y
// NO se duplica aquí: lo que no probaba nadie es el ciclo completo
// estrella → recarga → franja de la portada, que es donde vive el valor.
//
// ⚠️ UN SOLO PROYECTO: la franja llama a `/api/fighters/upcoming`, que tiene
// freno (5/10 s + 20/60 s por bucket y por IP). En los 6 proyectos serían 6
// peticiones al mismo bucket. Gasto de este fichero: UNA sola real.
//
// ⚠️ Y NADA de `test.only`: con CI=true, `forbidOnly` tumba la recolección.

test.beforeEach(({}, testInfo) => {
  test.skip(
    testInfo.project.name !== "escritorio-light",
    "la franja llama a una ruta con freno: un solo proyecto",
  );
});

const OLIVEIRA = { id: 6493, nombre: "Charles Oliveira" };
const CLAVE = "mma:favorites";

// 🪤 La entrada tiene que ser EXACTAMENTE así o `parseFavorites` la descarta EN
// SILENCIO (lib/favorites.ts:34-49): `id` entero positivo, `name` no vacío,
// `addedAt` numérico y `headshotUrl` null o una URL que empiece por https:// o /.
// Con `http://` (sin la ese) la entrada desaparece y el test saldría rojo por el
// sembrado, no por el producto. `null` es lo más seguro.
const SEMILLA = [{ id: OLIVEIRA.id, name: OLIVEIRA.nombre, headshotUrl: null, addedAt: 1 }];

test("la estrella de la ficha guarda el favorito y sobrevive a recargar", async ({ page }) => {
  await page.goto(`/fighters/${OLIVEIRA.id}`);

  // El botón no tiene texto visible (el icono es aria-hidden): solo se le llega
  // por el aria-label. Y ojo, las dos preposiciones no son simétricas:
  // "Guardar a X EN favoritos" / "Quitar a X DE favoritos".
  const guardar = page.getByRole("button", { name: `Guardar a ${OLIVEIRA.nombre} en favoritos` });
  const quitar = page.getByRole("button", { name: `Quitar a ${OLIVEIRA.nombre} de favoritos` });

  await expect(guardar).toBeVisible();
  await expect(guardar).toHaveAttribute("aria-pressed", "false");

  await guardar.click();

  // Siempre asertos con reintento, nunca getAttribute síncrono: el primer render
  // es SIEMPRE "no favorito" porque `getServerSnapshot` devuelve la lista vacía
  // (use-favorites.ts:52-54) y el cambio llega al hidratar.
  await expect(quitar).toHaveAttribute("aria-pressed", "true");

  // ESTO es lo que pide el sprint: que sobreviva a recargar.
  await page.reload();
  await expect(quitar).toHaveAttribute("aria-pressed", "true");

  // Y que lo guardado sea lo que dice guardar, no un objeto cualquiera.
  const guardado = await page.evaluate((clave) => localStorage.getItem(clave), CLAVE);
  const lista = JSON.parse(guardado ?? "[]") as {
    id: number;
    name: string;
    addedAt: number;
    headshotUrl: string | null;
  }[];
  expect(lista).toHaveLength(1);
  expect(lista[0].id).toBe(OLIVEIRA.id);
  expect(lista[0].name).toBe(OLIVEIRA.nombre);
  expect(typeof lista[0].addedAt).toBe("number");
  if (lista[0].headshotUrl !== null) {
    expect(lista[0].headshotUrl).toMatch(/^(https:\/\/|\/)/);
  }
});

test("con un favorito guardado, la portada pinta la franja", async ({ page }) => {
  // ÚNICA petición real a /api/fighters/upcoming de todo el fichero.
  //
  // Se siembra con addInitScript y NO con page.evaluate a posteriori: el store
  // solo escucha el evento `storage` (que NO se dispara en la pestaña que
  // escribe) y el CustomEvent `mma:favorites-changed`. Escribir localStorage en
  // caliente sin despachar ese evento deja la UI sin enterarse de nada.
  await page.addInitScript(
    ([clave, semilla]) => {
      localStorage.setItem(clave as string, JSON.stringify(semilla));
    },
    [CLAVE, SEMILLA] as const,
  );

  await page.goto("/");

  // La <section> no expone `role="region"` (no tiene nombre accesible), así que
  // el ancla buena es su encabezado, que es único en toda la portada.
  await expect(page.getByRole("heading", { name: "Luchadores guardados", level: 2 })).toBeVisible();
  await expect(page.getByText("Tus favoritos")).toBeVisible();
  await expect(
    page.getByRole("button", { name: `Quitar a ${OLIVEIRA.nombre} de favoritos` }),
  ).toBeVisible();

  // 🪤 NO usar `expect(page.locator('body')).toContainText(...)`: el 2-ago eso
  // dio por rota esta misma franja estando perfectamente pintada. Los locators
  // con rol reintentan; una lectura de innerText, no.
  await expect(page.locator("section").filter({ hasText: "Luchadores guardados" }).getByRole("link", { name: new RegExp(OLIVEIRA.nombre, "i") }).first()).toBeVisible();
});

test("quitar el último favorito hace desaparecer la franja entera", async ({ page }) => {
  // Aquí se prueba el borrado, no el endpoint: se sirve con page.route para no
  // gastar una segunda petición del bucket `upcoming`.
  await page.route("**/api/fighters/upcoming*", (route) => route.fulfill({ json: { bouts: [] } }));
  await page.addInitScript(
    ([clave, semilla]) => {
      localStorage.setItem(clave as string, JSON.stringify(semilla));
    },
    [CLAVE, SEMILLA] as const,
  );

  await page.goto("/");
  const encabezado = page.getByRole("heading", { name: "Luchadores guardados", level: 2 });
  await expect(encabezado).toBeVisible();

  await page.getByRole("button", { name: `Quitar a ${OLIVEIRA.nombre} de favoritos` }).click();

  // Con la lista vacía el componente devuelve null: la sección no se oculta, se
  // DESMONTA (favorites-strip.tsx:77-79).
  await expect(encabezado).toHaveCount(0);
  await expect
    .poll(async () => JSON.parse((await page.evaluate((c) => localStorage.getItem(c), CLAVE)) ?? "[]"))
    .toEqual([]);
});

test("basura en localStorage no rompe la portada", async ({ page }) => {
  // Cubre el parseo defensivo de lib/favorites.ts DE PUNTA A PUNTA. En unidad ya
  // está probado; lo que aquí se comprueba es que la portada no se cae, que es
  // lo que vería el visitante.
  await page.addInitScript((clave) => {
    localStorage.setItem(clave, '{"no":"es un array"}');
  }, CLAVE);

  const respuesta = await page.goto("/");
  expect(respuesta?.status()).toBeLessThan(400);

  // Sin favoritos válidos no hay franja, y por tanto tampoco petición al
  // endpoint (favorites-strip.tsx:43-45 corta antes del fetch).
  await expect(page.getByRole("heading", { name: "Luchadores guardados", level: 2 })).toHaveCount(0);

  // Y la página sigue viva: su encabezado principal se pinta.
  await expect(page.getByRole("heading", { level: 1 }).first()).toBeVisible();
  await expect(page.getByText(/Algo salió mal|Application error/i)).toHaveCount(0);
});
