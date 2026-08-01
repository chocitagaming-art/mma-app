import { describe, expect, it } from "vitest";

import {
  MAX_SEARCH_QUERY_LENGTH,
  normalizeSearchQuery,
} from "@/lib/search-input";

describe("normalizeSearchQuery", () => {
  it("rejects an empty string", () => {
    expect(normalizeSearchQuery("")).toEqual({ ok: false });
  });

  it("rejects a whitespace-only string", () => {
    expect(normalizeSearchQuery("   ")).toEqual({ ok: false });
  });

  it("rejects null/undefined input", () => {
    expect(normalizeSearchQuery(null)).toEqual({ ok: false });
    expect(normalizeSearchQuery(undefined)).toEqual({ ok: false });
  });

  it("trims surrounding whitespace", () => {
    expect(normalizeSearchQuery("  Jon Jones  ")).toEqual({
      ok: true,
      value: "Jon Jones",
    });
  });

  it("keeps normal characters untouched", () => {
    expect(normalizeSearchQuery("Khabib")).toEqual({
      ok: true,
      value: "Khabib",
    });
  });

  it("truncates an over-long query to the max length", () => {
    const raw = "a".repeat(MAX_SEARCH_QUERY_LENGTH + 50);
    const result = normalizeSearchQuery(raw);

    expect(result.ok).toBe(true);
    expect(result.ok && result.value.length).toBe(MAX_SEARCH_QUERY_LENGTH);
  });

  it("trims before measuring length so padded short queries stay intact", () => {
    const raw = `${" ".repeat(200)}Conor${" ".repeat(200)}`;
    expect(normalizeSearchQuery(raw)).toEqual({ ok: true, value: "Conor" });
  });
  // MINIMO DE 3 CARACTERES. Medido con EXPLAIN ANALYZE contra la BD real: con
  // 1-2 letras el planificador descarta el indice trigram de la migracion 020 y
  // hace Seq Scan sobre las 2.852 filas de `fighters`; a partir de 3 usa
  // Bitmap Index Scan. Y la busqueda global lanza TRES consultas en paralelo
  // contra un pool de 3 conexiones, asi que una rafaga de queries de una letra
  // ocupa el pool entero de esa instancia.
  // Comprobado ademas que no rompe nada real: no hay ni un luchador con nombre
  // de menos de 3 caracteres.
  it("rejects a query shorter than the minimum", () => {
    expect(normalizeSearchQuery("j")).toEqual({ ok: false });
    expect(normalizeSearchQuery("jo")).toEqual({ ok: false });
  });

  it("accepts a query exactly at the minimum", () => {
    expect(normalizeSearchQuery("jon")).toEqual({ ok: true, value: "jon" });
  });

  it("measures the minimum AFTER trimming", () => {
    expect(normalizeSearchQuery("  jo  ")).toEqual({ ok: false });
  });

  it("counts characters, not bytes: accented names are not penalised", () => {
    // "Chú" son 3 caracteres aunque en UTF-8 ocupe 4 bytes.
    expect(normalizeSearchQuery("Chú")).toEqual({ ok: true, value: "Chú" });
  });
});
