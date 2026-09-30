import { expect, test, type Page } from "@playwright/test";

// ── El historial ESPN de la ficha, contra la base de verdad ────────────────
//
// El NOT EXISTS de fighters.detail.ts esconde las filas de fight_history_espn
// que ya están en `fights`: mismo luchador y evento a ±1 día de fecha. NO
// compara el rival: con cualquier combate de `fights` en esa ventana, la fila
// ESPN se esconde. Sus tests de vitest
// (src/lib/queries/espn-history.sql.test.ts) solo leen el TEXTO de la SQL: un
// mutante con `and false` los pasa. Aquí se mira lo que sale en la página.
//
// Casos comprobados en producción el 30-sep-2026 (SQL de solo lectura):
//
//   · 9128 Yilizhati Maimaitijiang: la semifinal del Road to UFC del
//     28-ago-2026 contra Tre'ston Vines está DOS veces en la base, como la fila
//     ESPN 82075 y como el combate 16146 (evento 1094). Tiene que salir UNA, y
//     tiene que ser la de `fights` (badge «UFC»).
//   · 6782 Cody Chovancek: su victoria sobre Raphael Uchegbu del 16-sep-2025 es
//     del Contender Series (fila ESPN 89440), que lleva etiqueta violeta.
//
// 🪤 El e2e corre contra la base de PRODUCCIÓN: si algún día se borran esas
// filas, este test falla por datos, no por código. Mírese la base antes de
// tocar el producto.
//
// ⚠️ UN SOLO PROYECTO: el contenido del historial no depende del viewport ni
// del tema (el badge lleva las clases de los dos temas a la vez; el contraste
// de cada uno se mide en src/lib/contrast.test.ts). Seis veces serían seis
// fichas más contra Neon sin ninguna señal nueva.
//
// ⚠️ Y NADA de `test.only`: con CI=true, `forbidOnly` tumba la recolección.

test.beforeEach(({}, testInfo) => {
  test.skip(
    testInfo.project.name !== "escritorio-light",
    "el historial no depende del viewport ni del tema: un solo proyecto",
  );
});

// Filas de la tabla «Historial de peleas». La sección lleva id="historial"
// (fighters/[id]/page.tsx) y es la única tabla con ese ancla.
function filasDelHistorial(page: Page) {
  return page.locator("#historial tbody tr");
}

// El badge de promoción es el único <span title> de la fila: el title repite
// la etiqueta porque el texto puede truncarse (max-w-36).
function badgeDePromocion(fila: ReturnType<typeof filasDelHistorial>) {
  return fila.locator("span[title]");
}

test("la semifinal del Road to UFC de 9128 sale una sola vez, la de fights", async ({ page }) => {
  await page.goto("/fighters/9128");

  const filas = filasDelHistorial(page);
  await expect(filas.first()).toBeVisible();

  // El apóstrofo se deja libre: ESPN y UFCStats no escriben igual el nombre.
  const contraVines = filas.filter({ hasText: /Tre.ston Vines/i });
  await expect(
    contraVines,
    "el duplicado ESPN de la pelea 16146 vuelve a salir: revisa el NOT EXISTS",
  ).toHaveCount(1);
  // Identified by the event, not by the date: a date-only value is rendered
  // one day earlier when the server runs east of UTC (the megatest runs in
  // Europe/Madrid and paints "27 ago 2026"; production, in UTC, "28 ago 2026").
  await expect(contraVines).toContainText("Road To UFC: Maheshate vs. Flowers");
  // La que sobrevive es la de `fights` (UFC), no la copia de ESPN.
  await expect(badgeDePromocion(contraVines)).toHaveAttribute("title", "UFC");

  // Y el filtro no se lleva por delante lo que NO está repetido: sus peleas
  // regionales (WLF, Dragon FC…) siguen en la tabla. Sin esto, un NOT EXISTS
  // que escondiera todo el historial ESPN también daría «una sola vez».
  const titulos = await badgeDePromocion(filas).evaluateAll((badges) =>
    badges.map((badge) => badge.getAttribute("title")),
  );
  expect(
    titulos.filter((titulo) => titulo !== "UFC").length,
    `badges de la tabla: ${titulos.join(", ")}`,
  ).toBeGreaterThan(0);
});

test("una pelea del Contender Series lleva la etiqueta violeta", async ({ page }) => {
  await page.goto("/fighters/6782");

  const fila = filasDelHistorial(page).filter({ hasText: "Raphael Uchegbu" });
  await expect(fila).toHaveCount(1);

  const badge = badgeDePromocion(fila);
  await expect(badge).toHaveAttribute("title", "Contender Series");
  // Las clases de promotion-badge.ts, en los dos temas: si alguien vuelve a
  // mandar el Contender Series al gris de los regionales, cae aquí.
  for (const clase of [
    "bg-violet-500/15",
    "text-violet-800",
    "dark:bg-violet-400/15",
    "dark:text-violet-300",
  ]) {
    // Ni «/» ni «:» son especiales en una RegExp: no hace falta escaparlos.
    await expect(badge).toHaveClass(new RegExp(`(^|\\s)${clase}(\\s|$)`));
  }
  await expect(badge).not.toHaveClass(/(^|\s)bg-muted(\s|$)/);

  // Y el tile «Última pelea» del hero: 6782 no tiene combate UFC disputado (su
  // única fila en `fights` es la próxima), así que el tile cae a su última fila
  // ESPN, esta misma, y tiene que llevar el mismo badge violeta.
  const tile = page
    .locator("p", { hasText: /^Última pelea$/ })
    .locator("xpath=..")
    .locator("span[title]");
  await expect(tile).toHaveCount(1);
  await expect(tile).toHaveAttribute("title", "Contender Series");
  for (const clase of [
    "bg-violet-500/15",
    "text-violet-800",
    "dark:bg-violet-400/15",
    "dark:text-violet-300",
  ]) {
    await expect(tile).toHaveClass(new RegExp(`(^|\\s)${clase}(\\s|$)`));
  }
});
