import { describe, expect, it } from "vitest";

import {
  PRIORITY,
  clipEmbedUrl,
  clipWatchUrl,
  decideTurn,
  fitsMinimum,
  isYouTubeVideoId,
  loopEmbedUrl,
  normalizeClipRange,
  orderShorts,
  shortEmbedUrl,
  timerAction,
  type TurnPlayer,
  type TurnState,
} from "@/lib/playback-turn";

// Table tests for the pure turn logic. Ported one to one from the mockup
// (maqueta-shorts/turno.test.js, 47 tests on 29-sep-2026), with the same
// inputs and expected outputs; the only rename is orderShorts' field
// (`formato` → `format`, the shape of UfcShort). The rules changed twice on
// 30-sep-2026, in both tables the same way (DECISIONS.md):
//   · what the visitor chose is theirs, and only autoplay obeys the tab, the
//     menu and the half-visible rule;
//   · that night, the hero short stopped starting on its own: it plays only
//     when the visitor starts it, and when it ends no other one starts. UFC
//     TV and the event's broadcast still start on their own. «Pausar» went
//     with it (nothing moves on its own any more), and so did `paused`.
// And once more on 21-oct-2026 (the owner): the visitor's hero short, once
// they scroll it out of view, makes way for the home's slot when that one may
// start on its own («se pare el vídeo de arriba y se ponga el directo»).

const NOW = 100_000;

// A player at `ratio` visible. `since`: how many ms it has been MORE than half
// visible (null = it is not). By default it follows the ratio, as the
// IntersectionObserver does; passing it tests the ratio check on its own.
// `autoStart`, as in production: every player but the hero short (and the
// visitor's clips, which say so). `yieldsToAuto`, as in production: the hero
// short only. `started` / `left`: how many ms ago its mount started (the
// visitor's tap) and it last moved further out of view, to half or less or
// out of it altogether (null = never). Left out, they are what production
// gives the owner's walk, so the cases below go through the same path: the
// short started a minute ago at the top, with nothing else in view
// (`inViewAtStart`: the players more than half in view at that tap), and
// scrolled away 2 s ago when it is half or less in view now. `fullscreen`:
// the page's full screen element is inside its box.
function player(
  id: string,
  ratio: number,
  {
    since = ratio > 0.5 ? 1000 : null,
    area = null,
    eligible = true,
    autoStart = id !== "hero",
    focused = false,
    yieldsToAuto = id === "hero",
    started = 60_000,
    left = ratio > 0.5 ? null : 2_000,
    inViewAtStart = [],
    fullscreen = false,
  }: {
    since?: number | null;
    area?: number | null;
    eligible?: boolean;
    autoStart?: boolean;
    focused?: boolean;
    yieldsToAuto?: boolean;
    started?: number | null;
    left?: number | null;
    inViewAtStart?: string[];
    fullscreen?: boolean;
  } = {},
): TurnPlayer {
  return {
    id,
    priority: PRIORITY[id] ?? 0,
    autoStart,
    ratio,
    area: area ?? Math.round(ratio * 100_000),
    aboveSince: since == null ? null : NOW - since,
    eligible,
    focused,
    yieldsToAuto,
    startedAt: started == null ? null : NOW - started,
    leftAt: left == null ? null : NOW - left,
    inViewAtStart,
    fullscreen,
  };
}

function state(players: TurnPlayer[], extra: Partial<TurnState> = {}): TurnState {
  return {
    now: NOW,
    pageVisible: true,
    blocked: false,
    reducedMotion: false,
    current: null,
    players,
    ...extra,
  };
}

const cases: { name: string; s: TurnState; want: ReturnType<typeof decideTurn> }[] = [
  {
    name: "nothing on screen: nobody gets the turn",
    s: state([player("hero", 0), player("tv-bucle", 0)]),
    want: null,
  },
  {
    name: "UFC TV more than half visible for 400 ms: it starts on its own",
    s: state([player("hero", 0), player("tv-bucle", 0.8, { since: 400 })]),
    want: { id: "tv-bucle", owner: "auto" },
  },
  {
    name: "UFC TV in view for a minute with the keyboard focus inside its box (its poster): it waits",
    s: state([player("tv-bucle", 1, { since: 60_000, focused: true })]),
    want: null,
  },
  {
    name: "the focused one waits, and another automatic player in view may still start",
    s: state([
      player("evento", 1, { since: 1000, focused: true }),
      player("tv-bucle", 0.8, { since: 1000 }),
    ]),
    want: { id: "tv-bucle", owner: "auto" },
  },
  {
    name: "an automatic holder keeps the turn with the focus inside it (a tap inside makes it the visitor's elsewhere)",
    s: state([player("tv-bucle", 1, { focused: true })], { current: { id: "tv-bucle", owner: "auto" } }),
    want: { id: "tv-bucle", owner: "auto" },
  },
  {
    name: "UFC TV visible for only 399 ms: it waits",
    s: state([player("tv-bucle", 0.8, { since: 399 })]),
    want: null,
  },
  {
    // With aboveSince set: only the ratio check can say no.
    name: "exactly half visible is not «more than half»",
    s: state([player("tv-bucle", 0.5, { since: 1000 })]),
    want: null,
  },
  {
    name: "an automatic holder at exactly half is unmounted",
    s: state([player("tv-bucle", 0.5, { since: 1000 })], { current: { id: "tv-bucle", owner: "auto" } }),
    want: null,
  },
  // ── The hero short never starts on its own (the owner, 30-sep-2026, night) ──
  {
    name: "the hero short never starts on its own, not even fully in view for a minute",
    s: state([player("hero", 1, { since: 60_000, area: 200_000 })]),
    want: null,
  },
  {
    name: "the hero short is no candidate: UFC TV starts even though the hero shows more",
    s: state([player("hero", 1, { area: 200_000 }), player("tv-bucle", 0.6, { area: 90_000 })]),
    want: { id: "tv-bucle", owner: "auto" },
  },
  {
    // It cannot happen (only the visitor mounts the hero), and if a state
    // ever said so the rule still holds.
    name: "an automatic holder that may not start on its own is dropped",
    s: state([player("hero", 1)], { current: { id: "hero", owner: "auto" } }),
    want: null,
  },
  {
    name: "and UFC TV above half takes that turn in the same render",
    s: state([player("hero", 1), player("tv-bucle", 0.9)], { current: { id: "hero", owner: "auto" } }),
    want: { id: "tv-bucle", owner: "auto" },
  },
  // ── Hidden tab, blockers, reduced motion ──
  {
    name: "hidden tab: the automatic holder goes",
    s: state([player("tv-bucle", 1)], { pageVisible: false, current: { id: "tv-bucle", owner: "auto" } }),
    want: null,
  },
  {
    name: "hidden tab and nobody holds it: nothing starts on its own",
    s: state([player("evento", 1), player("tv-bucle", 1)], { pageVisible: false }),
    want: null,
  },
  {
    // The owner's decision of 30-sep-2026: YouTube's rules are about autoplay,
    // not about what the visitor chose to watch (PiP, sound in the background).
    name: "hidden tab: what the visitor chose stays",
    s: state([player("hero", 1)], { pageVisible: false, current: { id: "hero", owner: "user" } }),
    want: { id: "hero", owner: "user" },
  },
  {
    name: "a blocker is open (the menu): nothing starts on its own",
    s: state([player("evento", 1), player("tv-bucle", 1)], { blocked: true }),
    want: null,
  },
  {
    name: "a blocker takes the automatic holder away",
    s: state([player("tv-bucle", 0.9)], { blocked: true, current: { id: "tv-bucle", owner: "auto" } }),
    want: null,
  },
  {
    name: "a blocker (the menu) leaves what the visitor chose alone",
    s: state([player("evento", 0.9)], { blocked: true, current: { id: "evento", owner: "user" } }),
    want: { id: "evento", owner: "user" },
  },
  {
    name: "reduced motion: nothing starts on its own",
    s: state([player("evento", 1), player("tv-bucle", 1)], { reducedMotion: true }),
    want: null,
  },
  {
    name: "reduced motion also stops the automatic player that is already on",
    s: state([player("tv-bucle", 1)], { reducedMotion: true, current: { id: "tv-bucle", owner: "auto" } }),
    want: null,
  },
  // ── One at a time ──
  {
    name: "the automatic holder is unmounted as soon as it drops to half or less",
    s: state([player("hero", 0), player("tv-bucle", 0.49)], { current: { id: "tv-bucle", owner: "auto" } }),
    want: null,
  },
  // No page has two automatic players today (the home's slot shows ONE of
  // the three; /en-vivo and the event page, the broadcast). The tie-break
  // keeps the rule defined if one ever does.
  {
    name: "holder drops below half while another is above: swap in the same render",
    s: state([player("tv-bucle", 0.3), player("evento", 0.7)], { current: { id: "tv-bucle", owner: "auto" } }),
    want: { id: "evento", owner: "auto" },
  },
  {
    name: "the holder keeps the turn while above half, even if another shows more",
    s: state([player("tv-bucle", 0.6, { area: 116_000 }), player("evento", 0.9, { area: 530_000 })], {
      current: { id: "tv-bucle", owner: "auto" },
    }),
    want: { id: "tv-bucle", owner: "auto" },
  },
  {
    name: "nobody holds it and two are above half: the larger visible area wins",
    s: state([player("evento", 0.6, { area: 116_000 }), player("tv-bucle", 0.9, { area: 530_000 })]),
    want: { id: "tv-bucle", owner: "auto" },
  },
  {
    name: "same area: live event > UFC TV live > UFC TV loop",
    s: state([
      player("tv-bucle", 1, { area: 200_000 }),
      player("evento", 1, { area: 200_000 }),
      player("tv-directo", 1, { area: 200_000 }),
    ]),
    want: { id: "evento", owner: "auto" },
  },
  {
    name: "same area, UFC TV live against the loop: the live one",
    s: state([player("tv-bucle", 0.8, { area: 90_000 }), player("tv-directo", 0.9, { area: 90_000 })]),
    want: { id: "tv-directo", owner: "auto" },
  },
  // ── What the visitor chose is theirs ──
  // (A fight of the Hall of Fame, a click-to-play clip: any visitor's player
  // but the hero short, which makes way out of view since 21-oct-2026, below.)
  {
    name: "what the visitor started stays while any part of it is visible",
    s: state([player("clip", 0.2, { autoStart: false }), player("tv-bucle", 0.9)], {
      current: { id: "clip", owner: "user" },
    }),
    want: { id: "clip", owner: "user" },
  },
  {
    // In PiP the visitor scrolls away: removing the iframe would close it, and
    // the page cannot see a PiP inside a cross-origin iframe.
    name: "what the visitor chose stays at 0 % too, and nothing automatic starts meanwhile",
    s: state([player("clip", 0, { autoStart: false }), player("tv-bucle", 0.9)], {
      current: { id: "clip", owner: "user" },
    }),
    want: { id: "clip", owner: "user" },
  },
  {
    // PiP, or the sound on while reading further down, with no automatic
    // player in view: the short stays, as before 21-oct-2026.
    name: "the visitor's hero short out of view, with nothing automatic in view, stays",
    s: state([player("hero", 0), player("tv-bucle", 0.3)], { current: { id: "hero", owner: "user" } }),
    want: { id: "hero", owner: "user" },
  },
  {
    name: "out of view, tab hidden, a blocker and reduced motion at once: the visitor's still stays",
    s: state([player("evento", 0), player("tv-bucle", 0.9)], {
      pageVisible: false,
      blocked: true,
      reducedMotion: true,
      current: { id: "evento", owner: "user" },
    }),
    want: { id: "evento", owner: "user" },
  },
  {
    name: "the visitor's choice also survives reduced motion",
    s: state([player("tv-bucle", 0.4)], { reducedMotion: true, current: { id: "tv-bucle", owner: "user" } }),
    want: { id: "tv-bucle", owner: "user" },
  },
  // ── The hero short makes way for the home's slot (the owner, 21-oct-2026) ──
  // «Cuando haga scroll hacia abajo y llegue al UFC TV en directo, que se pare
  // el vídeo de arriba y se ponga el directo sin pulsar.»
  {
    name: "the visitor's short scrolled out of view: UFC TV, seen for the dwell, takes the turn on its own",
    s: state([player("hero", 0), player("tv-bucle", 0.9)], { current: { id: "hero", owner: "user" } }),
    want: { id: "tv-bucle", owner: "auto" },
  },
  {
    name: "exactly half of the short in view is out of view («more than half» is the rule)",
    s: state([player("hero", 0.5), player("tv-bucle", 0.8)], { current: { id: "hero", owner: "user" } }),
    want: { id: "tv-bucle", owner: "auto" },
  },
  {
    name: "UFC TV live takes it the same way (the owner's case)",
    s: state([player("hero", 0.2), player("tv-directo", 0.9)], { current: { id: "hero", owner: "user" } }),
    want: { id: "tv-directo", owner: "auto" },
  },
  {
    name: "and so does the event's broadcast in the home's slot",
    s: state([player("hero", 0), player("evento", 1)], { current: { id: "hero", owner: "user" } }),
    want: { id: "evento", owner: "auto" },
  },
  {
    // PiP, sound, full screen: it makes way all the same (the owner asked for
    // the video above to stop); the short's iframe goes, and its PiP with it.
    name: "a short the visitor touched inside makes way too (owner 'user' is all the turn knows)",
    s: state([player("hero", 0.1), player("tv-bucle", 1, { since: 60_000 })], {
      current: { id: "hero", owner: "user" },
    }),
    want: { id: "tv-bucle", owner: "auto" },
  },
  {
    name: "a tall screen: the short still more than half in view keeps the turn, UFC TV waits",
    s: state([player("hero", 0.51), player("tv-bucle", 1, { since: 60_000 })], {
      current: { id: "hero", owner: "user" },
    }),
    want: { id: "hero", owner: "user" },
  },
  {
    name: "UFC TV seen for only 399 ms: the short keeps the turn",
    s: state([player("hero", 0), player("tv-bucle", 0.9, { since: 399 })], {
      current: { id: "hero", owner: "user" },
    }),
    want: { id: "hero", owner: "user" },
  },
  {
    name: "UFC TV half in view: the short keeps the turn",
    s: state([player("hero", 0), player("tv-bucle", 0.5, { since: 1000 })], {
      current: { id: "hero", owner: "user" },
    }),
    want: { id: "hero", owner: "user" },
  },
  {
    // A PiP while the visitor is in another tab: nothing may start on its own.
    name: "tab hidden: the short out of view keeps the turn",
    s: state([player("hero", 0), player("tv-bucle", 1)], {
      pageVisible: false,
      current: { id: "hero", owner: "user" },
    }),
    want: { id: "hero", owner: "user" },
  },
  {
    name: "a blocker open (the menu): the short out of view keeps the turn",
    s: state([player("hero", 0), player("tv-bucle", 1)], { blocked: true, current: { id: "hero", owner: "user" } }),
    want: { id: "hero", owner: "user" },
  },
  {
    name: "reduced motion: the short out of view keeps the turn",
    s: state([player("hero", 0), player("tv-bucle", 1)], {
      reducedMotion: true,
      current: { id: "hero", owner: "user" },
    }),
    want: { id: "hero", owner: "user" },
  },
  {
    name: "the keyboard focus on UFC TV's poster: the short keeps the turn",
    s: state([player("hero", 0), player("tv-bucle", 1, { focused: true })], {
      current: { id: "hero", owner: "user" },
    }),
    want: { id: "hero", owner: "user" },
  },
  {
    name: "UFC TV under 200x200: the short keeps the turn",
    s: state([player("hero", 0), player("tv-bucle", 1, { eligible: false })], {
      current: { id: "hero", owner: "user" },
    }),
    want: { id: "hero", owner: "user" },
  },
  {
    // The tap itself is never undone on the spot: with no Up Next block the
    // slot sits right under the hero, and on a phone «Siguiente ›» can show
    // under a frame scrolled half away, with UFC TV playing below it.
    // Started there, the short stays until the visitor scrolls on.
    name: "started with UFC TV already in view and the short already half away: nothing moved since the tap, it stays",
    s: state(
      [
        player("hero", 0.3, { started: 200, left: 5_000, inViewAtStart: ["tv-bucle"] }),
        player("tv-bucle", 0.9, { since: 5_000 }),
      ],
      { current: { id: "hero", owner: "user" } },
    ),
    want: { id: "hero", owner: "user" },
  },
  {
    // A finger resting on the screen, or a scroll that goes back to where the
    // tap was: UFC TV crossed its half line again, but it was in view at the
    // tap and the short did not move on. Until 21-oct-2026's review this
    // counted as «UFC TV came into view» and undid the tap.
    name: "UFC TV in view at the tap, out and back since (the same place): the short stays",
    s: state(
      [
        player("hero", 0.3, { started: 5_000, left: 9_000, inViewAtStart: ["tv-bucle"] }),
        player("tv-bucle", 0.9, { since: 1_000 }),
      ],
      { current: { id: "hero", owner: "user" } },
    ),
    want: { id: "hero", owner: "user" },
  },
  {
    name: "UFC TV half or less in view at the tap, more than half now: the visitor scrolled to it, it takes the turn",
    s: state(
      [
        player("hero", 0.3, { started: 5_000, left: 9_000, inViewAtStart: [] }),
        player("tv-bucle", 0.9, { since: 1_000 }),
      ],
      { current: { id: "hero", owner: "user" } },
    ),
    want: { id: "tv-bucle", owner: "auto" },
  },
  {
    // A tall screen: UFC TV in view the whole time; the visitor scrolls the
    // short out of view under it.
    name: "the short scrolled out of view after the tap, UFC TV in view all along: it takes the turn at once",
    s: state(
      [
        player("hero", 0.4, { started: 30_000, left: 50, inViewAtStart: ["tv-bucle"] }),
        player("tv-bucle", 1, { since: 60_000 }),
      ],
      { current: { id: "hero", owner: "user" } },
    ),
    want: { id: "tv-bucle", owner: "auto" },
  },
  {
    // The IntersectionObserver reports the drop in the same instant as the
    // tap (the same clock tick): it still came after the tap.
    name: "the short moved out of view in the very instant of the tap: that counts as after it",
    s: state(
      [
        player("hero", 0.4, { started: 300, left: 300, inViewAtStart: ["tv-bucle"] }),
        player("tv-bucle", 1, { since: 60_000 }),
      ],
      { current: { id: "hero", owner: "user" } },
    ),
    want: { id: "tv-bucle", owner: "auto" },
  },
  {
    name: "the short that left the view BEFORE the tap, UFC TV in view all along: it stays",
    s: state(
      [
        player("hero", 0.4, { started: 30_000, left: 40_000, inViewAtStart: ["tv-bucle"] }),
        player("tv-bucle", 1, { since: 60_000 }),
      ],
      { current: { id: "hero", owner: "user" } },
    ),
    want: { id: "hero", owner: "user" },
  },
  {
    // No mount without a start time in production; a state without one is
    // read as a tap long gone, the rule without its guard.
    name: "no start time known: the short out of view makes way, as when the tap is long gone",
    s: state(
      [player("hero", 0, { started: null, left: null }), player("tv-bucle", 1, { since: 60_000 })],
      { current: { id: "hero", owner: "user" } },
    ),
    want: { id: "tv-bucle", owner: "auto" },
  },
  {
    // The visitor watching the short in full screen cannot scroll the page
    // behind it; only a relayout there (the viewport grows on entering full
    // screen, a phone turned) could move it out of view. Not their gesture.
    name: "the short in full screen, out of view behind it, UFC TV seen for a minute: it stays",
    s: state([player("hero", 0, { fullscreen: true }), player("tv-bucle", 1, { since: 60_000 })], {
      current: { id: "hero", owner: "user" },
    }),
    want: { id: "hero", owner: "user" },
  },
  // ── Only the hero short makes way: every other case as before ──
  {
    name: "UFC TV the visitor put on, out of view, with the hero's poster in full view: UFC TV stays",
    s: state([player("hero", 1, { since: 60_000 }), player("tv-bucle", 0)], {
      current: { id: "tv-bucle", owner: "user" },
    }),
    want: { id: "tv-bucle", owner: "user" },
  },
  {
    name: "a visitor's clip (the Hall of Fame) out of view, with UFC TV seen for a minute: the clip stays",
    s: state([player("clip", 0, { autoStart: false }), player("tv-bucle", 1, { since: 60_000 })], {
      current: { id: "clip", owner: "user" },
    }),
    want: { id: "clip", owner: "user" },
  },
  {
    // The modal is a blocker of its own while it is open (video-modal.tsx).
    name: "the videos modal of the news, with UFC TV in view: the modal stays",
    s: state([player("modal", 1, { autoStart: false }), player("tv-bucle", 1)], {
      blocked: true,
      current: { id: "modal", owner: "user" },
    }),
    want: { id: "modal", owner: "user" },
  },
  {
    name: "a visitor's player that does not say yieldsToAuto never makes way, out of view or not",
    s: state([player("tv-bucle", 0, { yieldsToAuto: false }), player("evento", 1, { since: 60_000 })], {
      current: { id: "tv-bucle", owner: "user" },
    }),
    want: { id: "tv-bucle", owner: "user" },
  },
  // ── 200x200, and players that go away ──
  {
    name: "a player under 200x200 (not eligible) never gets a turn",
    s: state([player("tv-bucle", 1, { eligible: false }), player("evento", 0.2)]),
    want: null,
  },
  {
    name: "an automatic holder that shrinks under 200 px loses the turn",
    s: state([player("tv-bucle", 0.9, { eligible: false })], { current: { id: "tv-bucle", owner: "auto" } }),
    want: null,
  },
  {
    // The 200x200 minimum is a rule for every embedded player, not only for
    // autoplay: the visitor's goes too.
    name: "the visitor's player also goes when it shrinks under 200 px",
    s: state([player("hero", 0.9, { eligible: false })], { current: { id: "hero", owner: "user" } }),
    want: null,
  },
  {
    name: "a holder that vanished from the list is dropped",
    s: state([player("tv-bucle", 0.9)], { current: { id: "evento", owner: "auto" } }),
    want: { id: "tv-bucle", owner: "auto" },
  },
  {
    // The hero unregisters (the visitor navigates away): the turn is free.
    name: "the visitor's holder that vanished is dropped too",
    s: state([player("tv-bucle", 0.9)], { current: { id: "hero", owner: "user" } }),
    want: { id: "tv-bucle", owner: "auto" },
  },
];

describe("decideTurn", () => {
  for (const c of cases) {
    it(c.name, () => {
      expect(decideTurn(c.s)).toEqual(c.want);
    });
  }
});

// PRIORITY: the tie-break among AUTOMATIC players. The hero short is never
// one, so it has none.
describe("PRIORITY", () => {
  it("only the players that start on their own, the event's broadcast first", () => {
    expect(PRIORITY).not.toHaveProperty("hero");
    expect(PRIORITY.evento).toBeGreaterThan(PRIORITY["tv-directo"]);
    expect(PRIORITY["tv-directo"]).toBeGreaterThan(PRIORITY["tv-bucle"]);
  });
});

// timerAction: what the hero's timer does when it fires (duration + 2.5 s
// after the iframe's load). Without the JS API a short the visitor paused,
// unmuted or put in full screen looks the same as one that ended.
describe("timerAction", () => {
  it("untouched: back to its poster (which shows the next short), never a next short on its own", () => {
    expect(timerAction(false)).toBe("release");
  });

  it("touched inside: it stays as the visitor left it (a pause looks like the end)", () => {
    expect(timerAction(true)).toBe("stay");
  });

  it("those are the only two answers: nothing starts another short", () => {
    expect([timerAction(false), timerAction(true)].sort()).toEqual(["release", "stay"]);
  });
});

// fitsMinimum: RMF «a viewport that is at least 200px by 200px». The same rule
// for the page's players and for the sheet (sizes measured in Chrome).
describe("fitsMinimum", () => {
  it("A's short and the sheet's floor, 200x355.6: yes", () => {
    expect(fitsMinimum({ width: 200, height: 355.56 })).toBe(true);
  });

  it("the sheet in landscape before this round, 111.94x199: no", () => {
    expect(fitsMinimum({ width: 111.94, height: 199 })).toBe(false);
  });

  it("199.9 px wide: no", () => {
    expect(fitsMinimum({ width: 199.9, height: 355.4 })).toBe(false);
  });

  it("UFC TV with min-h-[200px] and its border inside, 356x199: no", () => {
    expect(fitsMinimum({ width: 356, height: 199 })).toBe(false);
  });
});

// orderShorts: 9:16 only by default; with every format allowed the 4:5 ones go
// second and fifth, so they show up early in the list.
const V = (id: string) => ({ id, format: "9:16" });
const F = (id: string) => ({ id, format: "4:5" });

describe("orderShorts", () => {
  it("by default the 4:5 ones are left out", () => {
    const out = orderShorts([V("a"), F("x"), V("b"), V("c"), F("y")], false).map((s) => s.id);
    expect(out).toEqual(["a", "b", "c"]);
  });

  it("every format allowed puts the 4:5 ones in 2nd and 5th place", () => {
    const all = [V("a"), V("b"), V("c"), V("d"), V("e"), F("x"), F("y")];
    expect(orderShorts(all, true).map((s) => s.id)).toEqual(["a", "x", "b", "c", "y", "d", "e"]);
  });

  it("a short list still keeps every 4:5", () => {
    expect(orderShorts([V("a"), F("x"), F("y")], true).map((s) => s.id)).toEqual(["a", "x", "y"]);
  });
});

// The player URLs: youtube-nocookie, autoplay + mute + playsinline, and
// nothing else (no enablejsapi, no origin, no iframe_api anywhere).
describe("embed URLs", () => {
  it("shortEmbedUrl · muted autoplay, the production parameters", () => {
    expect(shortEmbedUrl("IuRvqcEmJr0", { mute: true })).toBe(
      "https://www.youtube-nocookie.com/embed/IuRvqcEmJr0?autoplay=1&mute=1&playsinline=1",
    );
  });

  it("shortEmbedUrl · without mute drops only the mute parameter", () => {
    expect(shortEmbedUrl("IuRvqcEmJr0", { mute: false })).toBe(
      "https://www.youtube-nocookie.com/embed/IuRvqcEmJr0?autoplay=1&playsinline=1",
    );
  });

  it("loopEmbedUrl · same shape as UFC TV today: first id in the path AND in playlist", () => {
    expect(loopEmbedUrl(["aaaaaaaaaaa", "bbbbbbbbbbb"], { mute: true })).toBe(
      "https://www.youtube-nocookie.com/embed/aaaaaaaaaaa?playlist=aaaaaaaaaaa,bbbbbbbbbbb&loop=1&autoplay=1&mute=1&playsinline=1",
    );
  });

  it("no URL ever carries enablejsapi or origin", () => {
    for (const url of [
      shortEmbedUrl("IuRvqcEmJr0", { mute: true }),
      shortEmbedUrl("IuRvqcEmJr0", { mute: false }),
      loopEmbedUrl(["aaaaaaaaaaa"], { mute: true }),
    ]) {
      expect(url).not.toMatch(/enablejsapi|origin=|iframe_api/);
    }
  });
});

// The Hall of Fame's fights (click-to-play, unmuted: the visitor started it).
// Values are the seed's: Hughes–Trigg II and Coleman–Williams share a marathon.
describe("clip URLs", () => {
  it("clipEmbedUrl · start only (the fight is the marathon's last chapter)", () => {
    expect(clipEmbedUrl("E2fUq7gT8z4", { start: 6646 })).toBe(
      "https://www.youtube-nocookie.com/embed/E2fUq7gT8z4?autoplay=1&playsinline=1&start=6646",
    );
  });

  it("clipEmbedUrl · start and end (a chapter in the middle)", () => {
    expect(clipEmbedUrl("E2fUq7gT8z4", { start: 3016, end: 3909 })).toBe(
      "https://www.youtube-nocookie.com/embed/E2fUq7gT8z4?autoplay=1&playsinline=1&start=3016&end=3909",
    );
  });

  it("clipEmbedUrl · a whole upload carries no range and no mute", () => {
    const url = clipEmbedUrl("vdY36eZZ6IY");
    expect(url).toBe("https://www.youtube-nocookie.com/embed/vdY36eZZ6IY?autoplay=1&playsinline=1");
    expect(url).not.toMatch(/mute|enablejsapi|origin=/);
  });

  it("normalizeClipRange · drops what YouTube would not take", () => {
    expect(normalizeClipRange({ start: -5, end: 10 })).toEqual({ start: null, end: 10 });
    expect(normalizeClipRange({ start: 12.5, end: null })).toEqual({ start: null, end: null });
    expect(normalizeClipRange({ start: 100, end: 100 })).toEqual({ start: 100, end: null });
    expect(normalizeClipRange({ start: 100, end: 50 })).toEqual({ start: 100, end: null });
    expect(normalizeClipRange({ start: null, end: 0 })).toEqual({ start: null, end: null });
  });

  it("clipEmbedUrl and clipWatchUrl · refuse anything that is not a video id", () => {
    for (const bad of ["", "short", "E2fUq7gT8z4&x=1", "../../evil1", "E2fUq7gT8z44"]) {
      expect(isYouTubeVideoId(bad)).toBe(false);
      expect(() => clipEmbedUrl(bad)).toThrow();
      expect(() => clipWatchUrl(bad)).toThrow();
    }
  });

  it("clipWatchUrl · youtube.com/watch with the start as t=", () => {
    expect(clipWatchUrl("E2fUq7gT8z4", { start: 6646, end: 7000 })).toBe(
      "https://www.youtube.com/watch?v=E2fUq7gT8z4&t=6646s",
    );
    expect(clipWatchUrl("vdY36eZZ6IY")).toBe("https://www.youtube.com/watch?v=vdY36eZZ6IY");
  });
});
