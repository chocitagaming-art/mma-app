import { describe, expect, it } from "vitest";

import {
  buildFightTimeline,
  decimateSamples,
  mapFightTimelineSample,
  sampleElapsedSeconds,
  scaleSeconds,
  scaleValue,
  timelinePointLabel,
  type FightTimelineSample,
} from "@/lib/fight-timeline";

// Muestra mínima válida; las stats llevan las claves compactas del contrato
// live_fight_stats (kd/ssl/tdl...) indexadas por fighter_id.
function sample(over: Partial<FightTimelineSample> & { stats?: object }): FightTimelineSample {
  const { stats, ...rest } = over;
  const mapped = mapFightTimelineSample({
    state: rest.state ?? "in",
    status_name: rest.statusName ?? "STATUS_IN_PROGRESS_2",
    period: rest.period ?? 1,
    display_clock: rest.displayClock ?? "4:00",
    stats: stats ?? { "201": { ssl: 1, kd: 0, tdl: 0 } },
    sampled_at: rest.sampledAt ?? "2026-07-11 22:40:53+00",
  });
  if (!mapped) {
    throw new Error("fixture inválida");
  }
  return mapped;
}

describe("mapFightTimelineSample", () => {
  it("sanea la fila y exige state/period/stats válidos", () => {
    expect(
      mapFightTimelineSample({
        state: "in", status_name: null, period: 2, display_clock: "3:41",
        stats: { "201": { ssl: 7 } }, sampled_at: "x",
      })?.period,
    ).toBe(2);
    // Walkouts (period 0), estado desconocido o stats corruptas -> null.
    expect(
      mapFightTimelineSample({
        state: "in", status_name: null, period: 0, display_clock: "-",
        stats: { "201": { ssl: 0 } }, sampled_at: "x",
      }),
    ).toBeNull();
    expect(
      mapFightTimelineSample({
        state: "pre", status_name: null, period: 1, display_clock: null,
        stats: { "201": { ssl: 0 } }, sampled_at: "x",
      }),
    ).toBeNull();
    expect(
      mapFightTimelineSample({
        state: "in", status_name: null, period: 1, display_clock: null,
        stats: "corrupto", sampled_at: "x",
      }),
    ).toBeNull();
  });
});

describe("sampleElapsedSeconds", () => {
  it("en curso: el reloj cuenta ATRÁS desde 5:00", () => {
    // R1 3:11 restantes -> 1:49 transcurrido.
    expect(
      sampleElapsedSeconds(sample({ period: 1, displayClock: "3:11" })),
    ).toBe(109);
    expect(
      sampleElapsedSeconds(sample({ period: 2, displayClock: "0:19" })),
    ).toBe(300 + 281);
  });

  it("descanso: el corte es el fin del asalto (reloj '-')", () => {
    expect(
      sampleElapsedSeconds(
        sample({ period: 1, displayClock: "-", statusName: "STATUS_END_OF_ROUND" }),
      ),
    ).toBe(300);
  });

  it("post: el reloj pasa a ser tiempo TRANSCURRIDO (el 2:47 de Garbrandt)", () => {
    expect(
      sampleElapsedSeconds(
        sample({ state: "post", statusName: "STATUS_FINAL", period: 1, displayClock: "2:47" }),
      ),
    ).toBe(167);
    // Decisión: '5:00' = asalto completo; '-' no aporta tiempo (se arrastra).
    expect(
      sampleElapsedSeconds(
        sample({ state: "post", statusName: "STATUS_FINAL", period: 3, displayClock: "5:00" }),
      ),
    ).toBe(900);
    expect(
      sampleElapsedSeconds(
        sample({ state: "post", statusName: "STATUS_FINAL", period: 3, displayClock: "-" }),
      ),
    ).toBeNull();
  });

  it("KO a mitad de asalto: End-of-Round llega con el reloj CONGELADO en cuenta atrás", () => {
    expect(
      sampleElapsedSeconds(
        sample({ period: 1, displayClock: "2:12", statusName: "STATUS_END_OF_ROUND" }),
      ),
    ).toBe(168);
  });
});

describe("buildFightTimeline", () => {
  const series = [
    sample({
      period: 1, displayClock: "3:11",
      stats: { "201": { ssl: 11, kd: 0, tdl: 0 }, "202": { ssl: 3, kd: 0, tdl: 0 } },
    }),
    sample({
      period: 1, displayClock: "-", statusName: "STATUS_END_OF_ROUND",
      stats: { "201": { ssl: 26, kd: 0, tdl: 1 }, "202": { ssl: 15, kd: 0, tdl: 0 } },
    }),
    sample({
      period: 2, displayClock: "2:25",
      stats: { "201": { ssl: 41, kd: 1, tdl: 1 }, "202": { ssl: 26, kd: 0, tdl: 0 } },
    }),
    sample({
      period: 2, displayClock: "-", statusName: "STATUS_END_OF_ROUND",
      stats: { "201": { ssl: 45, kd: 1, tdl: 1 }, "202": { ssl: 28, kd: 0, tdl: 0 } },
    }),
    // Muestras 'post' redundantes ('5:00' cae en el mismo segundo que el fin
    // del asalto 2; '-' arrastra el tiempo previo): mismos datos -> dedup.
    sample({
      state: "post", statusName: "STATUS_FINAL", period: 2, displayClock: "5:00",
      stats: { "201": { ssl: 45, kd: 1, tdl: 1 }, "202": { ssl: 28, kd: 0, tdl: 0 } },
    }),
    sample({
      state: "post", statusName: "STATUS_FINAL", period: 2, displayClock: "-",
      stats: { "201": { ssl: 45, kd: 1, tdl: 1 }, "202": { ssl: 28, kd: 0, tdl: 0 } },
    }),
  ];

  it("construye ambas esquinas con eje X no decreciente y deltas de KD/derribo", () => {
    const timeline = buildFightTimeline(series, 201, 202);
    expect(timeline).not.toBeNull();
    expect(timeline!.red.points.map((p) => p.seconds)).toEqual([109, 300, 455, 600]);
    expect(timeline!.red.points.map((p) => p.value)).toEqual([11, 26, 41, 45]);
    expect(timeline!.blue.final).toBe(28);
    expect(timeline!.rounds).toBe(2);
    expect(timeline!.totalSeconds).toBe(600);
    expect(timeline!.maxValue).toBe(45);
    // El KD de la roja aflora como delta en el punto del asalto 2...
    expect(timeline!.red.points[2].kdDelta).toBe(1);
    // ...y el derribo en el corte del primer asalto.
    expect(timeline!.red.points[1].tdDelta).toBe(1);
    expect(timeline!.blue.points.every((p) => p.kdDelta === 0)).toBe(true);
  });

  it("tolera una esquina ausente y exige historia mínima", () => {
    const soloRed = buildFightTimeline(series, 201, null);
    expect(soloRed).not.toBeNull();
    expect(soloRed!.blue.points).toEqual([]);
    // Una sola muestra no es una película.
    expect(buildFightTimeline(series.slice(0, 1), 201, 202)).toBeNull();
    expect(buildFightTimeline([], 201, 202)).toBeNull();
  });

  it("un KO a mitad de asalto conserva el tiempo real del final (patrón Garbrandt-Yanez)", () => {
    // Serie REAL de la pelea 12845 (UFC 329): End R1 con reloj congelado en
    // cuenta atrás (2:12 restantes) y 'post' con el tiempo oficial (2:47).
    const ko = [
      sample({ period: 1, displayClock: "4:55", stats: { "201": { ssl: 6 } } }),
      sample({ period: 1, displayClock: "2:22", stats: { "201": { ssl: 12 } } }),
      sample({
        period: 1, displayClock: "2:12", statusName: "STATUS_END_OF_ROUND",
        stats: { "201": { ssl: 14 } },
      }),
      sample({
        state: "post", statusName: "STATUS_FINAL", period: 1, displayClock: "2:13",
        stats: { "201": { ssl: 14 } },
      }),
      sample({
        state: "post", statusName: "STATUS_FINAL", period: 1, displayClock: "2:47",
        stats: { "201": { ssl: 14 } },
      }),
    ];
    const timeline = buildFightTimeline(ko, 201, null);
    // El final queda en ~2:48 (168 s), NUNCA en 5:00: los relojes 'post'
    // oficiales (2:13/2:47) se aplanan contra el tope ya visto y dedupean.
    expect(timeline!.red.points.map((p) => p.seconds)).toEqual([5, 158, 168]);
    expect(timeline!.totalSeconds).toBe(168);
    expect(timeline!.red.points[2].label).toBe("R1 · 2:48");
  });

  it("aplana retrocesos de reloj (scoreboard desincronizado)", () => {
    const glitch = [
      sample({ period: 2, displayClock: "2:00", stats: { "201": { ssl: 10 } } }),
      // Retrocede a R1 por un poll rancio: no puede dibujar hacia atrás.
      sample({ period: 1, displayClock: "0:10", stats: { "201": { ssl: 12 } } }),
      sample({ period: 2, displayClock: "1:00", stats: { "201": { ssl: 14 } } }),
    ];
    const timeline = buildFightTimeline(glitch, 201, null);
    expect(timeline!.red.points.map((p) => p.seconds)).toEqual([480, 480, 540]);
    // La etiqueta sale del tiempo YA aplanado: nada de "R1 · 8:00" imposibles.
    expect(timeline!.red.points.map((p) => p.label)).toEqual([
      "R2 · 3:00", "R2 · 3:00", "R2 · 4:00",
    ]);
  });

  it("un final en la PRIMERA mitad del asalto no salta hacia delante (post transicional ambigua)", () => {
    // Sumisión a 1:00 de R1: End-of-Round congela la cuenta atrás en 4:00,
    // la 'post' transicional REPITE ese 4:00 (que leído como transcurrido
    // saltaría a 4:00 min) y la oficial trae 1:00. Gana la lectura más
    // cercana al tiempo previo de la serie.
    const early = [
      sample({ period: 1, displayClock: "4:30", stats: { "201": { ssl: 4 } } }),
      sample({
        period: 1, displayClock: "4:00", statusName: "STATUS_END_OF_ROUND",
        stats: { "201": { ssl: 7 } },
      }),
      sample({
        state: "post", statusName: "STATUS_FINAL", period: 1, displayClock: "4:00",
        stats: { "201": { ssl: 7 } },
      }),
      sample({
        state: "post", statusName: "STATUS_FINAL", period: 1, displayClock: "1:00",
        stats: { "201": { ssl: 7 } },
      }),
    ];
    const timeline = buildFightTimeline(early, 201, null);
    expect(timeline!.red.points.map((p) => p.seconds)).toEqual([30, 60]);
    expect(timeline!.totalSeconds).toBe(60);
    expect(timeline!.red.points[1].label).toBe("R1 · 1:00");
  });

  it("STATUS_END_OF_FIGHT llega con state 'in' y cuenta atrás congelada (patrón Steveson-Ellison)", () => {
    // Verificado en la captura real de UFC 329 (comp 401868927): END_OF_FIGHT
    // repite el reloj congelado del END_OF_ROUND previo (2:26 restantes) y el
    // oficial fue 2:31 — cuenta atrás, no transcurrido.
    expect(
      sampleElapsedSeconds(
        sample({ period: 1, displayClock: "2:26", statusName: "STATUS_END_OF_FIGHT" }),
      ),
    ).toBe(154);
  });

  it("una fila corrupta con period gigante se descarta (no tumba el render)", () => {
    expect(
      mapFightTimelineSample({
        state: "in", status_name: null, period: 2_000_000_000,
        display_clock: "4:00", stats: { "201": { ssl: 1 } }, sampled_at: "x",
      }),
    ).toBeNull();
  });

  it("un KD en la primera muestra pinta anillo y una corrección transitoria no lo duplica", () => {
    const s = [
      // El KD cayó antes de la primera muestra: acumulado desde cero -> delta 1.
      sample({ period: 1, displayClock: "4:00", stats: { "201": { ssl: 5, kd: 1, tdl: 0 } } }),
      // Corrección transitoria de ESPN (kd 1 -> 0 -> 1): ni resta ni re-suma.
      sample({ period: 1, displayClock: "3:00", stats: { "201": { ssl: 8, kd: 0, tdl: 0 } } }),
      sample({ period: 1, displayClock: "2:00", stats: { "201": { ssl: 12, kd: 1, tdl: 0 } } }),
    ];
    const timeline = buildFightTimeline(s, 201, null);
    expect(timeline!.red.points.map((p) => p.kdDelta)).toEqual([1, 0, 0]);
  });

  it("una pelea de 5 asaltos etiqueta R4/R5 y extiende el dominio", () => {
    const five = [
      sample({ period: 4, displayClock: "3:00", stats: { "201": { ssl: 40 } } }),
      sample({ period: 5, displayClock: "1:00", stats: { "201": { ssl: 55 } } }),
    ];
    const timeline = buildFightTimeline(five, 201, null);
    expect(timeline!.rounds).toBe(5);
    expect(timeline!.totalSeconds).toBe(1440);
    expect(timeline!.red.points[1].label).toBe("R5 · 4:00");
  });
});

describe("escalas y etiquetas", () => {
  it("scaleSeconds y scaleValue mapean al área de dibujo", () => {
    expect(scaleSeconds(0, 600, 40, 700)).toBe(40);
    expect(scaleSeconds(600, 600, 40, 700)).toBe(740);
    expect(scaleSeconds(900, 600, 40, 700)).toBe(740); // clamp
    expect(scaleValue(0, 50, 20, 200)).toBe(220); // 0 abajo
    expect(scaleValue(50, 50, 20, 200)).toBe(20); // máximo arriba
  });

  it("timelinePointLabel muestra tiempo transcurrido del asalto", () => {
    expect(timelinePointLabel(109, 1)).toBe("R1 · 1:49");
    expect(timelinePointLabel(455, 2)).toBe("R2 · 2:35");
    expect(timelinePointLabel(600, 2)).toBe("R2 · 5:00");
  });

  it("decimateSamples conserva extremos y respeta el tope", () => {
    const arr = Array.from({ length: 75 }, (_, i) => i);
    const out = decimateSamples(arr, 40);
    expect(out.length).toBe(40);
    expect(out[0]).toBe(0);
    expect(out[out.length - 1]).toBe(74);
    expect(decimateSamples([1, 2, 3], 40)).toEqual([1, 2, 3]);
  });
});
