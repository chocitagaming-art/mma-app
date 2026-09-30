import { describe, expect, it, vi } from "vitest";

import {
  TIMER_CAP_MS,
  TIMER_EXTRA_MS,
  createShortsCarousel,
  posterLabel,
  shortTimerMs,
  shortWatchUrl,
} from "@/components/home/shorts-carousel";

// The hero's list of shorts, in node. Who may play is lib/playback-turn.ts
// (its own tests); this is only "which short" and "for how long". Since
// 30-sep-2026 (night) nothing here moves on its own: the poster shows a short,
// its ▶ plays it, «Siguiente ›» plays the one after, and at the end of a short
// the poster shows the next one, waiting for a tap.

describe("shortTimerMs", () => {
  it("is the duration plus 2.5 s, counted from the iframe's load", () => {
    expect(TIMER_EXTRA_MS).toBe(2_500);
    expect(shortTimerMs(15)).toBe(17_500);
    expect(shortTimerMs(58)).toBe(60_500);
  });

  it("never goes over the cap, nor below the margin", () => {
    expect(shortTimerMs(180)).toBe(182_500);
    expect(shortTimerMs(200)).toBe(TIMER_CAP_MS);
    expect(shortTimerMs(10_000)).toBe(TIMER_CAP_MS);
    expect(shortTimerMs(-5)).toBe(TIMER_EXTRA_MS);
  });
});

describe("createShortsCarousel", () => {
  it("refuses an empty list: the hero shows its own poster instead", () => {
    expect(() => createShortsCarousel(0)).toThrow();
  });

  it("at first the poster shows the most recent short, and its ▶ plays that one", () => {
    const c = createShortsCarousel(4);
    expect(c.getSnapshot()).toEqual({ current: null, cursor: 0 });
    c.queue(c.getSnapshot().cursor);
    expect(c.take()).toBe(0);
    expect(c.getSnapshot()).toEqual({ current: 0, cursor: 1 });
  });

  it("when a short ends, its poster shows the next one, ready for a tap", () => {
    const c = createShortsCarousel(4);
    c.queue(0);
    c.take();
    // The turn manager takes the iframe away: the poster reads the cursor.
    expect(c.getSnapshot().cursor).toBe(1);
  });

  it("«Siguiente ›» while a short plays: the next one", () => {
    const c = createShortsCarousel(5);
    c.queue(0);
    c.take();
    expect(c.nextIndex(true)).toBe(1);
    c.queue(c.nextIndex(true));
    expect(c.take()).toBe(1);
    expect(c.nextIndex(true)).toBe(2);
  });

  it("«Siguiente ›» from the poster: the one AFTER the poster's (the poster's is its ▶)", () => {
    const c = createShortsCarousel(5);
    // Nothing played yet: the poster shows the first; «Siguiente ›» skips it.
    expect(c.nextIndex(false)).toBe(1);
    c.queue(0);
    c.take();
    // The first ended: the poster shows the second; «Siguiente ›», the third.
    expect(c.nextIndex(false)).toBe(2);
  });

  it("wraps around at the end of the list", () => {
    const c = createShortsCarousel(3);
    for (const index of [0, 1, 2]) {
      c.queue(index);
      c.take();
    }
    expect(c.getSnapshot()).toEqual({ current: 2, cursor: 0 });
    expect(c.nextIndex(true)).toBe(0);
    expect(c.nextIndex(false)).toBe(1);
  });

  it("a visitor's start plays what they asked for, once", () => {
    const c = createShortsCarousel(4);
    c.queue(2);
    expect(c.take()).toBe(2);
    // The queue is spent: a mount with nothing asked would take the cursor.
    expect(c.take()).toBe(3);
  });

  it("a refused start leaves nothing queued", () => {
    const c = createShortsCarousel(3);
    c.queue(2);
    c.clearQueue();
    expect(c.take()).toBe(0);
  });

  it("notifies on every take with a new snapshot object", () => {
    const c = createShortsCarousel(2);
    const fn = vi.fn();
    const off = c.subscribe(fn);
    const before = c.getSnapshot();
    c.take();
    expect(fn).toHaveBeenCalledTimes(1);
    expect(c.getSnapshot()).not.toBe(before);
    off();
    c.take();
    expect(fn).toHaveBeenCalledTimes(1);
  });
});

describe("the poster", () => {
  const base = { tooSmall: false, reducedMotion: false };

  it("labels: tap to watch, tap to play with reduced motion, YouTube under 200x200", () => {
    expect(posterLabel(base)).toBe("Toca para ver");
    expect(posterLabel({ ...base, reducedMotion: true })).toBe("Toca para reproducir");
    expect(posterLabel({ tooSmall: true, reducedMotion: true })).toBe("Ver en YouTube");
  });

  it("no label talks of a pause any more: nothing plays on its own, so nothing is paused", () => {
    for (const tooSmall of [false, true]) {
      for (const reducedMotion of [false, true]) {
        expect(posterLabel({ tooSmall, reducedMotion })).not.toMatch(/pausa|seguir/i);
      }
    }
  });

  it("under 200x200 the tap goes to the short on YouTube", () => {
    expect(shortWatchUrl("fixShort-01")).toBe("https://www.youtube.com/shorts/fixShort-01");
  });
});
