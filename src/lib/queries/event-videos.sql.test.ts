import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

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
// (environment: "node"). Se sustituye por un paso directo, igual que hace
// `proximo-evento.sql.test.ts`.
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

// LA RUEDA DE PRENSA (migración 033 de mma-ingesta). La ficha tenía sitio para
// el careo, el pesaje y el directo, pero no para la conferencia. Mismo diseño
// que las de la 029: id de 11 caracteres + título REAL, NULL = no se pinta, y
// solo se rellena a mano con fijar_videos_evento.

/**
 * El UFC 333 con el vídeo que eligió el dueño el 22-oct: una RESUBIDA del canal
 * «MMA Español», no la conferencia oficial de la UFC (DHLdj5yFWmw, en inglés).
 * Por eso el título importa: es lo único que dice qué se está viendo.
 */
const UFC_333 = {
  ...UFC_331,
  id: 1093,
  name: "UFC 333: Volkanovski vs. Evloev",
  event_date: "2026-10-24",
  faceoff_video_id: "hVvIw8K754c",
  faceoff_video_title: "#UFC333 Volkanovski vs Evloev Careos de la Conferencia",
  weighin_video_id: null,
  weighin_video_title: null,
  press_video_id: "g3h-jwpkxJU",
  press_video_title: "UFC 333: CONFERENCIA DE PRENSA COMPLETA EN ESPAÑOL",
};

describe("la rueda de prensa (migración 033)", () => {
  beforeEach(() => {
    montarBase(UFC_333);
  });

  it("🔴 la consulta pide el vídeo de la rueda de prensa y su título", async () => {
    await getEventDetail(1093);
    const query = consultaDelEvento();
    expect(query, "getEventDetail ya no consulta la tabla events").toBeDefined();
    for (const columna of ["press_video_id", "press_video_title"]) {
      expect(query, `el SELECT de la ficha no pide ${columna}`).toContain(columna);
    }
  });

  it("🔴 id y título llegan tal cual: el título dice que es una resubida en español", async () => {
    const evento = await getEventDetail(1093);
    expect(evento?.pressVideoId).toBe("g3h-jwpkxJU");
    expect(evento?.pressVideoTitle).toBe(
      "UFC 333: CONFERENCIA DE PRENSA COMPLETA EN ESPAÑOL",
    );
  });

  it("🔴 con las columnas a NULL los campos llegan null, no undefined", async () => {
    // Lo normal: casi ningún evento tiene rueda de prensa fijada. `null` y no
    // `undefined`, por lo mismo que en la 029: un mapeo roto no debe pasar por
    // «no hay vídeo».
    montarBase({ ...UFC_333, press_video_id: null, press_video_title: null });
    const evento = await getEventDetail(1093);
    expect(evento?.pressVideoId).toBeNull();
    expect(evento?.pressVideoTitle).toBeNull();
  });
});

// SI LA WEB LLEGA A PRODUCCIÓN ANTES QUE LA 033. Vercel despliega solo con cada
// merge a main, y la migración la aplica otra mano en otro repo: el orden no lo
// garantiza nada. El 22-oct, con el rol de solo lectura, producción contestaba
// `column "press_video_id" does not exist` (SQLSTATE 42703). Sin red, ese error
// tumba /eventos/[id], /en-vivo y /ufc-hoy, que no lo capturan; y eso en la
// semana del UFC 333.

/** Un error de Postgres tal y como lo lanza `pg`: con su SQLSTATE en `code`. */
function pgError(code: string, message: string): Error {
  return Object.assign(new Error(message), { code });
}

/** Todas las consultas de la ficha que recibió el mock, en orden. */
const consultasDelEvento = () =>
  sqlMock.mock.calls.map(([query]) => query).filter((q) => q.includes("FROM events WHERE id"));

const COLUMNAS_033 = ["press_video_id", "press_video_title"] as const;

/**
 * Producción SIN la 033, como Postgres: nombrar la columna de verdad revienta
 * con 42703; pedirla como `NULL::text AS press_video_id` no, y la devuelve a
 * NULL. Una columna que la consulta no pide ni así no llega en la fila.
 */
function montarBaseSin033(fila: Record<string, unknown>) {
  const sinRueda = Object.fromEntries(
    Object.entries(fila).filter(([columna]) => !columna.startsWith("press_video_")),
  );
  sqlMock.mockReset();
  sqlMock.mockImplementation((query: string) => {
    if (query.includes("FROM events WHERE id")) {
      const sinAlias = query.replace(/\bAS\s+press_video_\w+/g, "");
      const real = COLUMNAS_033.find((columna) => sinAlias.includes(columna));
      if (real) {
        return Promise.reject(pgError("42703", `column "${real}" does not exist`));
      }
      const aNull = COLUMNAS_033.filter((columna) => query.includes(`NULL::text AS ${columna}`));
      return Promise.resolve([
        { ...sinRueda, ...Object.fromEntries(aNull.map((columna) => [columna, null])) },
      ] as never);
    }
    return Promise.resolve(responder(query, fila) as never);
  });
}

/** La base de siempre, salvo que la PRIMERA consulta de la ficha falla con `error`. */
function montarBaseQueFallaUnaVez(fila: Record<string, unknown>, error: Error) {
  montarBase(fila);
  const normal = sqlMock.getMockImplementation()!;
  let fallado = false;
  sqlMock.mockImplementation((query: string, values?: unknown[]) => {
    if (!fallado && query.includes("FROM events WHERE id")) {
      fallado = true;
      return Promise.reject(error);
    }
    return normal(query, values);
  });
}

describe("si la web se despliega antes que la migración 033", () => {
  beforeEach(() => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("🔴 la ficha se sirve entera, sin rueda de prensa, en vez de caerse", async () => {
    montarBaseSin033(UFC_333);
    const evento = await getEventDetail(1093);
    expect(evento, "sin la 033 la ficha del evento se cae").not.toBeNull();
    expect(evento?.name).toBe("UFC 333: Volkanovski vs. Evloev");
    expect(evento?.faceoffVideoId).toBe("hVvIw8K754c");
    expect(evento?.faceoffVideoTitle).toBe("#UFC333 Volkanovski vs Evloev Careos de la Conferencia");
    // null y no undefined: la página trata los dos igual, pero un undefined aquí
    // querría decir que la segunda consulta se olvidó de una columna.
    expect(evento?.pressVideoId).toBeNull();
    expect(evento?.pressVideoTitle).toBeNull();
    // Y queda en el log de Vercel POR QUÉ no hay rueda de prensa.
    expect(console.warn).toHaveBeenCalledTimes(1);
    expect(String(vi.mocked(console.warn).mock.calls[0][0])).toContain("033");
  });

  it("🔴 con la 033 aplicada va UNA sola consulta, y con las columnas de verdad", async () => {
    // La red es para el hueco entre un despliegue y otro, no un camino normal:
    // ni un segundo viaje a Neon en cada ficha ni la rueda pedida como NULL.
    montarBase(UFC_333);
    await getEventDetail(1093);
    const consultas = consultasDelEvento();
    expect(consultas).toHaveLength(1);
    expect(consultas[0]).not.toMatch(/AS\s+press_video_/);
    expect(console.warn).not.toHaveBeenCalled();
  });

  it.each([
    ["otra columna que no existe", pgError("42703", 'column "weighin_video_title" does not exist')],
    ["un GRANT olvidado", pgError("42501", "permission denied for table events")],
    ["Neon caída", new Error("Connection terminated unexpectedly")],
  ])("🔴 %s se relanza: no se disfraza de «no hay rueda de prensa»", async (_caso, error) => {
    montarBaseQueFallaUnaVez(UFC_333, error);
    await expect(getEventDetail(1093)).rejects.toBe(error);
    expect(consultasDelEvento(), "se reintentó un fallo que no es la 033").toHaveLength(1);
  });
});
