import { test, expect, type Page } from "@playwright/test";

// ── Fase 13B · tema, navegación, modales y acordeón ────────────────────────
//
// Es el ÚNICO fichero nuevo de la fase 13 que corre en varios proyectos, y es a
// propósito: aquí el viewport SÍ cambia el resultado (la hamburguesa es
// `lg:hidden`, el flyout es `hidden lg:flex`). Puede permitírselo porque NO
// toca ni una ruta con freno: `/api/live/now` y `/api/health` no tienen
// limitador, y sin favoritos en localStorage la portada no llama a
// `/api/fighters/upcoming`.
//
// ⚠️ Y NADA de `test.only`: con CI=true, `forbidOnly` tumba la recolección.

// El chip "En vivo" de la cabecera es un componente cliente que aparece o no
// según el CALENDARIO REAL, y cuando aparece añade un <a href="/en-vivo"> que
// colisiona con el del pie. Se neutraliza en todo el fichero para que los tests
// no dependan de si hay velada esta noche.
test.beforeEach(async ({ page }) => {
  await page.route("**/api/live/now", (route) =>
    route.fulfill({ status: 200, json: { phase: "none" } }),
  );
});

const esEscritorio = (nombre: string) => nombre.startsWith("escritorio");

// next-themes escribe en <html> la clase del tema resuelto al montar en el
// cliente: el HTML servido NO la trae. Esperar a que aparezca es la puerta de
// hidratación fiable — sin ella, un clic pre-hidratación se pierde y el test
// sale rojo de forma intermitente (que es justo lo que avisó el revisor).
async function esperarHidratacion(page: Page) {
  await expect
    .poll(() =>
      page.evaluate(() => {
        const clases = document.documentElement.classList;
        return clases.contains("dark") || clases.contains("light");
      }),
    )
    .toBe(true);
}

const esOscuro = (page: Page) =>
  page.evaluate(() => document.documentElement.classList.contains("dark"));

test("el botón de tema cambia el tema y el cambio sobrevive a recargar", async ({ page }) => {
  await page.goto("/");
  await esperarHidratacion(page);

  // Se asserta el CAMBIO respecto al estado inicial, nunca un valor fijo: los
  // seis proyectos arrancan con `colorScheme` forzado, así que en los tres
  // claros el clic lleva a oscuro y en los tres oscuros al revés. Y el icono del
  // botón es FIJO: no sirve para deducir el tema.
  const antes = await esOscuro(page);

  await page.getByRole("button", { name: "Cambiar tema", exact: true }).click();
  await expect.poll(() => esOscuro(page)).toBe(!antes);

  // Y se queda escrito, que es lo que hace útil el botón.
  await expect.poll(() => page.evaluate(() => localStorage.getItem("theme"))).toBe(
    antes ? "light" : "dark",
  );

  await page.reload();
  await esperarHidratacion(page);
  await expect.poll(() => esOscuro(page)).toBe(!antes);
});

test("el menú móvil se abre, se cierra con Escape y devuelve el foco", async ({ page }, testInfo) => {
  test.skip(esEscritorio(testInfo.project.name), "la hamburguesa es lg:hidden");

  await page.goto("/");
  await esperarHidratacion(page);

  // 🪤 El locator va por `aria-controls` y NO por el aria-label: al abrir, el
  // label pasa de "Abrir menú" a "Cerrar menú" y un locator por nombre guardado
  // en una constante dejaría de casar en el segundo uso.
  const hamburguesa = page.locator('button[aria-controls="mobile-nav"]');
  // 🪤 Y el nav va por id: hay DOS <nav aria-label="Navegación principal">
  // (escritorio y móvil), así que el rol con nombre viola strict mode.
  const navMovil = page.locator("#mobile-nav");

  await expect(hamburguesa).toBeVisible();
  await expect(hamburguesa).toHaveAttribute("aria-expanded", "false");
  await expect(navMovil).toBeHidden();

  await hamburguesa.click();
  await expect(hamburguesa).toHaveAttribute("aria-expanded", "true");
  await expect(navMovil).toBeVisible();

  // El enlace se busca DENTRO del menú: "Enfrentamiento" suelto son 3 nodos en
  // el DOM (nav escritorio, nav móvil y pie).
  await expect(navMovil.getByRole("link", { name: "Enfrentamiento", exact: true })).toBeVisible();

  await page.keyboard.press("Escape");
  await expect(navMovil).toBeHidden();
  await expect(hamburguesa).toHaveAttribute("aria-expanded", "false");
  await expect(hamburguesa).toBeFocused();
});

test("el flyout de escritorio abre el submenú de Luchadores", async ({ page }, testInfo) => {
  test.skip(!esEscritorio(testInfo.project.name), "el flyout es hidden lg:flex");

  await page.goto("/");
  await esperarHidratacion(page);

  // 🪤 NO usar getByRole('link', { name: 'Luchadores', exact: true }): son 3
  // nodos (nav escritorio, nav móvil y pie) y a 1280 px hay 2 visibles.
  const disparador = page.locator('a[aria-haspopup="menu"]');
  const menu = page.getByRole("menu", { name: "Luchadores" });

  await expect(menu).toBeHidden();
  await disparador.hover();
  await expect(menu).toBeVisible();
  await expect(disparador).toHaveAttribute("aria-expanded", "true");
  await expect(page.getByRole("menuitem", { name: "Salón de la Fama" })).toBeVisible();
});

test("el modal de vídeo se abre, bloquea el scroll y se cierra con Escape", async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== "escritorio-light", "el modal no depende del viewport");

  // Se corta el iframe de terceros: lo que se prueba es NUESTRO modal, no que
  // YouTube responda. El atributo src sigue estando para poder asertarlo.
  await page.route("https://www.youtube-nocookie.com/**", (route) => route.abort());

  await page.goto("/videos");

  const reproducir = page.locator('button[aria-label^="Reproducir: "]').first();
  // Los vídeos vienen de la API de YouTube: si ese día no devuelve nada, no hay
  // nada que abrir y se dice, en vez de fallar por algo ajeno.
  //
  // 🪤 Se ESPERA en vez de contar: React sirve el contenido en streaming dentro
  // de un `<div hidden>` y lo coloca después, así que un `count()` justo tras el
  // `goto` puede dar 0 con los vídeos ya en el DOM y saltarse el test en verde.
  const hayVideos = await reproducir
    .waitFor({ state: "visible", timeout: 10_000 })
    .then(() => true)
    .catch(() => false);
  test.skip(!hayVideos, "la API de YouTube no ha devuelto vídeos");

  await reproducir.click();

  const dialogo = page.getByRole("dialog");
  await expect(dialogo).toBeVisible();
  await expect(dialogo).toHaveAttribute("aria-modal", "true");
  await expect(dialogo.locator("iframe")).toHaveAttribute(
    "src",
    /^https:\/\/www\.youtube-nocookie\.com\/embed\//,
  );
  await expect(page.locator("body")).toHaveCSS("overflow", "hidden");
  await expect(dialogo.getByRole("button", { name: "Cerrar vídeo" })).toBeFocused();

  await page.keyboard.press("Escape");
  await expect(dialogo).toHaveCount(0);
  // Y devuelve el scroll: si no, la página se queda muerta tras cerrar.
  await expect(page.locator("body")).not.toHaveCSS("overflow", "hidden");
});

test("las pestañas del Salón cambian de ala y la URL las recuerda", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "escritorio-light", "las pestañas no dependen del viewport");

  await page.goto("/salon-de-la-fama");

  // 🪤 SIN `exact`: el nombre accesible del tab incluye el contador de la
  // insignia ("Ala Moderna19"), así que `exact: true` daría CERO nodos.
  const contribuidora = page.getByRole("tab", { name: "Ala Contribuidora" });
  await expect(page.getByRole("tab")).toHaveCount(4);
  await expect(page.getByRole("tab", { name: "Ala Moderna" })).toHaveAttribute(
    "aria-selected",
    "true",
  );

  await contribuidora.click();
  await expect(page).toHaveURL(/[?&]wing=contributor/);
  await expect(contribuidora).toHaveAttribute("aria-selected", "true");

  // 🚫 Aquí NO se prueba el botón atrás, y no es un olvido: `hall-of-fame-tabs`
  // usa `router.replace`, que SUSTITUYE la entrada del historial. Un `goBack()`
  // sale del Salón entero. Lo que el código sí garantiza —y es lo que vale para
  // compartir un enlace— es que la URL reconstruye el ala:
  await page.goto("/salon-de-la-fama?wing=contributor");
  await expect(page.getByRole("tab", { name: "Ala Contribuidora" })).toHaveAttribute(
    "aria-selected",
    "true",
  );
});

test("el acordeón de la cartelera despliega la comparativa", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "escritorio-light", "el acordeón no depende del viewport");

  await page.goto("/eventos/357");

  // Hay uno por combate (10 en este evento): siempre .first().
  const toggle = page.getByRole("button", { name: "Ver comparativa física" }).first();
  await expect(toggle).toBeVisible();
  await expect(toggle).toHaveAttribute("aria-expanded", "false");

  // El id del panel lo genera useId(): se LEE, nunca se escribe a mano.
  const idPanel = await toggle.getAttribute("aria-controls");
  expect(idPanel).toBeTruthy();
  const panel = page.locator(`#${idPanel}`);

  // El panel NO se desmonta al cerrarse (es una animación de grid): el aserto
  // bueno es aria-hidden, no toHaveCount(0).
  await expect(panel).toHaveAttribute("aria-hidden", "true");

  await toggle.click();
  await expect(toggle).toHaveAttribute("aria-expanded", "true");
  await expect(panel).toHaveAttribute("aria-hidden", "false");
  await expect(panel).toBeVisible();
});
