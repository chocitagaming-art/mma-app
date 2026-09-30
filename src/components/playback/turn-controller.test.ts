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
// 30-sep-2026, night), and UFC TV, which starts on its own when it is seen.

type FakeBox = Element & { size: { width: number; height: number } };

function box(width = 330, height = 587): FakeBox {
  const size = { width, height };
  return { size, getBoundingClientRect: () => ({ ...size }) } as unknown as FakeBox;
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
  controller.register({ id: "hero", element: hero, onMount: (owner) => mounts.push(`hero:${owner}`) });
  controller.register({
    id: "tv-bucle",
    element: tv,
    autoStart: true,
    onMount: (owner) => mounts.push(`tv:${owner}`),
  });
  controller.start();
  const worst = watchSinglePlayer(controller, ["hero", "tv-bucle"]);
  return { ...browser, controller, hero, tv, mounts, worst };
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

  it("the visitor's short takes the turn from UFC TV, and UFC TV does not come back while it is theirs", () => {
    const { controller, see, advance, hero, tv, mounts, worst } = setup();
    see(tv, 1);
    advance(500);
    see(hero, 0.3);
    expect(controller.userStart("hero")).toBe("started");
    expect(controller.getView("hero")).toMatchObject({ mounted: true, owner: "user" });
    expect(controller.getView("tv-bucle").mounted).toBe(false);
    // UFC TV fully in view for far longer than the dwell: it waits.
    advance(10_000);
    expect(controller.getView("tv-bucle").mounted).toBe(false);
    expect(mounts).toEqual(["tv:auto", "hero:user"]);
    expect(worst.mounted).toBe(1);
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
  it("out of view (0 %, as when scrolling in PiP) it stays, and no automatic player starts meanwhile", () => {
    const { controller, see, advance, hero, tv, worst } = setup();
    see(hero, 0.9);
    controller.userStart("hero");
    see(hero, 0);
    see(tv, 1);
    advance(2_000);
    expect(controller.getView("hero")).toMatchObject({ mounted: true, owner: "user" });
    expect(controller.getView("tv-bucle").mounted).toBe(false);
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
  // button (no tap inside): it stays while it plays, and its end closes it.
  it("started with a tap and never touched, out of view: it stays while it plays, and its timer frees the turn for UFC TV", () => {
    const { controller, see, advance, hero, tv, mounts, worst } = setup();
    see(hero, 0.9);
    controller.userStart("hero");
    see(hero, 0);
    see(tv, 1);
    advance(15_000);
    expect(controller.getView("hero")).toMatchObject({ mounted: true, owner: "user", touched: false });
    expect(controller.getView("tv-bucle").mounted).toBe(false);
    expect(controller.timerFired("hero")).toBe("release");
    expect(controller.getView("hero")).toMatchObject({ mounted: false, owner: null });
    expect(controller.getView("tv-bucle")).toMatchObject({ mounted: true, owner: "auto" });
    expect(mounts).toEqual(["hero:user", "tv:auto"]);
    expect(worst.mounted).toBe(1);
  });

  it("the same short touched inside (a PiP from YouTube's own button) stays at its timer, and UFC TV keeps waiting", () => {
    const { controller, see, advance, hero, tv, page, worst } = setup();
    see(hero, 0.9);
    controller.userStart("hero");
    const iframe = {};
    controller.setIframe("hero", iframe);
    page.active = iframe;
    controller.windowBlurred();
    advance(0);
    see(hero, 0);
    see(tv, 1);
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

  it("TurnSlot registers autoStart, and it is false unless the player asks for it", () => {
    const provider = files[1][1];
    expect(provider).toMatch(/autoStart\?: boolean;/);
    expect(provider).toMatch(/autoStart = false,/);
    expect(provider).toMatch(/controller\.register\(\{[\s\S]*?\bautoStart,[\s\S]*?\}\)/);
    expect(files[0][1]).toMatch(/autoStart: reg\.autoStart \?\? false/);
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
