import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { FighterSocialLinks } from "@/components/fighter/fighter-social-links";
import { buildFighterSocialLinks } from "@/lib/social-links";

// The markup of the fighter page's social row, rendered in node. The real
// pages, with the database's data, are pinned by e2e/ficha-redes.spec.ts.

function render(urls: { instagramUrl?: string | null; xUrl?: string | null }, name: string) {
  return renderToStaticMarkup(
    createElement(FighterSocialLinks, { name, links: buildFighterSocialLinks(urls, name) }),
  );
}

describe("FighterSocialLinks", () => {
  const html = render(
    {
      instagramUrl: "https://www.instagram.com/alexvolkanovski/",
      xUrl: "https://x.com/alexvolkanovski",
    },
    "Alexander Volkanovski",
  );

  it("one labelled list with the two profiles, Instagram first", () => {
    // role="list": without it WebKit/VoiceOver drops the list (and its label)
    // once preflight removes the bullets.
    expect(html).toMatch(/^<ul role="list" aria-label="Redes sociales de Alexander Volkanovski"/);
    const hrefs = [...html.matchAll(/href="([^"]+)"/g)].map((match) => match[1]);
    expect(hrefs).toEqual([
      "https://www.instagram.com/alexvolkanovski/",
      "https://x.com/alexvolkanovski",
    ]);
  });

  it("each link opens outside, without opener or referrer, and is named", () => {
    const anchors = html.match(/<a [^>]+>/g) ?? [];
    expect(anchors).toHaveLength(2);
    for (const anchor of anchors) {
      expect(anchor).toContain('target="_blank"');
      expect(anchor).toContain('rel="noopener noreferrer"');
      // 44×44 px hit area and the project's keyboard focus ring.
      expect(anchor).toContain("size-11");
      expect(anchor).toContain("focus-visible:outline-2");
    }
    expect(anchors[0]).toContain('aria-label="Instagram de Alexander Volkanovski (se abre en otra pestaña)"');
    expect(anchors[1]).toContain('aria-label="X de Alexander Volkanovski (se abre en otra pestaña)"');
  });

  it("the icons are decoration: hidden from assistive tech, no text of their own", () => {
    const svgs = html.match(/<svg [^>]+>/g) ?? [];
    expect(svgs).toHaveLength(2);
    for (const svg of svgs) expect(svg).toContain('aria-hidden="true"');
    // Nothing embedded: no iframe, no script, no image from Meta or X.
    expect(html).not.toMatch(/<iframe|<script|<img/);
  });

  it("only X when that is all ufc.com lists", () => {
    const solo = render({ instagramUrl: null, xUrl: "https://x.com/navajostirling" }, "Navajo Stirling");
    expect(solo).toContain('aria-label="X de Navajo Stirling (se abre en otra pestaña)"');
    expect(solo).not.toContain("instagram.com");
  });

  it("no profiles (or no columns yet): renders nothing at all", () => {
    expect(render({}, "Debutante")).toBe("");
    expect(render({ instagramUrl: null, xUrl: null }, "Debutante")).toBe("");
    // A footer-trap value is not a profile either.
    expect(render({ instagramUrl: "https://www.instagram.com/ufc/" }, "Debutante")).toBe("");
  });

  it("escapes the name like any other text", () => {
    const tricky = render({ xUrl: "https://x.com/someone" }, 'A "B" <C>');
    expect(tricky).toContain('aria-label="X de A &quot;B&quot; &lt;C&gt; (se abre en otra pestaña)"');
  });
});
