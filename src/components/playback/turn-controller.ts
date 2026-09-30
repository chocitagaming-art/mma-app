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
//   · hidden tab / pagehide → everything is unmounted; what the visitor had
//     started waits for a tap («Seguir») instead of coming back on its own;
//   · prefers-reduced-motion → decideTurn never starts anything on its own;
//   · "touched": a tap INSIDE a player's iframe blurs the window and leaves
//     that iframe as document.activeElement. That makes it the visitor's, and
//     the carousel timer leaves it alone. Nothing is sent to YouTube: no
//     postMessage, no iframe_api, no enablejsapi.
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
  isReady?: () => boolean;
  // Called synchronously on every mount: the carousel picks its short here.
  onMount?: (owner: TurnOwner) => void;
};

export type PlayerView = {
  mounted: boolean;
  owner: TurnOwner | null;
  // Grows on every mount: key the <iframe> on it so each mount is a new one.
  mountCount: number;
  paused: boolean;
  // The visitor's player after a hidden tab: the poster says «Seguir».
  waiting: boolean;
  touched: boolean;
};

export const IDLE_VIEW: PlayerView = Object.freeze({
  mounted: false,
  owner: null,
  mountCount: 0,
  paused: false,
  waiting: false,
  touched: false,
});

// Around half, so the observer reports every crossing of "more than half".
const THRESHOLDS = [0, HALF, 0.51, 1];

type Entry = {
  id: string;
  priority: number;
  element: Element;
  isReady: () => boolean;
  onMount?: (owner: TurnOwner) => void;
  iframe: unknown;
  ratio: number;
  area: number;
  aboveSince: number | null;
  paused: boolean;
  waiting: boolean;
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
      v.waiting === p.waiting &&
      v.touched === p.touched
    ) {
      return v;
    }
    return {
      mounted: p.mounted,
      owner: p.owner,
      mountCount: p.mountCount,
      paused: p.paused,
      waiting: p.waiting,
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
    return p.isReady() && fitsMinimum(p.element.getBoundingClientRect());
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
        paused: p.paused || p.waiting,
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

  function evaluate() {
    if (!started) return;
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
      // «Seguir» only waits while it is on screen; out of sight it goes back
      // to being an ordinary participant.
      if (p.ratio === 0) p.waiting = false;
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

  // What the visitor starts is theirs.
  function userStart(id: string) {
    const p = players.get(id);
    if (!p || blockers.size > 0) return;
    p.paused = false;
    p.waiting = false;
    const holder = current ? players.get(current.id) : undefined;
    if (holder) unmount(holder);
    current = null;
    mount(p, "user");
    current = { id: p.id, owner: "user" };
    commit();
  }

  return {
    register(reg: PlayerRegistration): () => void {
      const p: Entry = {
        id: reg.id,
        priority: reg.priority ?? PRIORITY[reg.id] ?? 0,
        element: reg.element,
        isReady: reg.isReady ?? (() => true),
        onMount: reg.onMount,
        iframe: null,
        ratio: 0,
        area: 0,
        aboveSince: null,
        paused: false,
        waiting: false,
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

    setPageVisible(visible: boolean) {
      if (visible === pageVisible) return;
      pageVisible = visible;
      if (visible) {
        evaluate();
        return;
      }
      const holder = current ? players.get(current.id) : undefined;
      if (current && holder) {
        if (current.owner === "user") holder.waiting = true;
        unmount(holder);
      }
      current = null;
      commit();
    },

    reducedMotionChanged() {
      evaluate();
    },

    // window "blur": after this task, is the focus inside the holder's iframe?
    windowBlurred() {
      later(() => {
        const p = current ? players.get(current.id) : undefined;
        if (!p || !p.iframe || env.activeElement() !== p.iframe) return;
        p.touched = true;
        p.owner = "user";
        current = { id: p.id, owner: "user" };
        commit();
      }, 0);
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
