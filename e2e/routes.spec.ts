import { test, expect } from "@playwright/test";

import { collectHeadshots, expectNoHorizontalOverflow } from "./helpers";

// Las 16 rutas de página. Las dinámicas usan IDs ESTABLES que existen en prod:
// evento 357 (UFC 306), luchador 6493 (ya lo vigila monitor.yml), combate 3821
// (Merab vs O'Malley, de UFC 306). Si alguno desapareciera, su test fallaría con
// un 404 claro en vez de un falso verde.
// /compare NO está en esta lista a propósito: no es una página, es un redirect a
// /enfrentamiento (que sí se prueba aquí abajo). Medir su desbordamiento no medía
// nada útil y era la ÚNICA de las rutas cuyo documento se reemplaza a sí mismo
// justo después del `load`, lo que la hacía inestable. Tiene su propio test al
// final del fichero, que además cubre el remapeo de parámetros que hoy no probaba
// nadie.
const ROUTES = [
  "/",
  "/clasificacion",
  "/en-vivo",
  "/enfrentamiento",
  "/eventos",
  "/eventos/357",
  "/fighters",
  "/fighters/6493",
  "/fights/3821",
  "/gimnasios",
  "/maestro",
  "/predict",
  "/salon-de-la-fama",
  "/tendencias",
  "/ufc-hoy",
  "/videos",
];

for (const route of ROUTES) {
  test(`ruta ${route} renderiza sin desbordamiento`, async ({ page }, testInfo) => {
    const response = await page.goto(route, { waitUntil: "load" });
    // Asserto DURO 1: la página responde (no 4xx/5xx ni error de servidor).
    expect(response, `sin respuesta HTTP en ${route}`).not.toBeNull();
    expect(response!.status(), `HTTP ${response!.status()} en ${route}`).toBeLessThan(400);

    // Asserto DURO 2: sin error boundary de React ("Algo salió mal" del error.tsx).
    await expect(
      page.getByText(/Algo salió mal|Application error/i),
      `error boundary visible en ${route}`,
    ).toHaveCount(0);

    // Asserto DURO 3: sin desbordamiento horizontal.
    await expectNoHorizontalOverflow(page, route);

    // INFO: cobertura de fotos (siluetas = WARNING, no fallo).
    const shots = await collectHeadshots(page);
    testInfo.annotations.push({
      type: "headshots",
      description: `${route} → fotos:${shots.photos} siluetas:${shots.silhouettes} sin-cargar:${shots.brokenExternal}`,
    });
  });
}

// El comparador vivía en /compare y se fusionó con /enfrentamiento. La ruta vieja
// sigue existiendo para no romper enlaces de fuera, y de paso traduce los
// parámetros antiguos (?a=&b=) a la semántica de esquinas (?red=&blue=). Esa
// traducción no la comprobaba nadie: si se rompiera, un enlace antiguo llevaría al
// comparador VACÍO en vez de a la pareja pedida, sin dar ningún error.
//
// Se comprueba la URL final y no el código HTTP a propósito: `permanentRedirect`
// en un Server Component NO devuelve un 308; Next sirve un 200 con la orden de
// redirigir dentro del payload de React y el salto lo da el cliente.
test("/compare lleva a /enfrentamiento traduciendo los parámetros antiguos", async ({ page }) => {
  await page.goto("/compare?a=6493&b=3821");
  await page.waitForURL(/\/enfrentamiento(\?|$)/);

  const url = new URL(page.url());
  expect(url.pathname, "no acabó en /enfrentamiento").toBe("/enfrentamiento");
  expect(url.searchParams.get("red"), "el parámetro a= no se tradujo a red=").toBe("6493");
  expect(url.searchParams.get("blue"), "el parámetro b= no se tradujo a blue=").toBe("3821");
  expect(url.searchParams.has("a"), "el parámetro antiguo a= sigue ahí").toBe(false);
  expect(url.searchParams.has("b"), "el parámetro antiguo b= sigue ahí").toBe(false);
});

test("/compare sin parámetros lleva a /enfrentamiento limpio", async ({ page }) => {
  await page.goto("/compare");
  await page.waitForURL(/\/enfrentamiento(\?|$)/);
  expect(new URL(page.url()).pathname).toBe("/enfrentamiento");
});

// FASE 9. El desglose por asaltos existe para 8.738 combates, pero si un día se
// cayera de la ficha (un cambio en la query, un `return null` de más) la página
// seguiría dando 200, sin error boundary y sin desbordarse: las tres cosas que
// mira el bucle de rutas de arriba. Este test comprueba que la sección está y
// que trae sus totales, que es lo que la distingue de la tabla que había antes.
test("la ficha de combate trae el asalto a asalto con sus totales", async ({ page }) => {
  // 3821 es uno de los ids estables que ya usa toda la suite: 5 asaltos, a
  // decisión unánime.
  await page.goto("/fights/3821", { waitUntil: "load" });

  const seccion = page.locator("section").filter({ hasText: "Asalto a asalto" });
  await expect(seccion, "no está la sección del asalto a asalto").toHaveCount(1);

  // Los cinco asaltos y la fila de totales.
  await expect(seccion.getByText(/^Asalto 5$/)).toHaveCount(1);
  await expect(
    seccion.getByText(/Total del combate/i),
    "faltan los totales: son lo que permite cuadrar con las estadísticas del combate",
  ).toHaveCount(1);

  // Y que NO se confunda con la función estrella, que va justo encima.
  await expect(
    seccion.getByText(/La película del combate/i),
    "el asalto a asalto se ha comido a la película del combate",
  ).toHaveCount(0);
});

test("/eventos lista al menos un evento (no solo el estado vacío)", async ({ page }) => {
  await page.goto("/eventos", { waitUntil: "load" });
  // La vista por defecto es "Próximos". Debe haber ≥1 enlace a una ficha de
  // evento, o el estado vacío explícito (aceptable si de verdad no hay próximos).
  const eventLinks = page.locator('a[href^="/eventos/"]');
  const empty = page.getByText(/Aún no hay próximos eventos/i);
  const [links, isEmpty] = await Promise.all([eventLinks.count(), empty.count()]);
  expect(links > 0 || isEmpty > 0, "ni eventos ni estado vacío en /eventos").toBeTruthy();
});

// EL PANEL DE ESTADO TIENE QUE SER INVISIBLE, no solo inaccesible. El dueño lo
// pidió así: "que nadie tenga acceso a eso ni que sepan que en la web está eso".
//
// Este test existe porque el primer intento NO cumplía: llamar a `notFound()`
// dentro de la página devolvía HTTP 200 (en esta versión de Next la página de
// "no encontrado" responde 200), mientras que una URL inexistente devolvía 404.
// Bastaba comparar los dos códigos para descubrir que /estado existía. Se
// arregló en el proxy, y esto lo deja clavado: si alguien quita ese guard, aquí
// salta.
test("/estado es indistinguible de una URL que no existe", async ({ request }) => {
  const inventada = await request.get("/una-ruta-que-no-existe-98765", {
    maxRedirects: 0,
  });
  const sinClave = await request.get("/estado", { maxRedirects: 0 });
  const claveMala = await request.get("/estado?k=esta-clave-no-vale", {
    maxRedirects: 0,
  });

  expect(inventada.status(), "una URL inventada debería dar 404").toBe(404);
  expect(
    sinClave.status(),
    "/estado sin clave delata que la ruta existe: debe responder igual que una URL inventada",
  ).toBe(inventada.status());
  expect(
    claveMala.status(),
    "/estado con clave incorrecta delata que la ruta existe",
  ).toBe(inventada.status());

  // Y que no se cuele ni un rastro del panel en el cuerpo.
  const cuerpo = await sinClave.text();
  expect(cuerpo).not.toContain("Estado del sistema");
  expect(cuerpo).not.toContain("El turno de guardia");
});

// El JSON del panel es lo que lee el guardián, así que su puerta importa igual.
test("/api/estado no contesta sin la clave", async ({ request }) => {
  const r = await request.get("/api/estado", { maxRedirects: 0 });
  expect(r.status(), "el JSON del panel debe esconderse igual que la página").toBe(404);
});
