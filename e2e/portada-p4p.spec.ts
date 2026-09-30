import { expect, test, type Locator } from "@playwright/test";

import { esperarHidratacion, fakeYouTubeEmbeds } from "./helpers";

// ── «Mejores libra por libra» de la portada ───────────────────────────────
//
// Desde el 28-sep-2026 el bloque tiene dos pestañas, Masculino y Femenino, y el
// pie de cada tarjeta dice el total de peleas SEGÚN EL RÉCORD que la tarjeta
// enseña (29-1-0 → «30 peleas»). Aquí se prueba lo que solo se ve con la página
// servida de verdad: los roles ARIA, que el clic cambie de panel, el teclado y
// que el pie cuadre con el récord de su propia tarjeta.
//
// 🪤 SIN NOMBRES FIJOS: la base es la de producción y el ranking cambia cada
// semana. Todo se comprueba por estructura (6 tarjetas, enlaces distintos) y
// por coherencia interna (el pie contra el récord de al lado).
//
// Corre en los seis proyectos a propósito: el pie tiene que caber en UNA línea
// también a 390 px, y un salto de línea no lo caza el test de desbordamiento
// (ver comprobarPiesEnUnaLinea: se mide el ALTO del pie, no sus cajas).
//
// La lógica de las flechas está además en src/lib/tabs-keyboard.test.ts; la
// consulta, en src/lib/queries/featured-fighters.sql.test.ts.
//
// ⚠️ Y NADA de `test.only`: con CI=true, `forbidOnly` tumba la recolección.

/** Los `/fighters/<id>` distintos de un panel: cada tarjeta enlaza 3 veces. */
async function fichasDelPanel(panel: Locator): Promise<string[]> {
  const hrefs = await panel
    .locator('a[href^="/fighters/"]')
    .evaluateAll((enlaces) => enlaces.map((a) => a.getAttribute("href") ?? ""));
  return [...new Set(hrefs)];
}

/**
 * Cada pie contra el récord de SU tarjeta. Se lee con textContent, que no
 * depende de que el panel esté a la vista.
 */
async function comprobarPies(panel: Locator, nombre: string): Promise<void> {
  const tarjetas = panel.locator("[data-fighter-card]");
  await expect(tarjetas, `${nombre}: tarjetas`).toHaveCount(6);

  for (let i = 0; i < 6; i += 1) {
    const tarjeta = tarjetas.nth(i);
    const record = (
      await tarjeta
        .getByText("Récord", { exact: true })
        .locator("xpath=following-sibling::p[1]")
        .textContent()
    )?.trim();
    const partes = /^(\d+)-(\d+)-(\d+)$/.exec(record ?? "");
    const suma = partes ? Number(partes[1]) + Number(partes[2]) + Number(partes[3]) : 0;

    // Sin récord (nulo o 0-0-0) NI peleas UFC disputadas la tarjeta no pinta
    // contador, y es válido (fight-count.ts). 🪤 Se cuenta ANTES de leer:
    // textContent() sobre un localizador vacío espera al elemento hasta el
    // actionTimeout (15 s) y el test moriría por tiempo, no por una aserción.
    const pieLoc = tarjeta.locator("[data-fight-count]");
    if ((await pieLoc.count()) === 0) {
      expect(suma, `${nombre} #${i + 1}: sin contador junto al récord ${record}`).toBe(0);
      continue;
    }
    const pie = (await pieLoc.textContent())?.trim() ?? "";

    const total = /^(\d+) peleas?$/.exec(pie);
    if (partes && total) {
      // La regla del dueño: el número sale del MISMO récord que se enseña.
      expect(Number(total[1]), `${nombre} #${i + 1}: «${pie}» junto a ${record}`).toBe(suma);
    } else {
      // Sin récord legible, el respaldo tiene que decir que es solo UFC.
      expect(pie, `${nombre} #${i + 1}: pie «${pie}» con récord «${record}»`).toMatch(
        /^\d+ en UFC$/,
      );
    }
  }
}

/**
 * Ningún pie visible parte en dos líneas: el alto de su contenido (sin el
 * relleno) no pasa de UNA línea de texto.
 *
 * 🪤 Contar las cajas del contador (`getClientRects().length`) NO sirve, y así
 * estuvo la primera versión: el <span> es hijo directo de un flex, el navegador
 * lo convierte en bloque y un bloque da 1 caja aunque su texto ocupe dos
 * líneas. Medido el 29-sep-2026 forzando un pie largo a 390 px: el span daba
 * 1 caja con su texto en tres líneas (60 px de alto). Se mide el pie ENTERO porque, con el contador en
 * `whitespace-nowrap`, lo que cedería al faltar sitio son los enlaces.
 */
async function comprobarPiesEnUnaLinea(panel: Locator, nombre: string): Promise<void> {
  const pies = await panel.locator("[data-card-footer]").evaluateAll((nodos) =>
    nodos.map((pie) => {
      const estilo = getComputedStyle(pie);
      return {
        texto: (pie.textContent ?? "").replace(/\s+/g, " ").trim(),
        alto: pie.clientHeight - parseFloat(estilo.paddingTop) - parseFloat(estilo.paddingBottom),
        linea: parseFloat(estilo.lineHeight),
      };
    }),
  );
  expect(pies, `${nombre}: pies`).toHaveLength(6);
  for (const pie of pies) {
    // Media línea de margen: sobra para el redondeo y una segunda línea no cabe.
    expect(pie.alto, `${nombre}: el pie «${pie.texto}» parte en dos líneas`).toBeLessThan(
      pie.linea * 1.5,
    );
  }
}

// The home page, /en-vivo and the event pages mount YouTube players on their
// own (the turn manager): they get the fake YouTube of e2e/helpers.ts.
test.beforeEach(async ({ page }) => {
  await fakeYouTubeEmbeds(page);
});

test("el libra por libra alterna Masculino y Femenino, y cada pie cuadra con su récord", async ({
  page,
}) => {
  await page.goto("/");

  const lista = page.getByRole("tablist", { name: "Libra por libra" });
  await expect(lista).toBeVisible();
  await expect(lista.getByRole("tab")).toHaveCount(2);

  const masculino = lista.getByRole("tab", { name: "Masculino", exact: true });
  const femenino = lista.getByRole("tab", { name: "Femenino", exact: true });
  await expect(masculino).toHaveAttribute("aria-selected", "true");
  await expect(femenino).toHaveAttribute("aria-selected", "false");

  // El panel se busca por el aria-controls de su pestaña: así se prueba también
  // que la pestaña apunta al panel que toca.
  const panelM = page.locator(`#${await masculino.getAttribute("aria-controls")}`);
  const panelF = page.locator(`#${await femenino.getAttribute("aria-controls")}`);
  await expect(panelM).toHaveAttribute("role", "tabpanel");
  await expect(panelF).toHaveAttribute("role", "tabpanel");
  await expect(panelM).toBeVisible();
  await expect(panelF).toBeHidden();

  const fichasM = await fichasDelPanel(panelM);
  const fichasF = await fichasDelPanel(panelF);
  expect(fichasM, "masculino: 6 luchadores distintos").toHaveLength(6);
  expect(fichasF, "femenino: 6 luchadoras distintas").toHaveLength(6);
  expect(
    fichasF.filter((href) => fichasM.includes(href)),
    "el mismo luchador en los dos paneles",
  ).toEqual([]);

  await comprobarPies(panelM, "masculino");
  await comprobarPies(panelF, "femenino");
  await comprobarPiesEnUnaLinea(panelM, "masculino");

  // El clic antes de hidratar se pierde: se espera a la hidratación y, por si
  // la isla llega un instante después que next-themes, se reintenta el clic.
  await esperarHidratacion(page);
  await expect(async () => {
    await femenino.click();
    await expect(femenino).toHaveAttribute("aria-selected", "true", { timeout: 1_000 });
  }).toPass();

  await expect(masculino).toHaveAttribute("aria-selected", "false");
  await expect(panelF).toBeVisible();
  await expect(panelM).toBeHidden();
  await comprobarPiesEnUnaLinea(panelF, "femenino");

  // Teclado (WAI-ARIA, activación automática): ← vuelve al masculino y se lleva
  // el foco; solo la pestaña activa está en el orden del Tab.
  await femenino.press("ArrowLeft");
  await expect(masculino).toHaveAttribute("aria-selected", "true");
  await expect(masculino).toBeFocused();
  await expect(masculino).toHaveAttribute("tabindex", "0");
  await expect(femenino).toHaveAttribute("tabindex", "-1");
  await expect(panelM).toBeVisible();
  await expect(panelF).toBeHidden();
});
