import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

import { medirContrasteEnDegradados } from "./contraste-degradado";
import { expectNoHorizontalOverflow } from "./helpers";

// T8 de la película — la primera auditoría de accesibilidad automática del repo.
//
// QUÉ CUBRE Y QUÉ NO, para que nadie la dé por más de lo que es:
//
//   SÍ  · contraste de TEXTO (WCAG 1.4.3) en los dos temas, que es donde se
//         cuelan las etiquetas grises sobre fondos claros. Incluido el texto
//         sobre DEGRADADO, pero eso NO lo mide axe: ver el 🪤 de abajo.
//   SÍ  · semántica de tabla: caption, scope, cabeceras con datos debajo. El
//         bloque de agarre pinta sus asaltos como tabla justo por esto.
//   SÍ  · aria-hidden que contenga algo enfocable — la regla que pilla el
//         patrón de plegado de event-bout-disclosure.tsx:79 si alguien mete un
//         enlace o un botón dentro de un panel cerrado.
//   NO  · el contraste de los GRÁFICOS (WCAG 1.4.11). axe-core no implementa
//         esa regla: solo mide texto. El contraste de la barra de agarre lo
//         vigila src/lib/contrast.test.ts, que lee globals.css y calcula los
//         ratios contra la superficie real y contra los colores adyacentes.
//
// Las dos redes juntas cubren el bloque entero. Ninguna sola basta.
//
// 🪤 Y HASTA EL 15-AGO-2026 ESTA CABECERA MENTÍA. Decía que el contraste de
// texto estaba cubierto, y para todo lo que va dentro de un tile era falso:
// axe-core no resuelve un fondo en DEGRADADO —y los tiles de la ficha son
// `bg-gradient-to-b from-card to-muted/60`—, así que no lo declara violación,
// lo deja en `incomplete`. Este fichero solo leía `violations`. Resultado: 29
// nodos de texto del bloque de agarre nunca se midieron, y por ese hueco se
// publicó durante cuatro días una línea a 4,01:1 en las 8.612 fichas.
//
// La lección no es «axe es limitado»: es que un vigilante tiene que declarar lo
// que NO mira, y este afirmaba lo contrario en su propia cabecera. Ahora los
// `incomplete` de contraste se resuelven en e2e/contraste-degradado.ts y los
// que ni ese resolvedor sabe decidir se cuentan y se congelan, para que un nodo
// nuevo no pueda volver a desaparecer en silencio.

// 14232 es el combate del maquetado: Sousa (rojo) vs Miranda (azul), U-DEC, y
// el ÚNICO tipo de ficha donde conviven los tres bloques (película + agarre +
// asalto a asalto). Son 32 combates de 8.612.
// 3821 es una ficha normal, de las 8.580 que NO tienen película: ahí el bloque
// de agarre queda pegado a "Asalto a asalto" sin nada en medio.
const FICHAS = [
  { url: "/fights/14232", que: "los tres bloques" },
  { url: "/fights/3821", que: "sin película" },
] as const;

// Las reglas se declaran por etiqueta y no por nombre: así, cuando axe añada
// comprobaciones nuevas a WCAG 2.1 AA, entran solas.
const ETIQUETAS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"];

/**
 * Espera a que el tema esté REALMENTE aplicado antes de medir nada.
 *
 * 🪤 Sin esto la auditoría es una moneda al aire, y se cazó midiendo: next-themes
 * pone la clase `light`/`dark` en el <html> desde JavaScript, así que hay una
 * ventana de ~100 ms en la que el documento no tiene ninguna de las dos y se
 * pinta con la paleta clara. axe que corra dentro de esa ventana audita el tema
 * CLARO creyendo que audita el oscuro y sale verde.
 *
 * Apareció como 4 tests "flaky" en el megatest: fallaban a la primera y pasaban
 * al reintento. Un vigilante que unas veces mira y otras no es peor que ninguno,
 * porque enseña a ignorar sus rojos.
 */
async function esperarTema(page: Page) {
  const tema = test.info().project.name.endsWith("-dark") ? "dark" : "light";
  await expect(page.locator("html")).toHaveClass(new RegExp(`(^|\\s)${tema}(\\s|$)`));
}

/**
 * Recorre la página entera y espera a que la altura deje de moverse.
 *
 * 🪤 ESTO NO ES PRECAUCIÓN: sin ello la auditoría es decorativa. Next sirve la
 * ficha por streaming, así que el contenido llega dentro de contenedores
 * ocultos y un script en línea lo coloca después. Mientras está ahí, cada
 * elemento mide 0x0 — y axe SALTA todo lo que mide cero, sin avisar de nada.
 *
 * Medido el 11-ago-2026 en /fights/3821 a 1280 px:
 *
 *     altura del cuerpo antes de asentar . . . 1.257 px  ->  0 violaciones
 *     altura después de asentar  . . . . . . . 3.477 px  ->  2 violaciones
 *
 * Dos tercios de la página no se estaban auditando, y la puerta salía verde.
 */
async function asentar(page: Page) {
  await page.waitForLoadState("load");
  await page.evaluate(async () => {
    const paso = window.innerHeight;
    for (let y = 0; y < document.body.scrollHeight; y += paso) {
      window.scrollTo(0, y);
      await new Promise((r) => requestAnimationFrame(() => r(null)));
    }
    window.scrollTo(0, 0);
    await new Promise((r) => requestAnimationFrame(() => r(null)));
  });

  let previa = -1;
  for (let i = 0; i < 20; i += 1) {
    const altura = await page.evaluate(() => document.body.scrollHeight);
    if (altura === previa) {
      return;
    }
    previa = altura;
    await page.waitForTimeout(100);
  }
}

/**
 * Abre todos los <details> antes de auditar.
 *
 * Sin esto el desplegable del bloque de agarre NO se audita: el contenido de un
 * <details> cerrado está oculto y axe salta lo oculto, así que la tabla de
 * asaltos —que es justo la parte con semántica que hay que vigilar— quedaría
 * fuera del alcance del vigilante sin que nadie se enterara.
 */
async function abrirDesplegables(page: Page) {
  await page.evaluate(() => {
    for (const d of Array.from(document.querySelectorAll("details"))) {
      d.open = true;
    }
  });
}

/**
 * DEUDA CONOCIDA, medida el 11-ago-2026 y AJENA a este bloque.
 *
 * No se silencia la regla entera: se descartan estos nodos concretos y
 * cualquier otro incumplimiento —incluido uno nuevo de la MISMA regla— sigue
 * saliendo en rojo. Si alguien arregla uno, este fichero avisa (ver el test
 * "la deuda conocida sigue siendo exactamente la que creemos").
 *
 * Las tres son SOLO de tema oscuro, y la causa es la misma en dos de ellas: la
 * paleta oscura aclara el rojo de marca para que despegue del fondo negro, y al
 * aclararlo el TEXTO BLANCO que va encima se queda sin contraste. Los hermanos
 * de esos tokens ya lo resuelven al revés (--win-foreground es #052e16 y
 * --nc-foreground es #451a03, tintas oscuras), así que el arreglo probablemente
 * sea de una línea — pero cambia botones y distintivos de todo el sitio, y eso
 * no es de esta sesión.
 */
const DEUDA_CONOCIDA = [
  {
    regla: "color-contrast",
    enHtml: "group/button",
    nota: "botón con texto blanco sobre --primary oscuro (#f5333a): 3.87:1, pide 4.5:1",
  },
  {
    regla: "color-contrast",
    enHtml: "text-white bg-corner-red",
    nota: 'distintivo "Ganador", blanco sobre --corner-red oscuro (#f5474c): 3.56:1',
  },
  {
    regla: "scrollable-region-focusable",
    enHtml: "mt-4 overflow-x-auto",
    nota: "la tabla de round-by-round.tsx:152 desborda y no se recorre con teclado",
  },
] as const;

const esDeudaConocida = (reglaId: string, html: string) =>
  DEUDA_CONOCIDA.some(
    (deuda) => deuda.regla === reglaId && html.includes(deuda.enHtml),
  );

async function auditar(page: Page) {
  await asentar(page);
  await abrirDesplegables(page);
  const { violations, incomplete } = await new AxeBuilder({ page })
    .withTags(ETIQUETAS)
    .analyze();

  // 🪤 `incomplete` NO ES RUIDO: es donde axe deja lo que no sabe decidir, y
  // hasta el 15-ago-2026 este fichero solo leía `violations`. Todo el texto de
  // un tile va sobre el degradado de PREMIUM_TILE, y ante un degradado axe se
  // abstiene: 29 nodos del bloque de agarre caían ahí en silencio mientras la
  // cabecera de este fichero afirmaba cubrir el contraste de texto.
  const candidatos = incomplete
    .filter((v) => v.id === "color-contrast")
    .flatMap((v) =>
      v.nodes.map((n) => ({
        target: n.target.map(String),
        html: n.html,
        mensaje: [...n.any, ...n.all, ...n.none]
          .map((c) => c.message ?? "")
          .join(" "),
      })),
    );
  const degradados = await medirContrasteEnDegradados(page, candidatos);

  // Se filtra NODO a NODO, no regla a regla: si aparece otro elemento que
  // incumple color-contrast, la violación sobrevive al filtro y falla.
  const vivas = violations
    .map((v) => ({
      ...v,
      nodes: v.nodes.filter((n) => !esDeudaConocida(v.id, n.html)),
    }))
    .filter((v) => v.nodes.length > 0);

  // Los fallos del degradado entran por la misma puerta que los de axe, con la
  // misma regla, para que la lista de deuda los filtre igual y para que no haya
  // dos sitios donde mirar.
  const delDegradado = degradados.fallos.filter(
    (f) => !esDeudaConocida("color-contrast", f.html),
  );
  if (delDegradado.length > 0) {
    vivas.push({
      id: "color-contrast",
      impact: "serious",
      help: "Texto sobre degradado: contraste insuficiente (medido por e2e/contraste-degradado.ts, no por axe)",
      description: "",
      helpUrl: "",
      tags: [],
      nodes: delDegradado.map((f) => ({
        html: f.html,
        target: [f.target],
        failureSummary: `${f.ratio}:1 sobre ${f.fondo} con texto ${f.color}; exige ${f.exigido}:1. Texto: «${f.texto}»`,
        any: [],
        all: [],
        none: [],
        impact: "serious" as const,
      })),
    } as (typeof vivas)[number]);
  }

  return { violations, vivas, degradados };
}

type Violaciones = Awaited<ReturnType<typeof auditar>>["vivas"];

function informe(violations: Violaciones) {
  return violations
    .map(
      (v) =>
        `[${v.impact ?? "?"}] ${v.id}: ${v.help}\n` +
        v.nodes
          .slice(0, 3)
          .map((n) => `    ${n.target.join(" ")}\n      ${n.failureSummary ?? ""}`)
          .join("\n"),
    )
    .join("\n\n");
}

for (const ficha of FICHAS) {
  test(`${ficha.url} (${ficha.que}) no tiene violaciones de accesibilidad`, async ({
    page,
  }) => {
    await page.goto(ficha.url);
    await expect(page.locator("#main-content")).toBeVisible();
    await esperarTema(page);

    const { vivas } = await auditar(page);

    expect(
      vivas,
      `Violaciones en ${ficha.url}:\n\n${informe(vivas)}`,
    ).toEqual([]);
  });
}

// La lista de deuda no puede convertirse en un cajón donde las cosas entran y
// nunca salen. Este test la mantiene honesta: si alguien arregla una de las
// tres, aquí sale en rojo pidiendo que se borre de la lista.
// El resolvedor de degradados tampoco lo sabe todo, y lo que no sabe hay que
// CONTARLO. Sin este test, un nodo que el resolvedor no pueda medir se
// comportaría igual que antes —desaparecer sin dejar rastro—, que es el fallo
// que se acaba de arreglar, solo que una capa más adentro.
test("los nodos que el resolvedor de degradados NO sabe medir siguen siendo los que creemos", async ({
  page,
}) => {
  test.skip(
    test.info().project.name !== "movil-light",
    "el recuento es el mismo en los seis proyectos; se comprueba una vez",
  );

  await page.goto("/fights/14232");
  await expect(page.locator("#main-content")).toBeVisible();
  await esperarTema(page);

  const { degradados } = await auditar(page);

  // Hoy el resolvedor decide TODOS los candidatos. Si algún día aparece un
  // fondo que no sabe componer (una imagen, un filtro, un color exótico), este
  // número sube y hay que mirarlo, no subirlo aquí sin más.
  expect(
    degradados.sinResolver.map((n) => n.motivo).sort(),
    "el resolvedor se ha topado con algo nuevo; míralo antes de tocar este número",
  ).toEqual([]);

  // Y que efectivamente esté midiendo: un resolvedor que no resuelve nada
  // también devolvería cero fallos.
  expect(
    degradados.resueltos,
    "el resolvedor no midió ni un nodo: o axe dejó de devolver incomplete, o el filtro los descarta todos",
  ).toBeGreaterThan(20);
});

test("la deuda conocida sigue siendo exactamente la que creemos", async ({
  page,
}) => {
  // Solo en móvil oscuro: las tres son de tema oscuro, y la del carril con
  // scroll solo se da cuando la tabla desborda, o sea en pantalla estrecha.
  test.skip(
    test.info().project.name !== "movil-dark",
    "se comprueba una vez, donde se dan las tres",
  );

  await page.goto("/fights/3821");
  await expect(page.locator("#main-content")).toBeVisible();
  await esperarTema(page);

  const { violations } = await auditar(page);
  const reglasEnDeuda = violations
    .filter((v) => v.nodes.some((n) => esDeudaConocida(v.id, n.html)))
    .map((v) => v.id)
    .sort();

  expect(
    reglasEnDeuda,
    "si una de las tres ya no aparece, bórrala de DEUDA_CONOCIDA en este fichero",
  ).toEqual(["color-contrast", "scrollable-region-focusable"]);
});

// La especificación de la película exige 375 px, y el viewport "móvil" de la
// casa son 390. Cuarenta y cinco píxeles menos parecen poco y no lo son: es el
// ancho al que el par de apellidos de la barra se toca en el centro.
test.describe("a 375 px, el ancho que exige la especificación", () => {
  for (const ficha of FICHAS) {
    test(`${ficha.url} aguanta 375 px sin desbordar ni perder accesibilidad`, async ({
      page,
    }) => {
      // Solo en los proyectos móviles: al forzar el viewport, en tablet y
      // escritorio sería exactamente la misma medida repetida tres veces.
      test.skip(
        !test.info().project.name.startsWith("movil"),
        "se mide una sola vez por tema, en el proyecto móvil",
      );

      await page.setViewportSize({ width: 375, height: 812 });
      await page.goto(ficha.url);
      await expect(page.locator("#main-content")).toBeVisible();
    await esperarTema(page);

      await expectNoHorizontalOverflow(page, `${ficha.url} a 375 px`);

      const { vivas } = await auditar(page);
      expect(
        vivas,
        `Violaciones en ${ficha.url} a 375 px:\n\n${informe(vivas)}`,
      ).toEqual([]);
    });
  }
});
