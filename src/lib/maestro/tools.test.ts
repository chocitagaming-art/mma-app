import { beforeEach, describe, expect, it, vi } from "vitest";

import { sql } from "@/lib/db";

// Aislamos del acceso real a la BD: el guard a===b no debe consultar nada.
const { getFighterComparisonDetailMock, getFighterRankingHistoryMock } =
  vi.hoisted(() => ({
    getFighterComparisonDetailMock: vi.fn(),
    getFighterRankingHistoryMock: vi.fn(),
  }));

vi.mock("@/lib/db", () => ({ sql: vi.fn() }));
vi.mock("@/lib/queries/fighters", () => ({
  getFighterComparisonDetail: getFighterComparisonDetailMock,
}));
vi.mock("@/lib/queries/rankings", () => ({
  getFighterRankingHistory: getFighterRankingHistoryMock,
}));

import { runMaestroTool } from "./tools";

function fakeProfile(name: string) {
  return {
    name,
    wins: 10,
    losses: 1,
    draws: 0,
    heightCm: 178,
    reachCm: 180,
    stance: "Orthodox",
    latestWeightClass: "Lightweight",
    aggregateStats: { sigStrikesLandedPerFight: 1 },
  };
}

describe("runMaestroTool('comparar')", () => {
  beforeEach(() => {
    getFighterComparisonDetailMock.mockReset();
  });

  it("avisa que es el mismo luchador cuando a === b y NO consulta la BD", async () => {
    const result = await runMaestroTool("comparar", { a: 7, b: 7 });

    expect(getFighterComparisonDetailMock).not.toHaveBeenCalled();
    expect(result).toMatchObject({ error: expect.any(String) });
    expect((result as { error: string }).error.toLowerCase()).toContain("mismo");
  });

  it("compara con normalidad cuando los ids son distintos", async () => {
    getFighterComparisonDetailMock.mockResolvedValueOnce({
      fighterA: fakeProfile("Khabib"),
      fighterB: fakeProfile("Gaethje"),
      directMatchups: [],
    });

    const result = await runMaestroTool("comparar", { a: 1, b: 2 });

    expect(getFighterComparisonDetailMock).toHaveBeenCalledWith(1, 2);
    expect(result).toHaveProperty("luchadorA");
    expect(result).toHaveProperty("luchadorB");
  });
});

describe("runMaestroTool('trayectoria_ranking')", () => {
  beforeEach(() => {
    getFighterRankingHistoryMock.mockReset();
  });

  it("devuelve la trayectoria por división cuando hay datos", async () => {
    getFighterRankingHistoryMock.mockResolvedValueOnce([
      { division: "lightweight", rankPosition: 5, snapshotDate: "2023-01-01", isChampion: false },
      { division: "lightweight", rankPosition: 1, snapshotDate: "2023-06-01", isChampion: true },
    ]);

    const result = await runMaestroTool("trayectoria_ranking", { id: 42 });

    expect(getFighterRankingHistoryMock).toHaveBeenCalledWith(42);
    expect(result).toMatchObject({
      trayectoria: [
        {
          division: "Peso Ligero",
          puntos: [
            { fecha: "2023-01-01", posicion: "#5" },
            { fecha: "2023-06-01", posicion: "Campeón" },
          ],
        },
      ],
    });
  });

  it("avisa con nota cuando el luchador no tiene historial de ranking", async () => {
    getFighterRankingHistoryMock.mockResolvedValueOnce([]);

    const result = await runMaestroTool("trayectoria_ranking", { id: 99 });

    expect(result).toMatchObject({ trayectoria: [], nota: expect.any(String) });
  });

  it("devuelve error y NO consulta la BD con un id inválido", async () => {
    const result = await runMaestroTool("trayectoria_ranking", { id: "abc" });

    expect(getFighterRankingHistoryMock).not.toHaveBeenCalled();
    expect(result).toMatchObject({ error: expect.any(String) });
  });
});

// --------------------------------------------------- lo que el modelo LEE
//
// 🪤 ESTOS TESTS AFIRMAN SOBRE LA CADENA, NO SOBRE EL OBJETO, y no es manía:
// `route.ts:159` hace `JSON.stringify(await runMaestroTool(...))`, o sea que el
// modelo nunca ve el objeto. Y al serializar, `undefined` DESAPARECE — así que
// un `expect(res.nota).toBeUndefined()` da verde tanto si la nota se omite a
// propósito como si el código la borró por accidente. La única forma de mirar
// lo que el modelo mira es mirar el JSON.

const sqlMock = vi.mocked(sql);

const FICHA_ROW = {
  id: 8899,
  name: "Guy Mezger",
  nickname: null,
  nationality: "USA",
  birth_date: "1968-01-19",
  height_cm: "185",
  reach_cm: null,
  stance: "Orthodox",
  weight_grams: 84000,
  wins: 34,
  losses: 15,
  draws: 2,
  fight_count: "10",
  latest_weight_class: "Middleweight",
};

/** Agregado de fight_stats: `sum()` devuelve null cuando ninguna fila lo trae. */
function agregado(over: Record<string, unknown> = {}) {
  return {
    sig_strikes_landed: "120",
    sig_strikes_attempted: "300",
    takedowns_landed: "8",
    takedowns_attempted: "20",
    submission_attempts: "3",
    control_time_seconds: null, // los 102: actas de los 90, sin cronómetro
    knockdowns: "2",
    total_fight_stats: "10",
    fights_with_control: "0",
    ...over,
  };
}

describe("runMaestroTool('ficha_y_stats') · el null no puede llegar como cero", () => {
  beforeEach(() => {
    sqlMock.mockReset();
  });

  it("entrega tiempo_control_seg NULL —no 0— cuando ninguna acta lo trae", async () => {
    sqlMock.mockResolvedValueOnce([FICHA_ROW]).mockResolvedValueOnce([agregado()]);

    const json = JSON.stringify(await runMaestroTool("ficha_y_stats", { id: 8899 }));

    // Que la ejecución llegó al agregado: con el mock devolviendo undefined,
    // `const [fighter] = undefined` revienta ANTES de la línea vigilada y un
    // test perezoso "pasa" capturando el rechazo sin ejecutar jamás lo que mira.
    expect(sqlMock).toHaveBeenCalledTimes(2);
    expect(json).toContain('"tiempo_control_seg":null');
    expect(json).not.toContain('"tiempo_control_seg":0');
    // Y con palabras, porque un null desnudo se lee como cero igual.
    expect(json).toContain("SIN DATO, no cero");
  });

  it("CONTROL NEGATIVO: un cero MEDIDO sigue siendo 0, no null", async () => {
    // Hay 127 luchadores cuya suma de control es 0 de verdad. Sin este par, el
    // test de arriba sólo comprueba "no hay ceros", que es otra cosa: lo pasaría
    // un arreglo que convirtiera en null todos los ceros del payload.
    sqlMock
      .mockResolvedValueOnce([FICHA_ROW])
      .mockResolvedValueOnce([agregado({ control_time_seconds: "0", fights_with_control: "10" })]);

    const json = JSON.stringify(await runMaestroTool("ficha_y_stats", { id: 8899 }));

    expect(json).toContain('"tiempo_control_seg":0');
    expect(json).not.toContain('"tiempo_control_seg":null');
    expect(json).not.toContain("SIN DATO");
  });

  it("avisa cuando el total sale de MENOS actas de las que hay (los 38 mixtos)", async () => {
    // David Abbott: 3 actas con control de 18. Publicar la suma a secas es
    // presentar una parcial con rótulo de total.
    sqlMock
      .mockResolvedValueOnce([FICHA_ROW])
      .mockResolvedValueOnce([
        agregado({ control_time_seconds: "123", total_fight_stats: "18", fights_with_control: "3" }),
      ]);

    const json = JSON.stringify(await runMaestroTool("ficha_y_stats", { id: 8899 }));

    expect(json).toContain('"peleas_con_control_medido":3');
    expect(json).toContain("3 de sus 18");
    expect(json).toContain("suma parcial");
  });

  it("un dato corrupto no se disfraza de 'sin dato'", async () => {
    // 🪤 ESTE ES EL ÚNICO DE ESTE FICHERO QUE **NO** PUEDE AFIRMAR SOBRE LA
    // CADENA, y la primera versión lo hacía: `JSON.stringify(NaN)` es `null`, o
    // sea que en el JSON un dato corrupto y un hueco legítimo son la MISMA
    // cadena. El test daba verde con el fallo puesto a mano — comprobado
    // saboteando `numOrNull`. La diferencia sólo existe antes de serializar, así
    // que aquí se mira el objeto. La regla no es "afirmar sobre el JSON": es
    // afirmar donde la diferencia que buscas todavía se ve.
    sqlMock
      .mockResolvedValueOnce([FICHA_ROW])
      .mockResolvedValueOnce([agregado({ knockdowns: "doce" })]);

    const res = (await runMaestroTool("ficha_y_stats", { id: 8899 })) as {
      stats_carrera: { knockdowns: number | null };
    };

    expect(res.stats_carrera.knockdowns).toBeNull();
    expect(Number.isNaN(res.stats_carrera.knockdowns)).toBe(false);
  });
});

describe("el récord tiene UNA forma, no tres", () => {
  beforeEach(() => {
    sqlMock.mockReset();
  });

  it("sin récord, las dos herramientas dicen lo mismo: null", async () => {
    // Antes `buscar_luchador` publicaba la cadena literal "null-null-null" y
    // `ficha_y_stats` publicaba "0-0-0" para el MISMO luchador. Dos mentiras
    // distintas para el mismo dato, en el mismo fichero.
    sqlMock.mockResolvedValueOnce([
      { id: 1, name: "Nadie", nickname: null, nationality: null, wins: null, losses: null, draws: null },
    ]);
    const busqueda = JSON.stringify(await runMaestroTool("buscar_luchador", { nombre: "Nadie" }));

    sqlMock
      .mockResolvedValueOnce([{ ...FICHA_ROW, wins: null, losses: null, draws: null }])
      .mockResolvedValueOnce([agregado()]);
    const ficha = JSON.stringify(await runMaestroTool("ficha_y_stats", { id: 8899 }));

    for (const json of [busqueda, ficha]) {
      expect(json).toContain('"record":null');
      expect(json).not.toContain('"record":"null-null-null"');
      expect(json).not.toContain('"record":"0-0-0"');
    }
  });

  it("CONTROL NEGATIVO: un récord de verdad sigue publicándose entero", async () => {
    sqlMock.mockResolvedValueOnce([
      { id: 1, name: "Alguien", nickname: null, nationality: null, wins: 20, losses: 0, draws: 0 },
    ]);

    const json = JSON.stringify(await runMaestroTool("buscar_luchador", { nombre: "Alguien" }));

    expect(json).toContain('"record":"20-0-0"');
  });
});
