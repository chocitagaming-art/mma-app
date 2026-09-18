import { beforeEach, describe, expect, it, vi } from "vitest";

// LOS VÍDEOS DE LA FICHA DE EVENTO: QUE LA CONSULTA LOS PIDA Y LOS MAPEE.
//
// El 18-sep-2026 el matcher de careos casó para el UFC 331 un short de 17 s
// titulado «what are these faceoffs saying?! #ufc331». La ficha lo pintó bajo el
// rótulo «Careo oficial» y nada lo desmentía, porque la web no sabía cómo se
// llamaba el vídeo: solo guardaba el id. La migración 029 añade el título real
// (y el vídeo del pesaje, que hasta ahora no existía).
//
// Aquí se juzga la capa de datos, que es donde se rompe en silencio: si alguien
// quita una columna del SELECT, TypeScript sigue verde —`EventRow` es un tipo,
// no un contrato con Postgres— y el campo llega `undefined` a la página, que lo
// trata como «no hay título» y vuelve al rótulo escrito a mano. Sin este test
// ese retroceso no lo caza nadie.
//
// LA TÉCNICA es la de `proximo-evento.sql.test.ts`: el mock de `sql()` contesta
// según el TEXTO de la consulta, no según el orden en que le llegan.
vi.mock("@/lib/db", () => ({ sql: vi.fn() }));

// `unstable_cache` necesita el contexto de petición de Next, que aquí no existe
// (environment: "node"). Se sustituye por un paso directo, igual que hacen
// `gyms.test.ts` y `proximo-evento.sql.test.ts`.
vi.mock("next/cache", () => ({
  unstable_cache: (fn: (...args: never[]) => unknown) => fn,
}));

import { sql } from "@/lib/db";
import { getEventDetail } from "@/lib/queries/events";

const sqlMock = vi.mocked(sql);

/**
 * El UFC 331 tal y como quedó tras la migración 029 y el arreglo a mano del
 * careo: careo con su título real (canal ufcespanol) y pesaje de TheMacLife,
 * que NO es un canal de la UFC — por eso el título importa tanto aquí.
 */
const UFC_331 = {
  id: 1090,
  name: "Crypto.com UFC 331: Van vs. Pantoja 2",
  event_date: "2026-09-19",
  location: "Las Vegas, Nevada, EE. UU.",
  status: "upcoming",
  start_time: "2026-09-20T02:00:00.000Z",
  image_url: null,
  faceoff_video_id: "MQLCbgV5rhc",
  faceoff_video_title: "#CryptoCom #UFC331: Careos Conferencia de Prensa",
  weighin_video_id: "enkyfSnB0r0",
  weighin_video_title: "UFC 331: Official Weigh-Ins",
  live_video_id: null,
  live_video_title: null,
  broadcast: null,
  ticket_url: null,
  tagline: null,
  headliner: null,
  source: "ufc.com",
  source_id: "ufc-331",
  early_prelims_time: null,
  prelims_time: null,
};

/** Uno de los 29 careos casados ANTES de la migración: id sí, título no. */
const EVENTO_SIN_TITULOS = {
  ...UFC_331,
  id: 1065,
  name: "UFC Fight Night: Nurmagomedov vs. Song",
  faceoff_video_title: null,
  weighin_video_id: null,
  weighin_video_title: null,
};

/** La base, en pequeño: la ficha del evento hace tres consultas distintas. */
function responder(query: string, fila: Record<string, unknown>) {
  // La cartelera y los bonos no pintan nada aquí: lo que se juzga son los
  // vídeos del evento. Vacíos, y el mapeo los deja en `bouts: []`.
  if (query.includes("FROM fights fi") || query.includes("FROM fight_bonuses")) {
    return [];
  }
  if (!query.includes("FROM events WHERE id")) {
    throw new Error(`Consulta inesperada en la ficha del evento:\n${query}`);
  }
  return [fila];
}

function montarBase(fila: Record<string, unknown>) {
  sqlMock.mockReset();
  sqlMock.mockImplementation((query: string) =>
    Promise.resolve(responder(query, fila) as never),
  );
}

/** La consulta de la ficha, entre todas las que recibió el mock. */
const consultaDelEvento = () =>
  sqlMock.mock.calls.map(([query]) => query).find((q) => q.includes("FROM events WHERE id"));

describe("los vídeos del evento (migración 029)", () => {
  beforeEach(() => {
    montarBase(UFC_331);
  });

  it("🔴 la consulta pide el título del careo y el vídeo del pesaje", async () => {
    await getEventDetail(1090);
    const query = consultaDelEvento();
    expect(query, "getEventDetail ya no consulta la tabla events").toBeDefined();
    for (const columna of [
      "faceoff_video_title",
      "weighin_video_id",
      "weighin_video_title",
    ]) {
      expect(query, `el SELECT de la ficha ya no pide ${columna}`).toContain(columna);
    }
  });

  it("🔴 el título del careo llega tal cual: es lo que delata un vídeo equivocado", async () => {
    const evento = await getEventDetail(1090);
    expect(evento?.faceoffVideoId).toBe("MQLCbgV5rhc");
    expect(evento?.faceoffVideoTitle).toBe(
      "#CryptoCom #UFC331: Careos Conferencia de Prensa",
    );
  });

  it("🔴 el pesaje trae id y título, y el título dice de quién es el vídeo", async () => {
    // TheMacLife no es la UFC. El título real («UFC 331: Official Weigh-Ins»)
    // es justo lo que impide que la web dé a entender que la señal es oficial.
    const evento = await getEventDetail(1090);
    expect(evento?.weighinVideoId).toBe("enkyfSnB0r0");
    expect(evento?.weighinVideoTitle).toBe("UFC 331: Official Weigh-Ins");
  });

  it("🔴 con las columnas a NULL los campos llegan null, no undefined", async () => {
    // Los 29 careos anteriores a la migración: la fila existe y trae las tres
    // columnas, pero vacías. `null` y no `undefined` importa porque la página
    // usa `??` y un `undefined` haría pasar por «no hay dato» lo que en realidad
    // sería un mapeo roto.
    //
    // OJO con lo que este test NO cubre: la columna AUSENTE del SELECT —el
    // retroceso de verdad— no se caza aquí, sino en el primer test, que mira el
    // TEXTO de la consulta. Comprobado quitando las tres columnas del SELECT:
    // falla ese, no este.
    montarBase(EVENTO_SIN_TITULOS);
    const evento = await getEventDetail(1065);
    expect(evento?.faceoffVideoId).toBe("MQLCbgV5rhc");
    expect(evento?.faceoffVideoTitle).toBeNull();
    expect(evento?.weighinVideoId).toBeNull();
    expect(evento?.weighinVideoTitle).toBeNull();
  });
});
