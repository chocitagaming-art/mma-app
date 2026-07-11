import { describe, expect, it } from "vitest";

import {
  inferFighterGender,
  isWomensDivision,
  silhouetteBody,
  silhouetteHeadshot,
} from "./fighter-silhouette";

describe("isWomensDivision", () => {
  it("detecta el texto de UFC", () => {
    expect(isWomensDivision("Women's Flyweight")).toBe(true);
    expect(isWomensDivision("Women's Flyweight Title Bout")).toBe(true);
  });

  it("detecta los slugs del backend de rankings", () => {
    expect(isWomensDivision("womens_strawweight")).toBe(true);
    expect(isWomensDivision("womens_pound_for_pound")).toBe(true);
  });

  it("rechaza divisiones masculinas, null y vacío", () => {
    expect(isWomensDivision("Lightweight")).toBe(false);
    expect(isWomensDivision("Flyweight")).toBe(false);
    expect(isWomensDivision(null)).toBe(false);
    expect(isWomensDivision(undefined)).toBe(false);
    expect(isWomensDivision("")).toBe(false);
  });
});

describe("inferFighterGender", () => {
  it("mujer por división (texto o slug)", () => {
    expect(inferFighterGender("Alexa Grasso", "Women's Flyweight")).toBe("female");
    expect(inferFighterGender("Zhang Weili", "womens_strawweight")).toBe("female");
  });

  it("hombre por división masculina", () => {
    expect(inferFighterGender("Islam Makhachev", "Lightweight")).toBe("male");
  });

  it("override curado: luchadoras sin peleas enlazadas en BD", () => {
    expect(inferFighterGender("Estefani Almeida", null)).toBe("female");
    expect(inferFighterGender("  ESTEFANI ALMEIDA  ", undefined)).toBe("female");
  });

  it("sin señal cae a masculina (como ufc.com)", () => {
    expect(inferFighterGender("Desconocido Total", null)).toBe("male");
    expect(inferFighterGender("Desconocido Total")).toBe("male");
  });
});

describe("rutas de silueta", () => {
  it("headshot por género", () => {
    expect(silhouetteHeadshot("male")).toBe("/fighters/silhouette-headshot-male.webp");
    expect(silhouetteHeadshot("female")).toBe(
      "/fighters/silhouette-headshot-female.webp",
    );
  });

  it("cuerpo por género", () => {
    expect(silhouetteBody("male")).toBe("/fighters/silhouette-body-male.webp");
    expect(silhouetteBody("female")).toBe("/fighters/silhouette-body-female.webp");
  });
});
