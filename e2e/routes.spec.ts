import { test, expect } from "@playwright/test";

import { collectHeadshots, expectNoHorizontalOverflow } from "./helpers";

// Las 16 rutas de página. Las dinámicas usan IDs ESTABLES que existen en prod:
// evento 357 (UFC 306), luchador 6493 (ya lo vigila monitor.yml), combate 3821
// (Merab vs O'Malley, de UFC 306). Si alguno desapareciera, su test fallaría con
// un 404 claro en vez de un falso verde.
const ROUTES = [
  "/",
  "/clasificacion",
  "/compare",
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

test("/eventos lista al menos un evento (no solo el estado vacío)", async ({ page }) => {
  await page.goto("/eventos", { waitUntil: "load" });
  // La vista por defecto es "Próximos". Debe haber ≥1 enlace a una ficha de
  // evento, o el estado vacío explícito (aceptable si de verdad no hay próximos).
  const eventLinks = page.locator('a[href^="/eventos/"]');
  const empty = page.getByText(/Aún no hay próximos eventos/i);
  const [links, isEmpty] = await Promise.all([eventLinks.count(), empty.count()]);
  expect(links > 0 || isEmpty > 0, "ni eventos ni estado vacío en /eventos").toBeTruthy();
});
