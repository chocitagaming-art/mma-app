import { describe, expect, it } from "vitest";

import {
  buildRankingTrajectory,
  scaleX,
  scaleY,
} from "@/lib/ranking-trajectory";
import type { FighterRankingHistoryEntry } from "@/lib/types";

function row(
  overrides: Partial<FighterRankingHistoryEntry>,
): FighterRankingHistoryEntry {
  return {
    division: "lightweight",
    rankPosition: 5,
    snapshotDate: "2023-01-01",
    isChampion: false,
    ...overrides,
  };
}

describe("buildRankingTrajectory", () => {
  it("separa una serie por división y la ordena por fecha", () => {
    // Entrada deliberadamente desordenada para comprobar el orden estable.
    const trajectory = buildRankingTrajectory([
      row({ division: "lightweight", rankPosition: 3, snapshotDate: "2023-06-01" }),
      row({ division: "mens_pound_for_pound", rankPosition: 10, snapshotDate: "2023-06-01" }),
      row({ division: "lightweight", rankPosition: 5, snapshotDate: "2023-01-01" }),
    ]);

    expect(trajectory.series).toHaveLength(2);

    const [lightweight, p4p] = trajectory.series;
    expect(lightweight.division).toBe("lightweight");
    expect(lightweight.colorVar).toBe("var(--chart-1)");
    expect(lightweight.points.map((p) => [p.date, p.position])).toEqual([
      ["2023-01-01", 5],
      ["2023-06-01", 3],
    ]);

    expect(p4p.division).toBe("mens_pound_for_pound");
    expect(p4p.colorVar).toBe("var(--chart-2)");
    expect(p4p.points).toHaveLength(1);

    expect(trajectory.dates).toEqual(["2023-01-01", "2023-06-01"]);
    expect(trajectory.minPosition).toBe(3);
    expect(trajectory.maxPosition).toBe(10);
  });

  it("maneja una única fecha como una serie con un solo punto", () => {
    const trajectory = buildRankingTrajectory([
      row({ rankPosition: 7, snapshotDate: "2024-03-01" }),
    ]);

    expect(trajectory.series).toHaveLength(1);
    expect(trajectory.series[0].points).toEqual([
      { date: "2024-03-01", position: 7, isChampion: false },
    ]);
    expect(trajectory.dates).toEqual(["2024-03-01"]);
  });

  it("normaliza al campeón a la posición 0 (cima del eje) aunque la BD traiga otro valor", () => {
    const trajectory = buildRankingTrajectory([
      row({ rankPosition: 1, snapshotDate: "2024-01-01", isChampion: true }),
    ]);

    expect(trajectory.series[0].points[0]).toEqual({
      date: "2024-01-01",
      position: 0,
      isChampion: true,
    });
    expect(trajectory.minPosition).toBe(0);
  });

  it("devuelve estructura vacía sin filas", () => {
    const trajectory = buildRankingTrajectory([]);

    expect(trajectory.series).toEqual([]);
    expect(trajectory.dates).toEqual([]);
    expect(trajectory.minPosition).toBe(0);
    expect(trajectory.maxPosition).toBe(0);
  });
});

describe("scaleX", () => {
  it("centra el único punto cuando solo hay una fecha", () => {
    expect(scaleX(0, 1, 40, 600)).toBe(340);
  });

  it("reparte las fechas de extremo a extremo del área de dibujo", () => {
    expect(scaleX(0, 3, 40, 600)).toBe(40);
    expect(scaleX(1, 3, 40, 600)).toBe(340);
    expect(scaleX(2, 3, 40, 600)).toBe(640);
  });
});

describe("scaleY", () => {
  it("invierte el eje: la mejor posición (campeón) queda arriba", () => {
    // dominio posiciones 0..10, área vertical 16..300
    expect(scaleY(0, 0, 10, 16, 284)).toBe(16);
    expect(scaleY(10, 0, 10, 16, 284)).toBe(300);
  });

  it("centra cuando todas las posiciones son iguales", () => {
    expect(scaleY(5, 5, 5, 16, 284)).toBe(158);
  });
});
