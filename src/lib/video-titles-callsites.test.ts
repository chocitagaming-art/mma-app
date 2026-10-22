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

// LA RUEDA DE PRENSA (migración 033 de mma-ingesta). Lo que se pinta lo juzga
// `components/event-press-conference.test.ts`; aquí, que la ficha lo cablee en
// su sitio y que no se cuele en ningún otro.
describe("el vídeo de la rueda de prensa", () => {
  const FICHA = "app/eventos/[id]/page.tsx";

  it("la ficha le pasa el vídeo y su título real a la sección", () => {
    const marca = etiqueta(leerFuente(FICHA), "EventPressConferenceSection");
    expect(marca, `${FICHA} no pinta la rueda de prensa`).not.toBeNull();
    expect(marca).toContain("videoId={event.pressVideoId}");
    expect(marca, "sin su título, la sección rotularía un vídeo que no sabe nombrar").toContain(
      "videoTitle={event.pressVideoTitle}",
    );
  });

  it("y no repite un vídeo que la ficha ya enseña como careo o como pesaje", () => {
    const marca = etiqueta(leerFuente(FICHA), "EventPressConferenceSection") ?? "";
    expect(marca).toContain("event.faceoffVideoId");
    expect(marca).toContain("event.weighinVideoId");
  });

  it("el directo detectado tampoco repite la rueda de prensa", () => {
    // resolveEventVideo descarta el vídeo que UFC TV detecta si la ficha ya lo
    // enseña más abajo: la rueda de prensa entra en esa lista.
    const src = leerFuente(FICHA);
    const inicio = src.indexOf("resolveEventVideo(");
    expect(inicio, `${FICHA} ya no resuelve el directo`).toBeGreaterThan(-1);
    const llamada = src.slice(inicio, src.indexOf(");", inicio));
    expect(llamada).toContain("event.pressVideoId");
  });

  it("va justo después del careo y antes del pesaje", () => {
    const src = leerFuente(FICHA);
    const careo = src.indexOf("{event.faceoffVideoId ? (");
    const rueda = src.indexOf("<EventPressConferenceSection");
    const pesaje = src.indexOf("<EventWeighInsSection");
    expect(careo, "no encuentro el bloque del careo").toBeGreaterThan(-1);
    expect(rueda, "la rueda de prensa no va después del careo").toBeGreaterThan(careo);
    expect(pesaje, "la rueda de prensa no va antes del pesaje").toBeGreaterThan(rueda);
    // «Justo después»: del careo a la rueda, la única sección es la del careo y
    // no se pinta ningún otro bloque del evento (directo, pesaje...).
    const tramo = src.slice(careo, rueda);
    expect(tramo.match(/<section\b/g), "hay otra sección entre el careo y la rueda").toHaveLength(1);
    expect(tramo, "hay otro bloque del evento entre el careo y la rueda").not.toMatch(/<Event\w+/);
  });

  it("la sección no afirma que el vídeo sea de la UFC", () => {
    // La rueda del UFC 333 que eligió el dueño es una resubida del canal «MMA
    // Español», no la conferencia de la UFC (esa es DHLdj5yFWmw, en inglés).
    // Mismo aviso que el pesaje de TheMacLife: un «oficial» aquí sería falso.
    const src = leerFuente("components/event-press-conference.tsx");
    expect(src).not.toContain("canal oficial");
    expect(src).not.toMatch(/Rueda de prensa oficial/i);
    expect(src, "el título real del vídeo dejó de pintarse").toContain("videoTitle");
  });

  it("solo la pinta la ficha del evento: ni /en-vivo ni la portada", () => {
    const sitios = [...recorrerTsx("app/"), ...recorrerTsx("components/")]
      .filter((ruta) => {
        const src = leerFuente(ruta);
        return src.includes("<EventPressConferenceSection") || src.includes("pressVideo");
      })
      .sort();
    expect(sitios).toEqual([FICHA]);
  });
});
