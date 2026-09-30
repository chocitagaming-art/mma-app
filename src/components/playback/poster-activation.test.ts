import { describe, expect, it } from "vitest";

import {
  interceptsClick,
  isKeyboardClick,
  isModifiedClick,
  playerToFocus,
  posterOutcome,
} from "@/components/playback/poster-activation";
import {
  createTurnController,
  type IntersectionEntryLike,
  type ObserverLike,
  type StartResult,
  type TurnEnvironment,
} from "@/components/playback/turn-controller";

// The posters of the players (the hero short, UFC TV, the event's broadcast):
// what a click on them does, in node. The poster is a real link to the video
// on YouTube; with JavaScript a plain click or Enter plays it here instead,
// and a keyboard start sends the focus into the player it mounted (the poster
// is gone: without it the focus fell on <body>). The React wiring
// (poster-link.tsx) and the real browser are in e2e/posters.spec.ts.

const CLICK = { button: 0, ctrlKey: false, metaKey: false, shiftKey: false, altKey: false };

describe("isModifiedClick: what stays the browser's own link action", () => {
  it("a plain click of the main button is the poster's (it plays here)", () => {
    expect(isModifiedClick(CLICK)).toBe(false);
  });

  it("Ctrl, ⌘, Shift or Alt: new tab, new window... on YouTube, as with any link", () => {
    for (const key of ["ctrlKey", "metaKey", "shiftKey", "altKey"] as const) {
      expect(isModifiedClick({ ...CLICK, [key]: true }), key).toBe(true);
    }
  });

  it("a button other than the main one", () => {
    expect(isModifiedClick({ ...CLICK, button: 1 })).toBe(true);
    expect(isModifiedClick({ ...CLICK, button: 2 })).toBe(true);
  });
});

describe("interceptsClick: what the poster takes from its link", () => {
  it("a plain click, Enter or Space on a poster that plays here: it mounts here", () => {
    expect(interceptsClick(CLICK, true)).toBe(true);
  });

  it("Ctrl, ⌘, Shift, Alt or another button: always the link's own action", () => {
    const clicks = [
      { ...CLICK, ctrlKey: true },
      { ...CLICK, metaKey: true },
      { ...CLICK, shiftKey: true },
      { ...CLICK, altKey: true },
      { ...CLICK, button: 1 },
    ];
    for (const click of clicks) {
      expect(interceptsClick(click, true), JSON.stringify(click)).toBe(false);
      expect(interceptsClick(click, false), JSON.stringify(click)).toBe(false);
    }
  });

  // The hero under 200x200 (a screen under 340 px). It used to ask the turn
  // manager anyway, which looks at the menu and at «ready» BEFORE the size:
  // during the intro (up to 1.5 s, or while the headline's font loads) or
  // under the open menu the answer was "not-ready" or "blocked", not
  // "too-small", and the tap did nothing on a poster announced as a link.
  it("a poster that cannot play here is a link all the way: never taken", () => {
    expect(interceptsClick(CLICK, false)).toBe(false);
  });
});

describe("isKeyboardClick", () => {
  it("Enter on the link (and a screen reader's activation) clicks with detail 0", () => {
    expect(isKeyboardClick({ detail: 0 })).toBe(true);
  });

  it("a mouse or a finger clicks with detail 1 or more", () => {
    expect(isKeyboardClick({ detail: 1 })).toBe(false);
    expect(isKeyboardClick({ detail: 2 })).toBe(false);
  });
});

describe("posterOutcome: what the poster does with the turn manager's answer", () => {
  it("started: the player mounts here, and the link does not open YouTube", () => {
    expect(posterOutcome("started")).toBe("play-here");
  });

  it("too-small: no legal player under 200x200, so the link opens YouTube", () => {
    expect(posterOutcome("too-small")).toBe("youtube");
  });

  it("not ready, blocked or unknown: nothing (as before the link)", () => {
    for (const result of ["not-ready", "blocked", "unknown"] as StartResult[]) {
      expect(posterOutcome(result), result).toBe("nothing");
    }
  });
});

type FakeIframe = { name: string };

function slotWith(iframe: FakeIframe | null) {
  return { querySelector: (selectors: "iframe") => (selectors === "iframe" ? iframe : null) };
}

describe("playerToFocus: only into a player the VISITOR holds", () => {
  const iframe: FakeIframe = { name: "player" };

  it("a mounted player the visitor started: its iframe", () => {
    expect(playerToFocus(slotWith(iframe), { mounted: true, owner: "user" })).toBe(iframe);
  });

  it("an automatic mount: never (the focus would make it look touched)", () => {
    expect(playerToFocus(slotWith(iframe), { mounted: true, owner: "auto" })).toBeNull();
  });

  it("back to the poster, or no slot: nothing", () => {
    expect(playerToFocus(slotWith(iframe), { mounted: false, owner: null })).toBeNull();
    expect(playerToFocus(null, { mounted: true, owner: "user" })).toBeNull();
    expect(playerToFocus(slotWith(null), { mounted: true, owner: "user" })).toBeNull();
  });
});

// With the REAL turn manager (turn-controller.ts) and a fake browser: focusing
// an iframe blurs the window and leaves the iframe as document.activeElement,
// which is exactly how the controller recognises a player the visitor touched
// ("touched": the carousel timer then leaves it alone). So the focus may only
// go into what the visitor started, and never into an automatic mount.
describe("playerToFocus with the turn manager's «touched» detection", () => {
  function setup() {
    let clock = 1_000;
    const timers: { at: number; fn: () => void }[] = [];
    const page = { active: null as unknown };
    let io: ((entries: IntersectionEntryLike[]) => void) | null = null;
    const observer: ObserverLike = { observe() {}, unobserve() {}, disconnect() {} };
    const env: TurnEnvironment = {
      now: () => clock,
      setTimeout: (fn, ms) => timers.push({ at: clock + ms, fn }),
      clearTimeout: () => {},
      createIntersectionObserver: (cb) => {
        io = cb;
        return observer;
      },
      createResizeObserver: () => observer,
      isPageVisible: () => true,
      prefersReducedMotion: () => false,
      headerHeight: () => 64,
      activeElement: () => page.active,
    };
    const run = (ms: number) => {
      clock += ms;
      for (const t of timers.splice(0).sort((a, b) => a.at - b.at)) {
        if (t.at <= clock) t.fn();
        else timers.push(t);
      }
    };
    const element = {
      getBoundingClientRect: () => ({ width: 330, height: 587 }),
    } as unknown as Element;
    const controller = createTurnController(env);
    controller.register({ id: "hero", element });
    controller.start();
    const iframe: FakeIframe = { name: "hero iframe" };
    const slot = slotWith(iframe);
    // What the provider does: the React slot hands its iframe over, and the
    // window's blur reaches windowBlurred.
    const focus = (target: FakeIframe | null) => {
      if (!target) return;
      page.active = target;
      controller.windowBlurred();
      run(0);
    };
    const showFully = () => {
      io?.([
        {
          target: element,
          isIntersecting: true,
          intersectionRatio: 1,
          intersectionRect: { width: 330, height: 587 },
        },
      ]);
      run(500);
    };
    return { controller, iframe, slot, focus, showFully };
  }

  it("an automatic mount is left alone: nothing focused, never marked touched", () => {
    const { controller, iframe, slot, focus, showFully } = setup();
    showFully();
    const view = controller.getView("hero");
    expect(view).toMatchObject({ mounted: true, owner: "auto" });
    controller.setIframe("hero", iframe);

    focus(playerToFocus(slot, view));
    expect(controller.getView("hero")).toMatchObject({ owner: "auto", touched: false });
  });

  it("a keyboard start: the focus goes in, and the player is the visitor's (touched)", () => {
    const { controller, iframe, slot, focus } = setup();
    expect(controller.userStart("hero")).toBe("started");
    const view = controller.getView("hero");
    expect(view).toMatchObject({ mounted: true, owner: "user", touched: false });
    controller.setIframe("hero", iframe);

    focus(playerToFocus(slot, view));
    expect(controller.getView("hero")).toMatchObject({ owner: "user", touched: true });
  });
});
