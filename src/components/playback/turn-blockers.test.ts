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
    expect(modal).toMatch(/const VIDEO_MODAL_BLOCKER = "video-modal";/);
    expect(modal).toMatch(/useTurnBlocker\(VIDEO_MODAL_BLOCKER, true\);/);
    // It is only mounted while open: the facade renders it on `playing`.
    expect(source("../youtube-facade.tsx")).toMatch(/\{playing && lightbox && \(\s*<VideoModal/);
  });

  // R10 (18-oct-2026): its player is a TurnSlot (through ClickToPlay), started
  // on mount as the visitor's, and exempt from the modal's own blocker. No
  // iframe of its own any more: that one played outside the turn, and the
  // visitor's UFC TV went on playing behind it.
  it("and its player is in the turn: a ClickToPlay started on mount, with the modal's blocker as its own", () => {
    const modal = source("../video-modal.tsx");
    expect(modal).toMatch(/<ClickToPlay[\s\S]*?\bstartOnMount\b[\s\S]*?ownBlocker=\{VIDEO_MODAL_BLOCKER\}[\s\S]*?\/>/);
    expect(modal).not.toMatch(/<iframe/);
    const clip = source("./click-to-play.tsx");
    expect(clip).toMatch(/if \(startOnMount\) userStart\(\);/);
    expect(clip).toMatch(/ownBlocker=\{ownBlocker\}/);
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
