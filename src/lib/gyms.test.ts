import { describe, expect, it } from "vitest";

import {
  formatDistance,
  gymDescription,
  haversineKm,
  parseSportTokens,
  sportLabels,
} from "@/lib/gyms";

describe("parseSportTokens", () => {
  it("separa por ; y normaliza espacios y mayúsculas", () => {
    expect(parseSportTokens("Boxing; muay_thai ;MMA")).toEqual(["boxing", "muay_thai", "mma"]);
  });

  it("separa también por espacios y comas (datos OSM reales)", () => {
    expect(parseSportTokens("fitness boxing")).toEqual(["fitness", "boxing"]);
    expect(parseSportTokens("judo, karate")).toEqual(["judo", "karate"]);
  });

  it("devuelve vacío sin tag", () => {
    expect(parseSportTokens(undefined)).toEqual([]);
  });
});

describe("sportLabels", () => {
  it("traduce tokens conocidos y omite desconocidos", () => {
    expect(sportLabels("boxing;muay_thai;yoga")).toEqual(["Boxeo", "Muay Thai"]);
  });

  it("deduplica etiquetas (sinónimos mapean a la misma)", () => {
    expect(sportLabels("boxing;boxing")).toEqual(["Boxeo"]);
    expect(sportLabels("boxing;boxeo")).toEqual(["Boxeo"]);
    expect(sportLabels("mma;mixed_martial_arts;artes_marciales_mixtas")).toEqual(["MMA"]);
    expect(sportLabels("jiu-jitsu;bjj;brazilian_jiu_jitsu")).toEqual(["BJJ"]);
  });

  it("traduce tokens en español y k1", () => {
    expect(sportLabels("boxeo;k1;defensa_personal")).toEqual([
      "Boxeo",
      "K-1",
      "Defensa personal",
    ]);
  });
});

describe("gymDescription", () => {
  it("compone la frase por plantilla con ciudad", () => {
    expect(gymDescription(["Boxeo", "Muay Thai"], "Madrid")).toBe(
      "Gimnasio de boxeo y muay thai en Madrid.",
    );
  });

  it("mantiene acrónimos en mayúsculas (MMA, BJJ, K-1)", () => {
    expect(gymDescription(["MMA", "BJJ", "K-1"], "Barcelona")).toBe(
      "Gimnasio de MMA, BJJ y K-1 en Barcelona.",
    );
  });

  it("una sola disciplina y sin ciudad", () => {
    expect(gymDescription(["Boxeo"], null)).toBe("Gimnasio de boxeo.");
  });

  it("sin disciplinas devuelve null (no inventa)", () => {
    expect(gymDescription([], "Madrid")).toBeNull();
  });
});

describe("haversineKm / formatDistance", () => {
  it("Madrid Sol → Retiro ≈ 1.6 km", () => {
    const km = haversineKm(40.4168, -3.7038, 40.4153, -3.6845);
    expect(km).toBeGreaterThan(1.4);
    expect(km).toBeLessThan(1.9);
  });

  it("formatea metros por debajo de 1 km", () => {
    expect(formatDistance(0.35)).toBe("a 350 m");
  });

  it("formatea km con coma decimal es-ES", () => {
    expect(formatDistance(2.34)).toBe("a 2,3 km");
  });
});
