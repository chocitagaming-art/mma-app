import { readFileSync } from "node:fs";
import path from "node:path";

import { expect, test as base, type Browser, type Page } from "@playwright/test";

import { esperarHidratacion, fakeYouTubeEmbeds } from "./helpers";

// ── Cara a cara: las dos fotos empiezan SIEMPRE a la misma altura ──────────
//
// Lo vio el dueño en su iPhone el 9-oct-2026: en la portada, la foto de una
// esquina más alta que la de la otra. Plan aprobado: alinear por la foto,
// revisar todos los cara a cara y medirlo de 360 a 1920 px, también en
// vertical y con el móvil tumbado, con nombres largos reales.
//
// Dónde hay dos fotos enfrentadas (data-face-off):
//   · home-hero  la portada (up-next-hero.tsx)
//   · fight      /fights/[id] (tale-of-the-tape.tsx)
//   · matchup    /enfrentamiento (matchup-client.tsx + corner-cards.tsx)
//   · y las filas de cartelera (event-bout-row.tsx, data-bout-corner).
//
// 🪤 SE MIDE LO QUE SE VE, NO LA CAJA. La caja de la foto mide lo mismo en las
// dos esquinas aunque lo de dentro empiece 54 px más abajo (un headshot
// centrado) o 80 px (una foto de pie que se encoge en una columna estrecha).
// Por eso data-testid="face-off-photo" marca el <img> o el cuadrado del
// headshot, y del <img> se calcula dónde empieza la imagen PINTADA con su
// object-fit y su object-position a partir de naturalWidth/naturalHeight.
//
// 🪤 Y POR ESO LAS IMÁGENES DE PRUEBA TIENEN LA PROPORCIÓN REAL. Con el PNG de
// 1×1 de maquetacion.spec.ts todas las fotos de pie se encogerían igual y el
// fallo no se vería. Las de e2e/fixtures/:
//   · careo-de-pie.png          185×455, la foto de pie de Volkanovski: la más
//                               ancha de ufc.com, el peor caso real
//                               (event_fight_card_upper_body_of_standing_athlete)
//   · careo-de-pie-185x621.png  la de Movsar Evloev, su rival del UFC 333, con
//                               su medida real. Las fotos de pie miden todas 185
//                               de ancho y de 455 a 656 de alto (medido en
//                               ufc.com el 11-oct): si las dos esquinas llevaran
//                               la de 185×455 se encogerían IGUAL y el caso de
//                               Volkanovski saldría verde estando mal.
//   · careo-medio-cuerpo.png    460×700 (athlete_bio_full_body)
//   · careo-headshot.png        350×254, el headshot de ESPN (el resto)
// En esas fotos, como en las reales, la cabeza toca la primera fila de la
// imagen: el borde de arriba de lo pintado es la altura de la cabeza.
//
// Corre en Chromium Y en WebKit: dónde parte un nombre depende del motor, y el
// dueño lo vio en un iPhone. Un solo proyecto (escritorio-light): cada test
// recorre sus tamaños de pantalla y el tema no cambia ninguna medida.
// 🪤 Aquí no hay barra de desplazamiento (Playwright la oculta, y un iPhone no
// la tiene). En un Chrome de escritorio, una ventana de 390 deja 375 px de
// maquetación: los «18 px a 390» medidos el 11-oct a mano son los de 375 aquí.
//
// ⚠️ Los saltos dicen SIEMPRE por qué, y ninguno es «no encontré nada»: un
// salto sin motivo es un agujero disfrazado de verde.

type Motor = "chromium" | "webkit";
type Esquina = "red" | "blue";
type Tamano = { width: number; height: number };

// Los dos lados de cada corte de Tailwind (sm 640, md 768, lg 1024, xl 1280).
const ANCHOS = [
  360, 375, 390, 412, 430, 480, 540, 600, 639, 640, 700, 767, 768, 800, 900, 1000, 1023, 1024,
  1100, 1180, 1279, 1280, 1366, 1440, 1600, 1920,
];

const TAMANOS: Tamano[] = [
  ...ANCHOS.map((width) => ({ width, height: 900 })),
  // En vertical: móviles, tablets y una pantalla de pie.
  { width: 360, height: 800 },
  { width: 390, height: 844 },
  { width: 430, height: 932 },
  { width: 768, height: 1024 },
  { width: 820, height: 1180 },
  { width: 1024, height: 1366 },
  { width: 1080, height: 1920 },
  // Móvil tumbado: cae en md (tres columnas). Medido el 11-oct: 22,8 px.
  { width: 844, height: 390 },
  { width: 932, height: 430 },
];

// Las filas de cartelera centran sus dos headshots: bastan los cortes.
const ANCHOS_CARTELERA = [360, 390, 640, 768, 1024, 1280, 1920];

const TOLERANCIA_PX = 1;

const FIXTURES = path.join(__dirname, "fixtures");
const IMAGEN = {
  dePie: readFileSync(path.join(FIXTURES, "careo-de-pie.png")),
  dePieEvloev: readFileSync(path.join(FIXTURES, "careo-de-pie-185x621.png")),
  medioCuerpo: readFileSync(path.join(FIXTURES, "careo-medio-cuerpo.png")),
  headshot: readFileSync(path.join(FIXTURES, "careo-headshot.png")),
};

// Cada foto de ufc.com lleva su estilo en la URL (comprobado en la base el
// 11-oct: todas las URL de pie llevan uno y las de medio cuerpo, el otro).
// Lo demás son headshots y banderas.
function imagenDePrueba(url: string): Buffer {
  if (url.includes("event_fight_card_upper_body_of_standing_athlete")) {
    return url.includes("EVLOEV_MOVSAR") ? IMAGEN.dePieEvloev : IMAGEN.dePie;
  }
  if (url.includes("athlete_bio_full_body")) return IMAGEN.medioCuerpo;
  return IMAGEN.headshot;
}

const test = base.extend<{ motor: Motor; pagina: Page }, { abrirWebkit: () => Promise<Browser> }>({
  motor: ["chromium", { option: true }],
  // WebKit se lanza a mano y una sola vez por worker: los proyectos de
  // playwright.config.ts son todos Chromium.
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
  // Contexto NUEVO en cada test y sin service worker: el de la PWA sirve el CSS
  // viejo (CLAUDE.md, trampas) y mediría la maquetación de antes.
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
      if (peticion.url().startsWith(baseURL ?? "http://localhost")) return route.continue();
      return peticion.resourceType() === "image"
        ? route.fulfill({
            status: 200,
            contentType: "image/png",
            body: imagenDePrueba(peticion.url()),
          })
        : route.abort();
    });
    // Registradas DESPUÉS del comodín, estas ganan.
    // La franja «En directo» depende del calendario real.
    await page.route("**/api/live/now", (route) =>
      route.fulfill({ status: 200, json: { phase: "none" } }),
    );
    // Cada buscador de /enfrentamiento busca al montar y gasta cupo del
    // limitador; aquí no hace falta (y cortado, no despliega su lista).
    await page.route("**/api/fighters/search*", (route) => route.abort());
    await page.route("**/api/predict", (route) => route.abort());
    await fakeYouTubeEmbeds(page);
    await ofrecer(page);
    await contexto.close();
  },
});

test.beforeEach(({}, testInfo) => {
  test.skip(
    testInfo.project.name !== "escritorio-light",
    "cada test recorre sus tamaños y el tema no cambia la geometría: basta un proyecto",
  );
});

type FotoMedida = {
  // Borde de arriba de lo que SE VE, en px de la ventana.
  arriba: number;
  // data-photo-kind de su caja: standing, bio, headshot o silhouette.
  tipo: string;
  // Texto de la esquina (para comprobar quién es) y, en la portada, el nombre.
  texto: string;
  nombre: string | null;
  // Portada: ¿la bandera va sola en su línea? ¿Cuántos rankings hay?
  banderaSola: boolean | null;
  rankings: number;
};
type ParMedido = Record<Esquina, FotoMedida>;

/**
 * Mide las dos fotos de un cara a cara en UN SOLO evaluate: entre dos llamadas
 * la cuenta atrás de la portada repinta, y las dos medidas tienen que ser de
 * la misma maquetación.
 */
function medirPar(pagina: Page, careo: string): Promise<ParMedido> {
  return pagina.evaluate((careo) => {
    const raiz = document.querySelector(`[data-face-off="${careo}"]`);
    if (!raiz) throw new Error(`no está [data-face-off="${careo}"]`);

    const PALABRAS: Record<string, string> = {
      top: "0%",
      left: "0%",
      center: "50%",
      bottom: "100%",
      right: "100%",
    };
    const porcentaje = (valor: string): string => PALABRAS[valor] ?? valor;

    // Borde de arriba de lo pintado. Del <img> se calcula con su object-fit y
    // su object-position; del headshot de reserva vale su caja (su imagen la
    // llena con object-cover). Y nada se ve por encima de la caja de la foto,
    // que recorta (overflow-hidden).
    const bordeVisible = (foto: HTMLElement): number => {
      const caja = foto.getBoundingClientRect();
      // 🪤 Sin caja, las dos medirían y=0 y la diferencia saldría 0: verde
      // falso. Pasó de verdad (11-oct): lo que llega por streaming está en el
      // DOM, dentro de un <div hidden>, antes de tener sitio en la página.
      if (caja.width === 0 || caja.height === 0) {
        throw new Error(`la foto de ${careo} no tiene caja (${caja.width}×${caja.height})`);
      }
      let arriba = caja.top;
      if (foto instanceof HTMLImageElement) {
        const nw = foto.naturalWidth;
        const nh = foto.naturalHeight;
        if (!foto.complete || nw <= 1 || nh <= 1) {
          throw new Error(`la foto ${foto.src} no ha cargado (${nw}×${nh})`);
        }
        const estilo = getComputedStyle(foto);
        const px = (valor: string) => parseFloat(valor) || 0;
        const bordeArriba = px(estilo.borderTopWidth) + px(estilo.paddingTop);
        const alto = caja.height - bordeArriba - px(estilo.borderBottomWidth) - px(estilo.paddingBottom);
        const ancho =
          caja.width -
          px(estilo.borderLeftWidth) -
          px(estilo.paddingLeft) -
          px(estilo.borderRightWidth) -
          px(estilo.paddingRight);
        const ajuste: Record<string, number> = {
          contain: Math.min(ancho / nw, alto / nh),
          cover: Math.max(ancho / nw, alto / nh),
          none: 1,
          "scale-down": Math.min(1, ancho / nw, alto / nh),
          fill: alto / nh,
        };
        const escala = ajuste[estilo.objectFit];
        if (escala === undefined) throw new Error(`object-fit desconocido: ${estilo.objectFit}`);
        const partes = estilo.objectPosition.trim().split(/\s+/).map(porcentaje);
        if (partes.length !== 2) {
          throw new Error(`object-position que este test no sabe leer: ${estilo.objectPosition}`);
        }
        const libre = alto - nh * escala;
        const y = partes[1];
        const desplazamiento = y.endsWith("%") ? (libre * parseFloat(y)) / 100 : parseFloat(y);
        // Con cover lo pintado sobresale por arriba, pero el propio <img> lo recorta.
        arriba = caja.top + bordeArriba + Math.max(0, desplazamiento);
      }
      const marco = foto.closest("[data-photo-kind]");
      return marco ? Math.max(arriba, marco.getBoundingClientRect().top) : arriba;
    };

    const medir = (esquina: "red" | "blue") => {
      const fotos = raiz.querySelectorAll<HTMLElement>(
        `[data-testid="face-off-photo"][data-photo-corner="${esquina}"]`,
      );
      if (fotos.length !== 1) throw new Error(`${fotos.length} fotos en la esquina ${esquina}`);
      const foto = fotos[0];
      const rincon = raiz.querySelector(`[data-face-off-corner="${esquina}"]`);
      const nombre = rincon?.querySelector<HTMLElement>('[data-testid="face-off-name"]') ?? null;
      const bandera = nombre?.parentElement?.querySelector("img") ?? null;
      return {
        arriba: bordeVisible(foto),
        tipo: foto.closest("[data-photo-kind]")?.getAttribute("data-photo-kind") ?? "?",
        texto: rincon?.textContent ?? "",
        nombre: nombre?.textContent ?? null,
        // En el flex-wrap del nombre, sola = toda la línea de la bandera por
        // encima de la del nombre.
        banderaSola:
          nombre && bandera
            ? bandera.getBoundingClientRect().bottom <= nombre.getBoundingClientRect().top + 0.5
            : null,
        rankings: rincon?.querySelectorAll('[data-testid="face-off-rank"]').length ?? 0,
      };
    };

    return { red: medir("red"), blue: medir("blue") };
  }, careo);
}

async function dosFrames(pagina: Page): Promise<void> {
  await pagina.evaluate(
    () => new Promise<void>((listo) => requestAnimationFrame(() => requestAnimationFrame(() => listo()))),
  );
}

/** Las fuentes (con la de reserva los nombres parten en otro sitio) y las animaciones finitas. */
async function esperarQueAsiente(pagina: Page): Promise<void> {
  await pagina.evaluate(() => document.fonts.ready);
  await pagina.waitForFunction(() =>
    document
      .getAnimations()
      .every(
        (a) => a.playState !== "running" || a.effect?.getComputedTiming().iterations === Infinity,
      ),
  );
}

/** Exige las dos fotos del cara a cara y que las <img> hayan cargado de verdad. */
async function esperarFotos(pagina: Page, careo: string): Promise<void> {
  const fotos = pagina.locator(`[data-face-off="${careo}"] [data-testid="face-off-photo"]`);
  await expect(fotos, `el cara a cara ${careo} no tiene sus dos fotos`).toHaveCount(2);
  // VISIBLES, no solo en el DOM: ver la trampa del <div hidden> en medirPar.
  await expect(fotos.first(), `la primera foto de ${careo} no se ve`).toBeVisible();
  await expect(fotos.last(), `la segunda foto de ${careo} no se ve`).toBeVisible();
  await expect
    .poll(
      () =>
        fotos.evaluateAll((todas) =>
          todas
            .filter((foto): foto is HTMLImageElement => foto instanceof HTMLImageElement)
            .every((img) => img.complete && img.naturalWidth > 1),
        ),
      { message: `las fotos de ${careo} no terminan de cargar` },
    )
    .toBe(true);
  await esperarQueAsiente(pagina);
}

/**
 * Recorre TODOS los tamaños, mide las dos fotos en cada uno y exige ≤ 1 px.
 * `expect.soft` para que salgan todos los tamaños que fallan de una vez.
 */
async function recorrerTamanos(
  pagina: Page,
  careo: string,
  contexto: string,
  alMedir?: (par: ParMedido, tamano: Tamano) => void,
): Promise<void> {
  const medidas: { tamano: string; diferencia: number }[] = [];
  for (const tamano of TAMANOS) {
    await pagina.setViewportSize(tamano);
    await dosFrames(pagina);
    const par = await medirPar(pagina, careo);
    const diferencia = Math.abs(par.red.arriba - par.blue.arriba);
    const donde = `${tamano.width}×${tamano.height}`;
    medidas.push({ tamano: donde, diferencia });
    expect
      .soft(
        diferencia,
        `${contexto} a ${donde}: la foto roja (${par.red.tipo}) empieza en y=${par.red.arriba.toFixed(1)} ` +
          `y la azul (${par.blue.tipo}) en y=${par.blue.arriba.toFixed(1)}: ${diferencia.toFixed(1)} px`,
      )
      .toBeLessThanOrEqual(TOLERANCIA_PX);
    alMedir?.(par, tamano);
  }
  // Un bucle que no mide nada daría verde: tantas medidas como tamaños.
  expect(medidas, `${contexto}: no se midieron todos los tamaños`).toHaveLength(TAMANOS.length);
  const peor = medidas.reduce((a, b) => (b.diferencia > a.diferencia ? b : a));
  console.log(
    `${contexto}: ${medidas.length} tamaños, peor diferencia ${peor.diferencia.toFixed(1)} px (${peor.tamano})`,
  );
}

// ── Casos con IDs fijos. Antes de medir se comprueba que siguen siendo lo que
// dicen (nombres y encuadre de cada esquina): si un luchador recibe foto de pie
// nueva, el caso deja de cubrir lo que cubría y se SALTA diciéndolo.

type Rincon = { nombre: string; tipo: string };
type CasoFijo = { url: string; porque: string; red: Rincon; blue: Rincon };

const COMBATES: CasoFijo[] = [
  {
    url: "/fights/17085",
    porque: "la captura del dueño del 9-oct, las dos de pie",
    red: { nombre: "Brendan Allen", tipo: "standing" },
    blue: { nombre: "Christian Leroy Duncan", tipo: "standing" },
  },
  {
    url: "/fights/18651",
    porque: "apodo largo",
    red: { nombre: "Andre Fili", tipo: "standing" },
    blue: { nombre: "Kai Kamaka III", tipo: "standing" },
  },
  {
    url: "/fights/6707",
    porque: "la mayor asimetría de nombre; medio cuerpo contra de pie",
    red: { nombre: "Douglas Silva de Andrade", tipo: "bio" },
    blue: { nombre: "Petr Yan", tipo: "standing" },
  },
  {
    url: "/fights/3376",
    porque: "el nombre más largo con foto de cuerpo",
    red: { nombre: "Neil Magny", tipo: "standing" },
    blue: { nombre: "Elizeu Zaleski dos Santos", tipo: "bio" },
  },
  {
    url: "/fights/12037",
    porque: "nombre y apodo largos, los dos de pie",
    red: { nombre: "Shem Rock", tipo: "standing" },
    blue: { nombre: "Abdul-Kareem Al-Selwady", tipo: "standing" },
  },
  {
    url: "/fights/9302",
    porque: "el apodo más largo",
    red: { nombre: "Mark Munoz", tipo: "bio" },
    blue: { nombre: "Tim Boetsch", tipo: "bio" },
  },
  {
    // Medido en producción el 11-oct: la cara de Gomez Juarez empezaba 54 px
    // más abajo a 390 (el headshot iba centrado en su caja).
    url: "/fights/5207",
    porque: "foto de pie contra solo headshot (su último combate es de 2022)",
    red: { nombre: "Vanessa Demopoulos", tipo: "standing" },
    blue: { nombre: "Silvana Gomez Juarez", tipo: "headshot" },
  },
  {
    url: "/fights/6234",
    porque: "la palabra más larga (Magomedsharipov)",
    red: { nombre: "Calvin Kattar", tipo: "bio" },
    blue: { nombre: "Zabit Magomedsharipov", tipo: "bio" },
  },
];

const ENFRENTAMIENTOS: CasoFijo[] = [
  {
    url: "/enfrentamiento?red=6394&blue=6294",
    porque: "Allen contra Duncan",
    red: { nombre: "Brendan Allen", tipo: "standing" },
    blue: { nombre: "Christian Leroy Duncan", tipo: "standing" },
  },
  {
    url: "/enfrentamiento?red=6203&blue=6899",
    porque: "de pie contra medio cuerpo, nombre largo",
    red: { nombre: "Petr Yan", tipo: "standing" },
    blue: { nombre: "Elizeu Zaleski dos Santos", tipo: "bio" },
  },
  {
    url: "/enfrentamiento?red=6685&blue=1256",
    porque: "la palabra más larga",
    red: { nombre: "Rob Font", tipo: "standing" },
    blue: { nombre: "Zabit Magomedsharipov", tipo: "bio" },
  },
  {
    url: "/enfrentamiento?red=420&blue=7367",
    porque: "apodo larguísimo",
    red: { nombre: "Chad Anheliger", tipo: "standing" },
    blue: { nombre: "Steven Koslow", tipo: "standing" },
  },
  {
    // La foto de pie más ancha (185×455): en columnas estrechas se encogía y
    // bajaba. Medido el 11-oct en /fights/15984 a 768: 79,4 px en Chromium.
    url: "/enfrentamiento?red=7029&blue=7118",
    porque: "Volkanovski, la foto de pie que se encogía",
    red: { nombre: "Alexander Volkanovski", tipo: "standing" },
    blue: { nombre: "Movsar Evloev", tipo: "standing" },
  },
];

async function medirCasoFijo(pagina: Page, careo: string, caso: CasoFijo, motor: Motor) {
  await pagina.goto(caso.url);
  await esperarFotos(pagina, careo);

  const visto = await medirPar(pagina, careo);
  const distinto = (["red", "blue"] as const).filter(
    (esquina) =>
      !visto[esquina].texto.includes(caso[esquina].nombre) ||
      visto[esquina].tipo !== caso[esquina].tipo,
  );
  test.skip(
    distinto.length > 0,
    `${caso.url} ya no es «${caso.porque}»: ` +
      distinto
        .map(
          (esquina) =>
            `${esquina} esperaba ${caso[esquina].nombre} (${caso[esquina].tipo}) y hay ` +
            `«${visto[esquina].texto.slice(0, 60)}» (${visto[esquina].tipo})`,
        )
        .join("; "),
  );

  await recorrerTamanos(pagina, careo, `[${motor}] ${caso.url}`);
}

// ── Nombres largos REALES en la portada ──────────────────────────────────────
//
// La portada enseña el estelar de la semana y no se puede elegir pareja por
// URL. Así que, YA HIDRATADA, se escriben en las dos esquinas nombres y apodos
// reales (sacados de la base el 11-oct): la maquetación es CSS puro y escribir
// el texto equivale a recibir ese dato. Cada pareja va también con las
// esquinas cambiadas. Y dos escenarios más, porque los 18 px del 11-oct salían
// de ahí (la bandera de Buckley saltaba sola a su línea):
//   · ranking en una sola esquina;
//   · bandera sola en su línea en una esquina, y la otra sin bandera.

type Lado = {
  nombre?: string;
  apodo?: string | null;
  // true: con su badge de ranking; false: sin él; sin poner: el de la semana.
  rango?: boolean;
  bandera?: boolean;
};
type Escenario = {
  titulo: string;
  red: Lado;
  blue: Lado;
  // Esquina en la que la bandera TIENE que quedar sola en su línea en algún
  // tamaño: si no, el escenario no prueba lo que dice.
  banderaSolaEn?: Esquina;
};

const ESCENARIOS: Escenario[] = [
  {
    titulo: "Allen contra Duncan",
    red: { nombre: "Brendan Allen", apodo: "All In" },
    blue: { nombre: "Christian Leroy Duncan", apodo: "CLD" },
  },
  {
    titulo: "Fili contra Kamaka III",
    red: { nombre: "Andre Fili", apodo: "Touchy" },
    blue: { nombre: "Kai Kamaka III", apodo: "The Fighting Hawaiian" },
  },
  {
    titulo: "Silva de Andrade contra Yan",
    red: { nombre: "Douglas Silva de Andrade", apodo: "D Silva" },
    blue: { nombre: "Petr Yan", apodo: "No Mercy" },
  },
  {
    titulo: "Magny contra Zaleski dos Santos",
    red: { nombre: "Neil Magny", apodo: null },
    blue: { nombre: "Elizeu Zaleski dos Santos", apodo: "Capoeira" },
  },
  {
    titulo: "Rock contra Al-Selwady",
    red: { nombre: "Shem Rock", apodo: null },
    blue: { nombre: "Abdul-Kareem Al-Selwady", apodo: "Pride of Palestine" },
  },
  {
    titulo: "Munoz contra Boetsch",
    red: { nombre: "Mark Munoz", apodo: "The Filipino Wrecking Machine" },
    blue: { nombre: "Tim Boetsch", apodo: "The Barbarian" },
  },
  {
    titulo: "Anheliger contra Koslow",
    red: { nombre: "Chad Anheliger", apodo: "The Monster" },
    blue: { nombre: "Steven Koslow", apodo: "Obi Won Shinobi the Pillow" },
  },
  {
    titulo: "Chovancek contra You",
    red: { nombre: "Cody Chovancek", apodo: "The Best Fisherman in MMA" },
    blue: { nombre: "SuYoung You", apodo: null },
  },
  {
    titulo: "Kattar contra Magomedsharipov",
    red: { nombre: "Calvin Kattar", apodo: null },
    blue: { nombre: "Zabit Magomedsharipov", apodo: null },
  },
  {
    titulo: "ranking solo en una esquina, con los nombres de la semana",
    red: { rango: true },
    blue: { rango: false },
  },
  {
    titulo: "ranking solo en una esquina y el nombre largo en la otra",
    red: { nombre: "Petr Yan", apodo: "No Mercy", rango: true },
    blue: { nombre: "Douglas Silva de Andrade", apodo: "D Silva", rango: false },
  },
  {
    titulo: "bandera sola en su línea, y la otra esquina sin bandera ni ranking",
    red: { nombre: "Zabit Magomedsharipov", apodo: null, bandera: true, rango: false },
    blue: { nombre: "SuYoung You", apodo: null, bandera: false, rango: false },
    banderaSolaEn: "red",
  },
];

function cambiarEsquinas(escenario: Escenario): Escenario {
  return {
    titulo: `${escenario.titulo} (esquinas cambiadas)`,
    red: escenario.blue,
    blue: escenario.red,
    banderaSolaEn:
      escenario.banderaSolaEn === undefined
        ? undefined
        : escenario.banderaSolaEn === "red"
          ? "blue"
          : "red",
  };
}

/** Escribe el escenario en las dos esquinas de la portada. */
async function escribirEscenario(pagina: Page, escenario: Escenario): Promise<void> {
  await pagina.evaluate(({ red, blue }) => {
    const careo = document.querySelector('[data-face-off="home-hero"]') as HTMLElement;
    // Modelos copiados ANTES de quitar nada. Si la semana no trae ranking o
    // bandera, se fabrican con las clases de RankBadge (up-next-hero.tsx) y de
    // CountryFlag (country-flag.tsx).
    const rangoModelo =
      careo.querySelector('[data-testid="face-off-rank"]')?.cloneNode(true) ??
      Object.assign(document.createElement("span"), {
        className:
          "inline-flex items-center rounded-sm border border-primary/40 bg-primary/10 px-1.5 py-0.5 font-mono text-[0.65rem] font-semibold leading-none text-primary",
        textContent: "#1",
      });
    if (rangoModelo instanceof HTMLElement) rangoModelo.dataset.testid = "face-off-rank";
    const banderaModelo =
      careo.querySelector('[data-testid="face-off-name"]')?.parentElement?.querySelector("img")?.cloneNode(true) ??
      careo
        .querySelectorAll('[data-testid="face-off-name"]')[1]
        ?.parentElement?.querySelector("img")
        ?.cloneNode(true) ??
      Object.assign(document.createElement("img"), {
        src: "https://flagcdn.com/br.svg",
        alt: "",
        width: 20,
        height: 15,
        className: "inline-block h-3.5 w-5 shrink-0 rounded-[2px] object-cover ring-1 ring-border",
      });

    for (const [esquina, lado] of [
      ["red", red],
      ["blue", blue],
    ] as const) {
      const rincon = careo.querySelector(`[data-face-off-corner="${esquina}"]`) as HTMLElement;
      const nombre = rincon.querySelector('[data-testid="face-off-name"]') as HTMLElement;
      const apodo = rincon.querySelector('[data-testid="face-off-nickname"]') as HTMLElement;
      const linea = nombre.parentElement as HTMLElement;
      if (lado.nombre !== undefined) nombre.textContent = lado.nombre;
      // Igual que el componente: el apodo entre comillas, y el párrafo siempre.
      if (lado.apodo !== undefined) apodo.textContent = lado.apodo ? `“${lado.apodo}”` : "";
      if (lado.rango !== undefined) {
        linea.querySelectorAll('[data-testid="face-off-rank"]').forEach((badge) => badge.remove());
        if (lado.rango) linea.append(rangoModelo.cloneNode(true));
      }
      if (lado.bandera !== undefined) {
        linea.querySelectorAll("img").forEach((bandera) => bandera.remove());
        if (lado.bandera) linea.prepend(banderaModelo.cloneNode(true));
      }
    }
  }, escenario);
  await pagina.evaluate(() => document.fonts.ready);
}

/** La portada a punto: hidratada, con su estelar y sus dos fotos cargadas. */
async function abrirPortada(pagina: Page): Promise<void> {
  await pagina.goto("/");
  await expect(pagina.getByRole("heading", { level: 1 })).toBeVisible();
  const estelar = await pagina.getByText("Combate estelar").count();
  test.skip(
    estelar === 0,
    "la portada no tiene «Combate estelar» (sin evento próximo o sin cartelera): no hay cara a cara",
  );
  await esperarFotos(pagina, "home-hero");
  await esperarHidratacion(pagina);
}

for (const motor of ["chromium", "webkit"] as const) {
  test.describe(motor, () => {
    test.use({ motor });

    test("portada, el estelar de la semana: las dos fotos empiezan a la misma altura", async ({
      pagina,
    }) => {
      await abrirPortada(pagina);
      const par = await medirPar(pagina, "home-hero");
      await recorrerTamanos(
        pagina,
        "home-hero",
        `[${motor}] portada (${par.red.nombre} contra ${par.blue.nombre})`,
      );
    });

    for (const original of ESCENARIOS) {
      test(`portada con nombres reales metidos a mano: ${original.titulo}`, async ({ pagina }) => {
        await abrirPortada(pagina);
        for (const escenario of [original, cambiarEsquinas(original)]) {
          await escribirEscenario(pagina, escenario);
          let banderaSolaVista = false;
          await recorrerTamanos(
            pagina,
            "home-hero",
            `[${motor}] portada · ${escenario.titulo}`,
            (par, tamano) => {
              const donde = `${escenario.titulo} a ${tamano.width}×${tamano.height}`;
              // Lo medido es lo escrito (nada ha repintado la esquina por debajo).
              for (const esquina of ["red", "blue"] as const) {
                const lado = escenario[esquina];
                if (lado.nombre !== undefined) {
                  expect(par[esquina].nombre, `${donde}: el nombre de ${esquina}`).toBe(lado.nombre);
                }
                if (lado.rango !== undefined) {
                  expect(par[esquina].rankings, `${donde}: rankings en ${esquina}`).toBe(
                    lado.rango ? 1 : 0,
                  );
                }
              }
              if (escenario.banderaSolaEn && par[escenario.banderaSolaEn].banderaSola) {
                banderaSolaVista = true;
              }
            },
          );
          if (escenario.banderaSolaEn) {
            expect(
              banderaSolaVista,
              `${escenario.titulo}: la bandera de ${escenario.banderaSolaEn} no quedó sola en su línea en ningún tamaño`,
            ).toBe(true);
          }
        }
      });
    }

    for (const caso of COMBATES) {
      test(`combate ${caso.url} (${caso.porque})`, async ({ pagina }) => {
        await medirCasoFijo(pagina, "fight", caso, motor);
      });
    }

    for (const caso of ENFRENTAMIENTOS) {
      test(`enfrentamiento ${caso.url} (${caso.porque})`, async ({ pagina }) => {
        await medirCasoFijo(pagina, "matchup", caso, motor);
      });
    }

    // ── Filas de cartelera: los dos headshots de cada fila a la misma altura.
    // Van centrados en la fila (items-center), así que una línea de récord que
    // parte en dos no los mueve: aquí se vigila que siga así, con los datos
    // reales y metiendo texto de más en una esquina.

    async function medirCartelera(pagina: Page, url: string): Promise<void> {
      await pagina.goto(url);
      const filas = pagina.locator('[data-testid="bout-row"]');
      await expect(filas.first(), `${url} no tiene filas de cartelera`).toBeVisible();
      const total = await filas.count();
      await esperarQueAsiente(pagina);

      const pasadas = [
        { nombre: "datos reales", meterTexto: false },
        // En /eventos/1098 no hay bonos en la base (11-oct): se mete a mano
        // «GANA + POTN + cuota» y un nombre largo en la esquina roja.
        { nombre: "con GANA, POTN, cuota y nombre largo en la roja", meterTexto: true },
      ];
      for (const pasada of pasadas) {
        if (pasada.meterTexto) {
          await pagina.evaluate(() => {
            for (const fila of document.querySelectorAll('[data-testid="bout-row"]')) {
              const textos = fila.querySelector('[data-bout-corner="red"] > :last-child');
              const lineas = textos?.querySelectorAll("p");
              if (!lineas || lineas.length < 2) continue;
              const nombre = lineas[0].querySelector("span.truncate");
              if (nombre) nombre.textContent = "Abdul-Kareem Al-Selwady de Andrade";
              lineas[1].append(" +250 GANA POTN Actuación de la Noche");
            }
          });
        }
        const medidas: number[] = [];
        for (const width of ANCHOS_CARTELERA) {
          await pagina.setViewportSize({ width, height: 900 });
          await dosFrames(pagina);
          const filasMedidas = await pagina.evaluate(() =>
            Array.from(document.querySelectorAll('[data-testid="bout-row"]')).map((fila) => {
              const arriba = (esquina: string) => {
                const caja = (
                  fila.querySelector(`[data-bout-corner="${esquina}"] > :first-child`) as HTMLElement
                ).getBoundingClientRect();
                // Sin caja, y=0 en las dos esquinas: verde falso (ver medirPar).
                if (caja.height === 0) throw new Error(`headshot ${esquina} sin caja en una fila`);
                return caja.top;
              };
              return {
                texto: (fila.textContent ?? "").replace(/\s+/g, " ").slice(0, 70),
                red: arriba("red"),
                blue: arriba("blue"),
              };
            }),
          );
          expect(filasMedidas, `${url} a ${width}: filas medidas`).toHaveLength(total);
          for (const fila of filasMedidas) {
            const diferencia = Math.abs(fila.red - fila.blue);
            medidas.push(diferencia);
            expect
              .soft(
                diferencia,
                `[${motor}] ${url} (${pasada.nombre}) a ${width}: «${fila.texto}» — headshot rojo en ` +
                  `y=${fila.red.toFixed(1)} y azul en y=${fila.blue.toFixed(1)}`,
              )
              .toBeLessThanOrEqual(TOLERANCIA_PX);
          }
        }
        expect(medidas, `${url} (${pasada.nombre}): no se midieron todas las filas`).toHaveLength(
          total * ANCHOS_CARTELERA.length,
        );
        console.log(
          `[${motor}] ${url} (${pasada.nombre}): ${total} filas × ${ANCHOS_CARTELERA.length} anchos, ` +
            `peor diferencia ${Math.max(...medidas).toFixed(1)} px`,
        );
      }
    }

    test("cartelera /eventos/1098 (completada: ganador, método y cuotas)", async ({ pagina }) => {
      await medirCartelera(pagina, "/eventos/1098");
    });

    test("cartelera del próximo evento (con rankings)", async ({ pagina }) => {
      await pagina.goto("/");
      await expect(pagina.getByRole("heading", { level: 1 })).toBeVisible();
      // El «Ver cartelera» del bloque «PRÓXIMO EVENTO», no el de otra sección.
      const enlace = pagina
        .locator("section", { has: pagina.getByText("PRÓXIMO EVENTO", { exact: true }) })
        .getByRole("link", { name: /Ver cartelera/ });
      test.skip(
        (await enlace.count()) === 0,
        "la portada no tiene próximo evento: no hay cartelera próxima que medir",
      );
      const href = await enlace.first().getAttribute("href");
      expect(href, "el enlace «Ver cartelera» no lleva a un evento").toMatch(/^\/eventos\/\d+$/);
      await medirCartelera(pagina, href as string);
    });
  });
}
