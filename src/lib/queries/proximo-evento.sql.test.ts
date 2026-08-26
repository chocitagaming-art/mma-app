import { beforeEach, describe, expect, it, vi } from "vitest";

// EL CRITERIO DE ACEPTACIÓN DEL ARREGLO DEL 26-AGO-2026, Y NADA MÁS.
//
// Ese día el "Road To UFC: Maheshate vs. Flowers" (id 1094, viernes 28, DOS
// combates, sin sede, sin póster y sin cuotas) desplazó al "UFC Fight Night:
// Nurmagomedov vs. Song" (id 1065, sábado 29, trece combates) de la portada, de
// /eventos, de /en-vivo, de /ufc-hoy, de /estado y de /directo. Los dos son
// `promotion_id = 1`: la promotora NO los distingue, todas esas consultas
// ordenaban por fecha y el viernes va antes que el sábado.
//
// ⚠️ ESTE FICHERO SE PONE ROJO CON EL CÓDIGO ANTERIOR AL CAMBIO, y esa es toda
// su razón de ser. Quítale el `AND ${eventoPrincipalSql("e")}` a cualquiera de
// las tres consultas y el mock de abajo le devuelve la lista SIN filtrar —el
// 1094 primero, que es lo que devolvía la base de verdad— y el test cae con el
// número del evento equivocado a la vista.
//
// LA TÉCNICA es la de `src/lib/estado/consulta.sql.test.ts`: el mock de `sql()`
// contesta según el TEXTO de la consulta que le llega, no según el orden. Aquí
// además ese texto ES lo que se juzga: la base solo esconde el Road To UFC si
// se lo PIDEN, igual que Postgres.
vi.mock("@/lib/db", () => ({ sql: vi.fn() }));

// `unstable_cache` necesita el contexto de petición de Next, que aquí no existe
// (environment: "node", sin servidor), y las tres funciones se envuelven en él
// al importar el módulo. Se sustituye por un paso directo, igual que en
// `src/lib/queries/gyms.test.ts`. Sin esto, `getNextEventHero` lanzaría y
// `getUpcomingEvents` —que tiene try/catch— devolvería [] fingiendo que no hay
// cartelera, o sea: el test fallaría mintiendo sobre la causa.
vi.mock("next/cache", () => ({
  unstable_cache: (fn: (...args: never[]) => unknown) => fn,
}));

import { sql } from "@/lib/db";
import {
  getLastEventResults,
  getNextEventHero,
  getUpcomingEvents,
} from "@/lib/queries/events";
import { getLiveEventCandidate } from "@/lib/queries/live";

const sqlMock = vi.mocked(sql);

/** El intruso del viernes 28. `tier = 'road_to_ufc'` (migración 028). */
const ROAD_TO_UFC = {
  id: 1094,
  name: "Road To UFC: Maheshate vs. Flowers",
  event_date: "2026-08-28",
  start_time: "2026-08-28T10:30:00.000Z",
  prelims_time: null,
  early_prelims_time: null,
  location: null,
  image_url: null,
  broadcast: null,
  ticket_url: null,
  tagline: null,
  headliner: null,
  live_video_id: null,
  live_video_title: null,
  main_event_finished: false,
  fight_count: "2",
  tier: "road_to_ufc",
};

/** La velada de verdad: sábado 29, trece combates. `tier = 'fight_night'`. */
const FIGHT_NIGHT = {
  id: 1065,
  name: "UFC Fight Night: Nurmagomedov vs. Song",
  event_date: "2026-08-29",
  start_time: "2026-08-29T21:00:00.000Z",
  prelims_time: "2026-08-29T18:00:00.000Z",
  early_prelims_time: null,
  location: "Las Vegas, Nevada, EE. UU.",
  image_url: "/s3/files/ufc-fight-night.jpg",
  broadcast: "UFC Fight Pass",
  ticket_url: null,
  tagline: null,
  headliner: "Nurmagomedov vs. Song",
  live_video_id: null,
  live_video_title: null,
  main_event_finished: false,
  fight_count: "13",
  tier: "fight_night",
};

/**
 * La base, en pequeño. Contesta según QUÉ le preguntan:
 *
 * - con `tier NOT IN` en el WHERE, el 1094 no sale (lo tapa Postgres);
 * - sin él, sale PRIMERO, que es lo que pasaba de verdad el 26-ago: las tres
 *   consultas ordenan por fecha ascendente y el viernes va antes que el sábado.
 *
 * (Para "el último evento" el orden es descendente, pero la fila que devuelve
 * este mock es la misma: un Road To UFC recién terminado ganando el ORDER BY.
 * Lo que se comprueba es que la consulta lleva el guard, no el `ORDER BY`.)
 */
function responder(query: string): Record<string, unknown>[] {
  // Las carteleras —el estelar del hero, las cinco peleas del último evento— no
  // pintan nada aquí: lo que se juzga es QUÉ evento se elige, no qué se enseña
  // de él. Vacías, y el mapeo las deja en `mainEvent: null` / `bouts: []`.
  if (query.includes("FROM fights fi")) return [];
  if (!query.includes("FROM events e")) {
    throw new Error(`Consulta inesperada al elegir el próximo evento:\n${query}`);
  }
  return query.includes("tier NOT IN") ? [FIGHT_NIGHT] : [ROAD_TO_UFC, FIGHT_NIGHT];
}

/** La consulta de "¿qué eventos vienen?" entre todas las que recibió el mock. */
const consultaDeLaCartelera = () =>
  sqlMock.mock.calls.map(([query]) => query).find((q) => q.includes("e.status = 'upcoming'"));

describe("¿cuál es EL próximo evento? · 1065 (sábado) y no 1094 (Road To UFC)", () => {
  beforeEach(() => {
    sqlMock.mockReset();
    sqlMock.mockImplementation((query: string) =>
      Promise.resolve(responder(query) as never),
    );
  });

  it("🔴 el hero de la portada se queda con el UFC Fight Night del sábado", async () => {
    // FE1. Lo que se vio el 26-ago: cuenta atrás al viernes, dos nombres que no
    // conoce nadie, sin póster y sin cuotas, tres días antes de la velada.
    const hero = await getNextEventHero();
    expect(hero?.id).toBe(1065);
    expect(hero?.name).toContain("Fight Night");
  });

  it("🔴 /en-vivo, /ufc-hoy y el chip EN VIVO miran ese mismo evento", async () => {
    // El más caro de los seis sitios: `getLiveEventCandidate` alimenta también
    // /api/live/now. Sin el guard, el viernes 28 la web se habría declarado EN
    // DIRECTO desde las 10:30 hasta las 19:00 para una cartelera de dos peleas.
    const candidato = await getLiveEventCandidate();
    expect(candidato?.id).toBe(1065);
  });

  it("🔴 y el bloque «Último evento» tampoco lo puede ocupar un Road To UFC", async () => {
    // FE10. Es el que se olvida: el sábado por la noche, cuando cae el estelar,
    // la portada cambia el hero por este bloque. Si aquí entrara el 1094, la
    // velada de trece combates no aparecería en la portada NI antes NI después.
    const ultimo = await getLastEventResults();
    expect(ultimo?.id).toBe(1065);
  });

  // ─────────────────────────────────────────────────────────────────────────
  // Y AHORA EL ASERTO NEGATIVO, que vale tanto como los tres de arriba.
  // ─────────────────────────────────────────────────────────────────────────

  it("🪤 /eventos SIGUE listando el Road To UFC, y de primero", async () => {
    // LA REGRESIÓN MÁS FÁCIL DE METER: "arreglar" /eventos escondiendo también
    // aquí el Road To UFC. Esto es una LISTA ("¿qué eventos hay?"), no una
    // elección ("¿cuál destaco?"): filtrarla dejaría un evento de la UFC
    // INACCESIBLE desde la navegación —sin tarjeta, sin enlace, sin ficha
    // alcanzable— que es peor que el problema que arreglamos.
    const proximos = await getUpcomingEvents();

    expect(proximos.map((e) => e.id)).toEqual([1094, 1065]);
    expect(consultaDeLaCartelera()).not.toContain("tier NOT IN");
  });

  it("y trae el `tier` de cada uno para poder rotularlos", async () => {
    // El Road To UFC no se esconde: se ETIQUETA (ETIQUETA_TIER), para que se vea
    // qué es y no parezca la velada de la semana. Si el SELECT dejara de traer
    // la columna, la tarjeta perdería el rótulo en silencio y volveríamos al
    // "hay dos eventos y parecen lo mismo" del 26-ago.
    const proximos = await getUpcomingEvents();

    expect(proximos.map((e) => e.tier)).toEqual(["road_to_ufc", "fight_night"]);
    expect(consultaDeLaCartelera()).toContain("e.tier");
  });
});
