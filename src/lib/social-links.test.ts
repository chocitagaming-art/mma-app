import { describe, expect, it } from "vitest";

import {
  INSTAGRAM_URL_PATTERN,
  X_URL_PATTERN,
  buildFighterSocialLinks,
  safeInstagramUrl,
  safeXUrl,
  socialSameAs,
} from "@/lib/social-links";

// The shapes mma-ingesta writes (migration 032 CHECKs). Taken from the 20
// ufc.com athlete pages measured on 18-oct-2026, already normalised.
const VOLKANOVSKI = {
  instagramUrl: "https://www.instagram.com/alexvolkanovski/",
  xUrl: "https://x.com/alexvolkanovski",
};

describe("the patterns are the database CHECKs, character for character", () => {
  it("Instagram: www, lower case, 1-30 of [a-z0-9._], trailing slash", () => {
    expect(INSTAGRAM_URL_PATTERN.source).toBe(
      "^https:\\/\\/www\\.instagram\\.com\\/[a-z0-9._]{1,30}\\/$",
    );
  });

  it("X: x.com, 1-15 of [A-Za-z0-9_], no trailing slash", () => {
    expect(X_URL_PATTERN.source).toBe("^https:\\/\\/x\\.com\\/[A-Za-z0-9_]{1,15}$");
  });
});

describe("safeInstagramUrl", () => {
  it("accepts the stored shape", () => {
    expect(safeInstagramUrl(VOLKANOVSKI.instagramUrl)).toBe(VOLKANOVSKI.instagramUrl);
    expect(safeInstagramUrl("https://www.instagram.com/the.notorious_mma/")).toBe(
      "https://www.instagram.com/the.notorious_mma/",
    );
  });

  it("rejects what the ingest should have normalised (not fixed here)", () => {
    for (const value of [
      "https://www.instagram.com/TheNotoriousMMA/", // upper case
      "https://instagram.com/alexvolkanovski/", // no www
      "http://www.instagram.com/alexvolkanovski/", // http
      "https://www.instagram.com/alexvolkanovski", // no trailing slash
      "https://www.instagram.com/alexvolkanovski/?hl=es", // query string
      "https://www.instagram.com/@alexvolkanovski/", // the @
      " https://www.instagram.com/alexvolkanovski/", // spaces
      `https://www.instagram.com/${"a".repeat(31)}/`, // 31 characters
      "https://www.instagram.com/p/ABC123/", // a post, not a profile
      "https://www.instagram.com.evil.com/alexvolkanovski/",
      "javascript:alert(1)//https://www.instagram.com/a/",
      "",
    ]) {
      expect(safeInstagramUrl(value), value).toBeNull();
    }
  });

  it("rejects the UFC's own accounts: the footer trap of a page-wide scrape", () => {
    expect(safeInstagramUrl("https://www.instagram.com/ufc/")).toBeNull();
    expect(safeInstagramUrl("https://www.instagram.com/ufcespanol/")).toBeNull();
  });

  it("anything that is not a string is null (a missing column is undefined)", () => {
    for (const value of [undefined, null, 42, {}, ["https://www.instagram.com/a/"]]) {
      expect(safeInstagramUrl(value)).toBeNull();
    }
  });
});

describe("safeXUrl", () => {
  it("accepts the stored shape, mixed case included", () => {
    expect(safeXUrl(VOLKANOVSKI.xUrl)).toBe(VOLKANOVSKI.xUrl);
    expect(safeXUrl("https://x.com/TheNotoriousMMA")).toBe("https://x.com/TheNotoriousMMA");
  });

  it("rejects twitter.com, slashes, queries, @ and long handles", () => {
    for (const value of [
      "https://twitter.com/alexvolkanovski",
      "https://www.x.com/alexvolkanovski",
      "https://x.com/alexvolkanovski/",
      "https://x.com/alexvolkanovski?ref=br_rs",
      "https://x.com/@navajostirling",
      "https://x.com/a.b",
      `https://x.com/${"a".repeat(16)}`,
      "https://x.com/",
    ]) {
      expect(safeXUrl(value), value).toBeNull();
    }
  });

  it("rejects the UFC's own account, whatever the case", () => {
    expect(safeXUrl("https://x.com/ufc")).toBeNull();
    expect(safeXUrl("https://x.com/UFC")).toBeNull();
    expect(safeXUrl("https://x.com/UFCEspanol")).toBeNull();
  });
});

describe("buildFighterSocialLinks", () => {
  it("Instagram first, then X, with «<red> de <nombre> (se abre en otra pestaña)» as the accessible name", () => {
    expect(buildFighterSocialLinks(VOLKANOVSKI, "Alexander Volkanovski")).toEqual([
      {
        network: "instagram",
        url: VOLKANOVSKI.instagramUrl,
        label: "Instagram de Alexander Volkanovski (se abre en otra pestaña)",
        handle: "@alexvolkanovski",
      },
      {
        network: "x",
        url: VOLKANOVSKI.xUrl,
        label: "X de Alexander Volkanovski (se abre en otra pestaña)",
        handle: "@alexvolkanovski",
      },
    ]);
  });

  it("only the valid one when the other is missing or malformed", () => {
    const links = buildFighterSocialLinks(
      { instagramUrl: null, xUrl: "https://x.com/navajostirling" },
      "Navajo Stirling",
    );
    expect(links.map((link) => link.network)).toEqual(["x"]);

    const soloInstagram = buildFighterSocialLinks(
      { instagramUrl: VOLKANOVSKI.instagramUrl, xUrl: "https://twitter.com/x" },
      "Alexander Volkanovski",
    );
    expect(soloInstagram.map((link) => link.network)).toEqual(["instagram"]);
  });

  it("nothing at all before migration 032: the keys do not exist", () => {
    expect(buildFighterSocialLinks({}, "Debutante")).toEqual([]);
    expect(buildFighterSocialLinks({ instagramUrl: null, xUrl: null }, "Debutante")).toEqual([]);
  });
});

describe("socialSameAs", () => {
  it("the valid profiles, Instagram first", () => {
    expect(socialSameAs(VOLKANOVSKI)).toEqual([VOLKANOVSKI.instagramUrl, VOLKANOVSKI.xUrl]);
  });

  it("drops what would not be drawn either", () => {
    expect(
      socialSameAs({ instagramUrl: "https://www.instagram.com/ufc/", xUrl: undefined }),
    ).toEqual([]);
  });
});
