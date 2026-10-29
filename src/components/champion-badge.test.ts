import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { ChampionBadge } from "@/components/champion-badge";

// The «Campeón» / «Campeona» label of a current champion's card, rendered in
// node. Where it sits on each card, and that the real champions of the
// database carry it, is pinned by e2e/campeones-oro.spec.ts and
// e2e/portada-p4p.spec.ts.

function texto(props: Parameters<typeof ChampionBadge>[0]) {
  return renderToStaticMarkup(createElement(ChampionBadge, props))
    .replace(/<[^>]+>/g, "")
    .trim();
}

describe("ChampionBadge", () => {
  it("dice «Campeón» por defecto", () => {
    expect(texto({})).toBe("Campeón");
  });

  // Review of 29-oct-2026: Kayla Harrison, Natalia Silva and Mackenzie Dern
  // carried «CAMPEÓN» in big letters over their faces.
  it("dice «Campeona» en la tarjeta de una luchadora", () => {
    expect(texto({ female: true })).toBe("Campeona");
  });

  it("el trofeo es decoración: el lector solo oye la palabra", () => {
    const html = renderToStaticMarkup(createElement(ChampionBadge, { female: true }));
    expect(html).toMatch(/<svg[^>]*aria-hidden="true"/);
  });
});
