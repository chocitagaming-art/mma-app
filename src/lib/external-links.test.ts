import { describe, expect, it } from "vitest";

import { fighterExternalLinks } from "@/lib/external-links";

describe("fighterExternalLinks", () => {
  it("builds the ESPN link from the numeric id", () => {
    expect(fighterExternalLinks({ source: "espn", sourceId: "3155424" })).toEqual([
      {
        label: "ESPN",
        url: "https://www.espn.com/mma/fighter/_/id/3155424",
      },
    ]);
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
