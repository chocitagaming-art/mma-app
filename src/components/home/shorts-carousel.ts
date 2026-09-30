// The home hero's list of shorts: WHICH short the visitor's next start plays,
// which one the poster shows, and how long one stays. Pure (no React, no DOM,
// no clock), so it runs in the node tests; shorts-hero.tsx wires it to the
// turn manager.
//
// Ported from the mockup (maqueta-shorts/escena.js: heroCursor, heroCurrent,
// shortTimerMs, and the labels of render()). WHO may play and WHEN is not
// decided here but in lib/playback-turn.ts. Since 30-sep-2026 (night) nothing
// here moves on its own: the poster shows a short (the most recent one at
// first), its ▶ plays it, «Siguiente ›» plays the one after the last one
// played, and when a short ends the poster shows the next one, for a tap.
//
// Why a tiny store and not React state: the turn manager calls onMount
// synchronously and notifies its subscribers right after. A setState there
// could land in a later render than the one that mounts the <iframe>, which
// would load the OLD short first and then navigate it to the new one. Read
// through useSyncExternalStore, this store is read in the SAME render that
// mounts it.

// Player start-up margin on top of the duration. It counts from the iframe's
// load and not from the first frame (without the JS API there is no way to
// know when it starts): a slow network or an ad can cut a short's last seconds.
// That is the price of not using the API (DECISIONS.md, 29-sep-2026).
export const TIMER_EXTRA_MS = 2_500;
// A short is 180 s at most (lib/ufc-shorts.ts); the cap guards a bad duration.
export const TIMER_CAP_MS = 190_000;

/** How long a short stays mounted before the hero's timer fires. */
export function shortTimerMs(seconds: number): number {
  const ms = Math.max(0, seconds) * 1000 + TIMER_EXTRA_MS;
  return Math.min(ms, TIMER_CAP_MS);
}

export type CarouselSnapshot = {
  // The short on screen, or the last one played (null before the first).
  current: number | null;
  // The short the poster shows, and its ▶ plays: the one after the last
  // played (the most recent short before any).
  cursor: number;
};

export type ShortsCarousel = ReturnType<typeof createShortsCarousel>;

export function createShortsCarousel(length: number) {
  if (!Number.isInteger(length) || length < 1) {
    throw new Error("createShortsCarousel needs at least one short");
  }
  let snapshot: CarouselSnapshot = { current: null, cursor: 0 };
  // What the visitor asked for (their ▶ or «Siguiente ›»), for the mount that
  // their start is about to trigger.
  let queued: number | null = null;
  const listeners = new Set<() => void>();

  function wrap(index: number): number {
    return ((index % length) + length) % length;
  }

  return {
    /** The short a visitor's start will play; call before userStart(). */
    queue(index: number) {
      queued = wrap(index);
    },

    /** The start was refused (too small, blocked...): forget the request. */
    clearQueue() {
      queued = null;
    },

    /**
     * The turn manager mounted the hero (its onMount): pick the short asked
     * for (the cursor if none was), move the cursor past it and return it.
     */
    take(): number {
      const index = queued ?? snapshot.cursor;
      queued = null;
      snapshot = { current: index, cursor: wrap(index + 1) };
      for (const fn of listeners) fn();
      return index;
    },

    /**
     * «Siguiente ›»: the short after the last one played. While one plays,
     * the one after it; once that one has ended, the same short, which its
     * poster now shows (both are the cursor): letting each short end and
     * tapping «Siguiente ›» plays them all, none skipped. Before any, the one
     * after the poster's, because the poster's is its own ▶.
     */
    nextIndex(): number {
      return wrap((snapshot.current ?? snapshot.cursor) + 1);
    },

    getSnapshot(): CarouselSnapshot {
      return snapshot;
    },

    subscribe(fn: () => void): () => void {
      listeners.add(fn);
      return () => {
        listeners.delete(fn);
      };
    },
  };
}

export type PosterState = {
  // Under 200x200 there is no legal inline player: the tap opens YouTube.
  tooSmall: boolean;
  reducedMotion: boolean;
};

/** The line under the poster's ▶ (as in the mockup's render()). */
export function posterLabel(s: PosterState): string {
  // Short on purpose: under 340 px of screen the poster is ~100 px wide.
  if (s.tooSmall) return "Ver en YouTube";
  if (s.reducedMotion) return "Toca para reproducir";
  return "Toca para ver";
}

/** The short on YouTube, for the tap under 200x200 (no inline player there). */
export function shortWatchUrl(id: string): string {
  return `https://www.youtube.com/shorts/${encodeURIComponent(id)}`;
}
