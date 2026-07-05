import { describe, expect, it } from "vitest";

import { eventExternalLink, fighterExternalLinks } from "@/lib/external-links";

describe("fighterExternalLinks", () => {
  it("builds the UFCStats link from the stored path", () => {
    expect(
      fighterExternalLinks({
        source: "ufcstats",
        sourceId: "/fighter-details/f1fac969a1d70acc",
      }),
    ).toEqual([
      {
        label: "UFCStats",
        url: "http://ufcstats.com/fighter-details/f1fac969a1d70acc",
      },
    ]);
  });

  it("adds the leading slash when the stored path lacks it", () => {
    expect(
      fighterExternalLinks({
        source: "ufcstats",
        sourceId: "fighter-details/f1fac969a1d70acc",
      }),
    ).toEqual([
      {
        label: "UFCStats",
        url: "http://ufcstats.com/fighter-details/f1fac969a1d70acc",
      },
    ]);
  });

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

describe("eventExternalLink", () => {
  it("builds the ufc.com event URL from the slug", () => {
    expect(
      eventExternalLink({ source: "ufc.com", sourceId: "ufc-319" }),
    ).toBe("https://www.ufc.com/event/ufc-319");
  });

  it("returns null for other sources", () => {
    expect(eventExternalLink({ source: "ufcstats", sourceId: "ufc-319" })).toBeNull();
    expect(eventExternalLink({ source: "manual", sourceId: "ufc-319" })).toBeNull();
  });

  it("returns null when source or slug are missing", () => {
    expect(eventExternalLink({ source: null, sourceId: "ufc-319" })).toBeNull();
    expect(eventExternalLink({ source: "ufc.com", sourceId: null })).toBeNull();
    expect(eventExternalLink({ source: "ufc.com", sourceId: "" })).toBeNull();
    expect(eventExternalLink({})).toBeNull();
  });
});
