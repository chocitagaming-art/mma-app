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
  controller.register({ id: "tv-bucle", element: tv, onMount: (owner) => mounts.push(`tv:${owner}`) });
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

describe("turn controller · more than half visible for 0.4 s", () => {
  it("mounts only after the dwell, as automatic", () => {
    const { controller, see, advance, hero, mounts } = setup();
    see(hero, 0.8);
    advance(300);
    expect(controller.getView("hero").mounted).toBe(false);
    advance(200);
    expect(controller.getView("hero")).toMatchObject({ mounted: true, owner: "auto" });
    expect(mounts).toEqual(["hero:auto"]);
  });

  it("a fast scroll (above half for 200 ms, then out) never mounts anything", () => {
    const { controller, see, advance, hero } = setup();
    see(hero, 0.9);
    advance(200);
    see(hero, 0.3);
    advance(2_000);
    expect(controller.getView("hero").mounted).toBe(false);
  });

  it("exactly half is not «more than half»: an automatic player is unmounted at once", () => {
    const { controller, see, advance, hero } = setup();
    see(hero, 0.9);
    advance(500);
    expect(controller.getView("hero").mounted).toBe(true);
    see(hero, 0.5);
    expect(controller.getView("hero").mounted).toBe(false);
  });
});

describe("turn controller · only one at a time", () => {
  it("two above half: the larger visible area; when it drops, the other takes over in the same commit", () => {
    const { controller, see, advance, hero, tv, worst } = setup();
    see(hero, 0.6);
    see(tv, 0.9);
    advance(500);
    expect(controller.getView("tv-bucle").mounted).toBe(true);
    expect(controller.getView("hero").mounted).toBe(false);
    see(tv, 0.2);
    expect(controller.getView("tv-bucle").mounted).toBe(false);
    expect(controller.getView("hero").mounted).toBe(true);
    expect(worst.mounted).toBe(1);
  });

  it("what the visitor starts takes the turn from an automatic player", () => {
    const { controller, see, advance, hero, tv, worst } = setup();
    see(tv, 1);
    advance(500);
    see(hero, 0.3);
    controller.userStart("hero");
    expect(controller.getView("hero")).toMatchObject({ mounted: true, owner: "user" });
    expect(controller.getView("tv-bucle").mounted).toBe(false);
    expect(worst.mounted).toBe(1);
  });
});

describe("turn controller · hidden tab", () => {
  it("everything is unmounted; the automatic one comes back when the tab does", () => {
    const { controller, see, advance, hero } = setup();
    see(hero, 1);
    advance(500);
    controller.setPageVisible(false);
    expect(controller.getView("hero").mounted).toBe(false);
    controller.setPageVisible(true);
    expect(controller.getView("hero")).toMatchObject({ mounted: true, owner: "auto" });
  });

  it("what the visitor started waits for a tap («Seguir») instead of coming back on its own", () => {
    const { controller, see, hero } = setup();
    see(hero, 0.3);
    controller.userStart("hero");
    controller.setPageVisible(false);
    expect(controller.getView("hero")).toMatchObject({ mounted: false, waiting: true });
    controller.setPageVisible(true);
    expect(controller.getView("hero").mounted).toBe(false);
    // Out of sight it goes back to being an ordinary participant.
    see(hero, 0);
    expect(controller.getView("hero").waiting).toBe(false);
  });

  it("a tab that starts hidden mounts nothing", () => {
    const browser = fakeBrowser();
    browser.page.visible = false;
    const controller = createTurnController(browser.env);
    const hero = box();
    controller.register({ id: "hero", element: hero });
    controller.start();
    browser.see(hero, 1);
    browser.advance(1_000);
    expect(controller.getView("hero").mounted).toBe(false);
  });
});

describe("turn controller · prefers-reduced-motion", () => {
  it("nothing starts on its own, and turning it on stops the automatic one; a tap still plays", () => {
    const { controller, see, advance, hero, page } = setup();
    see(hero, 1);
    advance(500);
    page.reduced = true;
    controller.reducedMotionChanged();
    expect(controller.getView("hero").mounted).toBe(false);
    advance(5_000);
    expect(controller.getView("hero").mounted).toBe(false);
    controller.userStart("hero");
    expect(controller.getView("hero")).toMatchObject({ mounted: true, owner: "user" });
  });
});

describe("turn controller · touched by the visitor", () => {
  it("a tap inside its iframe (window blur + the iframe focused) makes it the visitor's, and the timer leaves it", () => {
    const { controller, see, advance, hero, page } = setup();
    see(hero, 1);
    advance(500);
    const iframe = {};
    controller.setIframe("hero", iframe);
    page.active = iframe;
    controller.windowBlurred();
    advance(0);
    expect(controller.getView("hero")).toMatchObject({ mounted: true, owner: "user", touched: true });
    expect(controller.timerFired("hero")).toBe("stay");
    expect(controller.getView("hero").mounted).toBe(true);
  });

  it("a blur with the focus somewhere else (another tab, another app) touches nothing", () => {
    const { controller, see, advance, hero, page } = setup();
    see(hero, 1);
    advance(500);
    controller.setIframe("hero", {});
    page.active = null;
    controller.windowBlurred();
    advance(0);
    expect(controller.getView("hero")).toMatchObject({ owner: "auto", touched: false });
  });
});

describe("turn controller · the carousel timer", () => {
  it("untouched and still more than half visible: the next short is a new automatic mount", () => {
    const { controller, see, advance, hero, mounts } = setup();
    see(hero, 1);
    advance(500);
    const before = controller.getView("hero").mountCount;
    expect(controller.timerFired("hero")).toBe("next");
    expect(controller.getView("hero")).toMatchObject({ mounted: true, owner: "auto", mountCount: before + 1 });
    expect(mounts).toEqual(["hero:auto", "hero:auto"]);
  });

  it("started with «Siguiente» and now at 30 %: back to the poster, and the turn is free", () => {
    const { controller, see, advance, hero, tv } = setup();
    see(hero, 0.3);
    see(tv, 0.9);
    controller.userStart("hero");
    advance(500);
    expect(controller.getView("hero").mounted).toBe(true);
    expect(controller.timerFired("hero")).toBe("release");
    expect(controller.getView("hero").mounted).toBe(false);
    expect(controller.getView("tv-bucle").mounted).toBe(true);
  });

  it("a timer of a player that no longer holds the turn does nothing", () => {
    const { controller } = setup();
    expect(controller.timerFired("hero")).toBeNull();
  });
});

describe("turn controller · blockers, pause and size", () => {
  it("a blocker (menu or sheet) unmounts everything, and nothing comes back until it closes", () => {
    const { controller, see, advance, hero } = setup();
    see(hero, 1);
    advance(500);
    controller.addBlocker("menu");
    expect(controller.getView("hero").mounted).toBe(false);
    controller.userStart("hero");
    expect(controller.getView("hero").mounted).toBe(false);
    controller.removeBlocker("menu");
    expect(controller.getView("hero").mounted).toBe(true);
  });

  it("pause: unmounted and never starts on its own; resume is the visitor's", () => {
    const { controller, see, advance, hero } = setup();
    see(hero, 1);
    advance(500);
    controller.pause("hero");
    expect(controller.getView("hero")).toMatchObject({ mounted: false, paused: true });
    advance(5_000);
    expect(controller.getView("hero").mounted).toBe(false);
    controller.resume("hero");
    expect(controller.getView("hero")).toMatchObject({ mounted: true, owner: "user", paused: false });
  });

  it("under 200x200 it never mounts, and one that shrinks loses the turn on the next resize", () => {
    const { controller, see, advance, hero, resize } = setup();
    hero.size.width = 120;
    hero.size.height = 213;
    see(hero, 1);
    advance(500);
    expect(controller.getView("hero").mounted).toBe(false);
    hero.size.width = 330;
    hero.size.height = 587;
    resize();
    expect(controller.getView("hero").mounted).toBe(true);
    hero.size.width = 199;
    resize();
    expect(controller.getView("hero").mounted).toBe(false);
  });

  it("not ready (fonts, intro animation): not eligible yet; becoming ready mounts with no scroll or resize", () => {
    // A visitor who does not move: the dwell re-evaluation has already fired
    // and no IntersectionObserver / ResizeObserver event will come. Becoming
    // ready must be enough on its own (the mockup: heroReady = true; evaluate()).
    const browser = fakeBrowser();
    const controller = createTurnController(browser.env);
    const hero = box();
    controller.register({ id: "hero", element: hero, ready: false });
    controller.start();
    browser.see(hero, 1);
    browser.advance(1_000);
    expect(controller.getView("hero").mounted).toBe(false);
    controller.setReady("hero", true);
    expect(controller.getView("hero")).toMatchObject({ mounted: true, owner: "auto" });
    browser.advance(60_000);
    expect(controller.getView("hero").mounted).toBe(true);
  });

  it("going back to not ready takes the turn away; setReady on an unknown id does nothing", () => {
    const { controller, see, advance, hero } = setup();
    see(hero, 1);
    advance(500);
    expect(controller.getView("hero").mounted).toBe(true);
    controller.setReady("hero", false);
    expect(controller.getView("hero").mounted).toBe(false);
    expect(() => controller.setReady("nada", true)).not.toThrow();
  });
});

describe("turn controller · what the visitor starts also needs 200x200", () => {
  it("userStart on a 150x150 box does not mount and says why (the poster opens the sheet)", () => {
    const { controller, see, hero } = setup();
    hero.size.width = 150;
    hero.size.height = 150;
    see(hero, 1);
    expect(controller.userStart("hero")).toBe("too-small");
    expect(controller.getView("hero").mounted).toBe(false);
    expect(controller.resume("hero")).toBe("too-small");
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

  it("not ready yet: refused too, until it is", () => {
    const browser = fakeBrowser();
    const controller = createTurnController(browser.env);
    const hero = box();
    controller.register({ id: "hero", element: hero, ready: false });
    controller.start();
    browser.see(hero, 0.3);
    expect(controller.userStart("hero")).toBe("not-ready");
    expect(controller.getView("hero").mounted).toBe(false);
    controller.setReady("hero", true);
    expect(controller.userStart("hero")).toBe("started");
    expect(controller.getView("hero")).toMatchObject({ mounted: true, owner: "user" });
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
});

describe("turn controller · lifecycle", () => {
  it("unregistering the holder frees the turn for the next one", () => {
    const browser = fakeBrowser();
    const controller = createTurnController(browser.env);
    const hero = box();
    const tv = box(1024, 576);
    const offHero = controller.register({ id: "hero", element: hero });
    controller.register({ id: "tv-bucle", element: tv });
    controller.start();
    browser.see(hero, 1);
    browser.see(tv, 0.9);
    browser.advance(500);
    expect(controller.getView("tv-bucle").mounted).toBe(true);
    controller.userStart("hero");
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
    const hero = box();
    controller.register({ id: "hero", element: hero });
    expect(browser.liveIO().observed.has(hero)).toBe(true);
    browser.see(hero, 1);
    browser.advance(500);
    expect(controller.getView("hero").mounted).toBe(true);
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
    expect(controller).toMatch(/timerAction\(snapshot\(\), id, p\.touched\)/);
    const provider = files[1][1];
    expect(provider).not.toMatch(/decideTurn|mayAutoplay|timerAction\(/);
  });

  it("TurnSlot tells the controller when `ready` changes, so a still visitor still gets the player", () => {
    const provider = files[1][1];
    expect(provider).toMatch(/ready\?: boolean;/);
    expect(provider).toMatch(/useEffect\(\(\) => \{\s*controller\.setReady\(id, ready\);\s*\}, \[controller, id, ready\]\);/);
    // No readiness callback that nobody can re-trigger.
    expect(provider).not.toMatch(/isReady/);
  });

  it("the hook hands the start result to the poster (too-small → the sheet, as in the mockup)", () => {
    const provider = files[1][1];
    expect(provider).toMatch(/userStart: useCallback\(\(\): StartResult => controller\.userStart\(id\)/);
    expect(provider).toMatch(/resume: useCallback\(\(\): StartResult => controller\.resume\(id\)/);
  });
});
