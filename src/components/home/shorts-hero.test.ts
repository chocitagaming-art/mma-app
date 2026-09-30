import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { createElement, type ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { UFC_SHORTS_CHANNEL_URL } from "@/components/home/shorts-attribution";
import { ShortsHero, ShortsHeroPlaceholder, type HeroShort } from "@/components/home/shorts-hero";
import { PlaybackTurnProvider } from "@/components/playback/playback-turn-provider";

// The home hero's server render (no DOM: effects do not run on the server),
// plus a guard on its source. The browser behaviour (autoplay only in view,
// the timer, «Siguiente ›», a touched short) is the turn manager's, tested in
// turn-controller.test.ts and playback-turn.test.ts, and the geometry is in
// e2e/maquetacion.spec.ts.

const SHORTS: HeroShort[] = [
  { id: "fixShort-01", title: "The finish #ufc332", seconds: 15, thumbnail: "https://i.ytimg.com/vi/fixShort-01/hqdefault.jpg" },
  { id: "fixShort-02", title: "Career so far #ufc332", seconds: 58, thumbnail: "https://i.ytimg.com/vi/fixShort-02/hqdefault.jpg" },
];

function render(node: ReactElement) {
  return renderToStaticMarkup(createElement(PlaybackTurnProvider, null, node));
}

describe("ShortsHero · server render", () => {
  const html = render(createElement(ShortsHero, { shorts: SHORTS }));

  it("no iframe reaches the HTML: only the turn manager mounts one, in the browser", () => {
    expect(html).not.toContain("<iframe");
    expect(html).toContain('data-turn="hero"');
    expect(html).toContain('data-turn-state="poster"');
  });

  it("the poster is the first short's own thumbnail, whole, with its ▶ label", () => {
    expect(html).toContain('src="https://i.ytimg.com/vi/fixShort-01/hqdefault.jpg"');
    expect(html).toContain("object-contain");
    expect(html).toContain("Toca para ver");
    expect(html).toContain('aria-label="Toca para ver. Short de la UFC: The finish #ufc332"');
  });

  it("Pausar and «Siguiente ›» are real buttons, outside the frame", () => {
    expect(html).toMatch(/<button type="button"[^>]*>.*?<span>Pausar<\/span><\/button>/);
    expect(html).toMatch(/<button type="button" aria-label="Siguiente short"[^>]*>Siguiente /);
    // Outside the measured box: the frame's markup closes before them.
    const frame = html.indexOf('data-testid="hero-short"');
    expect(frame).toBeGreaterThan(-1);
    expect(html.indexOf("Pausar")).toBeGreaterThan(html.indexOf("</div>", html.indexOf('data-turn="hero"')));
  });

  it("attributes the UFC channel on YouTube, by name, in a new tab without referrer", () => {
    expect(html).toContain("Shorts del canal oficial de la UFC");
    expect(html).toContain(
      `<a href="${UFC_SHORTS_CHANNEL_URL}" target="_blank" rel="noopener noreferrer"`,
    );
    expect(html).toContain(">YouTube</a>");
  });

  it("nothing over the player: no feather mask and square corners", () => {
    expect(html).not.toContain("mask-feather");
    expect(html).not.toMatch(/data-turn="hero"[^>]*rounded/);
    expect(html).not.toMatch(/class="[^"]*rounded[^"]*"[^>]*data-turn="hero"/);
  });
});

describe("ShortsHero · without a list", () => {
  for (const [name, html] of [
    ["empty list", render(createElement(ShortsHero, { shorts: [] }))],
    ["placeholder", render(createElement(ShortsHeroPlaceholder))],
  ] as const) {
    it(`${name}: our own poster, the same box, and no player nor attribution`, () => {
      expect(html).toContain('data-testid="hero-short"');
      expect(html).toContain("/brand/hero-watermark.webp");
      expect(html).not.toContain("data-turn=");
      expect(html).not.toContain("<iframe");
      expect(html).not.toContain("i.ytimg.com");
      expect(html).not.toContain("<button");
      expect(html).not.toContain("YouTube");
    });
  }
});

describe("shorts-hero.tsx · source guard", () => {
  const source = readFileSync(
    fileURLToPath(new URL("./shorts-hero.tsx", import.meta.url)),
    "utf8",
  );
  // Comments may name what the code must not do.
  const code = source.replace(/\/\/.*$/gm, "").replace(/\{\/\*[\s\S]*?\*\/\}/g, "");

  it("no JS API of YouTube: no postMessage, no iframe_api, no enablejsapi", () => {
    // Developer Policies III.D.7 (DECISIONS.md, 29-sep-2026).
    expect(code).not.toMatch(/postMessage|iframe_api|enablejsapi/);
  });

  it("the iframe URL comes from the tested builder, not written by hand", () => {
    expect(code).toContain("src={shortEmbedUrl(playing.id, { mute: true })}");
    expect(code).not.toContain("youtube");
    // The one <iframe> is TurnSlot's: the turn manager mounts and unmounts it.
    expect(code).not.toMatch(/<iframe[\s>]/);
    expect(code).toContain("<TurnSlot");
  });
});
