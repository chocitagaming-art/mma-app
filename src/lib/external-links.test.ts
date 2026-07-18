import { describe, expect, it } from "vitest";

import { fighterExternalLinks } from "@/lib/external-links";

describe("fighterExternalLinks", () => {
  it("returns no external links (owner removed ESPN link, 18-jul)", () => {
    expect(fighterExternalLinks({ source: "espn", sourceId: "3155424" })).toEqual([]);
  });

  it("returns no links for sources without a public URL (manual)", () => {
    expect(fighterExternalLinks({ source: "manual", sourceId: "123" })).toEqual([]);
  });

  it("returns no links when source or sourceId are missing", () => {
    expect(fighterExternalLinks({ source: null, sourceId: "123" })).toEqual([]);
    expect(fighterExternalLinks({ source: "ufcstats", sourceId: null })).toEqual([]);
    expect(fighterExternalLinks({ source: "espn", sourceId: "" })).toEqual([]);
    expect(fighterExternalLinks({})).toEqual([]);
  });
});
