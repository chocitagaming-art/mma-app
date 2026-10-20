import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import {
  createTurnController,
  type IntersectionEntryLike,
  type ObserverLike,
  type TurnController,
  type TurnEnvironment,
} from "@/components/playback/turn-controller";

// The browser wiring of the turn manager, driven with a FAKE browser: the
// project's vitest runs in environment "node" (no DOM, on purpose: see
// vitest.config.ts), so the controller takes its browser as an argument and
// here it gets a hand-made one — a clock, timers, IntersectionObserver,
// ResizeObserver, tab visibility, reduced motion, the header height and the
// focused element. The React side (playback-turn-provider.tsx) only passes the
// real ones in; the decisions are lib/playback-turn.ts, tested on their own.
//
// The two players of the home, as in production: the hero short, which only
// plays when the visitor starts it (no autoStart: the owner's decision of
// 30-sep-2026, night) and, scrolled out of view, makes way for UFC TV
// (yieldsToAuto: the owner, 21-oct-2026); and UFC TV, which starts on its own
// when it is seen.

type FakeBox = Element & { size: { width: number; height: number }; inside: unknown[] };

// `inside`: what the box holds (its poster), for Element.contains.
function box(width = 330, height = 587): FakeBox {
  const size = { width, height };
  const inside: unknown[] = [];
  const el = {
    size,
    inside,
    getBoundingClientRect: () => ({ ...size }),
    contains: (node: unknown) => node === el || inside.includes(node),
  };
  return el as unknown as FakeBox;
}

type FakeIO = ObserverLike & {
  cb: (entries: IntersectionEntryLike[]) => void;
  options: { rootMargin: string; threshold: number[] };
  observed: Set<Element>;
  disconnected: boolean;
};

function fakeBrowser() {
  let clock = 1_000;
  let seq = 0;
  const timers = new Map<number, { at: number; fn: () => void }>();
  const ios: FakeIO[] = [];
  const resizeCallbacks: (() => void)[] = [];
  const page = { visible: true, reduced: false, header: 64, active: null as unknown };

  const env: TurnEnvironment = {
    now: () => clock,
    setTimeout: (fn, ms) => {
      seq += 1;
      timers.set(seq, { at: clock + ms, fn });
      return seq;
    },
    clearTimeout: (handle) => {
      timers.delete(handle as number);
    },
    createIntersectionObserver: (cb, options) => {
      const io: FakeIO = {
        cb,
        options,
        observed: new Set(),
        disconnected: false,
        observe(el) {
          this.observed.add(el);
        },
        unobserve(el) {
          this.observed.delete(el);
        },
        disconnect() {
          this.disconnected = true;
          this.observed.clear();
        },
      };
      ios.push(io);
      return io;
    },
    createResizeObserver: (cb) => {
      resizeCallbacks.push(cb);
      return { observe() {}, unobserve() {}, disconnect() {} };
    },
    isPageVisible: () => page.visible,
    prefersReducedMotion: () => page.reduced,
    headerHeight: () => page.header,
    activeElement: () => page.active,
  };

  function advance(ms: number) {
    const until = clock + ms;
    for (;;) {
      const due = [...timers.entries()]
        .filter(([, t]) => t.at <= until)
        .sort((a, b) => a[1].at - b[1].at || a[0] - b[0])[0];
      if (!due) break;
      timers.delete(due[0]);
      clock = due[1].at;
      due[1].fn();
    }
    clock = until;
  }

  const liveIO = () => ios.filter((io) => !io.disconnected).at(-1) as FakeIO;

  // The IntersectionObserver reports `ratio` of this box visible.
  function see(el: FakeBox, ratio: number) {
    liveIO().cb([
      {
        target: el,
        isIntersecting: ratio > 0,
        intersectionRatio: ratio,
        intersectionRect: { width: el.size.width, height: el.size.height * ratio },
      },
    ]);
  }

  function resize() {
    for (const cb of resizeCallbacks) cb();
  }

  return { env, page, advance, see, resize, liveIO, ios };
}

// Every notification is checked: never two players mounted at once.
function watchSinglePlayer(controller: TurnController, ids: string[]) {
  const worst = { mounted: 0 };
  controller.subscribe(() => {
    const n = ids.filter((id) => controller.getView(id).mounted).length;
    worst.mounted = Math.max(worst.mounted, n);
  });
  return worst;
}

function setup() {
  const browser = fakeBrowser();
  const controller = createTurnController(browser.env);
  const hero = box(330, 587);
  const tv = box(1024, 576);
  const mounts: string[] = [];
  // Every time the hero short made way (onYield), in one log with every
  // commit: the hero's poster has to go back to its short BEFORE the commit
  // that swaps the players, so React paints both in the same render.
  const log: string[] = [];
  controller.register({
    id: "hero",
    element: hero,
    yieldsToAuto: true,
    onMount: (owner) => mounts.push(`hero:${owner}`),
    onYield: () => log.push("yield"),
  });
  controller.register({
    id: "tv-bucle",
    element: tv,
    autoStart: true,
    onMount: (owner) => mounts.push(`tv:${owner}`),
  });
  controller.start();
  const worst = watchSinglePlayer(controller, ["hero", "tv-bucle"]);
  controller.subscribe(() => {
    const on = (id: string) => (controller.getView(id).mounted ? controller.getView(id).owner : "poster");
    log.push(`commit hero=${on("hero")} tv=${on("tv-bucle")}`);
  });
  const yields = () => log.filter((entry) => entry === "yield").length;
  return { ...browser, controller, hero, tv, mounts, log, yields, worst };
}

describe("turn controller · IntersectionObserver without the sticky header", () => {
  it("the root margin takes the header band off the top, with thresholds around half", () => {
    const { liveIO, hero, tv } = setup();
    expect(liveIO().options.rootMargin).toBe("-64px 0px 0px 0px");
    expect(liveIO().options.threshold).toEqual(expect.arrayContaining([0, 0.5, 0.51, 1]));
    expect([...liveIO().observed]).toEqual([hero, tv]);
  });

  it("when the header changes height, the observer is rebuilt with the new margin", () => {
    const { controller, page, liveIO, hero, tv } = setup();
    page.header = 112;
    controller.headerResized();
    expect(liveIO().options.rootMargin).toBe("-112px 0px 0px 0px");
    expect([...liveIO().observed]).toEqual([hero, tv]);
  });
});

describe("turn controller · UFC TV: more than half visible for 0.4 s", () => {
  it("mounts only after the dwell, as automatic", () => {
    const { controller, see, advance, tv, mounts } = setup();
    see(tv, 0.8);
    advance(300);
    expect(controller.getView("tv-bucle").mounted).toBe(false);
    advance(200);
    expect(controller.getView("tv-bucle")).toMatchObject({ mounted: true, owner: "auto" });
    expect(mounts).toEqual(["tv:auto"]);
  });

  it("a fast scroll (above half for 200 ms, then out) never mounts anything", () => {
    const { controller, see, advance, tv } = setup();
    see(tv, 0.9);
    advance(200);
    see(tv, 0.3);
    advance(2_000);
    expect(controller.getView("tv-bucle").mounted).toBe(false);
  });

  it("exactly half is not «more than half»: an automatic player is unmounted at once", () => {
    const { controller, see, advance, tv } = setup();
    see(tv, 0.9);
    advance(500);
    expect(controller.getView("tv-bucle").mounted).toBe(true);
    see(tv, 0.5);
    expect(controller.getView("tv-bucle").mounted).toBe(false);
  });
});

describe("turn controller · the keyboard focus inside a box holds its automatic start", () => {
  // The poster (a link) is replaced by the iframe when the player mounts: an
  // automatic mount under the keyboard focus dropped it on <body>. While the
  // focus is inside the box nothing starts there on its own.
  function focusPoster(browser: { page: { active: unknown } }, el: FakeBox) {
    const poster = { poster: true };
    el.inside.push(poster);
    browser.page.active = poster;
    return poster;
  }

  it("UFC TV in view with its poster focused: it waits, and starts as soon as the focus leaves", () => {
    const t = setup();
    focusPoster(t, t.tv);
    t.see(t.tv, 1);
    t.advance(2_000);
    expect(t.controller.getView("tv-bucle").mounted).toBe(false);
    expect(t.mounts).toEqual([]);
    t.page.active = null;
    t.controller.focusChanged();
    expect(t.controller.getView("tv-bucle").mounted).toBe(false);
    t.advance(0);
    expect(t.controller.getView("tv-bucle")).toMatchObject({ mounted: true, owner: "auto" });
  });

  it("the focus on something else of the page (the hero's «Siguiente») does not hold UFC TV", () => {
    const t = setup();
    focusPoster(t, t.hero);
    t.see(t.tv, 1);
    t.advance(500);
    expect(t.controller.getView("tv-bucle")).toMatchObject({ mounted: true, owner: "auto" });
  });

  it("Enter or a tap on the focused poster still plays it, as the visitor's", () => {
    const t = setup();
    focusPoster(t, t.tv);
    t.see(t.tv, 1);
    t.advance(500);
    expect(t.controller.userStart("tv-bucle")).toBe("started");
    expect(t.controller.getView("tv-bucle")).toMatchObject({ mounted: true, owner: "user" });
  });

  it("a focus change reaches the turn manager only through focusChanged, one task later", () => {
    const t = setup();
    t.see(t.tv, 1);
    t.advance(300);
    focusPoster(t, t.tv);
    t.advance(1_000);
    expect(t.controller.getView("tv-bucle").mounted).toBe(false);
    t.page.active = null;
    t.controller.focusChanged();
    t.controller.focusChanged();
    t.advance(0);
    expect(t.controller.getView("tv-bucle").mounted).toBe(true);
    expect(t.mounts).toEqual(["tv:auto"]);
  });
});

describe("turn controller · the hero short never starts on its own (30-sep-2026, night)", () => {
  it("fully in view for a minute: still its poster, and nothing was ever mounted", () => {
    const { controller, see, advance, hero, mounts } = setup();
    see(hero, 1);
    advance(60_000);
    expect(controller.getView("hero")).toMatchObject({ mounted: false, owner: null, mountCount: 0 });
    expect(mounts).toEqual([]);
  });

  it("nor when the tab comes back, the menu closes, reduced motion goes off or the box resizes", () => {
    const { controller, see, advance, hero, page, resize, mounts } = setup();
    see(hero, 1);
    advance(1_000);
    controller.setPageVisible(false);
    controller.setPageVisible(true);
    controller.addBlocker("menu");
    controller.removeBlocker("menu");
    page.reduced = true;
    controller.reducedMotionChanged();
    page.reduced = false;
    controller.reducedMotionChanged();
    resize();
    advance(5_000);
    expect(controller.getView("hero").mounted).toBe(false);
    expect(mounts).toEqual([]);
  });

  it("a player starts on its own only if it says so: autoStart is false by default", () => {
    const browser = fakeBrowser();
    const controller = createTurnController(browser.env);
    const quiet = box(1024, 576);
    const loud = box(1024, 576);
    controller.register({ id: "tv-directo", element: quiet });
    controller.register({ id: "evento", element: loud, autoStart: true });
    controller.start();
    browser.see(quiet, 1);
    browser.advance(1_000);
    expect(controller.getView("tv-directo").mounted).toBe(false);
    browser.see(quiet, 0);
    browser.see(loud, 1);
    browser.advance(1_000);
    expect(controller.getView("evento")).toMatchObject({ mounted: true, owner: "auto" });
  });

  // The hero used to register «not ready» until its headline's font and its
  // intro were done, and a tap on its ▶ in that time did nothing. Its poster
  // is now THE way to watch a short: no start of the visitor waits for that.
  it("the visitor starts it at once: there is no «not ready» for a tap", () => {
    const browser = fakeBrowser();
    const controller = createTurnController(browser.env);
    const hero = box();
    controller.register({ id: "hero", element: hero });
    controller.start();
    expect(controller.userStart("hero")).toBe("started");
    expect(controller.getView("hero")).toMatchObject({ mounted: true, owner: "user" });
  });
});

describe("turn controller · only one at a time", () => {
  it("two above half: the larger visible area; when it drops, the other takes over in the same commit", () => {
    // No page has two automatic players today; the rule still holds.
    const browser = fakeBrowser();
    const controller = createTurnController(browser.env);
    const tv = box(1024, 576);
    const live = box(768, 432);
    controller.register({ id: "tv-bucle", element: tv, autoStart: true });
    controller.register({ id: "evento", element: live, autoStart: true });
    controller.start();
    const worst = watchSinglePlayer(controller, ["tv-bucle", "evento"]);
    browser.see(live, 0.6);
    browser.see(tv, 0.9);
    browser.advance(500);
    expect(controller.getView("tv-bucle").mounted).toBe(true);
    expect(controller.getView("evento").mounted).toBe(false);
    browser.see(tv, 0.2);
    expect(controller.getView("tv-bucle").mounted).toBe(false);
    expect(controller.getView("evento").mounted).toBe(true);
    expect(worst.mounted).toBe(1);
  });

  // With no Up Next block the slot sits right under the hero, and on a phone
  // «Siguiente ›» can show under a frame scrolled half away, with UFC TV
  // playing below it. The tap moves the focus (focusChanged) and the
  // turn is decided again one task later: the short must not make way there
  // and then, or the tap would do nothing but restart UFC TV.
  it("the visitor's short takes the turn from UFC TV, and UFC TV does not take it back while nothing moves", () => {
    const { controller, see, advance, hero, tv, mounts, yields, worst } = setup();
    see(tv, 1);
    advance(500);
    see(hero, 0.3);
    expect(controller.userStart("hero")).toBe("started");
    expect(controller.getView("hero")).toMatchObject({ mounted: true, owner: "user" });
    expect(controller.getView("tv-bucle").mounted).toBe(false);
    // UFC TV fully in view for far longer than the dwell, the turn decided
    // again: it waits.
    controller.focusChanged();
    advance(10_000);
    controller.evaluate();
    expect(controller.getView("hero")).toMatchObject({ mounted: true, owner: "user" });
    expect(controller.getView("tv-bucle").mounted).toBe(false);
    expect(mounts).toEqual(["tv:auto", "hero:user"]);
    expect(yields()).toBe(0);
    expect(worst.mounted).toBe(1);
  });
});

// The owner, 21-oct-2026: «cuando haga scroll hacia abajo y llegue al UFC TV
// en directo, que se pare el vídeo de arriba y se ponga el directo sin
// pulsar». The visitor's hero short, once half or less of it is in view,
// makes way for an automatic player that may start on its own.
describe("turn controller · the visitor's short makes way for UFC TV out of view (21-oct-2026)", () => {
  function playShortThenScrollDown() {
    const t = setup();
    t.see(t.hero, 1);
    expect(t.controller.userStart("hero")).toBe("started");
    t.advance(3_000);
    // The visitor scrolls down: the short goes, UFC TV comes in.
    t.see(t.hero, 0);
    t.see(t.tv, 0.9);
    return t;
  }

  it("UFC TV seen for the dwell takes the turn on its own, muted (auto), in one commit, and the hero is told", () => {
    const t = playShortThenScrollDown();
    t.advance(300);
    expect(t.controller.getView("hero")).toMatchObject({ mounted: true, owner: "user" });
    expect(t.controller.getView("tv-bucle").mounted).toBe(false);
    t.advance(200);
    expect(t.controller.getView("hero")).toMatchObject({ mounted: false, owner: null });
    expect(t.controller.getView("tv-bucle")).toMatchObject({ mounted: true, owner: "auto" });
    expect(t.mounts).toEqual(["hero:user", "tv:auto"]);
    // The hero's poster first, then ONE commit with the swap: never two.
    expect(t.log.slice(-2)).toEqual(["yield", "commit hero=poster tv=auto"]);
    expect(t.yields()).toBe(1);
    expect(t.worst.mounted).toBe(1);
  });

  it("back up: UFC TV goes back to its poster, and the short never starts again on its own", () => {
    const t = playShortThenScrollDown();
    t.advance(500);
    expect(t.controller.getView("tv-bucle").owner).toBe("auto");
    t.see(t.tv, 0.2);
    t.see(t.hero, 1);
    t.advance(60_000);
    expect(t.controller.getView("tv-bucle").mounted).toBe(false);
    expect(t.controller.getView("hero").mounted).toBe(false);
    expect(t.mounts).toEqual(["hero:user", "tv:auto"]);
    // A tap plays it again, the visitor's, as always.
    expect(t.controller.userStart("hero")).toBe("started");
    expect(t.controller.getView("hero")).toMatchObject({ mounted: true, owner: "user" });
    expect(t.yields()).toBe(1);
  });

  it("a short the visitor touched inside (sound, PiP) makes way too", () => {
    const t = setup();
    t.see(t.hero, 1);
    t.controller.userStart("hero");
    const iframe = {};
    t.controller.setIframe("hero", iframe);
    t.page.active = iframe;
    t.controller.windowBlurred();
    t.advance(0);
    expect(t.controller.getView("hero")).toMatchObject({ owner: "user", touched: true });
    t.advance(1_000);
    t.see(t.hero, 0);
    t.see(t.tv, 1);
    t.advance(500);
    expect(t.controller.getView("hero").mounted).toBe(false);
    expect(t.controller.getView("tv-bucle")).toMatchObject({ mounted: true, owner: "auto" });
    expect(t.worst.mounted).toBe(1);
  });

  it("a tall screen: the short more than half in view keeps the turn; scrolled out under UFC TV, it makes way at once", () => {
    const t = setup();
    t.see(t.hero, 1);
    t.see(t.tv, 1);
    t.advance(500);
    expect(t.controller.getView("tv-bucle").owner).toBe("auto");
    t.advance(1_000);
    expect(t.controller.userStart("hero")).toBe("started");
    t.see(t.hero, 0.6);
    t.advance(10_000);
    expect(t.controller.getView("hero")).toMatchObject({ mounted: true, owner: "user" });
    expect(t.controller.getView("tv-bucle").mounted).toBe(false);
    // UFC TV never left the view: the drop of the short is what moved.
    t.see(t.hero, 0.4);
    expect(t.controller.getView("hero").mounted).toBe(false);
    expect(t.controller.getView("tv-bucle")).toMatchObject({ mounted: true, owner: "auto" });
    expect(t.worst.mounted).toBe(1);
  });

  it("the same tap under a frame half away: it stays until UFC TV comes into view again", () => {
    const t = setup();
    t.see(t.tv, 1);
    t.advance(500);
    t.see(t.hero, 0.3);
    t.controller.userStart("hero");
    t.advance(5_000);
    t.controller.evaluate();
    expect(t.controller.getView("hero").owner).toBe("user");
    // A scroll takes UFC TV out and back: it comes into view after the tap.
    t.see(t.tv, 0.4);
    t.see(t.tv, 0.9);
    t.advance(500);
    expect(t.controller.getView("hero").mounted).toBe(false);
    expect(t.controller.getView("tv-bucle")).toMatchObject({ mounted: true, owner: "auto" });
  });

  it("not with the tab hidden, the menu open, reduced motion or the focus on UFC TV's poster: then it does", () => {
    const t = playShortThenScrollDown();
    t.controller.setPageVisible(false);
    t.advance(2_000);
    expect(t.controller.getView("hero").owner).toBe("user");
    t.controller.addBlocker("menu");
    t.controller.setPageVisible(true);
    t.advance(2_000);
    expect(t.controller.getView("hero").owner).toBe("user");
    t.page.reduced = true;
    t.controller.removeBlocker("menu");
    t.advance(2_000);
    expect(t.controller.getView("hero").owner).toBe("user");
    const poster = { poster: true };
    t.tv.inside.push(poster);
    t.page.active = poster;
    t.page.reduced = false;
    t.controller.reducedMotionChanged();
    t.advance(2_000);
    expect(t.controller.getView("hero").owner).toBe("user");
    expect(t.controller.getView("tv-bucle").mounted).toBe(false);
    // The focus leaves the poster: now it makes way.
    t.page.active = null;
    t.controller.focusChanged();
    t.advance(0);
    expect(t.controller.getView("hero").mounted).toBe(false);
    expect(t.controller.getView("tv-bucle")).toMatchObject({ mounted: true, owner: "auto" });
    expect(t.yields()).toBe(1);
    expect(t.worst.mounted).toBe(1);
  });

  it("UFC TV seen for less than the dwell (a fast scroll past it): the short stays", () => {
    const t = playShortThenScrollDown();
    t.advance(200);
    t.see(t.tv, 0);
    t.advance(10_000);
    expect(t.controller.getView("hero")).toMatchObject({ mounted: true, owner: "user" });
    expect(t.controller.getView("tv-bucle").mounted).toBe(false);
    expect(t.yields()).toBe(0);
  });

  it("only a player that says yieldsToAuto: a visitor's clip out of view stays, UFC TV waits", () => {
    const browser = fakeBrowser();
    const controller = createTurnController(browser.env);
    const clip = box(1024, 576);
    const tv = box(1024, 576);
    controller.register({ id: "clip", element: clip });
    controller.register({ id: "tv-bucle", element: tv, autoStart: true });
    controller.start();
    browser.see(clip, 1);
    controller.userStart("clip");
    browser.see(clip, 0);
    browser.see(tv, 1);
    browser.advance(10_000);
    expect(controller.getView("clip")).toMatchObject({ mounted: true, owner: "user" });
    expect(controller.getView("tv-bucle").mounted).toBe(false);
  });

  it("UFC TV the visitor touched, out of view, with the hero's poster in view: nothing changes", () => {
    const t = setup();
    t.see(t.tv, 1);
    t.controller.userStart("tv-bucle");
    t.see(t.tv, 0);
    t.see(t.hero, 1);
    t.advance(10_000);
    expect(t.controller.getView("tv-bucle")).toMatchObject({ mounted: true, owner: "user" });
    expect(t.controller.getView("hero").mounted).toBe(false);
    expect(t.yields()).toBe(0);
  });
});

describe("turn controller · hidden tab", () => {
  it("the automatic one is unmounted, and comes back on its own when the tab does", () => {
    const { controller, see, advance, tv } = setup();
    see(tv, 1);
    advance(500);
    controller.setPageVisible(false);
    expect(controller.getView("tv-bucle").mounted).toBe(false);
    controller.setPageVisible(true);
    expect(controller.getView("tv-bucle")).toMatchObject({ mounted: true, owner: "auto" });
  });

  it("what the visitor started stays mounted: the same iframe, not a new one", () => {
    const { controller, see, advance, hero, tv, mounts, worst } = setup();
    see(hero, 0.9);
    controller.userStart("hero");
    const { mountCount } = controller.getView("hero");
    controller.setPageVisible(false);
    expect(controller.getView("hero")).toMatchObject({ mounted: true, owner: "user", mountCount });
    // Hidden for a while, with UFC TV fully in view: nothing else starts.
    see(tv, 1);
    advance(5_000);
    controller.setPageVisible(true);
    advance(1_000);
    expect(controller.getView("hero")).toMatchObject({ mounted: true, owner: "user", mountCount });
    expect(controller.getView("tv-bucle").mounted).toBe(false);
    expect(mounts).toEqual(["hero:user"]);
    expect(worst.mounted).toBe(1);
  });

  it("an automatic player the visitor touched inside is theirs: it stays with the tab hidden", () => {
    const { controller, see, advance, tv, page } = setup();
    see(tv, 1);
    advance(500);
    const iframe = {};
    controller.setIframe("tv-bucle", iframe);
    page.active = iframe;
    controller.windowBlurred();
    advance(0);
    controller.setPageVisible(false);
    expect(controller.getView("tv-bucle")).toMatchObject({ mounted: true, owner: "user", touched: true });
  });

  it("a tab that starts hidden mounts nothing", () => {
    const browser = fakeBrowser();
    browser.page.visible = false;
    const controller = createTurnController(browser.env);
    const tv = box(1024, 576);
    controller.register({ id: "tv-bucle", element: tv, autoStart: true });
    controller.start();
    browser.see(tv, 1);
    browser.advance(1_000);
    expect(controller.getView("tv-bucle").mounted).toBe(false);
  });
});

describe("turn controller · prefers-reduced-motion", () => {
  it("nothing starts on its own, and turning it on stops the automatic one; a tap still plays", () => {
    const { controller, see, advance, tv, page } = setup();
    see(tv, 1);
    advance(500);
    page.reduced = true;
    controller.reducedMotionChanged();
    expect(controller.getView("tv-bucle").mounted).toBe(false);
    advance(5_000);
    expect(controller.getView("tv-bucle").mounted).toBe(false);
    controller.userStart("tv-bucle");
    expect(controller.getView("tv-bucle")).toMatchObject({ mounted: true, owner: "user" });
  });
});

describe("turn controller · touched by the visitor", () => {
  it("a tap inside UFC TV's iframe (window blur + the iframe focused) makes it the visitor's", () => {
    const { controller, see, advance, tv, page } = setup();
    see(tv, 1);
    advance(500);
    const iframe = {};
    controller.setIframe("tv-bucle", iframe);
    page.active = iframe;
    controller.windowBlurred();
    advance(0);
    expect(controller.getView("tv-bucle")).toMatchObject({ mounted: true, owner: "user", touched: true });
    // Theirs now: out of view it stays (PiP).
    see(tv, 0);
    advance(2_000);
    expect(controller.getView("tv-bucle")).toMatchObject({ mounted: true, owner: "user" });
  });

  it("a blur with the focus somewhere else (another tab, another app) touches nothing", () => {
    const { controller, see, advance, tv, page } = setup();
    see(tv, 1);
    advance(500);
    controller.setIframe("tv-bucle", {});
    page.active = null;
    controller.windowBlurred();
    advance(0);
    expect(controller.getView("tv-bucle")).toMatchObject({ owner: "auto", touched: false });
  });

  // The net under the window blur: WebKit fires that blur only when a frame of
  // the page had the focus before (FocusController::setFocusedFrame), so a
  // first tap inside the iframe may move the focus there with no blur at all.
  // Every decision looks where the focus is before taking a player away.
  it("the focus inside the holder's iframe with no blur still makes it the visitor's at the next decision", () => {
    const { controller, see, advance, tv, page, worst } = setup();
    see(tv, 1);
    advance(500);
    const iframe = {};
    controller.setIframe("tv-bucle", iframe);
    page.active = iframe;
    // No windowBlurred(): the visitor scrolls away.
    see(tv, 0);
    advance(1_000);
    expect(controller.getView("tv-bucle")).toMatchObject({ mounted: true, owner: "user", touched: true });
    expect(worst.mounted).toBe(1);
  });

  it("a tap on the page (pointerdown) reads the focus BEFORE it leaves the iframe: the menu does not take it away", () => {
    const { controller, see, advance, tv, page } = setup();
    see(tv, 1);
    advance(500);
    const iframe = {};
    controller.setIframe("tv-bucle", iframe);
    page.active = iframe;
    // The hamburger: pointerdown first, then the focus goes to the page, then
    // the menu opens.
    controller.pagePointerDown();
    page.active = null;
    controller.addBlocker("menu");
    expect(controller.getView("tv-bucle")).toMatchObject({ mounted: true, owner: "user", touched: true });
  });

  it("with the focus elsewhere the net touches nothing: the automatic one still goes out of view", () => {
    const { controller, see, advance, tv, page } = setup();
    see(tv, 1);
    advance(500);
    controller.setIframe("tv-bucle", {});
    page.active = null;
    controller.pagePointerDown();
    see(tv, 0);
    expect(controller.getView("tv-bucle")).toMatchObject({ mounted: false, touched: false });
  });

  it("the hero's timer also looks at the focus first: a short with the focus inside stays", () => {
    const { controller, see, hero, page } = setup();
    see(hero, 1);
    controller.userStart("hero");
    const iframe = {};
    controller.setIframe("hero", iframe);
    page.active = iframe;
    expect(controller.timerFired("hero")).toBe("stay");
    expect(controller.getView("hero")).toMatchObject({ mounted: true, owner: "user", touched: true });
  });
});

describe("turn controller · what the visitor chose is theirs (DECISIONS.md, 30-sep-2026)", () => {
  // Since 21-oct-2026 the hero short makes way when UFC TV is seen (above);
  // with nothing automatic in view, as when reading further down, it stays.
  it("out of view (0 %, as when scrolling in PiP) it stays while nothing automatic is seen", () => {
    const { controller, see, advance, hero, tv, yields, worst } = setup();
    see(hero, 0.9);
    controller.userStart("hero");
    advance(1_000);
    see(hero, 0);
    // UFC TV passed by in a fast scroll (under the dwell), the page read below.
    see(tv, 1);
    advance(200);
    see(tv, 0);
    advance(10_000);
    expect(controller.getView("hero")).toMatchObject({ mounted: true, owner: "user" });
    expect(controller.getView("tv-bucle").mounted).toBe(false);
    expect(yields()).toBe(0);
    expect(worst.mounted).toBe(1);
  });

  it("a blocker (the menu) leaves it alone, and still refuses a new start behind it", () => {
    const { controller, see, hero, tv } = setup();
    see(tv, 0.9);
    controller.userStart("tv-bucle");
    controller.addBlocker("menu");
    expect(controller.getView("tv-bucle")).toMatchObject({ mounted: true, owner: "user" });
    see(hero, 1);
    expect(controller.userStart("hero")).toBe("blocked");
    controller.removeBlocker("menu");
    expect(controller.getView("tv-bucle")).toMatchObject({ mounted: true, owner: "user" });
    expect(controller.getView("hero").mounted).toBe(false);
  });

  it("it goes when the visitor picks another player: still one at a time", () => {
    const { controller, see, hero, tv, worst } = setup();
    see(hero, 0.9);
    controller.userStart("hero");
    see(hero, 0);
    see(tv, 0.4);
    expect(controller.userStart("tv-bucle")).toBe("started");
    expect(controller.getView("tv-bucle")).toMatchObject({ mounted: true, owner: "user" });
    expect(controller.getView("hero").mounted).toBe(false);
    expect(worst.mounted).toBe(1);
  });

  it("the view has no «waiting» nor «paused» state: nothing waits for a «Seguir» any more", () => {
    const { controller, see, hero } = setup();
    see(hero, 0.9);
    controller.userStart("hero");
    controller.setPageVisible(false);
    expect(Object.keys(controller.getView("hero")).sort()).toEqual(
      ["mountCount", "mounted", "owner", "touched"].sort(),
    );
  });
});

// R10 (18-oct-2026): the videos modal (video-modal.tsx) plays its video
// INSIDE the turn, as the visitor's, while it is also a blocker (it covers the
// page). «Uno a la vez»: what was playing goes, the visitor's included, and
// only what had started on its own comes back when it closes.
describe("turn controller · the videos modal: its own blocker, one at a time", () => {
  // As VideoModal mounts: its box registers, it starts, its blocker goes up.
  // Each VideoModal has its own blocker name (`video-modal-${useId()}`).
  function openModal(
    controller: TurnController,
    size: [number, number] = [1024, 576],
    id = "modal",
  ) {
    const modal = box(...size);
    const blocker = `video-modal-${id}`;
    const unregister = controller.register({ id, element: modal, ownBlocker: blocker });
    const result = controller.userStart(id);
    controller.addBlocker(blocker);
    return {
      result,
      // As it unmounts: React runs the parent's cleanup (the blocker) first.
      close() {
        controller.removeBlocker(blocker);
        unregister();
      },
    };
  }

  it("its own blocker does not stop its start", () => {
    const { controller } = setup();
    controller.register({ id: "modal", element: box(1024, 576), ownBlocker: "video-modal-a" });
    controller.addBlocker("video-modal-a");
    expect(controller.userStart("modal")).toBe("started");
    expect(controller.getView("modal")).toMatchObject({ mounted: true, owner: "user" });
  });

  // QA of R10: the mobile menu only closes on navigation, Escape or a wider
  // window, so a video card can be tapped under it (390 and 768 px). The
  // modal covers the menu too (z-100 over z-40): its start was "blocked" and
  // its «Ver en YouTube» poster did nothing.
  it("nor does the open mobile menu: the modal is above it", () => {
    const { controller, see, advance, tv } = setup();
    see(tv, 1);
    controller.addBlocker("menu");
    const modal = openModal(controller);
    expect(modal.result).toBe("started");
    expect(controller.getView("modal")).toMatchObject({ mounted: true, owner: "user" });
    modal.close();
    // The menu is still open: nothing automatic starts.
    advance(5_000);
    expect(controller.getView("tv-bucle").mounted).toBe(false);
    expect(controller.getView("modal").mounted).toBe(false);
  });

  it("a player WITHOUT a blocker of its own is still refused under any blocker, a modal's included", () => {
    const { controller, see, tv } = setup();
    see(tv, 1);
    controller.addBlocker("menu");
    expect(controller.userStart("tv-bucle")).toBe("blocked");
    controller.removeBlocker("menu");
    controller.addBlocker("video-modal-a");
    expect(controller.userStart("tv-bucle")).toBe("blocked");
  });

  // Two stacked modals (Tab used to leave the first one and Enter opened a
  // second): one shared blocker name was ONE entry in the Set, and closing
  // the top modal lifted the block of the one still open.
  it("two stacked modals: closing the top one keeps the block of the other", () => {
    const { controller, see, advance, tv, worst } = setup();
    see(tv, 1);
    advance(500);
    expect(controller.getView("tv-bucle")).toMatchObject({ mounted: true, owner: "auto" });
    const first = openModal(controller, [1024, 576], "modal-1");
    const second = openModal(controller, [1024, 576], "modal-2");
    expect(second.result).toBe("started");
    second.close();
    advance(5_000);
    expect(controller.getView("tv-bucle").mounted).toBe(false);
    first.close();
    advance(500);
    expect(controller.getView("tv-bucle")).toMatchObject({ mounted: true, owner: "auto" });
    expect(worst.mounted).toBe(1);
  });

  it("under 200x200 it still says too-small (the modal then shows the link to YouTube)", () => {
    const { controller } = setup();
    expect(openModal(controller, [190, 107]).result).toBe("too-small");
    expect(controller.getView("modal").mounted).toBe(false);
  });

  it("UFC TV that started on its own: goes while it is open, comes back on its own when it closes", () => {
    const { controller, see, advance, tv, worst } = setup();
    see(tv, 1);
    advance(500);
    expect(controller.getView("tv-bucle")).toMatchObject({ mounted: true, owner: "auto" });
    const modal = openModal(controller);
    expect(modal.result).toBe("started");
    expect(controller.getView("tv-bucle").mounted).toBe(false);
    advance(5_000);
    expect(controller.getView("tv-bucle").mounted).toBe(false);
    modal.close();
    expect(controller.getView("tv-bucle")).toMatchObject({ mounted: true, owner: "auto" });
    expect(worst.mounted).toBe(1);
  });

  it("UFC TV the VISITOR put on (touched inside): goes too, and does NOT come back on its own", () => {
    const { controller, see, advance, tv, page, worst } = setup();
    const ids = watchSinglePlayer(controller, ["hero", "tv-bucle", "modal"]);
    see(tv, 1);
    advance(500);
    const iframe = {};
    controller.setIframe("tv-bucle", iframe);
    page.active = iframe;
    controller.windowBlurred();
    advance(0);
    expect(controller.getView("tv-bucle")).toMatchObject({ mounted: true, owner: "user" });

    page.active = null;
    const modal = openModal(controller);
    expect(modal.result).toBe("started");
    expect(controller.getView("tv-bucle").mounted).toBe(false);
    modal.close();
    // Fully in view, far past the dwell, tab hidden and back: still its poster.
    advance(10_000);
    controller.setPageVisible(false);
    controller.setPageVisible(true);
    see(tv, 0.9);
    advance(10_000);
    expect(controller.getView("tv-bucle").mounted).toBe(false);
    // The visitor starts it again: theirs, and from then on as before.
    expect(controller.userStart("tv-bucle")).toBe("started");
    expect(controller.getView("tv-bucle")).toMatchObject({ mounted: true, owner: "user" });
    expect(worst.mounted).toBe(1);
    expect(ids.mounted).toBe(1);
  });

  it("UFC TV started with a tap on its poster: the same, back to its poster for good", () => {
    const { controller, see, advance, tv } = setup();
    see(tv, 0.9);
    expect(controller.userStart("tv-bucle")).toBe("started");
    const modal = openModal(controller);
    expect(controller.getView("tv-bucle").mounted).toBe(false);
    modal.close();
    advance(10_000);
    expect(controller.getView("tv-bucle").mounted).toBe(false);
  });

  it("the visitor's short goes too, and nothing starts behind the open modal", () => {
    const { controller, see, advance, hero, tv, worst } = setup();
    see(hero, 1);
    controller.userStart("hero");
    see(tv, 1);
    const modal = openModal(controller);
    expect(controller.getView("hero").mounted).toBe(false);
    advance(10_000);
    expect(controller.getView("tv-bucle").mounted).toBe(false);
    expect(controller.getView("modal")).toMatchObject({ mounted: true, owner: "user" });
    modal.close();
    expect(controller.getView("hero").mounted).toBe(false);
    // UFC TV was never playing: it is not the visitor's, it may start on its own.
    advance(500);
    expect(controller.getView("tv-bucle")).toMatchObject({ mounted: true, owner: "auto" });
    expect(worst.mounted).toBe(1);
  });

  // Parking is the modal's (the owner's decision was about opening a video):
  // the hero short over the visitor's UFC TV parks nothing, as before R10.
  it("the hero short over the visitor's UFC TV parks nothing: when the short ends, UFC TV comes back on its own", () => {
    const { controller, see, advance, hero, tv, worst } = setup();
    see(tv, 0.9);
    expect(controller.userStart("tv-bucle")).toBe("started");
    see(hero, 0.6);
    expect(controller.userStart("hero")).toBe("started");
    expect(controller.getView("tv-bucle").mounted).toBe(false);
    advance(1_000);
    expect(controller.timerFired("hero")).toBe("release");
    expect(controller.getView("tv-bucle")).toMatchObject({ mounted: true, owner: "auto" });
    expect(worst.mounted).toBe(1);
  });

  it("a refused start of the modal leaves the visitor's player alone and not parked", () => {
    const { controller, see, advance, tv } = setup();
    see(tv, 0.9);
    controller.userStart("tv-bucle");
    const modal = openModal(controller, [150, 84]);
    expect(modal.result).toBe("too-small");
    expect(controller.getView("tv-bucle")).toMatchObject({ mounted: true, owner: "user" });
    modal.close();
    advance(1_000);
    expect(controller.getView("tv-bucle")).toMatchObject({ mounted: true, owner: "user" });
  });
});

describe("turn controller · the end of the hero short (its timer)", () => {
  it("untouched and fully in view: back to its poster, and no short starts on its own after it", () => {
    const { controller, see, advance, hero, mounts } = setup();
    see(hero, 1);
    controller.userStart("hero");
    expect(controller.timerFired("hero")).toBe("release");
    expect(controller.getView("hero")).toMatchObject({ mounted: false, owner: null });
    advance(60_000);
    expect(controller.getView("hero").mounted).toBe(false);
    expect(mounts).toEqual(["hero:user"]);
  });

  it("and the turn is free: UFC TV, in view, starts on its own in the same commit", () => {
    const { controller, see, advance, hero, tv, worst } = setup();
    see(hero, 0.6);
    see(tv, 0.9);
    controller.userStart("hero");
    advance(2_000);
    expect(controller.getView("tv-bucle").mounted).toBe(false);
    expect(controller.timerFired("hero")).toBe("release");
    expect(controller.getView("hero").mounted).toBe(false);
    expect(controller.getView("tv-bucle")).toMatchObject({ mounted: true, owner: "auto" });
    expect(worst.mounted).toBe(1);
  });

  // Out of view while it plays, maybe in a PiP opened with the browser's own
  // button (no tap inside), with nothing automatic in view (the visitor reads
  // further down, past UFC TV): it stays while it plays, and its end closes
  // it. With UFC TV in view it makes way before (21-oct-2026, above).
  it("started with a tap and never touched, out of view: it stays while it plays, and its timer frees the turn for UFC TV", () => {
    const { controller, see, advance, hero, tv, mounts, worst } = setup();
    see(hero, 0.9);
    controller.userStart("hero");
    advance(1_000);
    see(hero, 0);
    advance(14_000);
    expect(controller.getView("hero")).toMatchObject({ mounted: true, owner: "user", touched: false });
    expect(controller.getView("tv-bucle").mounted).toBe(false);
    expect(controller.timerFired("hero")).toBe("release");
    expect(controller.getView("hero")).toMatchObject({ mounted: false, owner: null });
    // The visitor scrolls back up to UFC TV: it starts on its own.
    see(tv, 1);
    advance(500);
    expect(controller.getView("tv-bucle")).toMatchObject({ mounted: true, owner: "auto" });
    expect(mounts).toEqual(["hero:user", "tv:auto"]);
    expect(worst.mounted).toBe(1);
  });

  it("the same short touched inside (a PiP from YouTube's own button) stays at its timer", () => {
    const { controller, see, advance, hero, page, worst } = setup();
    see(hero, 0.9);
    controller.userStart("hero");
    const iframe = {};
    controller.setIframe("hero", iframe);
    page.active = iframe;
    controller.windowBlurred();
    advance(0);
    see(hero, 0);
    advance(15_000);
    expect(controller.timerFired("hero")).toBe("stay");
    advance(5_000);
    expect(controller.getView("hero")).toMatchObject({ mounted: true, owner: "user", touched: true });
    expect(controller.getView("tv-bucle").mounted).toBe(false);
    expect(worst.mounted).toBe(1);
  });

  it("a timer of a player that no longer holds the turn does nothing", () => {
    const { controller } = setup();
    expect(controller.timerFired("hero")).toBeNull();
  });
});

describe("turn controller · blockers and size", () => {
  it("a blocker (the menu) unmounts the automatic player, and nothing starts until it closes", () => {
    const { controller, see, advance, tv, hero } = setup();
    see(tv, 1);
    advance(500);
    controller.addBlocker("menu");
    expect(controller.getView("tv-bucle").mounted).toBe(false);
    see(hero, 1);
    expect(controller.userStart("hero")).toBe("blocked");
    expect(controller.getView("hero").mounted).toBe(false);
    controller.removeBlocker("menu");
    expect(controller.getView("tv-bucle")).toMatchObject({ mounted: true, owner: "auto" });
  });

  it("under 200x200 it never mounts, and one that shrinks loses the turn on the next resize", () => {
    const { controller, see, advance, tv, resize } = setup();
    tv.size.width = 356;
    tv.size.height = 199;
    see(tv, 1);
    advance(500);
    expect(controller.getView("tv-bucle").mounted).toBe(false);
    tv.size.height = 200;
    resize();
    expect(controller.getView("tv-bucle").mounted).toBe(true);
    tv.size.width = 199;
    resize();
    expect(controller.getView("tv-bucle").mounted).toBe(false);
  });
});

describe("turn controller · what the visitor starts also needs 200x200", () => {
  it("userStart on a 150x150 box does not mount and says why (the poster opens YouTube)", () => {
    const { controller, see, hero } = setup();
    hero.size.width = 150;
    hero.size.height = 150;
    see(hero, 1);
    expect(controller.userStart("hero")).toBe("too-small");
    expect(controller.getView("hero").mounted).toBe(false);
  });

  it("a refused start leaves the current holder playing", () => {
    const { controller, see, advance, hero, tv, worst } = setup();
    see(tv, 1);
    advance(500);
    hero.size.width = 150;
    see(hero, 0.3);
    expect(controller.userStart("hero")).toBe("too-small");
    expect(controller.getView("tv-bucle")).toMatchObject({ mounted: true, owner: "auto" });
    expect(worst.mounted).toBe(1);
  });

  it("the result of every start: started, blocked, unknown", () => {
    const { controller, see, hero } = setup();
    see(hero, 0.3);
    expect(controller.userStart("nada")).toBe("unknown");
    controller.addBlocker("menu");
    expect(controller.userStart("hero")).toBe("blocked");
    controller.removeBlocker("menu");
    expect(controller.userStart("hero")).toBe("started");
  });

  it("the visitor's player that shrinks under 200x200 goes too", () => {
    const { controller, see, hero, resize } = setup();
    see(hero, 1);
    controller.userStart("hero");
    hero.size.width = 120;
    hero.size.height = 213;
    resize();
    expect(controller.getView("hero").mounted).toBe(false);
  });
});

describe("turn controller · lifecycle", () => {
  it("unregistering the holder frees the turn for the next one", () => {
    const browser = fakeBrowser();
    const controller = createTurnController(browser.env);
    const hero = box();
    const tv = box(1024, 576);
    const offHero = controller.register({ id: "hero", element: hero });
    controller.register({ id: "tv-bucle", element: tv, autoStart: true });
    controller.start();
    browser.see(hero, 1);
    browser.see(tv, 0.9);
    browser.advance(500);
    expect(controller.getView("tv-bucle").mounted).toBe(true);
    controller.userStart("hero");
    expect(controller.getView("tv-bucle").mounted).toBe(false);
    offHero();
    expect(controller.getView("hero").mounted).toBe(false);
    expect(controller.getView("tv-bucle").mounted).toBe(true);
    expect(browser.liveIO().observed.has(hero)).toBe(false);
  });

  it("stop and start again (React StrictMode) observes every player again", () => {
    const { controller, liveIO, hero, tv, ios } = setup();
    controller.stop();
    expect(ios.every((io) => io.disconnected)).toBe(true);
    controller.start();
    expect([...liveIO().observed]).toEqual([hero, tv]);
  });

  it("a player registered after start is observed at once", () => {
    const browser = fakeBrowser();
    const controller = createTurnController(browser.env);
    controller.start();
    const tv = box(1024, 576);
    controller.register({ id: "tv-bucle", element: tv, autoStart: true });
    expect(browser.liveIO().observed.has(tv)).toBe(true);
    browser.see(tv, 1);
    browser.advance(500);
    expect(controller.getView("tv-bucle").mounted).toBe(true);
  });

  it("an unknown id reads as an idle poster, and the view object is stable between reads", () => {
    const { controller } = setup();
    expect(controller.getView("nada")).toMatchObject({ mounted: false, owner: null });
    expect(controller.getView("hero")).toBe(controller.getView("hero"));
  });
});

// ── Source guards ───────────────────────────────────────────────────────────

describe("source guards of the turn manager", () => {
  const files = [
    "./turn-controller.ts",
    "./playback-turn-provider.tsx",
    "../../lib/playback-turn.ts",
  ].map((path) => [path, readFileSync(fileURLToPath(new URL(path, import.meta.url)), "utf8")] as const);

  it("never talks to the player: no postMessage, no enablejsapi, no iframe_api (Developer Policies III.D.7)", () => {
    for (const [path, source] of files) {
      expect(source, path).not.toMatch(/\.postMessage\(|enablejsapi=|youtube\.com\/iframe_api|contentWindow/);
    }
  });

  it("the decisions stay in lib/playback-turn.ts: the wiring calls decideTurn and timerAction, it does not reimplement them", () => {
    const controller = files[0][1];
    expect(controller).toMatch(/apply\(decideTurn\(snapshot\(\)\)\)/);
    expect(controller).toMatch(/timerAction\(p\.touched\)/);
    const provider = files[1][1];
    expect(provider).not.toMatch(/decideTurn|timerAction\(/);
  });

  it("TurnSlot registers its ownBlocker, and userStart refuses as blocked only a player without one", () => {
    const provider = files[1][1];
    expect(provider).toMatch(/ownBlocker\?: string;/);
    expect(provider).toMatch(/controller\.register\(\{[\s\S]*?\bownBlocker,[\s\S]*?\}\)/);
    expect(files[0][1]).toMatch(/if \(p\.ownBlocker == null && blockers\.size > 0\) return "blocked";/);
  });

  it("TurnSlot registers autoStart, and it is false unless the player asks for it", () => {
    const provider = files[1][1];
    expect(provider).toMatch(/autoStart\?: boolean;/);
    expect(provider).toMatch(/autoStart = false,/);
    expect(provider).toMatch(/controller\.register\(\{[\s\S]*?\bautoStart,[\s\S]*?\}\)/);
    expect(files[0][1]).toMatch(/autoStart: reg\.autoStart \?\? false/);
  });

  // The owner's 21-oct-2026 rule is for the hero short and nothing else: the
  // videos modal, a Hall of Fame fight or UFC TV the visitor put on still
  // stay out of view (DECISIONS.md, 30-sep-2026).
  it("TurnSlot registers yieldsToAuto (false unless asked) and only the hero short asks for it", () => {
    const provider = files[1][1];
    expect(provider).toMatch(/yieldsToAuto\?: boolean;/);
    expect(provider).toMatch(/yieldsToAuto = false,/);
    expect(provider).toMatch(/controller\.register\(\{[\s\S]*?\byieldsToAuto,[\s\S]*?\}\)/);
    expect(files[0][1]).toMatch(/yieldsToAuto: reg\.yieldsToAuto \?\? false/);
    const read = (path: string) => readFileSync(fileURLToPath(new URL(path, import.meta.url)), "utf8");
    expect(read("../home/shorts-hero.tsx")).toMatch(/<TurnSlot[\s\S]*?\byieldsToAuto\b[\s\S]*?\/>/);
    for (const path of ["./live-embed-player.tsx", "./click-to-play.tsx", "../video-modal.tsx"]) {
      expect(read(path), path).not.toMatch(/yieldsToAuto/);
    }
  });

  // The hero's ▶ during its entrance (until its headline's font and its intro
  // animation were done) used to answer "not-ready" and do nothing.
  it("no start of the visitor waits for the page: no readiness gate left", () => {
    const [controller, provider] = [files[0][1], files[1][1]];
    expect(controller).not.toMatch(/not-ready|setReady/);
    expect(provider).not.toMatch(/setReady/);
  });

  it("the hook hands the start result to the poster (too-small → YouTube)", () => {
    const provider = files[1][1];
    expect(provider).toMatch(/userStart: useCallback\(\(\): StartResult => controller\.userStart\(id\)/);
  });

  it("the provider hands every focus change to the controller (a focused poster holds its automatic start)", () => {
    const provider = files[1][1];
    expect(provider).toMatch(/const onFocusChange = \(\) => controller\.focusChanged\(\);/);
    for (const type of ["focusin", "focusout"]) {
      expect(provider).toContain(`document.addEventListener("${type}", onFocusChange);`);
      expect(provider).toContain(`document.removeEventListener("${type}", onFocusChange);`);
    }
  });

  it("the provider hands every tap on the page to the controller, in the capture phase (before the focus moves)", () => {
    const provider = files[1][1];
    expect(provider).toMatch(/const onPointerDown = \(\) => controller\.pagePointerDown\(\);/);
    expect(provider).toMatch(/window\.addEventListener\("pointerdown", onPointerDown, true\);/);
    expect(provider).toMatch(/window\.removeEventListener\("pointerdown", onPointerDown, true\);/);
  });

  // pagehide may be the page going into the back/forward cache, to come back
  // as it was: it has to stay a hidden tab and nothing more, so the visitor's
  // player is still there on the way back (DECISIONS.md, 30-sep-2026). What a
  // hidden tab does is tested above; this pins the wiring that leads there,
  // and e2e/hero-shorts.spec.ts checks it in a real browser.
  it("pagehide is a hidden tab and nothing more (the back/forward cache), and pageshow brings the automatic player back", () => {
    const provider = files[1][1];
    expect(provider).toMatch(/const onPageHide = \(\) => controller\.setPageVisible\(false\);/);
    expect(provider).toMatch(/window\.addEventListener\("pagehide", onPageHide\);/);
    expect(provider).toMatch(
      /const onPageShow = \(\) => \{\s*if \(document\.visibilityState === "visible"\) controller\.setPageVisible\(true\);\s*\};/,
    );
    expect(provider).toMatch(/window\.addEventListener\("pageshow", onPageShow\);/);
    // One pagehide listener in the whole turn manager: no second one that
    // takes the players away behind this one's back.
    const listeners = files.flatMap(([, source]) => source.match(/addEventListener\("pagehide"/g) ?? []);
    expect(listeners).toHaveLength(1);
  });
});
