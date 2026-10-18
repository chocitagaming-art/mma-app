import { readFileSync } from "node:fs";
import path from "node:path";

import { expect, test as base, type Browser, type Page } from "@playwright/test";

import { esperarHidratacion, expectNoHorizontalOverflow } from "./helpers";

// ── /fighters: la cuadrícula de tarjetas (rediseño del 17-oct-2026) ─────────
//
// El dueño validó en un prototipo en vivo (docs: ARCHIVO/planes/
// rediseno-2026-10-17, apartado 4) cambiar la tabla de escritorio y la ficha
// larga del móvil por tarjetas con la foto recortada en relieve. Aquí se vigila
// lo que él vio:
//   · 2 columnas en el móvil, 3 desde 640 px y 4 desde 1024 (12 = 4×3).
//   · La tarjeta ENTERA es UN enlace a /fighters/<id>, con el nombre como
//     nombre accesible y sin enlaces anidados.
//   · En el móvil solo el buscador a la vista: los cuatro desplegables detrás de
//     «Filtros y orden», con aria-expanded de verdad.
//   · «Mostrando 12 de 2.892», no «of 2892».
//   · Sin desbordamiento horizontal de 360 a 1920, y las fotos dentro de su
//     tarjeta, apoyadas en la línea.
//   · Al pasar el ratón Y con el foco del teclado, la barra roja y la foto que
//     crece; sin transición con prefers-reduced-motion.
//
// Corre en Chromium Y en WebKit (el dueño mira en un iPhone). Un solo proyecto
// (escritorio-light): cada test recorre sus tamaños, y la geometría no depende
// del tema (el desbordamiento sí se mira en los dos).
//
// 🪤 Las fotos externas se sirven ENLATADAS con su proporción real: las de
// ufc.com miden 256×160 (event_results_athlete_headshot, medido el 18-oct) y
// las de ESPN 600×436 (≈ careo-headshot.png, 350×254). Con un PNG cuadrado la
// prueba de «la foto no se sale» no vería el caso que importa: la foto ancha de
// ufc.com en una tarjeta estrecha de móvil.
//
// 🪤 Las tarjetas entran con animate-rise (translateY escalonado): medir antes
// de que acabe compara tarjetas a alturas distintas. esperarTarjetas() espera.

type Motor = "chromium" | "webkit";

const FIXTURES = path.join(__dirname, "fixtures");
const FOTO_UFC = readFileSync(path.join(FIXTURES, "luchadores-headshot-256x160.png"));
const FOTO_ESPN = readFileSync(path.join(FIXTURES, "careo-headshot.png"));

const ANCHOS = [360, 390, 768, 1024, 1280, 1920];

const DESPLEGABLES = ["#filter-weight-class", "#filter-nationality", "#filter-stance", "#filter-sort"];

const test = base.extend<{ motor: Motor; pagina: Page }, { abrirWebkit: () => Promise<Browser> }>({
  motor: ["chromium", { option: true }],
  // WebKit se lanza a mano, una vez por worker: los proyectos del config son Chromium.
  abrirWebkit: [
    async ({ playwright }, ofrecer) => {
      const lanzado: { webkit: Browser | null } = { webkit: null };
      await ofrecer(async () => {
        lanzado.webkit ??= await playwright.webkit.launch().catch((error: unknown) => {
          throw new Error(
            `No arranca WebKit: instálalo con «npx playwright install webkit». (${String(error)})`,
          );
        });
        return lanzado.webkit;
      });
      await lanzado.webkit?.close();
    },
    { scope: "worker" },
  ],
  // Contexto nuevo por test y SIN service worker: el de la PWA sirve el CSS viejo.
  pagina: async ({ motor, browser, abrirWebkit, baseURL }, ofrecer) => {
    const navegador = motor === "webkit" ? await abrirWebkit() : browser;
    const contexto = await navegador.newContext({
      baseURL,
      colorScheme: "light",
      viewport: { width: 1280, height: 900 },
      serviceWorkers: "block",
    });
    const page = await contexto.newPage();
    await page.route("**/*", (route) => {
      const peticion = route.request();
      const url = peticion.url();
      if (url.startsWith(baseURL ?? "http://localhost")) return route.continue();
      if (peticion.resourceType() !== "image") return route.abort();
      return route.fulfill({
        status: 200,
        contentType: "image/png",
        body: url.includes("espncdn.com") ? FOTO_ESPN : FOTO_UFC,
      });
    });
    // Registradas DESPUÉS del comodín, estas ganan.
    await page.route("**/api/live/now", (route) =>
      route.fulfill({ status: 200, json: { phase: "none" } }),
    );
    await page.route("**/api/fighters/search*", (route) => route.abort());
    await ofrecer(page);
    await contexto.close();
  },
});

test.beforeEach(({}, testInfo) => {
  test.skip(
    testInfo.project.name !== "escritorio-light",
    "cada test recorre sus tamaños y motores: basta un proyecto",
  );
});

// Los enlaces a fichas que hay en el contenido (la cabecera y el pie enlazan a
// /fighters, nunca a /fighters/<id>; el buscador sugiere con <button>).
const TARJETAS = 'main a[href^="/fighters/"]';

async function esperarTarjetas(pagina: Page) {
  await expect(pagina.locator(TARJETAS).first()).toBeVisible();
  // Hasta que acabe la entrada escalonada (rise-in) de todas las tarjetas.
  await expect
    .poll(() =>
      pagina.evaluate(() =>
        document
          .getAnimations()
          .filter((a) => (a as CSSAnimation).animationName === "rise-in")
          .every((a) => a.playState === "finished"),
      ),
    )
    .toBe(true);
}

async function abrir(pagina: Page, ruta: string, ancho: number, alto = 900) {
  await pagina.setViewportSize({ width: ancho, height: alto });
  await pagina.goto(ruta);
  await esperarTarjetas(pagina);
}

for (const motor of ["chromium", "webkit"] as const) {
  test.describe(motor, () => {
    test.use({ motor });

    test("la cuadrícula tiene 2 columnas a 390, 3 a 768 y 4 a 1280", async ({ pagina }) => {
      await abrir(pagina, "/fighters", 390);
      for (const [ancho, columnas] of [
        [390, 2],
        [768, 3],
        [1280, 4],
      ] as const) {
        await pagina.setViewportSize({ width: ancho, height: 900 });
        const medida = await pagina.evaluate((selector) => {
          const tarjetas = [...document.querySelectorAll<HTMLElement>(selector)];
          const arriba = tarjetas[0]?.getBoundingClientRect().top ?? NaN;
          const enFila = tarjetas.filter(
            (t) => Math.abs(t.getBoundingClientRect().top - arriba) < 1,
          ).length;
          const rejilla = tarjetas[0]?.parentElement;
          const pistas = rejilla
            ? getComputedStyle(rejilla).gridTemplateColumns.split(" ").filter(Boolean).length
            : 0;
          return { total: tarjetas.length, enFila, pistas };
        }, TARJETAS);
        expect(medida.total, `[${motor}] ${ancho} px: una página son 12 tarjetas`).toBe(12);
        expect(medida.pistas, `[${motor}] ${ancho} px: columnas de la rejilla`).toBe(columnas);
        expect(medida.enFila, `[${motor}] ${ancho} px: tarjetas en la primera fila`).toBe(
          columnas,
        );
      }
    });

    test("cada tarjeta es UN enlace a /fighters/<id> con el nombre como nombre accesible", async ({
      pagina,
    }) => {
      await abrir(pagina, "/fighters", 1280);
      const tarjetas = pagina.locator(TARJETAS);
      await expect(tarjetas).toHaveCount(12);

      const datos = await tarjetas.evaluateAll((enlaces) =>
        enlaces.map((a) => ({
          href: a.getAttribute("href"),
          anidados: a.querySelectorAll("a").length,
          dentroDeOtro: a.parentElement?.closest("a") !== null,
          // Lo que nombra al enlace: aria-labelledby → el texto de ese nodo.
          nombre: (a.getAttribute("aria-labelledby") ?? "")
            .split(/\s+/)
            .map((id) => document.getElementById(id)?.textContent?.trim() ?? "")
            .join(" ")
            .trim(),
          // La tarjeta entera es el enlace: la foto y el récord van dentro.
          conFoto: a.querySelector("img") !== null,
          conRecord: /\d+-\d+-\d+/.test(a.textContent ?? ""),
        })),
      );
      const hrefs = new Set<string>();
      for (const [i, d] of datos.entries()) {
        expect(d.href, `tarjeta ${i}`).toMatch(/^\/fighters\/\d+$/);
        expect(d.anidados, `tarjeta ${i}: enlaces anidados`).toBe(0);
        expect(d.dentroDeOtro, `tarjeta ${i}: está dentro de otro enlace`).toBe(false);
        expect(d.nombre.length, `tarjeta ${i}: sin nombre accesible`).toBeGreaterThan(0);
        expect(d.conFoto, `tarjeta ${i}: la foto no está dentro del enlace`).toBe(true);
        expect(d.conRecord, `tarjeta ${i}: el récord no está dentro del enlace`).toBe(true);
        hrefs.add(d.href!);
      }
      expect(hrefs.size, "dos tarjetas apuntan al mismo luchador").toBe(12);

      // El nombre accesible que calcula el navegador es SOLO el nombre (no el
      // récord ni el apodo pegados): se busca el enlace por su nombre exacto.
      const primero = datos[0]!;
      const enlace = pagina.getByRole("link", { name: primero.nombre, exact: true });
      await expect(enlace).toHaveCount(1);
      await expect(enlace).toHaveAttribute("href", primero.href!);
    });

    test("en el móvil los desplegables esperan detrás de «Filtros y orden»", async ({ pagina }) => {
      await abrir(pagina, "/fighters", 390);
      await esperarHidratacion(pagina);

      const boton = pagina.getByRole("button", { name: /Filtros y orden/ });
      await expect(boton).toBeVisible();
      await expect(boton).toHaveAttribute("aria-expanded", "false");
      await expect(boton).toContainText("Peso, país, guardia");
      const alto = (await boton.boundingBox())!.height;
      expect(Math.round(alto), "el botón mide 44 px de alto (diana táctil)").toBe(44);

      const controla = await boton.getAttribute("aria-controls");
      expect(controla, "el botón dice qué despliega").toBeTruthy();
      const panel = pagina.locator(`#${controla}`);
      for (const desplegable of DESPLEGABLES) {
        await expect(panel.locator(desplegable), `${desplegable} dentro del panel`).toHaveCount(1);
        await expect(pagina.locator(desplegable), `${desplegable} oculto`).toBeHidden();
      }
      await expect(pagina.getByRole("textbox", { name: "Buscar por nombre del luchador" })).toBeVisible();

      await boton.click();
      await expect(boton).toHaveAttribute("aria-expanded", "true");
      for (const desplegable of DESPLEGABLES) {
        await expect(pagina.locator(desplegable), `${desplegable} visible`).toBeVisible();
      }

      await boton.click();
      await expect(boton).toHaveAttribute("aria-expanded", "false");
      for (const desplegable of DESPLEGABLES) {
        await expect(pagina.locator(desplegable), `${desplegable} oculto otra vez`).toBeHidden();
      }
    });

    test("con filtros activos el botón del móvil dice cuántos, y en escritorio no existe", async ({
      pagina,
    }) => {
      await abrir(pagina, "/fighters?stance=Southpaw&sort=wins", 390);
      const boton = pagina.getByRole("button", { name: /Filtros y orden/ });
      await expect(boton).toContainText("2 activos");
      // Cerrado al cargar: las tarjetas quedan arriba.
      await expect(boton).toHaveAttribute("aria-expanded", "false");
      await expect(pagina.locator("#filter-stance")).toBeHidden();

      await pagina.setViewportSize({ width: 1280, height: 900 });
      await expect(boton).toBeHidden();
      for (const desplegable of DESPLEGABLES) {
        await expect(pagina.locator(desplegable), `${desplegable} en escritorio`).toBeVisible();
      }
    });

    test("el resumen dice «de» con punto de millares, no «of»", async ({ pagina }) => {
      await abrir(pagina, "/fighters", 1280);
      const resumen = pagina.locator("main p", { hasText: /^Mostrando/ });
      await expect(resumen).toHaveCount(1);
      const texto = ((await resumen.textContent()) ?? "").replace(/\s+/g, " ").trim();
      expect(texto).not.toMatch(/\bof\b/);
      // La plantilla pasa de 1.000 luchadores: el total lleva su punto.
      expect(texto).toMatch(/^Mostrando 12 de \d{1,3}(\.\d{3})+ luchadores$/);
    });

    test("sin desbordamiento horizontal de 360 a 1920, en claro y en oscuro", async ({ pagina }) => {
      await abrir(pagina, "/fighters", 360);
      for (const tema of ["light", "dark"] as const) {
        await pagina.emulateMedia({ colorScheme: tema });
        for (const ancho of ANCHOS) {
          await pagina.setViewportSize({ width: ancho, height: 900 });
          await expectNoHorizontalOverflow(pagina, `[${motor}] /fighters a ${ancho} px (${tema})`);
        }
      }
    });

    test("las fotos se apoyan en su línea y no se salen de la tarjeta", async ({ pagina }) => {
      // Ventana muy alta: las fotos van en lazy y tienen que cargar TODAS.
      await abrir(pagina, "/fighters", 360, 4000);
      for (const ancho of ANCHOS) {
        await pagina.setViewportSize({ width: ancho, height: 4000 });
        await expect
          .poll(() =>
            pagina.evaluate((selector) =>
              [...document.querySelectorAll<HTMLImageElement>(`${selector} [data-testid="roster-card-photo"] img`)].every(
                (img) => img.complete && img.naturalWidth > 0,
              ),
            TARJETAS),
          )
          .toBe(true);

        const medidas = await pagina.evaluate((selector) => {
          return [...document.querySelectorAll<HTMLElement>(selector)].map((tarjeta) => {
            const zona = tarjeta.querySelector<HTMLElement>('[data-testid="roster-card-photo"]');
            const img = zona?.querySelector("img");
            if (!zona || !img) return null;
            const t = tarjeta.getBoundingClientRect();
            const z = zona.getBoundingClientRect();
            const caja = img.getBoundingClientRect();
            // Lo PINTADO, con object-fit: contain y object-position: bottom.
            const escala = Math.min(caja.width / img.naturalWidth, caja.height / img.naturalHeight);
            const ancho = img.naturalWidth * escala;
            const alto = img.naturalHeight * escala;
            const izquierda = caja.left + (caja.width - ancho) / 2;
            const zonaBorde = parseFloat(getComputedStyle(zona).borderBottomWidth) || 0;
            return {
              recorta: getComputedStyle(tarjeta).overflow,
              ajuste: getComputedStyle(img).objectFit,
              tarjetaIzq: t.left,
              tarjetaDer: t.right,
              tarjetaAncho: t.width,
              zonaArriba: z.top,
              linea: z.bottom - zonaBorde,
              zonaAlto: z.height - zonaBorde,
              pintadoArriba: caja.bottom - alto,
              pintadoAbajo: caja.bottom,
              pintadoIzq: izquierda,
              pintadoDer: izquierda + ancho,
            };
          });
        }, TARJETAS);

        expect(medidas.length, `${ancho} px: tarjetas`).toBe(12);
        for (const [i, m] of medidas.entries()) {
          const donde = `[${motor}] ${ancho} px, tarjeta ${i}`;
          expect(m, `${donde}: sin zona de foto o sin <img>`).not.toBeNull();
          const d = m!;
          expect(d.ajuste, `${donde}: la foto se encaja entera`).toBe("contain");
          // La tarjeta recorta: nada de la foto (ni al crecer un 7 %) pinta fuera.
          expect(["hidden", "clip"], `${donde}: la tarjeta no recorta`).toContain(d.recorta);
          // Apoyada en la línea y dentro de la zona de foto.
          expect(Math.abs(d.pintadoAbajo - d.linea), `${donde}: la foto no pisa la línea`).toBeLessThanOrEqual(1);
          expect(d.pintadoArriba, `${donde}: la foto se sale por arriba`).toBeGreaterThanOrEqual(d.zonaArriba - 1);
          // A lo ancho, como mucho el 6 % por lado que se validó (la caja es el
          // 112 % de la tarjeta: la foto ancha de ufc.com llena la tarjeta del móvil).
          const margen = d.tarjetaAncho * 0.06 + 1;
          expect(d.pintadoIzq, `${donde}: la foto se va por la izquierda`).toBeGreaterThanOrEqual(d.tarjetaIzq - margen);
          expect(d.pintadoDer, `${donde}: la foto se va por la derecha`).toBeLessThanOrEqual(d.tarjetaDer + margen);
        }
      }
    });

    test("al pasar el ratón y con el foco del teclado, barra roja y foto que crece", async ({
      pagina,
    }) => {
      await abrir(pagina, "/fighters", 1280);
      const tarjeta = pagina.locator(TARJETAS).first();
      const estado = () =>
        tarjeta.evaluate((a) => {
          const barra = getComputedStyle(a, "::after").transform;
          const foto = a.querySelector<HTMLElement>('[data-testid="roster-card-photo"] > div');
          return {
            barra,
            foto: foto ? getComputedStyle(foto).transform : "sin caja",
            borde: getComputedStyle(a).borderTopColor,
          };
        });
      const reposo = await estado();
      // scaleX(0) → matrix(0, 0, 0, 1, 0, 0).
      expect(reposo.barra).toMatch(/^matrix\(0, 0, 0, 1/);
      expect(reposo.foto).toBe("none");

      await tarjeta.hover();
      await expect.poll(async () => (await estado()).barra).toBe("matrix(1, 0, 0, 1, 0, 0)");
      await expect.poll(async () => (await estado()).foto).toMatch(/^matrix\(1\.07, 0, 0, 1\.07/);
      expect((await estado()).borde, "el borde no cambia al pasar el ratón").not.toBe(reposo.borde);

      // Ratón fuera, y la misma tarjeta con el TECLADO (:focus-visible).
      await pagina.mouse.move(1, 1);
      await expect.poll(async () => (await estado()).barra).toMatch(/^matrix\(0, 0, 0, 1/);
      // 🪤 Con Tab no vale en los dos motores: WebKit (como Safari) se salta los
      // enlaces al tabular. Un foco puesto justo después de usar el TECLADO sí
      // enciende :focus-visible en los dos (la heurística mira la última
      // interacción), y eso es lo que se comprueba abajo, no solo :focus.
      await pagina.keyboard.press("Shift");
      await tarjeta.focus();
      await expect(tarjeta).toBeFocused();
      expect(await tarjeta.evaluate((a) => a.matches(":focus-visible")), "sin :focus-visible").toBe(true);
      await expect.poll(async () => (await estado()).barra).toBe("matrix(1, 0, 0, 1, 0, 0)");
      await expect.poll(async () => (await estado()).foto).toMatch(/^matrix\(1\.07, 0, 0, 1\.07/);
    });

    test("con prefers-reduced-motion la foto y la barra no se animan", async ({ pagina }) => {
      await pagina.emulateMedia({ reducedMotion: "reduce" });
      await abrir(pagina, "/fighters", 1280);
      const duraciones = await pagina.locator(TARJETAS).first().evaluate((a) => {
        const foto = a.querySelector<HTMLElement>('[data-testid="roster-card-photo"] > div');
        const img = foto?.querySelector("img");
        const segundos = (valor: string) =>
          Math.max(...valor.split(",").map((v) => (v.trim().endsWith("ms") ? parseFloat(v) / 1000 : parseFloat(v))));
        return {
          barra: segundos(getComputedStyle(a, "::after").transitionDuration),
          foto: foto ? segundos(getComputedStyle(foto).transitionDuration) : -1,
          brillo: img ? segundos(getComputedStyle(img).transitionDuration) : -1,
          borde: segundos(getComputedStyle(a).transitionDuration),
        };
      });
      for (const [que, s] of Object.entries(duraciones)) {
        expect(s, `${que}: transición con reduced-motion`).toBeGreaterThanOrEqual(0);
        expect(s, `${que}: transición con reduced-motion`).toBeLessThanOrEqual(0.001);
      }
    });
  });
}
