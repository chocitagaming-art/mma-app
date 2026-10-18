import { readFileSync } from "node:fs";
import path from "node:path";

import { expect, test as base, type Browser, type Page } from "@playwright/test";

import { esperarHidratacion } from "./helpers";

// ── Salón HD: las caras del Salón de la Fama, nítidas como las de R5 ───────
//
// Aprobado por el dueño el 18-oct-2026. El Salón pinta sus fotos con HofPhoto
// (src/components/hof-photo.tsx), que no recibió la mejora de R5: a 390@3x
// las caras se veían a 0,5 de nitidez. Lo que se vigila aquí:
//   · Las caras de ufc.com del estilo event_results (256×160) piden el
//     original (500) con srcset en un móvil 3x… y un móvil 1x sigue con la
//     de 256.
//   · Los retratos 16:9 del Salón (estilo 382x217_2, 764×434) piden su
//     original (2000×1125) SOLO solos: la tarjeta grande de la «Clase» y el
//     modal. En la rejilla, nunca (9 a la vez dispararían el peso).
//   · En el modal de una pelea, las caras de las esquinas también.
//   · 🪤 La reserva EN CADENA: si el original falla, vuelve la foto guardada,
//     NO la silueta (antes, un fallo saltaba directo a la silueta).
//   · El modo (relieve o marco, data-photo) y el encuadre NO cambian: los
//     decide la URL GUARDADA.
//
// Imágenes externas ENLATADAS con su medida real; el original se reconoce por
// la URL (un /images/ de ufc.com SIN /styles/), y si es .jpg es un retrato.
// Chromium Y WebKit; un solo proyecto (escritorio-light): cada test fija su
// pantalla y su densidad.

type Motor = "chromium" | "webkit";
type Pantalla = { width: number; height: number; dpr: number };
type Opciones = {
  originalRoto?: boolean;
  // Retiene los originales hasta que se resuelve: el fallo llega DESPUÉS de
  // hidratar (el camino del onError, no el de la ref).
  soltarOriginal?: Promise<void>;
};
type Abrir = (pantalla: Pantalla, opciones?: Opciones) => Promise<Page>;

const FIXTURES = path.join(__dirname, "fixtures");
const CARA_GUARDADA = readFileSync(path.join(FIXTURES, "luchadores-headshot-256x160.png"));
const CARA_ORIGINAL = readFileSync(path.join(FIXTURES, "headshot-hd-500x325.png"));
const RETRATO_GUARDADO = readFileSync(path.join(FIXTURES, "retrato-salon-764x434.png"));
const RETRATO_ORIGINAL = readFileSync(path.join(FIXTURES, "retrato-salon-hd-2000x1125.png"));
const FOTO_ESPN = readFileSync(path.join(FIXTURES, "careo-headshot.png"));

const ORIGINAL = /^https:\/\/www\.ufc\.com\/images\/(?!styles\/)(\d{4}-\d{2}|image)\//;
const CARA = /\/images\/styles\/event_results_athlete_headshot\//;
const RETRATO = /\/images\/styles\/382x217_2\//;

const test = base.extend<
  { motor: Motor; abrir: Abrir; pedidas: { original: string[]; rotas: string[] } },
  { abrirWebkit: () => Promise<Browser> }
>({
  motor: ["chromium", { option: true }],
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
  pedidas: async ({}, ofrecer) => {
    await ofrecer({ original: [], rotas: [] });
  },
  abrir: async ({ motor, browser, abrirWebkit, baseURL, pedidas }, ofrecer) => {
    const navegador = motor === "webkit" ? await abrirWebkit() : browser;
    const contextos: { close: () => Promise<void> }[] = [];
    await ofrecer(async (pantalla, opciones = {}) => {
      // Sin service worker (sirve el CSS viejo) y sin caché compartida.
      const contexto = await navegador.newContext({
        baseURL,
        colorScheme: "dark",
        viewport: { width: pantalla.width, height: pantalla.height },
        deviceScaleFactor: pantalla.dpr,
        serviceWorkers: "block",
        // Sin el zoom del hover: el encuadre se compara quieto.
        reducedMotion: "reduce",
      });
      contextos.push(contexto);
      const page = await contexto.newPage();
      await page.route("**/*", async (route) => {
        const peticion = route.request();
        const url = peticion.url();
        if (url.startsWith(baseURL ?? "http://localhost")) return route.continue();
        if (peticion.resourceType() !== "image") return route.abort();
        if (ORIGINAL.test(url)) {
          pedidas.original.push(url);
          if (opciones.soltarOriginal) await opciones.soltarOriginal;
          if (opciones.originalRoto) {
            pedidas.rotas.push(url);
            return route.fulfill({ status: 404, contentType: "text/plain", body: "" });
          }
          const retrato = /\.jpe?g$/i.test(new URL(url).pathname);
          return route.fulfill({
            status: 200,
            contentType: "image/png",
            body: retrato ? RETRATO_ORIGINAL : CARA_ORIGINAL,
          });
        }
        return route.fulfill({
          status: 200,
          contentType: "image/png",
          body: RETRATO.test(url) ? RETRATO_GUARDADO : CARA.test(url) ? CARA_GUARDADA : FOTO_ESPN,
        });
      });
      await page.route("**/api/live/now", (route) =>
        route.fulfill({ status: 200, json: { phase: "none" } }),
      );
      return page;
    });
    for (const contexto of contextos) await contexto.close();
  },
});

test.beforeEach(({}, testInfo) => {
  test.skip(
    testInfo.project.name !== "escritorio-light",
    "cada test fija su pantalla y recorre los dos motores: basta un proyecto",
  );
});

type Foto = {
  clave: string; // tarjeta o pelea + alt: identifica la foto entre pasadas
  modo: string | null; // data-photo de su tarjeta o esquina
  src: string;
  srcset: string | null;
  actual: string;
  ancho: number; // ancho REAL del fichero bajado
  alt: string;
  // El encuadre, COMPUTADO (el atributo style se escribe distinto en el HTML
  // del servidor y en el <img> que pone React al caer a la guardada).
  estilo: string;
};

// Las fotos de una zona, cuando TODAS han cargado. 🪤 Con srcset,
// naturalWidth es el ancho entre la densidad: el real se lee abriendo
// currentSrc en una imagen aparte. 🪤 WebKit cambia de candidato unos ms
// después: se mide dentro de expect.poll hasta que todo es un número.
async function fotos(pagina: Page, selector: string): Promise<Foto[]> {
  await expect(pagina.locator(selector).first()).toBeAttached();
  await pagina.evaluate(async () => {
    for (let y = 0; y < document.body.scrollHeight; y += 300) {
      window.scrollTo(0, y);
      await new Promise((r) => setTimeout(r, 50));
    }
    window.scrollTo(0, 0);
  });
  let medidas: Foto[] = [];
  await expect
    .poll(async () => {
      medidas = await pagina.evaluate(async (sel) => {
        const lista = [...document.querySelectorAll<HTMLImageElement>(sel)];
        if (!lista.every((img) => img.complete && img.naturalWidth > 0)) return [];
        return Promise.all(
          lista.map(async (img) => {
            const sonda = new Image();
            sonda.src = img.currentSrc;
            await sonda.decode().catch(() => undefined);
            const duena = img.closest("[data-photo]");
            const tarjeta = img.closest("[data-hof-card], [data-hof-fight], [role=dialog]");
            return {
              clave: `${tarjeta?.getAttribute("data-hof-card") ?? tarjeta?.getAttribute("data-hof-fight") ?? "modal"} · ${img.alt}`,
              modo: duena?.getAttribute("data-photo") ?? null,
              src: img.getAttribute("src") ?? "",
              srcset: img.getAttribute("srcset"),
              actual: img.currentSrc,
              ancho: sonda.naturalWidth,
              alt: img.alt,
              estilo: (() => {
                const cs = getComputedStyle(img);
                const zoom = cs.getPropertyValue("--hof-zoom").trim() || "-";
                return `${cs.objectFit} | ${cs.objectPosition} | ${cs.transformOrigin} | zoom ${zoom}`;
              })(),
            };
          }),
        );
      }, selector);
      return medidas.length > 0 && medidas.every((f) => f.ancho > 0);
    })
    .toBe(true);
  return medidas;
}

async function abrirSalon(pagina: Page, opciones: { esperarCarga?: boolean } = {}) {
  await pagina.goto("/salon-de-la-fama", {
    waitUntil: opciones.esperarCarga === false ? "domcontentloaded" : "load",
  });
  await esperarHidratacion(pagina);
  await expect(pagina.getByRole("tab")).toHaveCount(4);
}

async function pestana(pagina: Page, nombre: RegExp) {
  await pagina.getByRole("tab", { name: nombre }).click();
  await expect(pagina.getByRole("tab", { name: nombre })).toHaveAttribute("aria-selected", "true");
}

const FOTOS_PANEL = "[role=tabpanel] .hof-photo img";
const FOTOS_CLASE = "[data-hof-latest-class] .hof-photo img";

// El modo y el encuadre de cada foto, para comparar dos pasadas.
const huella = (lista: Foto[]) =>
  Object.fromEntries(lista.map((f) => [f.clave, `${f.modo} | ${f.src} | ${f.estilo}`]));

for (const motor of ["chromium", "webkit"] as const) {
  test.describe(motor, () => {
    test.use({ motor });

    test("a 390@3x las caras del Salón piden el original; a 1x siguen con la de 256; el modo no cambia", async ({
      abrir,
    }) => {
      const retina = await abrir({ width: 390, height: 844, dpr: 3 });
      await abrirSalon(retina);
      await pestana(retina, /Ala Moderna/);
      const en3x = await fotos(retina, FOTOS_PANEL);
      const caras3x = en3x.filter((f) => CARA.test(f.src));
      expect(caras3x.length, `[${motor}] el Ala Moderna tiene caras de ufc.com event_results`).toBeGreaterThan(0);
      for (const cara of caras3x) {
        expect(cara.srcset, `[${motor}] ${cara.alt}: srcset guardada + original`).toMatch(
          / 256w, https:\/\/www\.ufc\.com\/images\/.+ 500w$/,
        );
        expect(cara.actual, `[${motor}] ${cara.alt} a 3x: baja el original`).toMatch(ORIGINAL);
        expect(cara.ancho, `[${motor}] ${cara.alt} a 3x: ancho del fichero`).toBeGreaterThanOrEqual(500);
      }

      // El Ala de Combate: las esquinas del cartel, igual.
      await pestana(retina, /Ala de Combate/);
      const esquinas = (await fotos(retina, FOTOS_PANEL)).filter((f) => CARA.test(f.src));
      expect(esquinas.length, `[${motor}] esquinas con cara event_results`).toBeGreaterThan(0);
      for (const cara of esquinas) {
        expect(cara.actual, `[${motor}] esquina ${cara.alt} a 3x`).toMatch(ORIGINAL);
      }

      const normal = await abrir({ width: 390, height: 844, dpr: 1 });
      await abrirSalon(normal);
      await pestana(normal, /Ala Moderna/);
      const en1x = await fotos(normal, FOTOS_PANEL);
      for (const cara of en1x.filter((f) => CARA.test(f.src))) {
        expect(cara.actual, `[${motor}] ${cara.alt} a 1x: sigue con la de 256`).toMatch(CARA);
        expect(cara.ancho, `[${motor}] ${cara.alt} a 1x`).toBe(256);
      }
      // Relieve o marco y encuadre: idénticos a 1x y a 3x.
      expect(huella(en3x), `[${motor}] el modo y el encuadre no dependen de la densidad`).toEqual(
        huella(en1x),
      );
    });

    test("los retratos 16:9: original solos (Clase y modal), la de 764 en la rejilla", async ({
      abrir,
      pedidas,
    }) => {
      const retina = await abrir({ width: 390, height: 844, dpr: 3 });
      await abrirSalon(retina);
      const clase = (await fotos(retina, FOTOS_CLASE)).filter((f) => RETRATO.test(f.src));
      expect(clase.length, `[${motor}] la «Clase» tiene un retrato 382x217_2 (Gerbasi, 2026)`).toBeGreaterThan(0);
      for (const retrato of clase) {
        expect(retrato.modo, `[${motor}] ${retrato.alt}: enmarcado`).toBe("framed");
        expect(retrato.srcset, `[${motor}] ${retrato.alt}: srcset`).toMatch(/ 764w, https:\/\/www\.ufc\.com\/images\/.+ 1439w$/);
        expect(retrato.actual, `[${motor}] ${retrato.alt} en la Clase a 3x`).toMatch(ORIGINAL);
        expect(retrato.ancho, `[${motor}] ${retrato.alt}`).toBe(2000);
        expect(retrato.estilo, `[${motor}] ${retrato.alt}: su zoom`).toMatch(/zoom 1\.7$/);
      }

      // La rejilla del Ala Contribuidora: los 9 retratos, SIN srcset.
      const antes = pedidas.original.length;
      await pestana(retina, /Ala Contribuidora/);
      const rejilla = (await fotos(retina, FOTOS_PANEL)).filter((f) => RETRATO.test(f.src));
      expect(rejilla.length, `[${motor}] retratos en la rejilla`).toBeGreaterThan(0);
      for (const retrato of rejilla) {
        expect(retrato.srcset, `[${motor}] ${retrato.alt} en la rejilla: sin srcset`).toBeNull();
        expect(retrato.ancho, `[${motor}] ${retrato.alt} en la rejilla`).toBe(764);
      }
      expect(
        pedidas.original.slice(antes).filter((u) => !clase.some((c) => c.actual === u)),
        `[${motor}] la rejilla no pide ningún original nuevo`,
      ).toEqual([]);

      // El modal del retrato: el original, en su marco 16:9.
      await retina.locator("[role=tabpanel] [data-hof-card]").filter({ has: retina.locator(`img[src*="382x217_2"]`) }).first().click();
      await expect(retina.getByRole("dialog")).toBeVisible();
      const [modal] = await fotos(retina, "[role=dialog] .hof-photo img");
      expect(modal.src, `[${motor}] el modal pinta el retrato guardado`).toMatch(RETRATO);
      expect(modal.actual, `[${motor}] el modal a 3x baja el original`).toMatch(ORIGINAL);
      expect(modal.ancho, `[${motor}] el modal`).toBe(2000);

      // A 1x, la Clase y el modal siguen con la de 764.
      const normal = await abrir({ width: 1280, height: 900, dpr: 1 });
      await abrirSalon(normal);
      for (const retrato of (await fotos(normal, FOTOS_CLASE)).filter((f) => RETRATO.test(f.src))) {
        expect(retrato.ancho, `[${motor}] ${retrato.alt} en la Clase a 1x`).toBe(764);
      }
    });

    test("en el modal de una pelea, las caras de las esquinas piden el original a 3x", async ({ abrir }) => {
      const retina = await abrir({ width: 390, height: 844, dpr: 3 });
      await abrirSalon(retina);
      await pestana(retina, /Ala de Combate/);
      const peleas = retina.locator("[role=tabpanel] [data-hof-fight]");
      const total = await peleas.count();
      let probadas = 0;
      for (let i = 0; i < total && probadas === 0; i++) {
        const tieneCara = await peleas
          .nth(i)
          .locator('img[src*="event_results_athlete_headshot"]')
          .count();
        if (!tieneCara) continue;
        await peleas.nth(i).click();
        await expect(retina.getByRole("dialog")).toBeVisible();
        const caras = (await fotos(retina, '[role=dialog] img[alt^="Foto de "]')).filter((f) =>
          CARA.test(f.src),
        );
        for (const cara of caras) {
          expect(cara.actual, `[${motor}] esquina del modal ${cara.alt} a 3x`).toMatch(ORIGINAL);
          expect(cara.ancho, `[${motor}] esquina del modal ${cara.alt}`).toBeGreaterThanOrEqual(500);
          probadas++;
        }
      }
      expect(probadas, `[${motor}] alguna pelea con cara event_results en su modal`).toBeGreaterThan(0);
    });

    test("con el original roto (antes de hidratar): la foto guardada, NUNCA la silueta, y el mismo modo", async ({
      abrir,
      pedidas,
    }) => {
      const sana = await abrir({ width: 390, height: 844, dpr: 3 });
      await abrirSalon(sana);
      const clasesSana = await fotos(sana, FOTOS_CLASE);
      await pestana(sana, /Ala Moderna/);
      const modernaSana = await fotos(sana, FOTOS_PANEL);

      const rota = await abrir({ width: 390, height: 844, dpr: 3 }, { originalRoto: true });
      await abrirSalon(rota);
      const clasesRota = await fotos(rota, FOTOS_CLASE);
      await pestana(rota, /Ala Moderna/);
      const modernaRota = await fotos(rota, FOTOS_PANEL);
      expect(pedidas.rotas.length, `[${motor}] se pidió (y falló) algún original`).toBeGreaterThan(0);

      for (const foto of [...clasesRota, ...modernaRota].filter((f) => CARA.test(f.src) || RETRATO.test(f.src))) {
        expect(foto.alt, `[${motor}] ${foto.clave}: sigue siendo una foto`).toMatch(/^Foto de /);
        expect(foto.actual, `[${motor}] ${foto.clave}: vuelve a la guardada`).toBe(foto.src);
      }
      expect(
        await rota.locator('.hof-photo img[alt^="Silueta de "]').count(),
        `[${motor}] tantas siluetas como sin el fallo`,
      ).toBe(await sana.locator('.hof-photo img[alt^="Silueta de "]').count());
      expect(huella(clasesRota), `[${motor}] la Clase: mismo modo y encuadre`).toEqual(huella(clasesSana));
      expect(huella(modernaRota), `[${motor}] el Ala Moderna: mismo modo y encuadre`).toEqual(
        huella(modernaSana),
      );
    });

    test("con el original roto DESPUÉS de hidratar, también vuelve a la guardada (onError)", async ({
      abrir,
      pedidas,
    }) => {
      const soltar: { ya: () => void } = { ya: () => undefined };
      const soltarOriginal = new Promise<void>((resolver) => {
        soltar.ya = resolver;
      });
      const pagina = await abrir(
        { width: 390, height: 844, dpr: 3 },
        { originalRoto: true, soltarOriginal },
      );
      await abrirSalon(pagina, { esperarCarga: false });
      // La tarjeta grande de la Clase: carga en seguida (eager), con srcset.
      const hd = pagina.locator('[data-hof-latest-class] .hof-photo img[data-headshot-quality="hd"]').first();
      await expect(hd, `[${motor}] la Clase pinta una foto con srcset`).toBeAttached();
      await expect
        .poll(() => pedidas.original.length, { message: `[${motor}] se pidió el original` })
        .toBeGreaterThan(0);
      await expect
        .poll(() => hd.evaluate((img) => Object.keys(img).some((k) => k.startsWith("__reactProps$"))), {
          message: `[${motor}] React ha hidratado el <img>`,
        })
        .toBe(true);
      expect(
        await hd.evaluate((img) => (img as HTMLImageElement).complete),
        `[${motor}] el original sigue sin responder al hidratar (si no, no se prueba el onError)`,
      ).toBe(false);
      const alt = (await hd.getAttribute("alt")) ?? "";

      soltar.ya();
      await expect.poll(() => pedidas.rotas.length, { message: `[${motor}] el original ha fallado` }).toBeGreaterThan(0);
      const despues = await fotos(pagina, FOTOS_CLASE);
      const misma = despues.find((f) => f.alt === alt);
      expect(misma, `[${motor}] ${alt}: sigue siendo una foto, no la silueta`).toBeDefined();
      expect(misma?.actual, `[${motor}] ${alt}: la URL guardada`).toBe(misma?.src);
    });
  });
}
