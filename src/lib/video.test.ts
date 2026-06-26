import { describe, expect, it } from "vitest";

import { buildFightVideoSearchUrl } from "@/lib/video";

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
