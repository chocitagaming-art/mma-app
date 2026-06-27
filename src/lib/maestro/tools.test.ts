import { beforeEach, describe, expect, it, vi } from "vitest";

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
