import { describe, expect, it } from "vitest";

import {
  MAX_FAVORITES,
  isFavorite,
  parseFavorites,
  serializeFavorites,
  toggleFavorite,
  type FavoriteFighter,
} from "./favorites";

const jones: FavoriteFighter = {
  id: 1,
  name: "Jon Jones",
  headshotUrl: "https://example.com/jones.png",
  addedAt: 100,
};

describe("parseFavorites", () => {
  it("devuelve [] con null, vacío o JSON inválido", () => {
    expect(parseFavorites(null)).toEqual([]);
    expect(parseFavorites("")).toEqual([]);
    expect(parseFavorites("{no es json")).toEqual([]);
  });

  it("devuelve [] cuando el JSON no es un array", () => {
    expect(parseFavorites('{"id":1}')).toEqual([]);
  });

  it("acepta entradas válidas y descarta las corruptas", () => {
    const raw = JSON.stringify([
      jones,
      { id: "2", name: "Malo" }, // id no numérico
      { id: 3, name: "", headshotUrl: null, addedAt: 1 }, // nombre vacío
      { id: 4, name: "Sin foto", headshotUrl: null, addedAt: 2 },
      "basura",
    ]);
    expect(parseFavorites(raw)).toEqual([
      jones,
      { id: 4, name: "Sin foto", headshotUrl: null, addedAt: 2 },
    ]);
  });

  it("descarta headshotUrl que no sea https/ruta relativa o sea desmesurado", () => {
    const raw = JSON.stringify([
      { id: 1, name: "Beacon", headshotUrl: "http://atacante.example/p.gif", addedAt: 1 },
      { id: 2, name: "JS", headshotUrl: "javascript:alert(1)", addedAt: 2 },
      { id: 3, name: "Larguísima", headshotUrl: `https://x.example/${"a".repeat(700)}`, addedAt: 3 },
      { id: 4, name: "Válida", headshotUrl: "https://ufc.com/foto.png", addedAt: 4 },
      { id: 5, name: "Relativa", headshotUrl: "/fighters/silueta.png", addedAt: 5 },
    ]);
    expect(parseFavorites(raw).map((entry) => entry.id)).toEqual([4, 5]);
  });

  it("deduplica por id conservando la primera entrada", () => {
    const raw = JSON.stringify([jones, { ...jones, name: "Duplicado" }]);
    expect(parseFavorites(raw)).toEqual([jones]);
  });

  it("recorta al máximo permitido", () => {
    const many = Array.from({ length: MAX_FAVORITES + 5 }, (_, i) => ({
      id: i + 1,
      name: `Peleador ${i + 1}`,
      headshotUrl: null,
      addedAt: i,
    }));
    expect(parseFavorites(JSON.stringify(many))).toHaveLength(MAX_FAVORITES);
  });
});

describe("toggleFavorite", () => {
  it("añade cuando no está y quita cuando está", () => {
    const added = toggleFavorite([], jones, 100);
    expect(added).toEqual([jones]);
    expect(isFavorite(added, jones.id)).toBe(true);

    const removed = toggleFavorite(added, jones);
    expect(removed).toEqual([]);
    expect(isFavorite(removed, jones.id)).toBe(false);
  });

  it("no muta la lista original", () => {
    const original: FavoriteFighter[] = [jones];
    toggleFavorite(original, { id: 2, name: "Otra", headshotUrl: null });
    expect(original).toEqual([jones]);
  });

  it("con la lista llena descarta el favorito más antiguo", () => {
    const full = Array.from({ length: MAX_FAVORITES }, (_, i) => ({
      id: i + 1,
      name: `Peleador ${i + 1}`,
      headshotUrl: null,
      addedAt: i,
    }));
    const next = toggleFavorite(full, { id: 999, name: "Nuevo", headshotUrl: null }, 999);
    expect(next).toHaveLength(MAX_FAVORITES);
    expect(isFavorite(next, 1)).toBe(false); // el más antiguo cae
    expect(isFavorite(next, 999)).toBe(true);
  });
});

describe("serializeFavorites", () => {
  it("hace round-trip con parseFavorites", () => {
    const list = [jones];
    expect(parseFavorites(serializeFavorites(list))).toEqual(list);
  });
});
