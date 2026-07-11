import { describe, expect, it } from "vitest";

import {
  buildLiveStatRows,
  formatControlTime,
  formatLandedPair,
  liveStatusLabel,
  mapLiveFightStatsRow,
  mapLiveStatValues,
  mapLiveStatsByFighter,
  type LiveFightStats,
} from "@/lib/live-stats";

// Payload REAL escrito por el bucle durante UFC 329 (fight 13154, Durden):
// coincide 1:1 con el panel del fightcenter de ESPN de esa pelea.
const DURDEN = {
  kd: 0, tsl: 30, tsa: 75, ssl: 28, ssa: 73,
  hl: 21, ha: 66, bl: 2, ba: 2, ll: 5, la: 5,
  tdl: 0, tda: 2, sub: 0, ctrl: 12,
};

function liveRow(overrides: Partial<LiveFightStats> = {}): LiveFightStats {
  return {
    fightId: 13154,
    state: "in",
    statusName: "STATUS_IN_PROGRESS_2",
    statusDetail: "R2",
    period: 2,
    displayClock: "2:37",
    updatedAt: "2026-07-11 21:25:36+00",
    byFighter: {},
    ...overrides,
  };
}

describe("mapLiveStatValues", () => {
  it("acepta el shape compacto del escritor", () => {
    const mapped = mapLiveStatValues(DURDEN);
    expect(mapped?.tsl).toBe(30);
    expect(mapped?.ctrl).toBe(12);
    expect(mapped?.kd).toBe(0);
  });

  it("degrada claves ausentes o corruptas a null sin tirar el resto", () => {
    const mapped = mapLiveStatValues({ tsl: 7, tsa: "x", kd: -1, ctrl: 4.6 });
    expect(mapped).toMatchObject({ tsl: 7, tsa: null, kd: null, ctrl: 5 });
  });

  it("devuelve null cuando no hay ningún número usable", () => {
    expect(mapLiveStatValues(null)).toBeNull();
    expect(mapLiveStatValues("corrupto")).toBeNull();
    expect(mapLiveStatValues([])).toBeNull();
    expect(mapLiveStatValues({ nada: 1 })).toBeNull();
  });
});

describe("mapLiveStatsByFighter", () => {
  it("mapea por fighter id y descarta claves no numéricas", () => {
    const byFighter = mapLiveStatsByFighter({
      "6320": DURDEN,
      "n/a": DURDEN,
      "9024": "corrupto",
    });
    expect(Object.keys(byFighter)).toEqual(["6320"]);
  });

  it("JSONB corrupto degrada a objeto vacío (nunca rompe /en-vivo)", () => {
    expect(mapLiveStatsByFighter(null)).toEqual({});
    expect(mapLiveStatsByFighter([1, 2])).toEqual({});
    expect(mapLiveStatsByFighter("x")).toEqual({});
  });
});

describe("mapLiveFightStatsRow", () => {
  it("mapea la fila cruda de la query", () => {
    const mapped = mapLiveFightStatsRow({
      fight_id: 13154,
      state: "post",
      status_name: "STATUS_FINAL",
      status_detail: "Final",
      period: 2,
      display_clock: "2:19",
      stats: { "6320": DURDEN },
      updated_at: "2026-07-11 21:25:36+00",
    });
    expect(mapped?.state).toBe("post");
    expect(mapped?.byFighter["6320"]?.ssl).toBe(28);
  });

  it("descarta filas con estado o fight_id inválidos", () => {
    const base = {
      fight_id: 13154, state: "in", status_name: null, status_detail: null,
      period: null, display_clock: null, stats: null, updated_at: null,
    };
    expect(mapLiveFightStatsRow({ ...base, state: "???" })).toBeNull();
    expect(mapLiveFightStatsRow({ ...base, fight_id: "abc" })).toBeNull();
    // Sin stats la fila sigue valiendo (estado fino para la cabecera).
    expect(mapLiveFightStatsRow(base)?.byFighter).toEqual({});
  });
});

describe("liveStatusLabel", () => {
  it("traduce los estados finos conocidos de ESPN", () => {
    expect(liveStatusLabel(liveRow({ statusName: "STATUS_FIGHTERS_WALKING" })))
      .toBe("Salida al octágono");
    expect(liveStatusLabel(liveRow({ statusName: "STATUS_PRE_FIGHT" })))
      .toBe("A punto de empezar");
    expect(liveStatusLabel(liveRow({ statusName: "STATUS_END_OF_ROUND", period: 1 })))
      .toBe("Descanso · fin del asalto 1");
    expect(liveStatusLabel(liveRow())).toBe("Asalto 2 · 2:37");
    expect(liveStatusLabel(liveRow({ state: "post" }))).toBe("Final");
    expect(liveStatusLabel(liveRow({ statusName: "STATUS_FINAL" }))).toBe("Final");
  });

  it("sin reloj usable muestra solo el asalto; lo desconocido degrada al detail", () => {
    expect(liveStatusLabel(liveRow({ displayClock: "-" }))).toBe("Asalto 2");
    expect(
      liveStatusLabel(liveRow({ statusName: "STATUS_ALGO_NUEVO", statusDetail: "End R2" })),
    ).toBe("End R2");
  });
});

describe("formatControlTime / formatLandedPair", () => {
  it("control en segundos al formato del panel de ESPN", () => {
    expect(formatControlTime(61)).toBe("1:01");
    expect(formatControlTime(0)).toBe("0:00");
    expect(formatControlTime(605)).toBe("10:05");
    expect(formatControlTime(null)).toBe("—");
  });

  it("pares con./int.", () => {
    expect(formatLandedPair(23, 52)).toBe("23/52");
    expect(formatLandedPair(23, null)).toBe("23");
    expect(formatLandedPair(null, 52)).toBe("—");
  });
});

describe("buildLiveStatRows", () => {
  it("construye las filas estilo ESPN con el conectado como comparador", () => {
    const rows = buildLiveStatRows(mapLiveStatValues(DURDEN), mapLiveStatValues({
      ...DURDEN, tsl: 25, tsa: 53, ctrl: 61,
    }));
    const totals = rows.find((row) => row.label === "Golpes totales");
    expect(totals).toMatchObject({ red: "30/75", blue: "25/53", redNum: 30, blueNum: 25 });
    const control = rows.find((row) => row.label === "Control");
    expect(control).toMatchObject({ red: "0:12", blue: "1:01", redNum: 12, blueNum: 61 });
    expect(rows.map((row) => row.label)).toEqual([
      "KD", "Golpes totales", "Golpes sig.", "Cabeza", "Cuerpo", "Piernas",
      "Derribos", "Int. sumisión", "Control",
    ]);
  });

  it("una esquina ausente pinta — pero conserva la fila; sin dato alguno, fila fuera", () => {
    const rows = buildLiveStatRows(mapLiveStatValues({ tsl: 7, tsa: 18 }), null);
    expect(rows).toEqual([
      { label: "Golpes totales", red: "7/18", blue: "—", redNum: 7, blueNum: null },
    ]);
    expect(buildLiveStatRows(null, null)).toEqual([]);
  });

  it("los ceros legítimos (walkouts recién empezados) SÍ se muestran", () => {
    const zeros = mapLiveStatValues({ kd: 0, tsl: 0, tsa: 0 });
    const rows = buildLiveStatRows(zeros, zeros);
    expect(rows.find((row) => row.label === "KD")).toMatchObject({ red: "0", blue: "0" });
  });
});
