import { describe, expect, it } from "vitest";

import {
  buildFightRadar,
  clampValue,
  radarAxisPoint,
  radarPoint,
  radarPolygonPoints,
  SKILL_AXES,
  type SkillAxes,
  type SkillRadarEntry,
} from "./skill-radar";

const AXES: SkillAxes = {
  striking: 80,
  grappling: 60,
  defense: 40,
  experience: 90,
  cardio: 50,
};

describe("radarPoint", () => {
  it("el eje 0 al 100% apunta hacia arriba", () => {
    const { x, y } = radarPoint(0, 5, 100, 200, 150, 100);
    expect(x).toBeCloseTo(200, 6);
    expect(y).toBeCloseTo(50, 6);
  });

  it("valor 0 queda en el centro sea cual sea el eje", () => {
    for (let i = 0; i < 5; i++) {
      const { x, y } = radarPoint(i, 5, 0, 200, 150, 100);
      expect(x).toBeCloseTo(200, 6);
      expect(y).toBeCloseTo(150, 6);
    }
  });

  it("valor 50 queda a mitad de radio", () => {
    const full = radarPoint(2, 5, 100, 0, 0, 100);
    const half = radarPoint(2, 5, 50, 0, 0, 100);
    expect(half.x).toBeCloseTo(full.x / 2, 6);
    expect(half.y).toBeCloseTo(full.y / 2, 6);
  });
});

describe("radarAxisPoint", () => {
  it("acepta radios ABSOLUTOS mayores que el radio del pentágono (sin clamp)", () => {
    // Regresión: las etiquetas de eje viven al 118% del radio; radarPoint las
    // acotaba a 100% y caían sobre los vértices.
    const label = radarAxisPoint(0, 5, 200, 150, 118);
    expect(label.x).toBeCloseTo(200, 6);
    expect(label.y).toBeCloseTo(32, 6);
  });

  it("coincide con radarPoint al 100% del radio", () => {
    const a = radarAxisPoint(2, 5, 200, 150, 100);
    const b = radarPoint(2, 5, 100, 200, 150, 100);
    expect(a.x).toBeCloseTo(b.x, 6);
    expect(a.y).toBeCloseTo(b.y, 6);
  });
});

describe("radarPolygonPoints", () => {
  it("genera un par x,y por eje", () => {
    const points = radarPolygonPoints([100, 100, 100, 100, 100], 0, 0, 100);
    expect(points.split(" ")).toHaveLength(5);
    expect(points.split(" ")[0]).toBe("0,-100");
  });
});

describe("clampValue", () => {
  it("acota fuera de rango y NaN", () => {
    expect(clampValue(-5)).toBe(0);
    expect(clampValue(140)).toBe(100);
    expect(clampValue(Number.NaN)).toBe(0);
    expect(clampValue(63)).toBe(63);
  });
});

describe("SKILL_AXES", () => {
  it("mantiene el orden de la maqueta aprobada", () => {
    expect(SKILL_AXES.map((axis) => axis.key)).toEqual([
      "striking",
      "grappling",
      "defense",
      "experience",
      "cardio",
    ]);
  });
});

describe("buildFightRadar", () => {
  const entries: SkillRadarEntry[] = [
    { fighterId: 1, division: "lightweight", axes: AXES },
    { fighterId: 2, division: "lightweight", axes: { ...AXES, striking: 70 } },
  ];

  it("resuelve ambos lados y la etiqueta de división", () => {
    const radar = buildFightRadar(entries, 1, 2);
    expect(radar.red).toEqual(AXES);
    expect(radar.blue?.striking).toBe(70);
    expect(radar.divisionLabel).toBe("Peso ligero");
  });

  it("lado sin entrada o TBD queda a null", () => {
    const radar = buildFightRadar(entries, 1, null);
    expect(radar.red).toEqual(AXES);
    expect(radar.blue).toBeNull();
    expect(radar.divisionLabel).toBe("Peso ligero");
  });

  it("sin ninguna entrada no hay etiqueta", () => {
    const radar = buildFightRadar(entries, 99, null);
    expect(radar.red).toBeNull();
    expect(radar.blue).toBeNull();
    expect(radar.divisionLabel).toBeNull();
  });

  it("divisiones distintas entre esquinas -> etiqueta null (cada uno puntúa contra la suya)", () => {
    const mixed: SkillRadarEntry[] = [
      { fighterId: 1, division: "lightweight", axes: AXES },
      { fighterId: 2, division: "welterweight", axes: AXES },
    ];
    const radar = buildFightRadar(mixed, 1, 2);
    expect(radar.red).not.toBeNull();
    expect(radar.blue).not.toBeNull();
    expect(radar.divisionLabel).toBeNull();
  });

  it("división desconocida no rompe (etiqueta null)", () => {
    const radar = buildFightRadar(
      [{ fighterId: 3, division: "superweight", axes: AXES }],
      3,
      null,
    );
    expect(radar.red).toEqual(AXES);
    expect(radar.divisionLabel).toBeNull();
  });
});
