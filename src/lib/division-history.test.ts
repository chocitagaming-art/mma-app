import { describe, expect, it } from "vitest";

import {
  computeDivisionHistory,
  formatDivisionStint,
  type DivisionHistoryInput,
} from "@/lib/division-history";

// Factoría mínima (fecha + categoría es lo único que consume el helper).
function fight(
  eventDate: string | null,
  weightClass: string | null,
): DivisionHistoryInput {
  return { eventDate, weightClass };
}

describe("computeDivisionHistory", () => {
  it("accepts Date objects for eventDate (node-postgres returns DATE as Date)", () => {
    // Regresión: en producción eventDate llega como Date, no string, y el
    // helper reventaba con "eventDate.slice is not a function".
    const history: DivisionHistoryInput[] = [
      { eventDate: new Date("2023-06-10T00:00:00Z"), weightClass: "Featherweight Bout" },
      { eventDate: new Date("2020-01-18T00:00:00Z"), weightClass: "Featherweight Bout" },
    ] as unknown as DivisionHistoryInput[];

    expect(computeDivisionHistory(history)).toEqual([
      { division: "Peso Pluma", from: 2020, to: null, fights: 2 },
    ]);
  });

  it("ignores catchweight and open weight bouts (one-off weight agreements)", () => {
    const history = [
      fight("2024-05-11", "Welterweight Bout"),
      fight("2019-08-17", "Catchweight Bout"),
      fight("2015-07-12", "Welterweight Bout"),
    ];

    expect(computeDivisionHistory(history)).toEqual([
      { division: "Peso Wélter", from: 2015, to: null, fights: 2 },
    ]);
  });

  it("returns a single open stint when the fighter never changed division", () => {
    // El historial de la ficha llega DESCENDENTE (más reciente primero).
    const history = [
      fight("2023-06-10", "Featherweight Bout"),
      fight("2021-03-06", "Featherweight Bout"),
      fight("2020-01-18", "Featherweight Bout"),
    ];

    expect(computeDivisionHistory(history)).toEqual([
      { division: "Peso Pluma", from: 2020, to: null, fights: 3 },
    ]);
  });

  it("splits a simple division change and leaves only the current one open", () => {
    const history = [
      fight("2024-04-13", "Lightweight Bout"),
      fight("2023-07-08", "Lightweight Bout"),
      fight("2022-10-22", "Featherweight Bout"),
      fight("2020-05-30", "Featherweight Bout"),
    ];

    expect(computeDivisionHistory(history)).toEqual([
      { division: "Peso Pluma", from: 2020, to: 2022, fights: 2 },
      { division: "Peso Ligero", from: 2023, to: null, fights: 2 },
    ]);
  });

  it("collapses back-and-forth moves into one entry per division", () => {
    // Pluma → Ligero → Pluma → Ligero: dos entradas, no cuatro.
    const history = [
      fight("2024-02-17", "Lightweight Bout"),
      fight("2023-09-16", "Featherweight Bout"),
      fight("2022-06-11", "Lightweight Bout"),
      fight("2020-08-29", "Featherweight Bout"),
    ];

    expect(computeDivisionHistory(history)).toEqual([
      // El `to` de Pluma es su ÚLTIMA pelea en la división (2023), aunque
      // hubiera pasado por Ligero en medio.
      { division: "Peso Pluma", from: 2020, to: 2023, fights: 2 },
      { division: "Peso Ligero", from: 2022, to: null, fights: 2 },
    ]);
  });

  it("ignores null, unknown weight classes and unparseable dates", () => {
    const history = [
      fight("2024-01-20", "Welterweight Bout"),
      fight("2023-03-04", null),
      fight("2022-11-12", "Superfight Championship"), // desconocida
      fight(null, "Welterweight Bout"), // sin fecha: no se puede ordenar
      fight("not-a-date", "Welterweight Bout"),
      fight("2021-05-15", "Welterweight Bout"),
    ];

    expect(computeDivisionHistory(history)).toEqual([
      { division: "Peso Wélter", from: 2021, to: null, fights: 2 },
    ]);
  });

  it("returns an empty list when nothing usable remains", () => {
    expect(computeDivisionHistory([])).toEqual([]);
    expect(computeDivisionHistory([fight("2024-01-20", null)])).toEqual([]);
  });
});

describe("formatDivisionStint", () => {
  it("formats a closed range with a two-digit end year in the same century", () => {
    expect(
      formatDivisionStint({
        division: "Peso Pluma",
        from: 2020,
        to: 2023,
        fights: 8,
      }),
    ).toBe("Pluma 2020-23");
  });

  it("formats an open stint with a trailing dash", () => {
    expect(
      formatDivisionStint({
        division: "Peso Ligero",
        from: 2023,
        to: null,
        fights: 4,
      }),
    ).toBe("Ligero 2023-");
  });

  it("collapses same-year stints to a single year", () => {
    expect(
      formatDivisionStint({
        division: "Peso Wélter",
        from: 2019,
        to: 2019,
        fights: 2,
      }),
    ).toBe("Wélter 2019");
  });

  it("keeps the full end year across centuries and labels without 'Peso'", () => {
    expect(
      formatDivisionStint({
        division: "Sin límite",
        from: 1997,
        to: 2003,
        fights: 5,
      }),
    ).toBe("Sin límite 1997-2003");
  });
});
