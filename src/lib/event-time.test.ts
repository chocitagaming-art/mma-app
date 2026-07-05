import { describe, expect, it } from "vitest";

import { parseEventTimestamp } from "@/lib/event-time";

describe("parseEventTimestamp", () => {
  it("parses the Postgres timestamptz text format (offset without minutes)", () => {
    const date = parseEventTimestamp("2026-08-16 01:00:00+00");
    expect(date).not.toBeNull();
    expect(date?.toISOString()).toBe("2026-08-16T01:00:00.000Z");
  });

  it("parses a negative offset without minutes", () => {
    const date = parseEventTimestamp("2026-08-15 21:00:00-04");
    expect(date?.toISOString()).toBe("2026-08-16T01:00:00.000Z");
  });

  it("parses an offset that already has minutes", () => {
    const date = parseEventTimestamp("2026-08-16 06:30:00+05:30");
    expect(date?.toISOString()).toBe("2026-08-16T01:00:00.000Z");
  });

  it("parses strict ISO 8601 input unchanged", () => {
    const date = parseEventTimestamp("2026-08-16T01:00:00Z");
    expect(date?.toISOString()).toBe("2026-08-16T01:00:00.000Z");
  });

  it("returns null for null or empty input", () => {
    expect(parseEventTimestamp(null)).toBeNull();
    expect(parseEventTimestamp("")).toBeNull();
    expect(parseEventTimestamp("   ")).toBeNull();
  });

  it("returns null for garbage input", () => {
    expect(parseEventTimestamp("por confirmar")).toBeNull();
  });
});
