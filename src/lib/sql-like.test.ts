import { describe, expect, it } from "vitest";

import {
  containsPattern,
  escapeLikePattern,
  startsWithPattern,
} from "@/lib/sql-like";

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

describe("startsWithPattern", () => {
  it("ancla al principio y deja el resto abierto", () => {
    expect(startsWithPattern("Conor")).toBe("Conor%");
  });

  it("escapa los comodines del usuario", () => {
    // Sin esto, teclear "%" en el buscador convertía el criterio de ORDEN en
    // "casa con todo", y el orden dejaba de significar nada.
    expect(startsWithPattern("%")).toBe("\\%%");
    expect(startsWithPattern("a_b")).toBe("a\\_b%");
  });

  it("recorta los espacios antes de anclar", () => {
    expect(startsWithPattern("  Jon  ")).toBe("Jon%");
  });
});
