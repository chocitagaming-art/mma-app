import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import {
  blend,
  contrastRatio,
  extractBlock,
  parseColorTokens,
  parseHex,
  relativeLuminance,
} from "@/lib/contrast";

// Este test LEE globals.css. No es una copia de los valores: si alguien cambia
// un color en el CSS, aquí se entera. Es el único vigilante de contraste que
// tiene el repo, y existe porque la especificación de la película admite por
// escrito que "los ratios citados no se recalcularon".
const CSS = readFileSync(
  fileURLToPath(new URL("../app/globals.css", import.meta.url)),
  "utf8",
);

const claro = parseColorTokens(extractBlock(CSS, ":root") ?? "");
const oscuro = parseColorTokens(extractBlock(CSS, ".dark") ?? "");

// El umbral de WCAG 2.1 SC 1.4.11 para elementos gráficos que transmiten
// información. No es 4.5 (eso es texto, 1.4.3) ni 3.0 por gusto: es la norma.
const UMBRAL = 3;

// La superficie REAL sobre la que se dibuja el bloque de agarre.
//
// NO es --card. Los tiles de la ficha usan PREMIUM_TILE, que es
// `bg-gradient-to-b from-card to-muted/60` (y `dark:to-muted/30`). El extremo
// del degradado lleva alpha, así que compone contra lo que hay DETRÁS del tile,
// que es --background. Medir contra --card a secas regala contraste.
function superficies(tokens: Record<string, string>, alphaMuted: number) {
  const arriba = tokens["--card"];
  const abajo = blend(tokens["--muted"], tokens["--background"], alphaMuted);
  expect(abajo).not.toBeNull();
  return { arriba, abajo: abajo as string };
}

const TEMAS = [
  { nombre: "claro", tokens: claro, alphaMuted: 0.6 },
  { nombre: "oscuro", tokens: oscuro, alphaMuted: 0.3 },
] as const;

describe("aritmética de contraste", () => {
  it("parsea hex de 6 y de 3 cifras, y rechaza lo que no lo es", () => {
    expect(parseHex("#d20a0a")).toEqual([210, 10, 10]);
    expect(parseHex("d20a0a")).toEqual([210, 10, 10]);
    expect(parseHex("#fff")).toEqual([255, 255, 255]);
    expect(parseHex("oklch(0.5 0.1 30)")).toBeNull();
    expect(parseHex("")).toBeNull();
  });

  it("da los dos extremos que fija la norma", () => {
    // Blanco sobre negro es el máximo posible, y sale 21 exacto.
    expect(contrastRatio("#ffffff", "#000000")).toBeCloseTo(21, 5);
    // Un color contra sí mismo es 1: no hay contraste.
    expect(contrastRatio("#d20a0a", "#d20a0a")).toBeCloseTo(1, 5);
  });

  it("es simétrico: el orden de los colores no cambia el número", () => {
    const ida = contrastRatio("#52525b", "#ffffff");
    const vuelta = contrastRatio("#ffffff", "#52525b");
    expect(ida).toBeCloseTo(vuelta as number, 10);
  });

  it("devuelve null en vez de NaN cuando el color no se entiende", () => {
    expect(contrastRatio("#ffffff", "var(--card)")).toBeNull();
    expect(relativeLuminance([0, 0, 0])).toBe(0);
    expect(relativeLuminance([255, 255, 255])).toBeCloseTo(1, 10);
  });

  it("compone alpha: opaco devuelve el color, transparente el fondo", () => {
    expect(blend("#000000", "#ffffff", 1)).toBe("#000000");
    expect(blend("#000000", "#ffffff", 0)).toBe("#ffffff");
    expect(blend("#ffffff", "#000000", 0.5)).toBe("#808080");
    expect(blend("#ffffff", "#000000", Number.NaN)).toBeNull();
  });

  it("lee los tokens de cada tema por separado, sin mezclarlos", () => {
    // Mismo nombre, valor distinto en cada bloque: si extractBlock contara mal
    // las llaves, los dos temas devolverían lo mismo.
    expect(claro["--card"]).toBe("#ffffff");
    expect(oscuro["--card"]).toBe("#161619");
    expect(claro["--card"]).not.toBe(oscuro["--card"]);
    expect(extractBlock(CSS, ".selector-que-no-existe")).toBeNull();
  });
});

describe("T7 · el tramo «nadie sujetaba» cumple WCAG 1.4.11", () => {
  it("el token existe declarado en los DOS temas", () => {
    // Un token declarado solo en :root heredaría el valor claro en oscuro, y
    // eso ya pasa a propósito con --brand-ink: el olvido y la decisión se
    // parecen demasiado como para no fijarlo.
    expect(claro["--grip-nobody"]).toMatch(/^#[0-9a-f]{6}$/i);
    expect(oscuro["--grip-nobody"]).toMatch(/^#[0-9a-f]{6}$/i);
    expect(claro["--grip-nobody"]).not.toBe(oscuro["--grip-nobody"]);
  });

  it("está registrado en @theme inline, sin lo cual no existe la utilidad", () => {
    // Comprobado compilando con el postcss del repo: un token declarado solo en
    // :root/.dark no genera NINGUNA clase de Tailwind. Falla en silencio.
    expect(CSS).toContain("--color-grip-nobody: var(--grip-nobody);");
  });

  for (const { nombre, tokens, alphaMuted } of TEMAS) {
    describe(`tema ${nombre}`, () => {
      const { arriba, abajo } = superficies(tokens, alphaMuted);
      const fondos = [
        ["arriba del degradado", arriba],
        ["abajo del degradado", abajo],
      ] as const;

      // Los TRES tramos de la barra tienen que despegarse del fondo, no solo el
      // nuevo: si el rojo o el azul dejaran de cumplir, la barra sería igual de
      // inconforme aunque «nadie» estuviera perfecto.
      const tramos = [
        ["--grip-nobody", tokens["--grip-nobody"]],
        ["--corner-red", tokens["--corner-red"]],
        ["--corner-blue", tokens["--corner-blue"]],
      ] as const;

      for (const [tramo, color] of tramos) {
        for (const [donde, fondo] of fondos) {
          it(`${tramo} llega a 3:1 ${donde}`, () => {
            const ratio = contrastRatio(color, fondo);
            expect(ratio).not.toBeNull();
            expect(ratio as number).toBeGreaterThanOrEqual(UMBRAL);
          });
        }
      }

      // --border era el candidato obvio para el tramo «nadie» y es el motivo de
      // que T7 exista. Este test lo deja fijado: mientras siga por debajo de
      // 3:1, volver a él es una regresión, no una simplificación.
      it("--border NO vale para un tramo que significa", () => {
        const ratio = contrastRatio(tokens["--border"], arriba);
        expect(ratio).not.toBeNull();
        expect(ratio as number).toBeLessThan(UMBRAL);
      });

      // 1.4.11 no pide solo contraste contra el fondo: lo pide contra los
      // colores ADYACENTES. Y aquí ningún relleno lo cumple contra su vecino:
      // medido, «nadie» contra el rojo da 1.39 y contra el azul 1.26.
      //
      // Por eso los tramos van SEPARADOS por una línea del color de la
      // superficie, y esa línea NO es decorativa: es lo que hace conforme a la
      // barra. Este test existe para que quitarla salga en rojo.
      it("los rellenos NO se distinguen entre sí: el separador es obligatorio", () => {
        const nobodyVsRed = contrastRatio(
          tokens["--grip-nobody"],
          tokens["--corner-red"],
        );
        const nobodyVsBlue = contrastRatio(
          tokens["--grip-nobody"],
          tokens["--corner-blue"],
        );

        expect(nobodyVsRed as number).toBeLessThan(UMBRAL);
        expect(nobodyVsBlue as number).toBeLessThan(UMBRAL);
      });

      it("el separador sí se distingue de los tres tramos que separa", () => {
        // El separador es el color de la superficie del tile (--card), que es
        // lo que se ve por el hueco entre tramo y tramo.
        for (const [, color] of tramos) {
          const ratio = contrastRatio(tokens["--card"], color);
          expect(ratio).not.toBeNull();
          expect(ratio as number).toBeGreaterThanOrEqual(UMBRAL);
        }
      });
    });
  }
});

// ---------------------------------------------------------------------------
// El chip «EN VIVO» de la cabecera (live-nav-chip.tsx)
// ---------------------------------------------------------------------------
//
// 🪤 LO CAZÓ EL MEGATEST DEL 15-AGO, Y SOLO PORQUE ERA DÍA DE VELADA. El chip
// se pinta únicamente en fase "live" o "pre" (evento a menos de 24 h), así que
// en un día cualquiera NO EXISTE en el DOM y axe no puede verlo. Llevaba
// publicándose en la cabecera de TODAS las páginas cada fin de semana de
// velada con `text-primary` sobre `bg-primary/10` = 4,36:1 en tema claro,
// donde el texto pequeño pide 4,5.
//
// Y el agujero simétrico, que es la parte que casi se cuela: el HOVER estaba
// PEOR que el reposo —`bg-primary/20` da 3,66 en claro y 4,22 en oscuro— y
// axe tampoco lo audita, porque no simula el puntero encima. Bajar solo el
// reposo habría dejado el de al lado abierto. Por eso el hover ya no cambia el
// fondo: intensifica el BORDE, y así el ratio del texto es el mismo en los dos
// estados y no hay un segundo número que vigilar.
const UMBRAL_TEXTO = 4.5;

describe("el chip «EN VIVO» de la cabecera cumple WCAG 1.4.3", () => {
  // Tiene que coincidir con live-nav-chip.tsx. Si alguien sube el tinte, este
  // número deja de cuadrar con el CSS y el test de abajo cae.
  const ALPHA_FONDO = 0.05;

  for (const { nombre, tokens } of TEMAS) {
    describe(`tema ${nombre}`, () => {
      // El chip vive en el <header>, que es `bg-background/85` sobre la página:
      // el fondo efectivo es --background, no --card.
      const fondo = blend(tokens["--primary"], tokens["--background"], ALPHA_FONDO);

      it("el texto llega a 4,5:1 en reposo", () => {
        const ratio = contrastRatio(tokens["--primary"], fondo as string);
        expect(ratio).not.toBeNull();
        expect(ratio as number).toBeGreaterThanOrEqual(UMBRAL_TEXTO);
      });

      it("y el hover NO puede oscurecer el fondo, o vuelve a incumplir", () => {
        // La prueba de que el arreglo de reposo no basta: con el tinte del
        // hover que había antes (0.2), el claro se queda en 3,66.
        const conHoverViejo = blend(tokens["--primary"], tokens["--background"], 0.2);
        const ratioViejo = contrastRatio(tokens["--primary"], conHoverViejo as string);
        expect(ratioViejo as number).toBeLessThan(UMBRAL_TEXTO);
      });
    });
  }

  it("live-nav-chip.tsx usa el alpha que este test mide, y no cambia el fondo al pasar el ratón", () => {
    // Sin esto el test mediría una aritmética bonita que el componente no usa.
    //
    // 🪤 Se lee SOLO el className, no el fichero entero. La primera versión de
    // este aserto hacía `expect(fichero).not.toContain("hover:bg-primary")` y
    // salía en rojo por el comentario que explica el arreglo, que menciona las
    // clases viejas. Un vigilante que se lee a sí mismo no vigila nada.
    const chip = readFileSync(
      fileURLToPath(new URL("../components/live/live-nav-chip.tsx", import.meta.url)),
      "utf8",
    );
    const clases = chip.match(/className="([^"]+)"/)?.[1];
    expect(clases, "no encontré el className del chip").toBeDefined();
    expect(clases).toContain("bg-primary/5");
    // Cualquier utilidad de fondo en hover vuelve a mover el ratio del texto.
    expect(clases).not.toMatch(/hover:bg-/);
  });
});

// ---------------------------------------------------------------------------
// Los distintivos de esquina y el botón de marca, en tema oscuro
// ---------------------------------------------------------------------------
//
// La paleta oscura ACLARA el rojo y el azul de marca para que despeguen del
// fondo negro, y al aclararlos el texto blanco de encima se queda sin
// contraste. Medido el 15-ago-2026, con blanco:
//
//     --corner-red   #f5474c . . . 3,57:1   (distintivo «Ganador»)
//     --corner-blue  #3b92f0 . . . 3,20:1   (el mismo, esquina azul)
//     --primary      #f5333a . . . 3,88:1   (todos los botones del sitio)
//
// 🪤 DOS COSAS QUE LA LISTA DE DEUDA TENÍA MAL. Primera: apuntaba el rojo y no
// el azul, y el AZUL ESTÁ PEOR. No salía porque las dos fichas que audita el
// e2e tienen ganador de la esquina roja — la deuda describía la muestra, no el
// sitio. Segunda: la pista era «--corner-red-foreground es el único hermano que
// sigue en blanco», y cambiar ese token solo no habría movido un píxel, porque
// NADIE lo consumía: tale-of-the-tape.tsx escribía `text-white` a pelo.
//
// Las tintas nuevas siguen el patrón que ya usaban los hermanos del desenlace
// (--win-foreground #052e16, --nc-foreground #451a03): una versión muy oscura
// del propio color, no un negro genérico.
describe("distintivos de esquina y botón: el texto encima cumple 4,5:1", () => {
  const PARES = [
    ["--corner-red", "--corner-red-foreground"],
    ["--corner-blue", "--corner-blue-foreground"],
    ["--primary", "--primary-foreground"],
  ] as const;

  for (const { nombre, tokens } of TEMAS) {
    for (const [fondo, tinta] of PARES) {
      it(`${tinta} sobre ${fondo} en tema ${nombre}`, () => {
        const ratio = contrastRatio(tokens[tinta], tokens[fondo]);
        expect(ratio, `faltan tokens: ${fondo}=${tokens[fondo]} ${tinta}=${tokens[tinta]}`).not.toBeNull();
        expect(ratio as number).toBeGreaterThanOrEqual(UMBRAL_TEXTO);
      });
    }
  }

  it("el distintivo «Ganador» CONSUME los tokens en vez de escribir el blanco a pelo", () => {
    // Sin esto, los tokens de arriba pueden estar perfectos y la pantalla
    // seguir incumpliendo. Es exactamente lo que pasaba hasta el 15-ago.
    const tape = readFileSync(
      fileURLToPath(new URL("../components/tale-of-the-tape.tsx", import.meta.url)),
      "utf8",
    );
    expect(tape).toContain("text-corner-red-foreground");
    expect(tape).toContain("text-corner-blue-foreground");
  });

  it("el punto del directo NO cuelga de --primary-foreground", () => {
    // `bg-primary-foreground` eran cuatro puntos pulsantes con un halo blanco
    // escrito a mano. Con la tinta oscura nueva se habrían vuelto puntos
    // NEGROS con halo blanco: el agujero simétrico de este arreglo. Un brillo
    // no es texto y no puede colgar del token del texto.
    for (const ruta of [
      "../components/live/live-banner.tsx",
      "../components/live/live-cta-button.tsx",
      "../app/eventos/[id]/page.tsx",
      "../app/ufc-hoy/page.tsx",
    ]) {
      const src = readFileSync(fileURLToPath(new URL(ruta, import.meta.url)), "utf8");
      expect(src, `${ruta} sigue usando bg-primary-foreground para el punto`).not.toContain(
        "bg-primary-foreground",
      );
    }
  });
});

// ---------------------------------------------------------------------------
// Los badges de desenlace de /enfrentamiento
// ---------------------------------------------------------------------------
//
// 🪤 EL HOVER OTRA VEZ. Los cinco desenlaces iban con `bg-primary/10
// text-primary`, un tinte TRANSPARENTE, y la Card que los contiene lleva
// `hover:bg-accent`: al pasar el ratón el fondo cambia bajo el badge y el ratio
// se hunde a 4,03-4,38 en varias ramas. axe no simula el puntero, así que no lo
// vio nadie — el mismo patrón que el chip «EN VIVO» de la cabecera.
//
// Con el badge SÓLIDO el fondo es opaco y el hover deja de importar: el ratio
// es el mismo en los dos estados y solo hay un número que vigilar. Además cada
// desenlace pasa a tener su color, que era la otra mitad del fleco.
describe("badges de desenlace: sólidos, y por eso inmunes al hover", () => {
  const SOLIDOS = [
    ["--corner-red", "--corner-red-foreground"],
    ["--corner-blue", "--corner-blue-foreground"],
    ["--nc", "--nc-foreground"],
  ] as const;

  for (const { nombre, tokens } of TEMAS) {
    for (const [fondo, tinta] of SOLIDOS) {
      it(`${tinta} sobre ${fondo} en tema ${nombre}`, () => {
        const ratio = contrastRatio(tokens[tinta], tokens[fondo]);
        expect(ratio).not.toBeNull();
        expect(ratio as number).toBeGreaterThanOrEqual(UMBRAL_TEXTO);
      });

      it(`el badge ${fondo} se distingue de la tarjeta en tema ${nombre}`, () => {
        // 1.4.11: el badge es un elemento gráfico que transmite información, y
        // tiene que despegarse de la superficie sobre la que se apoya, tanto en
        // reposo (--card) como con el ratón encima (--accent).
        for (const superficie of ["--card", "--accent"] as const) {
          const ratio = contrastRatio(tokens[fondo], tokens[superficie]);
          expect(ratio, `${fondo} sobre ${superficie}`).not.toBeNull();
          expect(ratio as number).toBeGreaterThanOrEqual(UMBRAL);
        }
      });
    }
  }

  it("y el componente los consume: nada de tinte transparente", () => {
    const src = readFileSync(
      fileURLToPath(new URL("../components/matchup-client.tsx", import.meta.url)),
      "utf8",
    );
    expect(src).toContain("bg-win text-win-foreground");
    expect(src).toContain("bg-nc text-nc-foreground");
    // 🪤 Y NO puede volver el color de esquina: 'redWin' es la ranura del
    // formulario, no la esquina del combate, asi que pintarlo de rojo publica
    // un dato falso que cambia si intercambias a los dos luchadores.
    expect(src).not.toContain("bg-corner-red text-corner-red-foreground");
    expect(src).not.toContain("bg-corner-blue text-corner-blue-foreground");
  });
});

// ---------------------------------------------------------------------------
// El hover de los botones primarios
// ---------------------------------------------------------------------------
//
// 🪤 EL AGUJERO SIMÉTRICO DEL ARREGLO DE LA TARDE, cazado por la revisión de
// después de desplegar. Al pasar --primary-foreground a tinta oscura, el reposo
// pasó a cumplir (4,84) y el HOVER se rompió: `hover:bg-primary/80` atenúa el
// rojo contra el fondo negro, y sobre ese rojo apagado la tinta oscura cae a
// 3,39. Antes era al revés — reposo 3,88 y hover 5,54 con el blanco.
//
// Y no hay tinta que salve las dos. Medido en tema oscuro sobre los tres
// fondos que genera el propio CSS del botón (#f5333a, /90 #de2f36, /80
// #c62b31):
//
//     #ffffff . . . 3,88 / 4,60 / 5,54     falla el reposo
//     #2a0407 . . . 4,84 / 4,08 / 3,39     falla el hover
//     #000000 . . . 5,42 / 4,57 / 3,79     falla el hover
//
// El problema no es la tinta: es que --primary en oscuro no aguanta que le
// bajen la opacidad. `hover:opacity-90` tampoco vale (4,11): atenúa el fondo
// mucho más que la tinta casi negra, que ya está pegada al negro del fondo.
//
// Por eso EL HOVER YA NO TOCA EL COLOR. Da el feedback con un anillo, como ya
// hace `focus-visible`, y el ratio del texto es el mismo en los dos estados:
// un único número que vigilar en vez de dos que se mueven en direcciones
// contrarias. Es la misma conclusión a la que se llegó con el chip «EN VIVO» y
// con los badges de desenlace, tres veces el mismo día.
describe("ningún estado del botón primario puede atenuar su fondo", () => {
  const FICHEROS = [
    "../components/ui/button.tsx",
    "../components/ui/badge.tsx",
    "../components/market-model-comparison.tsx",
    "../components/matchup/prediction-section.tsx",
    "../app/fighters/page.tsx",
    "../components/matchup-client.tsx",
  ];

  for (const ruta of FICHEROS) {
    it(`${ruta.split("/").pop()} no baja la opacidad de bg-primary al pasar el ratón`, () => {
      const src = readFileSync(fileURLToPath(new URL(ruta, import.meta.url)), "utf8");
      // Solo importa donde el texto va con --primary-foreground ENCIMA de
      // bg-primary sólido. `hover:bg-primary/10` de los botones con borde es
      // otro patrón: ahí la tinta es `text-primary` y el fondo es la tarjeta,
      // no el rojo. Meterlos en el mismo saco daría un rojo que no significa
      // nada, y una puerta que grita sin motivo se acaba silenciando.
      //
      // 🪤 SE MIRA CADA CADENA, NO CADA LÍNEA NI CADA `className=`. La primera
      // versión de este aserto filtraba las líneas que contuvieran "className"
      // y daba VERDE con el fallo puesto a mano en button.tsx, porque ahí las
      // clases viven dentro de un objeto `cva` y no hay ningún `className=`.
      // Un verificador que no caza su propio control negativo no verifica nada,
      // y hoy es la tercera vez que pasa.
      const cadenas = src.match(/"[^"\n]*"|'[^'\n]*'|`[^`]*`/g) ?? [];
      const culpables = cadenas
        .filter((cadena) => /text-primary-foreground/.test(cadena))
        .flatMap((cadena) => cadena.match(/hover:bg-primary\/\d+/g) ?? []);
      expect(
        culpables,
        `atenuar bg-primary en hover hunde el texto a 3,39:1 en oscuro; usa un anillo`,
      ).toEqual([]);
    });
  }

  it("y la tinta cumple sobre el fondo a plena opacidad, que ahora es el único", () => {
    for (const { nombre, tokens } of TEMAS) {
      const ratio = contrastRatio(tokens["--primary-foreground"], tokens["--primary"]);
      expect(ratio, `tema ${nombre}`).not.toBeNull();
      expect(ratio as number, `tema ${nombre}`).toBeGreaterThanOrEqual(UMBRAL_TEXTO);
    }
  });
});
