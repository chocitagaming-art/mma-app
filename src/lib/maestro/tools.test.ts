import { beforeEach, describe, expect, it, vi } from "vitest";

// Aislamos del acceso real a la BD: el guard a===b no debe consultar nada.
const { getFighterComparisonDetailMock } = vi.hoisted(() => ({
  getFighterComparisonDetailMock: vi.fn(),
}));

vi.mock("@/lib/db", () => ({ sql: vi.fn() }));
vi.mock("@/lib/queries/fighters", () => ({
  getFighterComparisonDetail: getFighterComparisonDetailMock,
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
