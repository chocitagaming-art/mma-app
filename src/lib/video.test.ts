import { describe, expect, it } from "vitest";

import {
  buildFightVideoSearchUrl,
  parseYouTubeId,
  resolveFightVideoUrl,
} from "@/lib/video";

describe("buildFightVideoSearchUrl", () => {
  it("builds a YouTube search URL for the two fighters with 'full fight'", () => {
    const url = buildFightVideoSearchUrl("Islam Makhachev", "Charles Oliveira");
    expect(url).toBe(
      "https://www.youtube.com/results?search_query=" +
        encodeURIComponent("Islam Makhachev vs Charles Oliveira full fight"),
    );
  });

  it("includes the event when provided", () => {
    const url = buildFightVideoSearchUrl("Jon Jones", "Stipe Miocic", "UFC 309");
    expect(url).toContain(
      encodeURIComponent("Jon Jones vs Stipe Miocic UFC 309 full fight"),
    );
  });

  it("omits the event segment when it is empty or undefined", () => {
    const withUndefined = buildFightVideoSearchUrl("A", "B");
    const withEmpty = buildFightVideoSearchUrl("A", "B", "");
    const expected =
      "https://www.youtube.com/results?search_query=" +
      encodeURIComponent("A vs B full fight");
    expect(withUndefined).toBe(expected);
    expect(withEmpty).toBe(expected);
  });

  it("url-encodes special characters so the link is valid", () => {
    const url = buildFightVideoSearchUrl("José Aldo", "Petr Yan");
    expect(url).not.toContain(" ");
    expect(url).toContain("Jos%C3%A9%20Aldo%20vs%20Petr%20Yan");
  });
});

describe("resolveFightVideoUrl", () => {
  it("returns the curated url verbatim when present (trimmed)", () => {
    expect(resolveFightVideoUrl("https://youtu.be/abc", "A", "B", "UFC 1")).toBe(
      "https://youtu.be/abc",
    );
    expect(resolveFightVideoUrl("  https://youtu.be/abc  ", "A", "B")).toBe(
      "https://youtu.be/abc",
    );
  });

  it("falls back to the YouTube search url when curated is null/empty", () => {
    const search = buildFightVideoSearchUrl("A", "B", "UFC 1");
    expect(resolveFightVideoUrl(null, "A", "B", "UFC 1")).toBe(search);
    expect(resolveFightVideoUrl(undefined, "A", "B", "UFC 1")).toBe(search);
    expect(resolveFightVideoUrl("", "A", "B", "UFC 1")).toBe(search);
    expect(resolveFightVideoUrl("   ", "A", "B", "UFC 1")).toBe(search);
  });
});

describe("parseYouTubeId", () => {
  const ID = "dQw4w9WgXcQ";

  it("extracts the id from a standard watch URL", () => {
    expect(parseYouTubeId(`https://www.youtube.com/watch?v=${ID}`)).toBe(ID);
  });

  it("extracts the id from a watch URL with extra params (any order)", () => {
    expect(parseYouTubeId(`https://www.youtube.com/watch?v=${ID}&t=42s`)).toBe(
      ID,
    );
    expect(
      parseYouTubeId(`https://www.youtube.com/watch?app=desktop&v=${ID}&t=5`),
    ).toBe(ID);
  });

  it("extracts the id from a youtu.be short link with a timestamp", () => {
    expect(parseYouTubeId(`https://youtu.be/${ID}`)).toBe(ID);
    expect(parseYouTubeId(`https://youtu.be/${ID}?t=30`)).toBe(ID);
  });

  it("extracts the id from /embed/ and youtube-nocookie embed URLs", () => {
    expect(parseYouTubeId(`https://www.youtube.com/embed/${ID}`)).toBe(ID);
    expect(
      parseYouTubeId(`https://www.youtube-nocookie.com/embed/${ID}?autoplay=1`),
    ).toBe(ID);
  });

  it("extracts the id from a /shorts/ URL", () => {
    expect(parseYouTubeId(`https://www.youtube.com/shorts/${ID}`)).toBe(ID);
  });

  it("tolerates leading/trailing whitespace", () => {
    expect(parseYouTubeId(`  https://youtu.be/${ID}  `)).toBe(ID);
  });

  it("returns null for null, undefined, empty and non-YouTube URLs", () => {
    expect(parseYouTubeId(null)).toBeNull();
    expect(parseYouTubeId(undefined)).toBeNull();
    expect(parseYouTubeId("")).toBeNull();
    expect(parseYouTubeId("   ")).toBeNull();
    expect(parseYouTubeId("https://vimeo.com/123456789")).toBeNull();
    expect(parseYouTubeId("not a url")).toBeNull();
  });

  it("returns null when the id is not a valid 11-char token", () => {
    expect(parseYouTubeId("https://youtu.be/abc")).toBeNull();
    expect(parseYouTubeId("https://www.youtube.com/watch?v=short")).toBeNull();
  });
});
