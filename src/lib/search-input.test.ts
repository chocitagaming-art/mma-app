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
});
