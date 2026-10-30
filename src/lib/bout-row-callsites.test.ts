import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

// QUIÉN PINTA LA FILA DE CARTELERA, Y CON QUÉ CARAS.
//
// <EventBoutRow> tiene dos tamaños de cara (headshotSize, ver ROW_LAYOUTS en
// components/event-bout-row-layout.ts): la fila grande (72/96 px, con el
// original de ufc.com) y la de siempre (36/48). Qué sitio pide cuál lo decidió
// el dueño, y no se deduce de nada: el 29-oct-2026 la portada («ponemos las
// fotos de las cabezas más grandes y nítidas») y el 30-oct la cartelera de
// /eventos/[id] y /ufc-hoy, y esa misma noche /en-vivo (el «Ver en directo» de
// la ficha llevaba a caras pequeñas). Las «Peleas canceladas» de la ficha se
// quedan pequeñas: son combates que no se van a celebrar.
//
// Ningún test de geometría ve un sitio que se queda con la fila de siempre: la
// pequeña también cabe. Por eso el guard va sobre el CÓDIGO FUENTE, como
// live-embed-callsites.test.ts: cada <EventBoutRow de app/ y components/, con lo
// que recorre (`section.bouts`, `event.cancelledBouts`…) y lo que pide. Un sitio
// nuevo, uno que desaparece o uno que cambia de tamaño es ROJO, y quien lo toque
// tiene que decidirlo a conciencia aquí.
//
// Este fichero vive en lib/ y no se lee a sí mismo (ver live-embed-callsites).

const SRC = new URL("../", import.meta.url);

function leerFuente(ruta: string): string {
  return readFileSync(fileURLToPath(new URL(ruta, SRC)), "utf8");
}

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

type Sitio = { clave: string; tamano: string };

// Cada etiqueta <EventBoutRow …/> del fichero, con la lista que recorre (el
// `.map(` más cercano por encima) y su headshotSize: "large", "default" si no
// lo pide, o el texto tal cual si es otra cosa (una variable también es rojo:
// el tamaño tiene que leerse en el sitio).
function sitiosDe(ruta: string): Sitio[] {
  const src = leerFuente(ruta);
  const sitios: Sitio[] = [];
  for (const { index } of src.matchAll(/<EventBoutRow\b/g)) {
    const fin = src.indexOf("/>", index);
    if (fin === -1) throw new Error(`${ruta}: <EventBoutRow sin cerrar`);
    const etiqueta = src.slice(index, fin + 2);
    const antes = src.slice(0, index);
    const mapas = [...antes.matchAll(/([\w.?]+)\.map\(/g)];
    const lista = mapas.at(-1)?.[1] ?? "(sin .map)";
    const pedido = /\bheadshotSize=(?:"([^"]*)"|\{([^}]*)\})/.exec(etiqueta);
    const tamano = pedido ? (pedido[1] ?? `{${pedido[2]}}`) : "default";
    sitios.push({ clave: `${ruta} · ${lista}`, tamano });
  }
  return sitios;
}

// El mapa decidido. Clave: fichero · lo que recorre.
const MAPA: Record<string, "large" | "default"> = {
  // La portada, «Último evento» (29-oct).
  "components/home/last-event-section.tsx · event.bouts": "large",
  // La cartelera de la ficha del evento (30-oct).
  "app/eventos/[id]/page.tsx · section.bouts": "large",
  // Las canceladas de la ficha: plegadas, al 70 % y PEQUEÑAS a propósito.
  "app/eventos/[id]/page.tsx · event.cancelledBouts": "default",
  // /ufc-hoy, la cartelera de la velada (30-oct).
  "app/ufc-hoy/page.tsx · seccion.bouts": "large",
  // /en-vivo, el marcador del directo (30-oct por la noche).
  "app/en-vivo/page.tsx · section.bouts": "large",
};

describe("sitios que pintan EventBoutRow", () => {
  const sitios = [...recorrerTsx("app/"), ...recorrerTsx("components/")].flatMap(sitiosDe);

  it("son exactamente los del mapa, ni uno más ni uno menos", () => {
    expect(sitios.map((s) => s.clave).sort()).toEqual(Object.keys(MAPA).sort());
  });

  for (const [clave, tamano] of Object.entries(MAPA)) {
    it(`🔴 ${clave} → ${tamano === "large" ? "la fila grande" : "la de siempre"}`, () => {
      const sitio = sitios.find((s) => s.clave === clave);
      expect(sitio, `${clave} ya no pinta <EventBoutRow>`).toBeDefined();
      expect(sitio?.tamano, `${clave}: headshotSize`).toBe(tamano);
    });
  }
});
