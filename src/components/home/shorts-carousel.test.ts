import { describe, expect, it, vi } from "vitest";

import {
  TIMER_CAP_MS,
  TIMER_EXTRA_MS,
  createShortsCarousel,
  posterIndex,
  posterLabel,
  shortTimerMs,
  shortWatchUrl,
} from "@/components/home/shorts-carousel";

// The hero's carousel, in node. Who may play is lib/playback-turn.ts (its own
// tests); this is only "which short" and "for how long", as in the mockup.

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

  it("each automatic mount takes the next short, and wraps around", () => {
    const c = createShortsCarousel(3);
    expect(c.getSnapshot()).toEqual({ current: null, cursor: 0 });
    expect([c.take(), c.take(), c.take(), c.take()]).toEqual([0, 1, 2, 0]);
    expect(c.getSnapshot()).toEqual({ current: 0, cursor: 1 });
  });

  it("a visitor's start plays what they asked for, once", () => {
    const c = createShortsCarousel(4);
    c.take(); // 0 on screen, cursor 1
    c.queue(c.resumeIndex()); // «Seguir»: the same one again
    expect(c.take()).toBe(0);
    expect(c.take()).toBe(1); // the queue is spent: back to the cursor
  });

  it("«Siguiente ›» continues from the one on screen", () => {
    const c = createShortsCarousel(5);
    c.take();
    c.take(); // 1 on screen
    c.queue(c.nextIndex());
    expect(c.take()).toBe(2);
  });

  it("a refused start leaves nothing queued", () => {
    const c = createShortsCarousel(3);
    c.queue(2);
    c.clearQueue();
    expect(c.take()).toBe(0);
  });

  it("before anything played, «Seguir» is the first short", () => {
    const c = createShortsCarousel(3);
    expect(c.resumeIndex()).toBe(0);
    expect(c.nextIndex()).toBe(0);
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
  const base = { tooSmall: false, waiting: false, paused: false, reducedMotion: false };

  it("labels, in the mockup's order of precedence", () => {
    expect(posterLabel(base)).toBe("Toca para ver");
    expect(posterLabel({ ...base, reducedMotion: true })).toBe("Toca para reproducir");
    expect(posterLabel({ ...base, reducedMotion: true, paused: true })).toBe(
      "En pausa · toca para seguir",
    );
    expect(posterLabel({ ...base, paused: true, waiting: true })).toBe("Seguir");
    expect(posterLabel({ ...base, waiting: true, tooSmall: true })).toBe("Ver en YouTube");
  });

  it("shows the paused short, or else the next one", () => {
    expect(posterIndex({ current: null, cursor: 0 }, true, false)).toBe(0);
    expect(posterIndex({ current: 3, cursor: 4 }, false, false)).toBe(4);
    expect(posterIndex({ current: 3, cursor: 4 }, true, false)).toBe(3);
    expect(posterIndex({ current: 3, cursor: 4 }, false, true)).toBe(3);
  });

  it("under 200x200 the tap goes to the short on YouTube", () => {
    expect(shortWatchUrl("fixShort-01")).toBe("https://www.youtube.com/shorts/fixShort-01");
  });
});
