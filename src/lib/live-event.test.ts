import { describe, expect, it } from "vitest";

import {
  computeBoutStates,
  firstSegmentStart,
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
