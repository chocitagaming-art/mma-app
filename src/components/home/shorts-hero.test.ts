import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { createElement, type ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { UFC_SHORTS_CHANNEL_URL } from "@/components/home/shorts-attribution";
import { ShortsHero, ShortsHeroPlaceholder, type HeroShort } from "@/components/home/shorts-hero";
import { PlaybackTurnProvider } from "@/components/playback/playback-turn-provider";

// The home hero's server render (no DOM: effects do not run on the server),
// plus a guard on its source. The browser behaviour (it never starts on its
// own, a tap plays the short, «Siguiente ›», the end of a short, a touched
// short) is the turn manager's, tested in turn-controller.test.ts and
// playback-turn.test.ts, and in a real browser in e2e/hero-shorts.spec.ts;
// the geometry is in e2e/maquetacion.spec.ts.

const SHORTS: HeroShort[] = [
  { id: "fixShort-01", title: "The finish #ufc332", seconds: 15, thumbnail: "https://i.ytimg.com/vi/fixShort-01/hqdefault.jpg" },
  { id: "fixShort-02", title: "Career so far #ufc332", seconds: 58, thumbnail: "https://i.ytimg.com/vi/fixShort-02/hqdefault.jpg" },
];

function render(node: ReactElement) {
  return renderToStaticMarkup(createElement(PlaybackTurnProvider, null, node));
}

describe("ShortsHero · server render", () => {
  const html = render(createElement(ShortsHero, { shorts: SHORTS }));

  it("no iframe reaches the HTML: only a tap mounts one, in the browser", () => {
    expect(html).not.toContain("<iframe");
    expect(html).toContain('data-turn="hero"');
    expect(html).toContain('data-turn-state="poster"');
  });

  it("the poster is the most recent short's own thumbnail, whole, with its ▶ label", () => {
    expect(html).toContain('src="https://i.ytimg.com/vi/fixShort-01/hqdefault.jpg"');
    expect(html).toContain("object-contain");
    expect(html).toContain("Toca para ver");
    expect(html).toContain('aria-label="Toca para ver. Short de la UFC: The finish #ufc332"');
  });

  it("without JavaScript the poster is a real link to that short on YouTube, in a new tab", () => {
    // What the visitor gets while the page's JavaScript is off, blocked or not
    // there yet: the ▶ opens the short on YouTube. With it, the click plays it
    // here (poster-link.tsx) and only then is it announced as a button.
    const poster = /<div[^>]*\bdata-turn="hero"[^>]*>(<[a-z]+\b[^>]*>)/.exec(html)?.[1] ?? "";
    expect(poster).toMatch(/^<a\s/);
    expect(poster).toContain('href="https://www.youtube.com/shorts/fixShort-01"');
    expect(poster).toContain('target="_blank"');
    expect(poster).toContain('rel="noopener noreferrer"');
    expect(poster).toContain('aria-label="Toca para ver. Short de la UFC: The finish #ufc332"');
    expect(poster).not.toContain("role=");
  });

  it("«Siguiente ›» is a real button, outside the frame, and there is no «Pausar»: nothing moves on its own", () => {
    expect(html).toMatch(/<button type="button" aria-label="Siguiente short"[^>]*>Siguiente /);
    expect(html).not.toMatch(/Pausar|Seguir/);
    // Outside the measured box: the frame's markup closes before it.
    const frame = html.indexOf('data-testid="hero-short"');
    expect(frame).toBeGreaterThan(-1);
    expect(html.indexOf("Siguiente short")).toBeGreaterThan(
      html.indexOf("</div>", html.indexOf('data-turn="hero"')),
    );
  });

  it("before React runs «Siguiente ›» is not shown: no dead button without JavaScript", () => {
    // visibility: hidden keeps its room (the search box below does not jump
    // at hydration) and takes it out of the tab order and of screen readers.
    const row = /<div class="([^"]*)"><button type="button" aria-label="Siguiente short"/.exec(html)?.[1];
    expect(row, "the row of «Siguiente ›» is not where the test looks").toBeDefined();
    expect(row?.split(/\s+/)).toContain("invisible");
  });

  it("the entrance animation is on the frame until a short is mounted in it", () => {
    const frame = /<div class="([^"]*)"><div aria-hidden="true" class="absolute left-1\/2/.exec(html)?.[1];
    expect(frame?.split(/\s+/)).toContain("animate-rise");
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
    // mute=1, measured on 30-sep-2026: without it a strict autoplay policy
    // leaves the short the visitor tapped black and stopped (a second tap).
    expect(code).toContain("src={shortEmbedUrl(playing.id, { mute: true })}");
    expect(code).not.toContain("youtube");
    // The one <iframe> is TurnSlot's: the turn manager mounts and unmounts it.
    expect(code).not.toMatch(/<iframe[\s>]/);
    expect(code).toContain("<TurnSlot");
  });

  it("the hero short never starts on its own: its TurnSlot does not ask for autoStart", () => {
    // The owner's decision of 30-sep-2026 (night). TurnSlot's autoStart is
    // false unless a player asks for it; only LiveEmbedPlayer does.
    expect(code).not.toMatch(/autoStart/);
  });

  it("nothing waits for the page before a tap: no readiness, no fonts, no intro timer", () => {
    // The ▶ during the hero's entrance used to do nothing ("not-ready").
    expect(code).not.toMatch(/\bready\b|document\.fonts|setTimeout\(resolve/);
    expect(code).toMatch(/rising=\{view\.mountCount === 0\}/);
  });

  it("«Siguiente ›» plays the short after the one on screen, and no pause is left", () => {
    expect(code).toMatch(/startFromControl\(carousel\.nextIndex\(view\.mounted\)\)/);
    expect(code).not.toMatch(/pause|Pausar|Seguir|resumeIndex|posterIndex/);
  });
});
