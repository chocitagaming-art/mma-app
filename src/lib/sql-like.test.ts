import { describe, expect, it } from "vitest";

import { containsPattern, escapeLikePattern } from "@/lib/sql-like";

describe("escapeLikePattern", () => {
  it("returns plain text unchanged", () => {
    expect(escapeLikePattern("Sean Strickland")).toBe("Sean Strickland");
  });

  it("escapes percent signs", () => {
    expect(escapeLikePattern("100% Fighter")).toBe("100\\% Fighter");
  });

  it("escapes underscores", () => {
    expect(escapeLikePattern("under_score")).toBe("under\\_score");
  });

  it("escapes backslashes before they can escape anything else", () => {
    expect(escapeLikePattern("a\\b")).toBe("a\\\\b");
  });

  it("escapes every occurrence, not just the first", () => {
    expect(escapeLikePattern("%_%")).toBe("\\%\\_\\%");
  });
});

describe("containsPattern", () => {
  it("wraps the escaped value with wildcards", () => {
    expect(containsPattern("Sean Strickland")).toBe("%Sean Strickland%");
  });

  it("trims surrounding whitespace before wrapping", () => {
    expect(containsPattern("  Jon Jones ")).toBe("%Jon Jones%");
  });

  it("escapes LIKE metacharacters inside the value", () => {
    expect(containsPattern("50%_off\\")).toBe("%50\\%\\_off\\\\%");
  });
});
