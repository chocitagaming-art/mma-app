import { expect, test, type Page } from "@playwright/test";

import { expectNoHorizontalOverflow } from "./helpers";

// La película, T7-T9 — el bloque del reparto de agarre, comprobado sobre la
// página REAL. Los tests unitarios prueban la cuenta; esto prueba lo que se
// publica, que es lo único que ve un lector.

async function abrirFicha(page: Page, id: number) {
  await page.goto(`/fights/${id}`);
  await expect(page.locator("#main-content")).toBeVisible();
  // Next sirve la ficha por streaming: sin recorrerla, las secciones de abajo
  // no llegan a maquetarse y los locators de Playwright no las encuentran.
  await page.evaluate(async () => {
    const paso = window.innerHeight;
    for (let y = 0; y < document.body.scrollHeight; y += paso) {
      window.scrollTo(0, y);
      await new Promise((r) => requestAnimationFrame(() => r(null)));
    }
    window.scrollTo(0, 0);
    await new Promise((r) => requestAnimationFrame(() => r(null)));
  });
}

const bloque = (page: Page) =>
  page.getByTestId("fight-grip");

test("14232 publica los seis números del acta, que es el criterio de aceptación", async ({
  page,
}) => {
  // R1 64/147 · R2 57/31 · R3 48/53. Si sale otra cosa, algo de la cadena está
  // filtrando lo que no debe. Se comprueba sobre el texto RENDERIZADO, no sobre
  // el resultado de una función: es la única prueba que ejecuta la tubería
  // entera —query, nulos, cuenta, formato y render— de una sola vez.
  await abrirFicha(page, 14232);

  const panel = bloque(page);
  await expect(panel).toBeVisible();
  await panel.locator("summary").click();

  const tabla = panel.locator("table");
  await expect(tabla).toBeVisible();

  for (const reloj of ["1:04", "2:27", "0:57", "0:31", "0:48", "0:53"]) {
    await expect(
      tabla.getByText(reloj, { exact: false }),
      `falta el reloj ${reloj} en la tira por asaltos de 14232`,
    ).toHaveCount(1);
  }

  // Y el total del combate, con sus dos denominadores. Los tres suman 100:
  // los reparte `repartirPorcentajes` juntos, no cada uno por su cuenta.
  await expect(panel).toContainText("19 % (2:49)");
  await expect(panel).toContainText("26 % (3:51)");
  await expect(panel).toContainText("nadie sujetaba 55 % (8:20)");
  await expect(panel).toContainText("de 15:00 de combate");
  await expect(panel).toContainText("Miranda se llevó el 58 %");
  // Y la frase de arriba dice lo mismo que la barra: 19 + 26 = 45.
  await expect(panel).toContainText("El 45 % del combate se peleó agarrado");
});

test("🪤 no publica «100 %» ni «0 %» cuando el acta dice otra cosa", async ({
  page,
}) => {
  // 3850, Rozenstruik vs Tuivasa: 1 s y 1 s de agarre en 900. Antes de la
  // revisión de después de desplegar, esta ficha publicaba «nadie sujetaba
  // 100 %» encima de dos cifras de «0 %» que tenían segundos medidos debajo.
  await abrirFicha(page, 3850);

  const panel = bloque(page);
  await expect(panel).toBeVisible();

  await expect(panel).not.toContainText("nadie sujetaba 100 %");
  await expect(panel).toContainText("nadie sujetaba 99 %");
  // Un segundo medido no se publica como 0 %: se declara pequeño.
  await expect(panel).toContainText("<1 % (0:01)");
  await expect(panel).not.toContainText("0 % (0:01)");
});

test("el rojo va a la izquierda y el azul a la derecha, en ese orden en el DOM", async ({
  page,
}) => {
  // No es cosmético: --corner-red y --corner-blue tienen luminancia casi
  // idéntica, y en escala de grises lo único que desambigua a las dos esquinas
  // es la POSICIÓN. Si alguien "mejora" el orden, el bloque deja de leerse.
  await abrirFicha(page, 14232);

  const panel = bloque(page);
  const html = (await panel.innerHTML()) ?? "";
  const posRojo = html.indexOf("text-corner-red");
  const posAzul = html.indexOf("text-corner-blue");

  expect(posRojo, "no se encuentra la etiqueta de la esquina roja").toBeGreaterThan(-1);
  expect(posAzul, "no se encuentra la etiqueta de la esquina azul").toBeGreaterThan(-1);
  expect(posRojo, "el azul aparece antes que el rojo").toBeLessThan(posAzul);
});

test("con el desplegable cerrado, nada de dentro coge el foco", async ({ page }) => {
  // 🪤 El disclosure de la casa pliega con aria-hidden pero SIN `hidden` ni
  // `inert` (event-bout-disclosure.tsx:79), así que su contenido plegado sigue
  // siendo tabulable. Este bloque usa <details> nativo justo para no heredar
  // eso, y este test es lo que impide que alguien lo cambie sin enterarse.
  await abrirFicha(page, 14232);
  await expect(bloque(page)).toBeVisible();

  const atrapados: string[] = [];
  for (let i = 0; i < 80; i += 1) {
    await page.keyboard.press("Tab");
    const dentro = await page.evaluate(() => {
      const el = document.activeElement;
      if (!el || el === document.body) return null;
      const details = el.closest("details");
      const enSummary = el.tagName === "SUMMARY" || !!el.closest("summary");
      if (details && !details.open && !enSummary) {
        return `${el.tagName}: ${(el.textContent || "").trim().slice(0, 40)}`;
      }
      return "";
    });
    if (dentro === null) break;
    if (dentro) atrapados.push(dentro);
  }

  expect(
    atrapados,
    "hay foco atrapado dentro de un desplegable cerrado",
  ).toEqual([]);
});

test("los números por asalto son datos de TABLA, no un resumen hablado", async ({
  page,
}) => {
  // La película vieja pone role="img" en su SVG, lo que vuelve presentacionales
  // sus ~28 <title>: en móvil no hay hover y esa información es literalmente
  // inalcanzable. Aquí no: cada cifra es una celda con sus cabeceras.
  await abrirFicha(page, 14232);

  const panel = bloque(page);
  await panel.locator("summary").click();
  const tabla = panel.locator("table");

  await expect(tabla.locator("caption")).toHaveClass(/sr-only/);
  await expect(tabla.locator('th[scope="col"]')).toHaveCount(3);
  await expect(tabla.locator('th[scope="colgroup"]')).toHaveCount(3);
  await expect(tabla.locator("tbody td")).toHaveCount(9);

  // Y el carril que puede desbordar se recorre con teclado.
  const carril = panel.locator('[role="region"]');
  await expect(carril).toHaveAttribute("tabindex", "0");
  await expect(carril).toHaveAttribute("aria-label", /agarre/i);
});

test("un cero MEDIDO se publica aunque su tramo no se dibuje", async ({ page }) => {
  // 3821: O'Malley no llegó a sujetar ni un segundo. El tramo azul tiene
  // anchura cero y NO se pinta —con su separador de 2 px se vería como un tramo
  // de verdad— pero la cifra sigue ahí, porque ese cero es un dato medido.
  // Son 167 combates de 8.612.
  await abrirFicha(page, 3821);

  const panel = bloque(page);
  await expect(panel).toBeVisible();
  await expect(panel).toContainText("0 % (0:00)");
  // El 100 % legítimo: se publica porque el otro estuvo a cero MEDIDO.
  await expect(panel).toContainText("se llevó el 100 %");
});

test("🪤 la barra no puede afirmar CERO donde el texto publica «<1 %»", async ({
  page,
}) => {
  // HISTORIA DE DOS VERIFICADORES CIEGOS, y los dos los escribí yo el mismo día.
  //
  // El fallo original: los separadores iban en un overlay absoluto de 2 px
  // centrado en la frontera y se pintaban ENCIMA de los rellenos, tapando 1 px
  // del tramo de cada lado. 284 tramos con segundos medidos desaparecían.
  //
  // 1er verificador — `getBoundingClientRect().width > 0`. Inútil: la caja mide
  // 0,33 px con el fallo puesto y con él quitado. Habría dado verde siempre.
  //
  // 2º verificador — `document.elementFromPoint` en el centro del tramo. Cazó
  // el overlay, y por eso pasó el control negativo… pero SIGUE DANDO VERDE
  // sobre la ficha que falla, porque el árbol de cajas existe aunque Chrome no
  // pinte un solo píxel: una caja de 0,33 px se redondea a cero al pintar.
  // La revisión de después de desplegar lo midió: 111 fichas a 375 px con un
  // tramo de segundos medidos y CERO píxeles de color.
  //
  // Este mide los PÍXELES. Captura la barra y cuenta cuántos hay de cada color.
  // Es el único instrumento que no se puede engañar con geometría.
  await page.setViewportSize({ width: 375, height: 812 });
  await abrirFicha(page, 3211);

  const panel = bloque(page);
  await expect(panel).toBeVisible();
  await expect(panel).toContainText("<1 % (0:01)");

  const barra = panel.getByTestId("grip-bar").first();
  await barra.scrollIntoViewIfNeeded();

  const colores = await barra.evaluate((el) =>
    ([...el.children] as HTMLElement[])
      .filter((h) => /bg-corner-|bg-grip-nobody/.test(h.className))
      .map((h) => getComputedStyle(h).backgroundColor),
  );
  expect(colores).toHaveLength(3);

  const png = await barra.screenshot();
  const pintados = await page.evaluate(async ({ datos, colores }) => {
    const blob = new Blob([new Uint8Array(datos)], { type: "image/png" });
    const bitmap = await createImageBitmap(blob);
    const lienzo = document.createElement("canvas");
    lienzo.width = bitmap.width;
    lienzo.height = bitmap.height;
    const ctx = lienzo.getContext("2d")!;
    ctx.drawImage(bitmap, 0, 0);
    const fila = ctx.getImageData(0, Math.floor(bitmap.height / 2), bitmap.width, 1).data;

    const aRgb = (css: string) => (css.match(/\d+/g) ?? []).slice(0, 3).map(Number);
    return colores.map((css) => {
      const [r, g, b] = aRgb(css);
      let n = 0;
      for (let i = 0; i < fila.length; i += 4) {
        // Margen de 12 por el antialiasing de los bordes redondeados.
        if (Math.abs(fila[i] - r) <= 12 && Math.abs(fila[i + 1] - g) <= 12 && Math.abs(fila[i + 2] - b) <= 12) {
          n += 1;
        }
      }
      return n;
    });
  }, { datos: [...png], colores });

  // 3211: Topuria 140 s, nadie 759 s, Almakhan 1 SEGUNDO de 900. Los tres
  // publican su cifra, así que los tres tienen que existir en la imagen.
  for (const [i, n] of pintados.entries()) {
    expect(
      n,
      `el tramo ${colores[i]} no pinta NI UN PIXEL, y su cifra se publica igual`,
    ).toBeGreaterThan(0);
  }
});

test("a 375 px la ficha entera no desborda, con el desplegable abierto", async ({
  page,
}) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await abrirFicha(page, 14232);
  await bloque(page).locator("summary").click();
  await page.waitForTimeout(300);
  await expectNoHorizontalOverflow(page, "/fights/14232 a 375 px con el desplegable abierto");
});
