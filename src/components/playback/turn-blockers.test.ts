import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

// What covers the page is a blocker of the turn manager (useTurnBlocker in
// playback-turn-provider.tsx): while it is open the AUTOMATIC player goes
// (YouTube: nothing in front of the player) and nothing starts on its own;
// what the visitor chose stays. What a blocker does is tested in
// turn-controller.test.ts; this pins WHO is one. The project's vitest runs
// without a DOM, so these are source guards; e2e/lo-que-tapa.spec.ts checks
// the same in a real browser.

function source(path: string): string {
  return readFileSync(fileURLToPath(new URL(path, import.meta.url)), "utf8");
}

describe("turn blockers", () => {
  it("the videos lightbox (video-modal.tsx) blocks the turn for as long as it is mounted, i.e. open", () => {
    const modal = source("../video-modal.tsx");
    expect(modal).toMatch(/import \{ useTurnBlocker \} from "@\/components\/playback\/playback-turn-provider";/);
    expect(modal).toMatch(/useTurnBlocker\("video-modal", true\);/);
    // It is only mounted while open: the facade renders it on `playing`.
    expect(source("../youtube-facade.tsx")).toMatch(/\{playing && lightbox && \(\s*<VideoModal/);
  });

  it("the mobile menu blocks the turn while it is open", () => {
    expect(source("../site-header.tsx")).toMatch(/useTurnBlocker\("menu", open\);/);
  });

  // A menu left open after navigating kept every player blocked: /en-vivo
  // opened (from the EN VIVO chip) with the broadcast's ▶ dead.
  it("the mobile menu closes on every navigation: a new route, the logo and the EN VIVO chip", () => {
    const header = source("../site-header.tsx");
    // A new route closes it (state adjusted while rendering, no effect).
    expect(header).toMatch(
      /if \(menuPathname !== pathname\) \{\s*setMenuPathname\(pathname\);\s*setOpen\(false\);\s*\}/,
    );
    // The logo and the chip close it too (the logo on the home is the same
    // route: no change of path to catch).
    expect(header).toMatch(/<Link\s+href="\/"\s+aria-label="MMA STATUS — inicio"\s+onClick=\{closeMenu\}/);
    expect(header).toMatch(/<LiveNavChip onNavigate=\{closeMenu\} \/>/);
    const chip = source("../live/live-nav-chip.tsx");
    expect(chip).toMatch(/<Link\s+href="\/en-vivo"\s+onClick=\{onNavigate\}/);
  });
});
