import { test, expect, type Page } from "@playwright/test";
import sharp from "sharp";

import {
  CONTRATO,
  claridad,
  contraste,
  deltaE00,
  umbralTexto,
  type Rgb,
} from "@/lib/color-contract";

// ─── PUERTA 2 de 2 · EL CONTRATO DE COLOR, EN PÍXELES ────────────────────────
//
// Destino en el repo: e2e/color.spec.ts
//
// MEDIDO el 6-ago-2026: en todo el proyecto hay CERO asertos de color, CERO de
// contraste, CERO capturas y CERO axe. Las 6 puertas del megatest (código de
// estado, error boundary, desbordamiento, CSP, hidratación, headshots) salen
// TODAS verdes con la home ilegible, porque ninguna mira un color. Esto lo
// arregla.
//
// ── EN QUÉ PROYECTOS CORRE Y POR QUÉ ─────────────────────────────────────────
// Solo en `escritorio-light` y `escritorio-dark`, de los 6 que hay. NO es
// pereza: el color NO depende del viewport (ningún token, ninguna clase de color
// del proyecto lleva breakpoint), así que móvil-light y escritorio-light miden
// EXACTAMENTE lo mismo. Correr en los 6 triplicaría el coste para repetir la
// misma cifra tres veces. Lo que sí cambia todo es el TEMA, y por eso los dos
// temas son obligatorios: el fallo del degradado solo existe en claro y el de
// los botones solo en oscuro.
//
// 🪤 Si algún día una clase de color lleva `sm:` o `lg:`, hay que ampliar a los
// 6 proyectos. Un grep de `(sm|md|lg|xl):(bg|text|border|from|to|via)-` que dé
// >0 es la señal.
//
// ── LO QUE NO MIDE (dicho aquí para que nadie lo dé por cubierto) ────────────
// · Estados :hover / :focus. La página en reposo es lo que ve el 100 % de la
//   gente; el hover es de escritorio y transitorio. MEDIDO y relevante: en
//   oscuro `hover:bg-primary/80` compone #c62b31 y ahí la tinta oscura daría
//   3,555:1. Si se adopta la tinta como --primary-foreground, ESTO hay que
//   medirlo también (ver TODO al final).
// · Texto sobre imagen (portadas de noticias, headshots): no hay color de fondo
//   determinista contra el que medir.
// · El baño rojo de `body::before`: no entra en el fondo compuesto por
//   getComputedStyle. Lo cubre la puerta de tokens.

const RUTAS = ["/", "/fighters/6495", "/eventos/357", "/clasificacion"];

type Fallo = {
  texto: string;
  color: string;
  fondo: string;
  px: number;
  peso: number;
  ratio: number;
  necesita: number;
  clase: string;
};

// Solo escritorio: el color no depende del viewport (ver cabecera).
function soloEscritorio(nombreProyecto: string) {
  test.skip(
    !nombreProyecto.startsWith("escritorio"),
    "el color no depende del viewport: se mide una vez por tema",
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// TEST 1 · CONTRASTE DE TEXTO REAL (WCAG 2.2 AA)
//
// Recorre TODOS los nodos de texto visibles, calcula el fondo compuesto subiendo
// por los ancestros y falla por debajo de AA.
//
// 🪤 El color se normaliza pintándolo en un <canvas> de 1×1 y leyendo el píxel.
// Parecerá un rodeo, pero NO lo es: Chrome devuelve `oklab(...)` y
// `color-mix(...)` en getComputedStyle para las clases con alfa de Tailwind v4,
// y un parseo con regex de números los lee como RGB y da colores inventados.
// COMPROBADO: con regex, la home en oscuro daba 32 "fallos", 20 de ellos
// fantasmas (texto del pie salía #030303 cuando en realidad es #bebebe).
// Con el canvas: 23 fallos, todos reales.
// ─────────────────────────────────────────────────────────────────────────────
async function medirTextos(page: Page): Promise<Fallo[]> {
  return page.evaluate(() => {
    const cv = document.createElement("canvas");
    cv.width = cv.height = 1;
    const ctx = cv.getContext("2d", { willReadFrequently: true })!;
    const leer = (css: string): [number, number, number, number] => {
      if (!css || css === "transparent" || css === "none") return [0, 0, 0, 0];
      ctx.globalCompositeOperation = "copy";
      ctx.fillStyle = "#000";
      ctx.fillStyle = css;
      ctx.fillRect(0, 0, 1, 1);
      const d = ctx.getImageData(0, 0, 1, 1).data;
      return [d[0], d[1], d[2], d[3] / 255];
    };
    const sobre = (
      f: [number, number, number, number],
      b: [number, number, number],
    ): [number, number, number] => [
      f[0] * f[3] + b[0] * (1 - f[3]),
      f[1] * f[3] + b[1] * (1 - f[3]),
      f[2] * f[3] + b[2] * (1 - f[3]),
    ];
    const fondoCompuesto = (el: Element): [number, number, number] => {
      const pila: [number, number, number, number][] = [];
      let n: Element | null = el;
      while (n) {
        const c = leer(getComputedStyle(n).backgroundColor);
        if (c[3] > 0) pila.push(c);
        if (c[3] === 1) break;
        n = n.parentElement;
      }
      let out: [number, number, number] = [255, 255, 255];
      for (let i = pila.length - 1; i >= 0; i--) out = sobre(pila[i], out);
      return out;
    };
    const hex = (c: [number, number, number]) =>
      "#" +
      c.map((v) => Math.round(v).toString(16).padStart(2, "0")).join("");

    const salida: {
      texto: string;
      color: [number, number, number];
      fondo: [number, number, number];
      px: number;
      peso: number;
      clase: string;
      colorHex: string;
      fondoHex: string;
    }[] = [];
    const vistos = new Set<Element>();
    const w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    let n: Node | null;
    while ((n = w.nextNode())) {
      const t = (n.nodeValue ?? "").trim();
      if (!t) continue;
      const el = n.parentElement;
      if (!el || vistos.has(el)) continue;
      vistos.add(el);
      const cs = getComputedStyle(el);
      if (cs.visibility === "hidden" || cs.display === "none") continue;
      if (Number(cs.opacity) === 0) continue;
      const r = el.getBoundingClientRect();
      if (r.width === 0 || r.height === 0) continue;
      const fondo = fondoCompuesto(el);
      const color = sobre(leer(cs.color), fondo);
      salida.push({
        texto: t.slice(0, 40),
        color,
        fondo,
        px: parseFloat(cs.fontSize),
        peso: Number(cs.fontWeight) || 400,
        clase: String((el as HTMLElement).className ?? "").slice(0, 70),
        colorHex: hex(color),
        fondoHex: hex(fondo),
      });
    }
    return salida;
  }).then((nodos) =>
    nodos
      .map((x) => {
        const necesita = umbralTexto(x.px, x.peso);
        const ratio = contraste(x.color as Rgb, x.fondo as Rgb);
        return {
          texto: x.texto,
          color: x.colorHex,
          fondo: x.fondoHex,
          px: x.px,
          peso: x.peso,
          ratio: Number(ratio.toFixed(3)),
          necesita,
          clase: x.clase,
        };
      })
      // 🪤 La tolerancia de 0,0005 NO es para "dar margen": es porque el ratio
      // se redondea a 3 decimales para el informe y sin ella un 4,4999996
      // legítimo saldría rojo por el redondeo.
      .filter((f) => f.ratio < f.necesita - 0.0005),
  );
}

for (const ruta of RUTAS) {
  test(`contraste de texto AA en ${ruta}`, async ({ page }, testInfo) => {
    soloEscritorio(testInfo.project.name);
    await page.route("**/api/live/now", (r) =>
      r.fulfill({ status: 200, json: { phase: "none" } }),
    );
    await page.goto(ruta);
    // El tema resuelto lo escribe next-themes al montar: sin esperarlo se puede
    // medir el HTML servido, que no lleva la clase y mediría el tema que no es.
    await expect
      .poll(() =>
        page.evaluate(() => {
          const c = document.documentElement.classList;
          return c.contains("dark") || c.contains("light");
        }),
      )
      .toBe(true);

    const fallos = await medirTextos(page);
    const resumen = fallos
      .map(
        (f) =>
          `  ${f.ratio}:1 (necesita ${f.necesita}) · ${f.color} sobre ${f.fondo}` +
          ` · ${f.px}px/${f.peso} · "${f.texto}"\n    ${f.clase}`,
      )
      .join("\n");
    expect(
      fallos,
      `${fallos.length} nodo(s) de texto por debajo de WCAG AA en ${ruta} ` +
        `(${testInfo.project.name}):\n${resumen}`,
    ).toHaveLength(0);
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// TEST 2 · SEPARACIÓN SUPERFICIE / FONDO EN EL PERÍMETRO
//
// Este es el que pilla el degradado que cruza. Y mide PÍXELES DE VERDAD, no el
// modelo: una captura de la página, decodificada con `sharp` (que ya está en
// devDependencies, no se añade nada), y muestreo del perímetro.
//
// Por qué píxeles y no getComputedStyle: el defecto vive DENTRO de un
// `linear-gradient`, y getComputedStyle devuelve la receta, no el color a media
// altura. Modelar la interpolación a mano es exactamente el tipo de suposición
// que ya ha fallado dos veces en este proyecto.
//
// 🪤 deviceScaleFactor va a 1 (por defecto en Playwright), así que 1 px CSS = 1
// px de la captura. Si algún día se pone a 2, hay que multiplicar las
// coordenadas o el muestreo apuntará a la esquina equivocada.
// ─────────────────────────────────────────────────────────────────────────────

type Candidata = {
  x: number;
  y: number;
  w: number;
  h: number;
  etiqueta: string;
  tieneBorde: boolean;
  tieneSombra: boolean;
  bordePx: number;
};

async function candidatas(page: Page): Promise<Candidata[]> {
  return page.evaluate(() =>
    Array.from(document.querySelectorAll<HTMLElement>("body *"))
      .map((el) => {
        const cs = getComputedStyle(el);
        const r = el.getBoundingClientRect();
        const tieneDegradado = /gradient/.test(cs.backgroundImage);
        const tieneRelleno =
          cs.backgroundColor !== "rgba(0, 0, 0, 0)" &&
          cs.backgroundColor !== "transparent";
        if (!tieneDegradado && !tieneRelleno) return null;
        // Superficies de verdad: nada de chips ni de pastillas.
        if (r.width < 120 || r.height < 80) return null;
        // Fuera de pantalla o tapadas: no se pueden fotografiar.
        if (r.width * r.height > 2_000_000) return null;
        const anchoBorde = Math.max(
          parseFloat(cs.borderTopWidth),
          parseFloat(cs.borderBottomWidth),
          parseFloat(cs.borderLeftWidth),
          parseFloat(cs.borderRightWidth),
        );
        return {
          x: Math.round(r.left + window.scrollX),
          y: Math.round(r.top + window.scrollY),
          w: Math.round(r.width),
          h: Math.round(r.height),
          etiqueta: `${el.tagName.toLowerCase()}.${String(el.className ?? "").slice(0, 55)}`,
          tieneBorde: anchoBorde > 0,
          tieneSombra: cs.boxShadow !== "none" && !/rgba\(0, 0, 0, 0\) 0px 0px 0px 0px$/.test(cs.boxShadow),
          bordePx: anchoBorde,
        };
      })
      .filter((x): x is Candidata => x !== null),
  );
}

test("las superficies elevadas no cruzan su fondo (R2c) y están delimitadas (R2a|R2b)", async ({
  page,
}, testInfo) => {
  soloEscritorio(testInfo.project.name);
  await page.route("**/api/live/now", (r) =>
    r.fulfill({ status: 200, json: { phase: "none" } }),
  );
  // La ficha de luchador es donde vive PREMIUM_TILE (19 usos en 12 ficheros).
  await page.goto("/fighters/6495");
  await expect
    .poll(() =>
      page.evaluate(() => {
        const c = document.documentElement.classList;
        return c.contains("dark") || c.contains("light");
      }),
    )
    .toBe(true);
  // Las animaciones de entrada (`animate-rise`) mueven las cajas: sin esto, las
  // coordenadas medidas y la captura pueden no ser del mismo instante.
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.waitForTimeout(400);

  const cajas = await candidatas(page);
  expect(cajas.length, "no se ha encontrado ni una superficie que medir").
    toBeGreaterThan(3);

  const png = await page.screenshot({ fullPage: true, animations: "disabled" });
  const { data, info } = await sharp(png)
    .raw()
    .toBuffer({ resolveWithObject: true });
  const canales = info.channels;
  const pixel = (x: number, y: number): Rgb | null => {
    if (x < 0 || y < 0 || x >= info.width || y >= info.height) return null;
    const i = (y * info.width + x) * canales;
    return [data[i], data[i + 1], data[i + 2]];
  };

  const MARGEN = 4; // px hacia dentro y hacia fuera del borde
  const problemas: string[] = [];

  for (const caja of cajas) {
    // Puntos del perímetro: 5 por lado, evitando las esquinas redondeadas.
    const puntos: { dentro: [number, number]; fuera: [number, number] }[] = [];
    for (let k = 1; k <= 5; k++) {
      const fx = caja.x + Math.round((caja.w * k) / 6);
      const fy = caja.y + Math.round((caja.h * k) / 6);
      puntos.push(
        { dentro: [fx, caja.y + MARGEN], fuera: [fx, caja.y - MARGEN] }, // arriba
        { dentro: [fx, caja.y + caja.h - MARGEN], fuera: [fx, caja.y + caja.h + MARGEN] }, // abajo
        { dentro: [caja.x + MARGEN, fy], fuera: [caja.x - MARGEN, fy] }, // izquierda
        { dentro: [caja.x + caja.w - MARGEN, fy], fuera: [caja.x + caja.w + MARGEN, fy] }, // derecha
      );
    }

    const signos = new Set<number>();
    let peorDL = Infinity;
    let peorPunto = "";
    let mejorDE = 0;

    for (const p of puntos) {
      const dentro = pixel(p.dentro[0], p.dentro[1]);
      const fuera = pixel(p.fuera[0], p.fuera[1]);
      if (!dentro || !fuera) continue;
      const dL = claridad(dentro) - claridad(fuera);
      const dE = deltaE00(dentro, fuera);
      // 🪤 Si el píxel de dentro cayó sobre texto o un icono, |ΔL*| se dispara y
      // el punto no dice nada de la SUPERFICIE. Se descarta por encima de 25 L*:
      // ninguna superficie legítima despega tanto de su fondo inmediato, y el
      // texto del proyecto sí (foreground vs card son 90+ L* de diferencia).
      if (Math.abs(dL) > 25) continue;
      signos.add(Math.sign(dL));
      if (Math.abs(dL) < peorDL) {
        peorDL = Math.abs(dL);
        peorPunto = `(${p.dentro[0]},${p.dentro[1]}) dentro=${dentro} fuera=${fuera}`;
      }
      if (dE > mejorDE) mejorDE = dE;
    }
    if (peorDL === Infinity) continue; // nada medible: se calla y no inventa

    // R2(c) · sin cruce
    if (signos.size > 1) {
      problemas.push(
        `CRUCE · ${caja.etiqueta}\n    la superficie está por encima del fondo en unos ` +
          `puntos del perímetro y por debajo en otros: en algún punto el contraste ` +
          `vale exactamente 1,000. Peor punto: ${peorPunto}`,
      );
      continue;
    }
    if (peorDL < CONTRATO.SUPERFICIE_DL_MIN) {
      problemas.push(
        `FUNDIDO · ${caja.etiqueta}\n    |ΔL*| mínimo en el perímetro = ` +
          `${peorDL.toFixed(3)}, por debajo de ${CONTRATO.SUPERFICIE_DL_MIN}. ${peorPunto}`,
      );
      continue;
    }
    // R2(a) color propio · O R2(b) delimitador
    const separaElColor = mejorDE >= CONTRATO.SUPERFICIE_DE00;
    const hayDelimitador = caja.tieneBorde || caja.tieneSombra;
    if (!separaElColor && !hayDelimitador) {
      problemas.push(
        `SIN DELIMITAR · ${caja.etiqueta}\n    ΔE00 máximo contra el fondo = ` +
          `${mejorDE.toFixed(3)} (< ${CONTRATO.SUPERFICIE_DE00}) y no tiene ni borde ni sombra: ` +
          `no hay nada que diga dónde acaba.`,
      );
    }
  }

  expect(
    problemas,
    `${problemas.length} superficie(s) incumplen R2 en /fighters/6495 ` +
      `(${testInfo.project.name}), sobre ${cajas.length} medidas:\n` +
      problemas.join("\n"),
  ).toHaveLength(0);
});

// TODO (post-congelación, 9-ago): si se adopta la tinta oscura como
// --primary-foreground en oscuro, añadir aquí un tercer test que fuerce
// :hover sobre los botones primarios y repita el aserto de AA. MEDIDO hoy:
// primary/80 sobre #0b0b0d compone #c62b31, y ahí la tinta da 3,555:1.
