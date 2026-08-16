import { describe, expect, it } from "vitest";

import {
  MIN_CONTROL_SECONDS,
  MIN_CONTROL_SHARE,
  buildControlBands,
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

  it("tdTotal se queda con el ÚLTIMO tdl, no con el máximo del directo", () => {
    // Patrón REAL de la 14022 (esquina roja 6455): un derribo en R1, ESPN
    // acredita un segundo en R3 y lo RETIRA al sellar la ficha. El acta de
    // ufcstats —y la tabla de asaltos de la misma página— dicen 1.
    const s = [
      sample({ period: 1, displayClock: "4:15", stats: { "201": { ssl: 8, tdl: 1 } } }),
      sample({
        period: 3, displayClock: "-", statusName: "STATUS_END_OF_ROUND",
        stats: { "201": { ssl: 44, tdl: 2 } },
      }),
      // La 'post' del cierre repite segundo y golpes: se DEDUPLICA y no añade
      // punto. La retirada del derribo tiene que sobrevivir igualmente.
      sample({
        state: "post", statusName: "STATUS_FINAL", period: 3, displayClock: "5:00",
        stats: { "201": { ssl: 44, tdl: 1 } },
      }),
    ];
    const timeline = buildFightTimeline(s, 201, null);
    expect(timeline!.red.points.length).toBe(2);
    // Los deltas siguen siendo monótonos: suman 2 (dos tachas sin tope).
    expect(timeline!.red.points.map((p) => p.tdDelta)).toEqual([1, 1]);
    // Y el total con el que ESPN cierra es 1: el tope que deja una sola.
    expect(timeline!.red.tdTotal).toBe(1);
    // Una esquina ausente no inventa derribos.
    expect(timeline!.blue.tdTotal).toBe(0);
  });

  it("tdTotal ignora las muestras sin tdl en vez de contarlas como cero", () => {
    const s = [
      sample({ period: 1, displayClock: "4:00", stats: { "201": { ssl: 5, tdl: 1 } } }),
      sample({ period: 1, displayClock: "3:00", stats: { "201": { ssl: 9 } } }),
    ];
    expect(buildFightTimeline(s, 201, null)!.red.tdTotal).toBe(1);
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

// ---------------------------------------------------------------------------
// LA BANDA DE AGARRE
// ---------------------------------------------------------------------------
//
// buildControlBands recibe el eje X YA APLANADO (`elapsed`), que es lo que
// construye buildFightTimeline. Estos tests se lo pasan explícito a propósito:
// el aplanado del reloj ya tiene sus propios tests ahí arriba, y aquí lo que se
// prueba es el REPARTO DE VENTANAS, no la lectura del scoreboard.
describe("buildControlBands", () => {
  // Muestra con solo el reloj de agarre de cada esquina. El ssl va porque una
  // muestra sin ninguna clave usable se descarta en el mapeo.
  function ctrl(red: number | null, blue: number | null): FightTimelineSample {
    const stats: Record<string, Record<string, number>> = {};
    if (red != null) {
      stats["201"] = { ssl: 1, ctrl: red };
    }
    if (blue != null) {
      stats["202"] = { ssl: 1, ctrl: blue };
    }
    return sample({ stats });
  }

  it("la ventana es de quien la ocupa: 40 s de agarre en 60 dan un tramo", () => {
    const bands = buildControlBands([ctrl(40, 0)], [60], 201, 202);
    expect(bands).toEqual([{ from: 0, to: 60, owner: "red", seconds: 40 }]);
  });

  it("🪤 EL UMBRAL ES UN TERCIO, y cambiarlo tiene que salir en rojo", () => {
    expect(MIN_CONTROL_SHARE).toBe(1 / 3);
    // 15 s en una ventana de 60 son el 25 %: el resto de la ventana se peleó de
    // pie y pintar los 60 s enteros de rojo sería afirmar de más.
    expect(buildControlBands([ctrl(15, 0)], [60], 201, 202)).toEqual([]);
    // 20 s son el 33,3 % justo, y el justo entra.
    expect(buildControlBands([ctrl(20, 0)], [60], 201, 202)).toHaveLength(1);
  });

  it("🪤 un RETROCESO de ctrl deja la ventana sin dueño, no en cero", () => {
    // El caso real es la 13315 esquina roja: 36 -> 14, o sea -22 s. Un
    // retroceso significa "no sé quién sujetaba aquí", jamás "cero segundos".
    // (Este aserto fija el CONTRATO; hoy un Math.max(0, delta) daría el mismo
    // dibujo porque el suelo del umbral ya excluye al cero — ver el comentario
    // de ctrlDelta. El que muerde de verdad es el test de aquí debajo.)
    const bands = buildControlBands(
      [ctrl(36, 5), ctrl(14, 6)],
      [60, 120],
      201,
      202,
    );
    // La primera ventana sí tiene dueño; la del retroceso NO, y el rival que
    // ganó 1 s en ella tampoco se la lleva.
    expect(bands).toEqual([{ from: 0, to: 60, owner: "red", seconds: 36 }]);
  });

  it("🪤 y la línea base NO baja con el retroceso: se queda en el MÁXIMO", () => {
    // Misma doctrina que los KD y los derribos: el reloj de agarre solo sube,
    // así que una bajada es un error de ESPN y no un hecho de la pelea. Medir
    // la recuperación desde el valor rebajado cuenta DOS VECES los mismos
    // segundos: aquí, 74 - 14 = 60 s de agarre en una ventana de 60, o sea el
    // tramo entero, cuando el propio ESPN solo ha acreditado 74 en total y ya
    // había 36 pintados antes.
    const bands = buildControlBands(
      [ctrl(36, 0), ctrl(14, 0), ctrl(74, 0)],
      [60, 120, 180],
      201,
      202,
    );
    expect(bands[bands.length - 1].seconds).toBe(38);
    // Y el invariante que esto compra: la banda JAMÁS afirma más agarre del que
    // ESPN llegó a acreditar. 36 + 38 = 74. Con la base bajando salían 96.
    const total = bands.reduce((acc, band) => acc + band.seconds, 0);
    expect(total).toBeLessThanOrEqual(74);
  });

  it("🪤 y el retroceso NO puede inventarse un tramo entero (caso real 13315)", () => {
    // Abdul-Malik, esquina roja de la 13315: ESPN lo sube a 36, lo desploma a
    // 14 durante dos muestras y lo devuelve a 34 antes de cerrar en 37. El acta
    // de ufcstats también dice 37. La versión que bajaba la base leía la
    // recuperación como "+20 s nuevos" y publicaba un SEGUNDO rectángulo con el
    // <title> «sujetó 0:20»: 56 s dibujados sobre 37 reales.
    const bands = buildControlBands(
      [ctrl(15, 0), ctrl(36, 0), ctrl(14, 0), ctrl(14, 0), ctrl(34, 0), ctrl(37, 0)],
      [60, 120, 180, 240, 300, 360],
      201,
      202,
    );
    const total = bands.reduce((acc, band) => acc + band.seconds, 0);
    expect(total).toBeLessThanOrEqual(37);
  });

  it("🪤 UN TRAMO TIENE QUE MEDIR ALGO: el suelo absoluto de 5 s", () => {
    expect(MIN_CONTROL_SECONDS).toBe(5);
    // El umbral relativo solo se cumple a sí mismo: en una ventana de 2 s, 2 s
    // de agarre son el 100 %. Es el patrón real de la 14232, donde ESPN emite
    // dos muestras pegadas en el corte de asalto y salían rectángulos de 0,3 px
    // de pantalla que además contaban en el «5 tramos de…» del aria-label.
    expect(buildControlBands([ctrl(0, 0), ctrl(2, 0)], [598, 600], 201, 202)).toEqual(
      [],
    );
    // Con 5 s justos sí, y ahí el suelo relativo (1/3) vuelve a mandar.
    expect(
      buildControlBands([ctrl(0, 0), ctrl(5, 0)], [595, 600], 201, 202),
    ).toHaveLength(1);
  });

  it("un empate exacto en la ventana no tiene dueño", () => {
    expect(buildControlBands([ctrl(30, 30)], [60], 201, 202)).toEqual([]);
  });

  it("🪤 LA RÁFAGA: el reloj de ESPN llega a saltos y el sobrante va hacia atrás", () => {
    // Patrón real del estelar: de 2 a 103 s de agarre en una ventana de 30. Los
    // 71 s que no caben ocurrieron ANTES —el acumulado no puede superar al
    // reloj de combate—, así que el tramo arranca 71 s antes.
    const bands = buildControlBands(
      [ctrl(2, 0), ctrl(103, 0)],
      [88, 118],
      201,
      202,
    );
    expect(bands).toEqual([{ from: 17, to: 118, owner: "red", seconds: 101 }]);
    // Y el ancho es el techo: nunca se publican más segundos de los que dura.
    for (const band of bands) {
      expect(band.seconds).toBeLessThanOrEqual(band.to - band.from);
    }
  });

  it("🪤 la ráfaga NO cruza el corte de asalto", () => {
    // Entre asalto y asalto no se sujeta a nadie: un salto gordo en la primera
    // muestra del R2 no puede pintar dentro del R1.
    const bands = buildControlBands(
      [ctrl(0, 0), ctrl(200, 0)],
      [300, 330],
      201,
      202,
    );
    expect(bands).toEqual([{ from: 300, to: 330, owner: "red", seconds: 30 }]);
  });

  it("🪤 la ráfaga NO pisa el tramo anterior", () => {
    const bands = buildControlBands(
      [ctrl(30, 0), ctrl(30, 40), ctrl(130, 40)],
      [60, 120, 150],
      201,
      202,
    );
    expect(bands).toEqual([
      { from: 0, to: 60, owner: "red", seconds: 30 },
      { from: 60, to: 120, owner: "blue", seconds: 40 },
      { from: 120, to: 150, owner: "red", seconds: 30 },
    ]);
  });

  it("ventanas seguidas del mismo dueño se funden en UN tramo", () => {
    // Y por eso el carril no necesita separador: dos tramos del mismo color
    // nunca se tocan.
    expect(
      buildControlBands([ctrl(30, 0), ctrl(60, 0)], [60, 120], 201, 202),
    ).toEqual([{ from: 0, to: 120, owner: "red", seconds: 60 }]);
  });

  it("una pelea de pie no tiene banda: sin ctrl, o con ctrl a cero, no hay tramos", () => {
    // Es el caso de Barboza-Ribovics (19 s de clinch en 6:33) y de
    // Johnson-McConico (3 s): cero tramos, y la capa entera desaparece.
    const sinCtrl = [
      sample({ stats: { "201": { ssl: 5 }, "202": { ssl: 3 } } }),
      sample({ stats: { "201": { ssl: 9 }, "202": { ssl: 7 } } }),
    ];
    expect(buildControlBands(sinCtrl, [60, 120], 201, 202)).toEqual([]);
    expect(
      buildControlBands([ctrl(0, 0), ctrl(0, 0)], [60, 120], 201, 202),
    ).toEqual([]);
  });

  it("una esquina ausente no puede tener tramos", () => {
    const bands = buildControlBands(
      [ctrl(40, 40), ctrl(80, 90)],
      [60, 120],
      201,
      null,
    );
    expect(bands.length).toBeGreaterThan(0);
    expect(bands.every((band) => band.owner === "red")).toBe(true);
  });

  it("las muestras que no mueven el reloj no abren ventana (las dos 'post')", () => {
    const bands = buildControlBands(
      [ctrl(40, 0), ctrl(45, 0), ctrl(45, 0)],
      [60, 60, 60],
      201,
      202,
    );
    expect(bands).toEqual([{ from: 0, to: 60, owner: "red", seconds: 40 }]);
  });

  it("invariantes sobre una serie larga: ordenados, sin solapes y honrados", () => {
    const serie = [
      ctrl(0, 0), ctrl(4, 0), ctrl(2, 0), ctrl(103, 0), ctrl(133, 5),
      ctrl(133, 60), ctrl(140, 60), ctrl(300, 60), ctrl(300, 61),
    ];
    const eje = [26, 57, 88, 118, 149, 211, 241, 273, 330];
    const bands = buildControlBands(serie, eje, 201, 202);
    expect(bands.length).toBeGreaterThan(1);
    let prevTo = -1;
    for (const band of bands) {
      expect(band.from).toBeLessThan(band.to);
      expect(band.from).toBeGreaterThanOrEqual(prevTo);
      expect(band.seconds).toBeGreaterThan(0);
      expect(band.seconds).toBeLessThanOrEqual(band.to - band.from);
      prevTo = band.to;
    }
  });

  it("el R1 REAL del estelar de UFC 330 sale de una pieza", () => {
    // Serie literal de la pelea 12885 (Makhachev rojo 6258 · Garry azul 6232),
    // asalto 1: ssl congelado en (2,1) los 5 minutos mientras el reloj de
    // agarre de Makhachev sube 0-4-2-103-133-166-196-235 y ESPN lo corrige a
    // 218 al cerrar el asalto. La película de hoy dibuja ahí una raya
    // horizontal; con la banda, ese R1 es UN bloque rojo con 3:46 dentro.
    const r1 = [0, 4, 2, 103, 133, 166, 196, 235, 218, 218].map((c) =>
      ctrl(c, 0),
    );
    const eje = [26, 57, 88, 118, 149, 211, 241, 273, 300, 300];
    // El arranque en 19 sale de la ráfaga: a 1:58 ESPN declara 103 s de agarre
    // en una ventana de 30, así que 69 de esos segundos ocurrieron antes. La
    // base es el MÁXIMO visto (4), no el 2 al que ESPN lo bajó por el camino:
    // por eso 19 y no 17, y por eso el bloque declara 3:44 y no 3:46.
    expect(buildControlBands(r1, eje, 201, 202)).toEqual([
      { from: 19, to: 273, owner: "red", seconds: 224 },
    ]);
  });
});

describe("buildFightTimeline · el contrato de `control`", () => {
  it("una pelea sin ctrl publica una lista vacía, no undefined", () => {
    const sinCtrl = [
      sample({ period: 1, displayClock: "4:00", stats: { "201": { ssl: 5 } } }),
      sample({ period: 1, displayClock: "3:00", stats: { "201": { ssl: 9 } } }),
    ];
    expect(buildFightTimeline(sinCtrl, 201, null)!.control).toEqual([]);
  });

  it("y los tramos se recortan al dominio que el eje llega a dibujar", () => {
    // La última muestra trae agarre pero NO golpes, así que no es punto:
    // totalSeconds se queda en 120 y el tramo no puede acabar en 180.
    const s = [
      sample({ period: 1, displayClock: "4:00", stats: { "201": { ssl: 5, ctrl: 0 } } }),
      sample({ period: 1, displayClock: "3:00", stats: { "201": { ssl: 8, ctrl: 40 } } }),
      sample({ period: 1, displayClock: "2:00", stats: { "201": { ctrl: 100 } } }),
    ];
    const timeline = buildFightTimeline(s, 201, null)!;
    expect(timeline.totalSeconds).toBe(120);
    expect(timeline.control).toEqual([
      { from: 60, to: 120, owner: "red", seconds: 60 },
    ]);
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
