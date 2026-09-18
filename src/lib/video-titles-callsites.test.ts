import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

// 🪤 EL RÓTULO NO SE INVENTA, Y ESO HAY QUE CABLEARLO EN CADA SITIO.
//
// El 18-sep-2026 el matcher de careos casó para el UFC 331 (id 1090) un short de
// 17 s titulado «what are these faceoffs saying?! #ufc331». La ficha del evento y
// /en-vivo lo pintaron bajo un rótulo escrito a mano —«Careo oficial»— y ninguna
// de las dos dijo nunca cómo se llamaba el vídeo, así que el error solo se veía
// dándole al play. Con el título real a la vista, un vídeo equivocado se delata
// solo. Es la misma lección que ya dejó escrita `event-live-embed.tsx`.
//
// Aquí no hay arnés de componentes React (vitest va en environment "node" a
// propósito, ver vitest.config.ts), así que el guard va sobre el CÓDIGO FUENTE,
// igual que hacen `live-embed-callsites.test.ts` y `contrast.test.ts`.
//
// Honestidad sobre lo que esto vale: comprueba que el título REAL está cableado
// en los dos sitios y que el vídeo del pesaje llega a la sección, no que se
// pinten bonitos. El mapeo de las columnas lo cubre `queries/event-videos.sql.test.ts`.

const SRC = new URL("../", import.meta.url);

function leerFuente(ruta: string): string {
  return readFileSync(fileURLToPath(new URL(ruta, SRC)), "utf8");
}

// Recorrido manual en vez de `readdirSync(..., { recursive: true })` para que se
// vea qué se mira y qué no: solo `app/` y `components/`. Este fichero vive en
// `lib/` y por eso no se lee a sí mismo — un vigilante que se cuenta entre los
// vigilados no vigila nada (misma trampa documentada en contrast.test.ts).
function recorrerTsx(rutaRelativa: string): string[] {
  const encontrados: string[] = [];
  for (const entrada of readdirSync(fileURLToPath(new URL(rutaRelativa, SRC)), {
    withFileTypes: true,
  })) {
    const hijo = `${rutaRelativa}${entrada.name}`;
    if (entrada.isDirectory()) {
      encontrados.push(...recorrerTsx(`${hijo}/`));
    } else if (entrada.name.endsWith(".tsx")) {
      encontrados.push(hijo);
    }
  }
  return encontrados;
}

// Se recorta la ETIQUETA, no el fichero: así el aserto exige que la prop esté en
// ESTA llamada (y no en cualquier otra línea del fichero que la mencione, un
// comentario incluido) y el fallo no escupe 400 líneas de JSX.
function etiqueta(src: string, componente: string): string | null {
  const inicio = src.indexOf(`<${componente}`);
  if (inicio === -1) {
    return null;
  }
  const fin = src.indexOf("/>", inicio);
  return fin === -1 ? null : src.slice(inicio, fin + 2);
}

const PAGINAS_CON_CAREO = ["app/en-vivo/page.tsx", "app/eventos/[id]/page.tsx"];

describe("el título real del vídeo del careo", () => {
  it("las dos páginas se lo pasan al reproductor en vez del rótulo a mano", () => {
    for (const ruta of PAGINAS_CON_CAREO) {
      const src = leerFuente(ruta);
      const marca = etiqueta(src, "FightVideoPlayer");
      expect(marca, `${ruta} ya no pinta el careo`).not.toBeNull();
      expect(
        marca,
        `${ruta} rotula el careo sin mirar faceoffVideoTitle: un vídeo equivocado ` +
          "volvería a pasar por «Careo oficial» sin que nada lo desmienta",
      ).toContain("faceoffVideoTitle");
    }
  });

  it("y además lo enseñan en pantalla, no solo en el texto accesible", () => {
    // El texto accesible del reproductor lo lee un lector de pantalla; el que
    // mira la ficha necesita VER de qué vídeo se trata. Son dos usos distintos
    // del mismo dato y el segundo es el que cazó el short del UFC 331.
    for (const ruta of PAGINAS_CON_CAREO) {
      const src = leerFuente(ruta);
      expect(
        src.split("faceoffVideoTitle").length - 1,
        `${ruta} usa faceoffVideoTitle una sola vez: falta el título visible`,
      ).toBeGreaterThanOrEqual(3); // el ternario del guard, el fallback y el <p>
    }
  });

  it("no hay un tercer sitio que pinte el careo", () => {
    const sitios = [...recorrerTsx("app/"), ...recorrerTsx("components/")]
      .filter((ruta) => leerFuente(ruta).includes("faceoffVideoId"))
      .sort();
    expect(sitios).toEqual(PAGINAS_CON_CAREO);
  });
});

describe("el vídeo del pesaje", () => {
  it("las dos páginas se lo pasan a la sección de pesaje", () => {
    for (const ruta of PAGINAS_CON_CAREO) {
      const marca = etiqueta(leerFuente(ruta), "EventWeighInsSection");
      expect(marca, `${ruta} ya no pinta el pesaje`).not.toBeNull();
      expect(marca, `${ruta} pinta el pesaje sin el vídeo`).toContain(
        "weighinVideoId",
      );
      expect(marca, `${ruta} pasa el vídeo del pesaje sin su título`).toContain(
        "weighinVideoTitle",
      );
    }
  });

  it("no hay un tercer sitio que pinte el pesaje", () => {
    const sitios = [...recorrerTsx("app/"), ...recorrerTsx("components/")]
      .filter((ruta) => leerFuente(ruta).includes("<EventWeighInsSection"))
      .sort();
    expect(sitios).toEqual(PAGINAS_CON_CAREO);
  });

  it("la sección no afirma que la señal sea de la UFC", () => {
    // El pesaje del UFC 331 lo sube TheMacLife, un canal de terceros. Un rótulo
    // como el del directo («canal oficial de la UFC») sería falso aquí, y es
    // exactamente el tipo de frase que se cuela al copiar un componente.
    const src = leerFuente("components/event-weigh-ins.tsx");
    expect(src).not.toContain("canal oficial");
    expect(src, "el título real del vídeo dejó de pintarse").toContain("videoTitle");
  });
});
