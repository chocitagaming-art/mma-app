import {
  DWELL_MS,
  HALF,
  PRIORITY,
  decideTurn,
  fitsMinimum,
  timerAction,
  type TimerAction,
  type Turn,
  type TurnOwner,
  type TurnState,
} from "@/lib/playback-turn";

// The browser half of the turn manager, WITHOUT React and without touching
// `window` directly: it gets its browser as an argument (TurnEnvironment).
// playback-turn-provider.tsx passes the real one; turn-controller.test.ts a
// fake one, because the project's vitest runs without a DOM.
//
// It only turns browser events into the state that lib/playback-turn.ts
// decides on, and applies the decision (mount / unmount). Ported from the
// mockup's page half (maqueta-shorts/escena.js, "The page"):
//   · one IntersectionObserver for every player, with the sticky header band
//     taken off the top (rootMargin), re-created when the header resizes;
//   · a player that goes above half visible is re-evaluated DWELL_MS later;
//   · hidden tab / pagehide → the automatic player is unmounted and comes
//     back on its own; the visitor's stays (DECISIONS.md, 30-sep-2026);
//   · prefers-reduced-motion → decideTurn never starts anything on its own;
//   · "touched": a tap INSIDE a player's iframe blurs the window and leaves
//     that iframe as document.activeElement. That makes it the visitor's, and
//     the carousel timer leaves it alone. As a net, every decision and every
//     tap on the page first look where the focus is (noticeTouch). Nothing is
//     sent to YouTube: no postMessage, no iframe_api, no enablejsapi.
//
// "Mounted" is state here; the React slot renders the <iframe> only while its
// view says so, and re-creates it when mountCount changes.

export type IntersectionEntryLike = {
  target: Element;
  isIntersecting: boolean;
  intersectionRatio: number;
  intersectionRect: { width: number; height: number };
};

export type ObserverLike = {
  observe(el: Element): void;
  unobserve(el: Element): void;
  disconnect(): void;
};

export type TurnEnvironment = {
  now(): number;
  setTimeout(fn: () => void, ms: number): unknown;
  clearTimeout(handle: unknown): void;
  createIntersectionObserver(
    cb: (entries: IntersectionEntryLike[]) => void,
    options: { rootMargin: string; threshold: number[] },
  ): ObserverLike;
  // Called when any player box changes size (eligibility may change).
  createResizeObserver(cb: () => void): ObserverLike;
  isPageVisible(): boolean;
  prefersReducedMotion(): boolean;
  headerHeight(): number;
  activeElement(): unknown;
};

export type PlayerRegistration = {
  id: string;
  // Defaults to PRIORITY[id] (lib/playback-turn.ts), or 0.
  priority?: number;
  element: Element;
  // False while the player must not be mounted yet (fonts, intro animation).
  // Defaults to true. Change it with setReady(): that re-evaluates at once,
  // because a visitor who does not scroll sends no other event.
  ready?: boolean;
  // Called synchronously on every mount: the carousel picks its short here.
  onMount?: (owner: TurnOwner) => void;
};

export type PlayerView = {
  mounted: boolean;
  owner: TurnOwner | null;
  // Grows on every mount: key the <iframe> on it so each mount is a new one.
  mountCount: number;
  paused: boolean;
  touched: boolean;
};

// What a visitor's tap on the poster got. "too-small": under MIN_PLAYER_PX
// there is no legal inline player, so the poster sends the visitor to the
// sheet instead (as the mockup does). Nothing is mounted unless "started".
export type StartResult = "started" | "too-small" | "not-ready" | "blocked" | "unknown";

export const IDLE_VIEW: PlayerView = Object.freeze({
  mounted: false,
  owner: null,
  mountCount: 0,
  paused: false,
  touched: false,
});

// Around half, so the observer reports every crossing of "more than half".
const THRESHOLDS = [0, HALF, 0.51, 1];

type Entry = {
  id: string;
  priority: number;
  element: Element;
  ready: boolean;
  onMount?: (owner: TurnOwner) => void;
  iframe: unknown;
  ratio: number;
  area: number;
  aboveSince: number | null;
  paused: boolean;
  touched: boolean;
  mounted: boolean;
  owner: TurnOwner | null;
  mountCount: number;
  view: PlayerView;
};

export type TurnController = ReturnType<typeof createTurnController>;

export function createTurnController(env: TurnEnvironment) {
  const players = new Map<string, Entry>();
  const byElement = new Map<Element, Entry>();
  const blockers = new Set<string>();
  const listeners = new Set<() => void>();
  const timers = new Set<unknown>();
  let current: Turn | null = null;
  let started = false;
  let pageVisible = true;
  let io: ObserverLike | null = null;
  let ro: ObserverLike | null = null;

  function later(fn: () => void, ms: number) {
    const handle = env.setTimeout(() => {
      timers.delete(handle);
      fn();
    }, ms);
    timers.add(handle);
  }

  function viewOf(p: Entry): PlayerView {
    const v = p.view;
    if (
      v.mounted === p.mounted &&
      v.owner === p.owner &&
      v.mountCount === p.mountCount &&
      v.paused === p.paused &&
      v.touched === p.touched
    ) {
      return v;
    }
    return {
      mounted: p.mounted,
      owner: p.owner,
      mountCount: p.mountCount,
      paused: p.paused,
      touched: p.touched,
    };
  }

  // New view objects only for what changed, then ONE notification: React
  // renders the unmount of one player and the mount of the next in the same
  // commit, so the browser never paints two.
  function commit() {
    let changed = false;
    for (const p of players.values()) {
      const next = viewOf(p);
      if (next !== p.view) {
        p.view = next;
        changed = true;
      }
    }
    if (changed) {
      for (const fn of listeners) fn();
    }
  }

  function eligible(p: Entry): boolean {
    return p.ready && fitsMinimum(p.element.getBoundingClientRect());
  }

  function snapshot(): TurnState {
    return {
      now: env.now(),
      pageVisible,
      blocked: blockers.size > 0,
      reducedMotion: env.prefersReducedMotion(),
      current,
      players: [...players.values()].map((p) => ({
        id: p.id,
        priority: p.priority,
        ratio: p.ratio,
        area: p.area,
        aboveSince: p.aboveSince,
        paused: p.paused,
        eligible: eligible(p),
      })),
    };
  }

  function mount(p: Entry, owner: TurnOwner) {
    p.mounted = true;
    p.owner = owner;
    p.mountCount += 1;
    p.touched = false;
    p.onMount?.(owner);
  }

  function unmount(p: Entry) {
    p.mounted = false;
    p.owner = null;
    p.touched = false;
    p.iframe = null;
  }

  // Unmount the old one and mount the new one in the same task.
  function apply(next: Turn | null) {
    if (current && next && current.id === next.id) {
      current = next;
      const p = players.get(next.id);
      if (p) p.owner = next.owner;
      return;
    }
    const holder = current ? players.get(current.id) : undefined;
    if (holder) unmount(holder);
    current = null;
    const p = next ? players.get(next.id) : undefined;
    if (next && p) {
      mount(p, next.owner);
      current = next;
    }
  }

  // Is the focus inside the holder's iframe? Then the visitor touched it
  // (sound, pause, full screen, PiP): from now on it is theirs, and the
  // carousel timer leaves it as they left it. Returns whether it changed.
  //
  // The window blur is the usual sign (windowBlurred), but WebKit fires it
  // only when a frame of the page had the focus before
  // (FocusController::setFocusedFrame): a first tap inside the iframe may
  // move the focus there with no blur at all. So every decision that could
  // take the holder away, and every tap on the page (pagePointerDown), look
  // here first.
  function noticeTouch(): boolean {
    const p = current ? players.get(current.id) : undefined;
    if (!p || p.touched || !p.iframe || env.activeElement() !== p.iframe) return false;
    p.touched = true;
    p.owner = "user";
    current = { id: p.id, owner: "user" };
    return true;
  }

  function evaluate() {
    if (!started) return;
    noticeTouch();
    apply(decideTurn(snapshot()));
    commit();
  }

  function onIntersect(entries: IntersectionEntryLike[]) {
    for (const e of entries) {
      const p = byElement.get(e.target);
      if (!p) continue;
      p.ratio = e.isIntersecting ? e.intersectionRatio : 0;
      p.area = e.isIntersecting ? e.intersectionRect.width * e.intersectionRect.height : 0;
      if (p.ratio > HALF) {
        if (p.aboveSince == null) {
          p.aboveSince = env.now();
          later(evaluate, DWELL_MS + 20);
        }
      } else {
        p.aboveSince = null;
      }
    }
    evaluate();
  }

  function observe() {
    if (!started) return;
    const headerPx = Math.max(0, Math.round(env.headerHeight()));
    io?.disconnect();
    io = env.createIntersectionObserver(onIntersect, {
      rootMargin: `-${headerPx}px 0px 0px 0px`,
      threshold: THRESHOLDS,
    });
    for (const p of players.values()) io.observe(p.element);
  }

  // What the visitor starts is theirs, but only in a legal player: the 200x200
  // minimum holds for a tap too, and nothing mounts before the page is ready.
  // A refused start leaves the current holder alone.
  function userStart(id: string): StartResult {
    const p = players.get(id);
    if (!p) return "unknown";
    if (blockers.size > 0) return "blocked";
    if (!p.ready) return "not-ready";
    if (!fitsMinimum(p.element.getBoundingClientRect())) return "too-small";
    p.paused = false;
    const holder = current ? players.get(current.id) : undefined;
    if (holder) unmount(holder);
    current = null;
    mount(p, "user");
    current = { id: p.id, owner: "user" };
    commit();
    return "started";
  }

  return {
    register(reg: PlayerRegistration): () => void {
      const p: Entry = {
        id: reg.id,
        priority: reg.priority ?? PRIORITY[reg.id] ?? 0,
        element: reg.element,
        ready: reg.ready ?? true,
        onMount: reg.onMount,
        iframe: null,
        ratio: 0,
        area: 0,
        aboveSince: null,
        paused: false,
        touched: false,
        mounted: false,
        owner: null,
        mountCount: 0,
        view: IDLE_VIEW,
      };
      players.set(p.id, p);
      byElement.set(p.element, p);
      if (started) {
        io?.observe(p.element);
        ro?.observe(p.element);
        evaluate();
      }
      return () => {
        if (players.get(p.id) !== p) return;
        if (current?.id === p.id) {
          unmount(p);
          current = null;
        }
        io?.unobserve(p.element);
        ro?.unobserve(p.element);
        players.delete(p.id);
        byElement.delete(p.element);
        evaluate();
        commit();
      };
    },

    // Creates the observers and starts deciding. Safe to call again after
    // stop() (React StrictMode runs effects twice in development).
    start() {
      if (started) return;
      started = true;
      pageVisible = env.isPageVisible();
      observe();
      ro = env.createResizeObserver(() => evaluate());
      for (const p of players.values()) ro.observe(p.element);
      evaluate();
    },

    stop() {
      started = false;
      io?.disconnect();
      ro?.disconnect();
      io = null;
      ro = null;
      for (const handle of timers) env.clearTimeout(handle);
      timers.clear();
    },

    evaluate,

    // The page finished what the player waits for (fonts, intro animation), or
    // started again. Re-evaluates now: the dwell timer may be long gone.
    setReady(id: string, ready: boolean) {
      const p = players.get(id);
      if (!p || p.ready === ready) return;
      p.ready = ready;
      evaluate();
    },

    headerResized() {
      observe();
    },

    setIframe(id: string, iframe: unknown) {
      const p = players.get(id);
      if (p) p.iframe = iframe;
    },

    userStart,

    pause(id: string) {
      const p = players.get(id);
      if (!p) return;
      p.paused = true;
      if (current?.id === id) {
        unmount(p);
        current = null;
      }
      evaluate();
      commit();
    },

    // «Reanudar» = the visitor starts it again.
    resume: userStart,

    // The carousel timer of `id` fired (duration + 2.5 s after the iframe's
    // load). null when that player no longer holds the turn.
    timerFired(id: string): TimerAction | null {
      const p = players.get(id);
      if (!p || !current || current.id !== id) return null;
      if (noticeTouch()) commit();
      const action = timerAction(snapshot(), id, p.touched);
      if (action === "stay") return action;
      unmount(p);
      if (action === "next") {
        mount(p, "auto");
        current = { id, owner: "auto" };
        commit();
      } else {
        current = null;
        evaluate();
        commit();
      }
      return action;
    },

    addBlocker(name: string) {
      blockers.add(name);
      evaluate();
    },

    removeBlocker(name: string) {
      blockers.delete(name);
      evaluate();
    },

    // Hidden: the automatic player goes (decideTurn), the visitor's stays.
    setPageVisible(visible: boolean) {
      if (visible === pageVisible) return;
      pageVisible = visible;
      evaluate();
    },

    reducedMotionChanged() {
      evaluate();
    },

    // window "blur": after this task, is the focus inside the holder's iframe?
    windowBlurred() {
      later(() => {
        if (noticeTouch()) commit();
      }, 0);
    },

    // A tap or click anywhere on the page, in the capture phase: it runs
    // BEFORE the focus leaves the iframe, so a player the visitor touched
    // with no window blur is already theirs when this tap opens the menu.
    pagePointerDown() {
      if (noticeTouch()) commit();
    },

    getView(id: string): PlayerView {
      return players.get(id)?.view ?? IDLE_VIEW;
    },

    subscribe(fn: () => void): () => void {
      listeners.add(fn);
      return () => {
        listeners.delete(fn);
      };
    },
  };
}
