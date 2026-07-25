import { describe, expect, it } from "vitest";

import {
  computeBoutStates,
  firstSegmentStart,
  isMainEventFinished,
  resolveLivePhase,
  type LiveBoutInput,
  type LiveEventTimes,
} from "@/lib/live-event";

// Horarios reales de UFC 329 (12-jul-2026): early prelims 23:00Z (día 11),
// prelims 00:00Z, main card 01:00Z. Formato texto de Postgres (timestamptz).
const TIMES: LiveEventTimes = {
  eventDate: "2026-07-12",
  startTime: "2026-07-12 01:00:00+00",
  prelimsTime: "2026-07-12 00:00:00+00",
  earlyPrelimsTime: "2026-07-11 23:00:00+00",
};

function bout(
  fightId: number,
  boutOrder: number | null,
  cardSegment: string | null,
  finished = false,
): LiveBoutInput {
  return {
    fightId,
    boutOrder,
    cardSegment,
    method: finished ? "KO/TKO" : null,
    winnerId: finished ? 100 + fightId : null,
  };
}

describe("firstSegmentStart", () => {
  it("elige el tramo más temprano disponible", () => {
    expect(firstSegmentStart(TIMES)?.toISOString()).toBe(
      "2026-07-11T23:00:00.000Z",
    );
  });

  it("cae a prelims/main cuando faltan tramos", () => {
    expect(
      firstSegmentStart({ ...TIMES, earlyPrelimsTime: null })?.toISOString(),
    ).toBe("2026-07-12T00:00:00.000Z");
    expect(
      firstSegmentStart({
        ...TIMES,
        earlyPrelimsTime: null,
        prelimsTime: null,
      })?.toISOString(),
    ).toBe("2026-07-12T01:00:00.000Z");
  });

  it("null sin ningún horario", () => {
    expect(
      firstSegmentStart({
        eventDate: "2026-07-12",
        startTime: null,
        prelimsTime: null,
        earlyPrelimsTime: null,
      }),
    ).toBeNull();
  });
});

describe("resolveLivePhase", () => {
  it("'pre' dentro de las 24 h previas", () => {
    expect(resolveLivePhase(TIMES, new Date("2026-07-11T10:00:00Z"))).toBe(
      "pre",
    );
  });

  it("'none' a más de 24 h", () => {
    expect(resolveLivePhase(TIMES, new Date("2026-07-10T10:00:00Z"))).toBe(
      "none",
    );
  });

  it("'live' desde 30 min antes del primer tramo", () => {
    expect(resolveLivePhase(TIMES, new Date("2026-07-11T22:31:00Z"))).toBe(
      "live",
    );
    expect(resolveLivePhase(TIMES, new Date("2026-07-11T22:29:00Z"))).toBe(
      "pre",
    );
  });

  it("'live' durante la cartelera y hasta 8 h tras el main card", () => {
    expect(resolveLivePhase(TIMES, new Date("2026-07-12T03:00:00Z"))).toBe(
      "live",
    );
    expect(resolveLivePhase(TIMES, new Date("2026-07-12T08:59:00Z"))).toBe(
      "live",
    );
    expect(resolveLivePhase(TIMES, new Date("2026-07-12T09:01:00Z"))).toBe(
      "none",
    );
  });

  it("sin horarios: 'live' solo el día natural UTC del evento", () => {
    const noTimes: LiveEventTimes = {
      eventDate: "2026-07-12",
      startTime: null,
      prelimsTime: null,
      earlyPrelimsTime: null,
    };
    expect(resolveLivePhase(noTimes, new Date("2026-07-12T15:00:00Z"))).toBe(
      "live",
    );
    expect(resolveLivePhase(noTimes, new Date("2026-07-13T01:00:00Z"))).toBe(
      "none",
    );
  });

  it("'none' sin horarios ni fecha", () => {
    expect(
      resolveLivePhase(
        {
          eventDate: null,
          startTime: null,
          prelimsTime: null,
          earlyPrelimsTime: null,
        },
        new Date("2026-07-12T00:00:00Z"),
      ),
    ).toBe("none");
  });
});

describe("computeBoutStates", () => {
  // Cartel de 5: estelar bout_order 1 (main), 2 (main), 3 (prelims),
  // 4 (prelims), 5 (early_prelims). Cronología: 5 → 4 → 3 → 2 → 1.
  const CARD: LiveBoutInput[] = [
    bout(1, 1, "main"),
    bout(2, 2, "main"),
    bout(3, 3, "prelims"),
    bout(4, 4, "prelims"),
    bout(5, 5, "early_prelims"),
  ];

  it("fase 'pre': todo pending, nada live", () => {
    const states = computeBoutStates(
      CARD,
      "pre",
      TIMES,
      new Date("2026-07-11T10:00:00Z"),
    );
    expect([...states.values()].every((state) => state === "pending")).toBe(
      true,
    );
  });

  it("en vivo: la primera de la noche (mayor bout_order) está EN CURSO", () => {
    const states = computeBoutStates(
      CARD,
      "live",
      TIMES,
      new Date("2026-07-11T23:10:00Z"),
    );
    expect(states.get(5)).toBe("live");
    expect(states.get(4)).toBe("pending");
    expect(states.get(1)).toBe("pending");
  });

  it("con resultados escritos, avanza a la siguiente sin terminar", () => {
    const card = [
      bout(1, 1, "main"),
      bout(2, 2, "main"),
      bout(3, 3, "prelims"),
      bout(4, 4, "prelims", true),
      bout(5, 5, "early_prelims", true),
    ];
    const states = computeBoutStates(
      card,
      "live",
      TIMES,
      new Date("2026-07-12T00:20:00Z"),
    );
    expect(states.get(5)).toBe("finished");
    expect(states.get(4)).toBe("finished");
    expect(states.get(3)).toBe("live");
    expect(states.get(2)).toBe("pending");
  });

  it("empate/NC (method sin winner) cuenta como finished", () => {
    const draw: LiveBoutInput = {
      fightId: 9,
      boutOrder: 3,
      cardSegment: "prelims",
      method: "Decision",
      winnerId: null,
    };
    const states = computeBoutStates(
      [draw],
      "live",
      TIMES,
      new Date("2026-07-12T00:20:00Z"),
    );
    expect(states.get(9)).toBe("finished");
  });

  it("liveFinishedIds marca finished un empate/NC sin resultado en fights (hallazgo 6)", () => {
    // ESPN dio la pelea por terminada (fila viva 'post') pero el pipeline no
    // escribió method/winner (empate/NC): sin la señal seguía "En curso".
    const card = [
      bout(1, 1, "main"),
      bout(2, 2, "main"),
      bout(3, 3, "prelims"), // el empate: sin method/winner en fights
      bout(4, 4, "prelims", true),
      bout(5, 5, "early_prelims", true),
    ];
    const sinSenal = computeBoutStates(
      card,
      "live",
      TIMES,
      new Date("2026-07-12T01:05:00Z"),
    );
    // Sin señal: la 3 (empate) queda como candidata EN CURSO, contradictorio.
    expect(sinSenal.get(3)).toBe("live");

    const conSenal = computeBoutStates(
      card,
      "live",
      TIMES,
      new Date("2026-07-12T01:05:00Z"),
      new Set([3]),
    );
    // Con la señal: la 3 pasa a "finished" y el puntero avanza a la 2.
    expect(conSenal.get(3)).toBe("finished");
    expect(conSenal.get(2)).toBe("live");
  });

  it("liveInProgressIds manda sobre la deducción: pelea CAÍDA en mitad del evento (1062, 25-jul)", () => {
    // Caso real. ESPN retiró Dulatov-Turman (#3) de su cartelera DURANTE la
    // velada; no se reordenó, desapareció. Quedó con status NULL y sin winner,
    // así que la deducción por bout_order la eligió como "en curso" mientras
    // Erceg (#2) se estaba peleando de verdad, con sus stats en pantalla.
    const card = [
      bout(12863, 1, "main"), // Ankalaev, aún por pelear
      bout(12864, 2, "main"), // Erceg: EN CURSO de verdad (ESPN state='in', asalto 1)
      bout(12866, 3, "main"), // Dulatov: caída de la cartelera, nunca se disputó
      bout(12870, 4, "main", true), // Zaynukov, ya cerrada
    ];
    const now = new Date("2026-07-12T01:05:00Z");

    // Sin la señal se reproduce el bug que vio el dueño: la caída sale "live".
    const sinSenal = computeBoutStates(card, "live", TIMES, now);
    expect(sinSenal.get(12866)).toBe("live");
    expect(sinSenal.get(12864)).toBe("pending");

    // Con la señal se mira el DATO: la que ESPN da por empezada es la 12864.
    const conSenal = computeBoutStates(
      card,
      "live",
      TIMES,
      now,
      undefined,
      new Set([12864]),
    );
    expect(conSenal.get(12864)).toBe("live");
    expect(conSenal.get(12866)).toBe("pending");
    expect(conSenal.get(12863)).toBe("pending");
    expect(conSenal.get(12870)).toBe("finished");
  });

  it("sin señal de 'en curso' se sigue deduciendo por bout_order (respaldo intacto)", () => {
    // Entre combate y combate ESPN no marca ninguno 'in'. Un Set vacío NO debe
    // dejar la cartelera entera en "pending": la deducción es el respaldo para
    // el que se escribió.
    const card = [bout(1, 1, "main"), bout(2, 2, "main"), bout(3, 3, "prelims", true)];
    const states = computeBoutStates(
      card,
      "live",
      TIMES,
      new Date("2026-07-12T01:05:00Z"),
      undefined,
      new Set<number>(),
    );
    expect(states.get(2)).toBe("live");
  });

  it("una pelea ya terminada no se marca 'live' aunque llegue en liveInProgressIds", () => {
    // Snapshot rancio: ESPN dejó la fila en 'in' y el resultado entró por otra
    // vía. El resultado manda sobre el estado.
    const card = [bout(1, 1, "main"), bout(2, 2, "main", true)];
    const states = computeBoutStates(
      card,
      "live",
      TIMES,
      new Date("2026-07-12T01:05:00Z"),
      undefined,
      new Set([2]),
    );
    expect(states.get(2)).toBe("finished");
    expect(states.get(1)).toBe("live");
  });

  it("la siguiente es 'next' si su tramo aún no ha empezado", () => {
    // Prelims terminados a las 00:40; el main card no abre hasta la 01:00.
    const card = [
      bout(1, 1, "main"),
      bout(2, 2, "main"),
      bout(3, 3, "prelims", true),
      bout(4, 4, "prelims", true),
      bout(5, 5, "early_prelims", true),
    ];
    const states = computeBoutStates(
      card,
      "live",
      TIMES,
      new Date("2026-07-12T00:40:00Z"),
    );
    expect(states.get(2)).toBe("next");
    const after = computeBoutStates(
      card,
      "live",
      TIMES,
      new Date("2026-07-12T01:05:00Z"),
    );
    expect(after.get(2)).toBe("live");
  });

  it("una pelea saltada (posterior ya terminada) no estanca el puntero", () => {
    // La 4 (prelims) se canceló a última hora sin marcarse en BD: la 3 ya
    // tiene resultado, así que la cronología demuestra que la 4 fue saltada.
    const card = [
      bout(1, 1, "main"),
      bout(2, 2, "main"),
      bout(3, 3, "prelims", true),
      bout(4, 4, "prelims"),
      bout(5, 5, "early_prelims", true),
    ];
    const states = computeBoutStates(
      card,
      "live",
      TIMES,
      new Date("2026-07-12T01:10:00Z"),
    );
    expect(states.get(4)).toBe("pending");
    expect(states.get(2)).toBe("live");
  });

  it("sin resultados todavía, el puntero es el de mayor bout_order", () => {
    const states = computeBoutStates(
      CARD,
      "live",
      TIMES,
      new Date("2026-07-11T23:30:00Z"),
    );
    expect(states.get(5)).toBe("live");
  });

  it("bout_order NULL nunca se marca live", () => {
    const card = [bout(1, null, "main"), bout(2, null, "main")];
    const states = computeBoutStates(
      card,
      "live",
      TIMES,
      new Date("2026-07-12T02:00:00Z"),
    );
    expect(states.get(1)).toBe("pending");
    expect(states.get(2)).toBe("pending");
  });

  it("todo terminado: nadie live", () => {
    const card = [bout(1, 1, "main", true), bout(2, 2, "main", true)];
    const states = computeBoutStates(
      card,
      "live",
      TIMES,
      new Date("2026-07-12T04:00:00Z"),
    );
    expect([...states.values()].every((state) => state === "finished")).toBe(
      true,
    );
  });
});

describe("isMainEventFinished", () => {
  it("false mientras el estelar (bout_order 1) sigue sin resultado", () => {
    const card = [
      bout(1, 1, "main"), // estelar aún sin resultado
      bout(2, 2, "main", true),
      bout(5, 5, "early_prelims", true),
    ];
    expect(isMainEventFinished(card)).toBe(false);
  });

  it("true cuando el estelar (menor bout_order) ya tiene resultado", () => {
    const card = [
      bout(1, 1, "main", true),
      bout(2, 2, "main"),
      bout(5, 5, "early_prelims", true),
    ];
    expect(isMainEventFinished(card)).toBe(true);
  });

  it("prelims terminados pero el estelar en curso -> aún NO terminado", () => {
    const card = [
      bout(1, 1, "main"),
      bout(2, 2, "main"),
      bout(3, 3, "prelims", true),
      bout(4, 4, "prelims", true),
      bout(5, 5, "early_prelims", true),
    ];
    expect(isMainEventFinished(card)).toBe(false);
  });

  it("empate/NC en el estelar (method sin winner) cuenta como terminado", () => {
    const draw: LiveBoutInput = {
      fightId: 1,
      boutOrder: 1,
      cardSegment: "main",
      method: "Decision",
      winnerId: null,
    };
    expect(isMainEventFinished([draw])).toBe(true);
  });

  it("liveFinishedIds cierra el estelar sin resultado en fights (ESPN 'post')", () => {
    const card = [bout(1, 1, "main"), bout(2, 2, "main", true)];
    expect(isMainEventFinished(card)).toBe(false);
    expect(isMainEventFinished(card, new Set([1]))).toBe(true);
  });

  it("sin bouts o con bout_order NULL -> false (no se afirma terminado)", () => {
    expect(isMainEventFinished([])).toBe(false);
    expect(isMainEventFinished([bout(1, null, "main", true)])).toBe(false);
  });

  it("el menor bout_order presente manda (las canceladas ya vienen excluidas)", () => {
    const card = [bout(2, 2, "main", true), bout(3, 3, "prelims")];
    expect(isMainEventFinished(card)).toBe(true);
  });
});
