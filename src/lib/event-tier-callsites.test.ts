import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

// 🪤 EL FILTRO DEL EVENTO DESTACADO ES UN CABLEADO DE NUEVE SITIOS, Y SE ROMPE
// POR LOS DOS LADOS.
//
// El 26-ago-2026 el "Road To UFC: Maheshate vs. Flowers" (id 1094, viernes 28,
// dos combates, sin sede ni póster) desplazó al UFC Fight Night del sábado (id
// 1065, trece combates) en la portada, en /en-vivo, en /ufc-hoy, en /estado y
// en /directo. Los dos son `promotion_id = 1`: la promotora NO los distingue.
//
// El arreglo hay que ESCRIBIRLO A MANO en cada consulta que pregunta "¿cuál es
// EL evento?", y son nueve repartidas por cuatro ficheros. Los tests de al lado
// prueban que las consultas de HOY lo llevan; lo que no vigilaba nadie es el
// cableado del MAÑANA, y ahí hay dos fallos distintos, los dos silenciosos:
//
//   1. UN SITIO OLVIDADO. Una consulta nueva de "cuál es el próximo" sin el
//      predicado: vuelve el 26-ago, pero solo en esa página.
//   2. UN SITIO DE MÁS, QUE ES PEOR. Ponérselo a una consulta que pregunta
//      "¿QUÉ eventos existen?" —la lista de /eventos, la ficha del evento, el
//      buscador, los años, los pasados— deja un evento REAL de la UFC
//      inaccesible desde la navegación: sin tarjeta, sin resultado de búsqueda
//      y sin ficha alcanzable. Nadie abre una incidencia por una página que no
//      sale, así que ese fallo puede vivir meses. Está avisado en el comentario
//      de `eventoPrincipalSql`, pero un comentario no se pone rojo.
//
// Un sitio de llamada solo se caza LEYENDO EL FUENTE, igual que hace
// `live-embed-callsites.test.ts` con `<EventLiveEmbed>` y por el mismo motivo:
// no es un fallo de lógica, es cableado.
//
// Honestidad sobre lo que esto vale: comprueba DÓNDE está el predicado, no que
// la consulta que lo lleva sea correcta. Eso ya lo cubren, ejecutando el código,
// `queries/proximo-evento.sql.test.ts`, `estado/consulta.sql.test.ts` y
// `directo/consulta.sql.test.ts`.

const SRC = new URL("../", import.meta.url);

/**
 * La definición se lee a sí misma: `export function eventoPrincipalSql(` casa
 * con el mismo patrón que un sitio de llamada. Se excluye por ruta, no por
 * regex, para que sacarla del recuento sea una decisión visible.
 *
 * Los `*.test.ts` quedan fuera enteros, este fichero incluido: un vigilante que
 * se cuenta entre los vigilados no vigila nada (misma trampa documentada en
 * `contrast.test.ts` y en `live-embed-callsites.test.ts`).
 */
const DEFINICION = "lib/event-tier.ts";

function leerFuente(ruta: string): string {
  return readFileSync(fileURLToPath(new URL(ruta, SRC)), "utf8");
}

function recorrerFuentes(rutaRelativa: string): string[] {
  const encontrados: string[] = [];
  for (const entrada of readdirSync(fileURLToPath(new URL(rutaRelativa, SRC)), {
    withFileTypes: true,
  })) {
    const hijo = `${rutaRelativa}${entrada.name}`;
    if (entrada.isDirectory()) {
      encontrados.push(...recorrerFuentes(`${hijo}/`));
    } else if (
      /\.tsx?$/.test(entrada.name) &&
      !/\.(test|spec)\.tsx?$/.test(entrada.name)
    ) {
      encontrados.push(hijo);
    }
  }
  return encontrados;
}

/** Sitios de llamada, no menciones: el `(` deja fuera los `import`. */
function llamadas(fuente: string): number {
  return (fuente.match(/eventoPrincipalSql\(/g) ?? []).length;
}

const FUENTES = recorrerFuentes("");

const REPARTO_REAL: Record<string, number> = {};
for (const ruta of FUENTES) {
  if (ruta === DEFINICION) {
    continue;
  }
  const cuantas = llamadas(leerFuente(ruta));
  if (cuantas > 0) {
    REPARTO_REAL[ruta] = cuantas;
  }
}

/**
 * Los nueve sitios, uno a uno. Añadir una entrada aquí tiene que ser una
 * decisión consciente: la pregunta que la justifica es siempre "¿cuál es EL
 * evento que enseño / grabo / vigilo?", nunca "¿qué eventos hay?".
 */
const REPARTO_ESPERADO: Record<string, number> = {
  // El hero de la portada y el bloque "Último evento".
  "lib/queries/events.ts": 2,
  // `getLiveEventCandidate`: /en-vivo, /ufc-hoy, el chip EN VIVO del header y
  // /api/live/now, los cuatro de la misma fila.
  "lib/queries/live.ts": 1,
  // La última velada, la próxima, las fotos de la cartelera y los DOS CTE del
  // turno de guardia (`proxima` y `en_marcha`).
  "lib/estado/consulta.ts": 5,
  // `EVENTO_SQL`: qué velada se vigila el sábado por la noche.
  "lib/directo/consulta.ts": 1,
};

describe("el filtro del evento destacado · dónde se usa", () => {
  it("se lee de verdad el árbol de src/, no una lista vieja", () => {
    // Si el recorrido se quedara a medias (una ruta mal montada, un readdir que
    // no entra en `queries/`), los recuentos de abajo saldrían a cero y este
    // fichero pasaría en verde sin haber mirado nada.
    expect(FUENTES.length).toBeGreaterThan(200);
    expect(FUENTES).toContain("lib/queries/events.ts");
    expect(FUENTES).not.toContain("lib/event-tier-callsites.test.ts");
  });

  it("🔴 está en los nueve sitios que eligen «el evento», y en ninguno más", () => {
    expect(REPARTO_REAL).toEqual(REPARTO_ESPERADO);
  });

  it("y son nueve, ni ocho ni diez", () => {
    const total = Object.values(REPARTO_REAL).reduce((n, cuantas) => n + cuantas, 0);
    expect(total).toBe(9);
  });
});

// `events.ts` es el fichero mezclado: ahí conviven las dos preguntas. Dos de sus
// consultas ELIGEN evento (el hero y "Último evento") y cuatro LISTAN eventos
// (los próximos, los pasados, el buscador y la ficha). El recuento de arriba
// dice "dos" pero no dice CUÁLES: mover el filtro de sitio dentro del mismo
// fichero deja el total en dos y rompe la navegación igual.
const EVENTS = leerFuente("lib/queries/events.ts");

/**
 * Trocea por función de primer nivel. Lo que quede ANTES de la primera función
 * (las constantes SQL del módulo) no cae en ningún trozo a propósito: el
 * recuento por fichero de arriba ya lo cubre, y aquí solo interesa quién
 * pregunta qué.
 */
function trocearPorFuncion(fuente: string): Map<string, string> {
  const cabeceras = [
    ...fuente.matchAll(/^(?:export )?(?:async )?function (\w+)/gm),
  ];
  const trozos = new Map<string, string>();
  cabeceras.forEach((cabecera, i) => {
    const desde = cabecera.index ?? 0;
    const hasta = cabeceras[i + 1]?.index ?? fuente.length;
    trozos.set(cabecera[1], fuente.slice(desde, hasta));
  });
  return trozos;
}

const FUNCIONES = trocearPorFuncion(EVENTS);

describe("el filtro del evento destacado · dentro de events.ts", () => {
  it("🔴 lo llevan las dos que ELIGEN evento, y solo ésas", () => {
    const conFiltro = [...FUNCIONES]
      .filter(([, cuerpo]) => llamadas(cuerpo) > 0)
      .map(([nombre]) => nombre)
      .sort();

    expect(conFiltro).toEqual([
      "getLastEventResultsUncached",
      "getNextEventHeroUncached",
    ]);
  });

  it.each([
    ["getUpcomingEventsUncached", "la lista de /eventos"],
    ["getPastEventsUncached", "la lista de eventos pasados"],
    ["searchEvents", "el buscador"],
    ["getEventDetailUncached", "la ficha del evento"],
  ])("🪤 %s (%s) NO filtra por tier", (funcion, queEs) => {
    // Filtrar aquí no esconde el Road To UFC: lo BORRA del sitio. La ficha es la
    // peor de las cuatro —devolvería null y la página daría 404— y el buscador
    // la segunda: alguien que escribe "road to ufc" no encontraría nada.
    const cuerpo = FUNCIONES.get(funcion);
    // Un rename dejaría este aserto sin nada que mirar y el test pasaría solo.
    expect(cuerpo, `${funcion} ya no existe en events.ts (${queEs})`).toBeDefined();
    expect(llamadas(cuerpo as string), queEs).toBe(0);
  });
});
