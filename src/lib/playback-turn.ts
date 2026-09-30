// The "turn manager" of the home page players: who may have a MOUNTED YouTube
// player right now. Pure logic, no DOM and no clock, so it runs the same in
// the browser, on the server and in the tests.
//
// Ported one to one from the owner's mockup (maqueta-shorts/escena.js, 29-sep-
// 2026, table tests in turno.test.js → lib/playback-turn.test.ts). The rules
// for the visitor's player changed on 30-sep-2026 in both, the same way.
// The browser wiring (IntersectionObserver, hidden tab, "touched" detection)
// lives in components/playback/turn-controller.ts and only feeds this module.
//
// What it enforces (YouTube RMF and Developer Policies, see DECISIONS.md,
// 29-sep-2026):
//   - An automatic player is mounted only when MORE than half of it is visible
//     (the sticky header band does not count) for DWELL_MS in a row.
//   - At most ONE player mounted. An automatic one goes (back to its poster)
//     when it drops to half or less, with the tab hidden, with a blocker open
//     (the mobile menu) or with prefers-reduced-motion.
//   - Hidden tab, a blocker or prefers-reduced-motion: nothing starts on its own.
//   - Two candidates at once: the larger visible area wins, then PRIORITY.
//   - No player under MIN_PLAYER_PX x MIN_PLAYER_PX, the visitor's included.
//
// What the visitor chose is theirs (the owner's decision, DECISIONS.md,
// 30-sep-2026: YouTube's rules are about autoplay, not about what the visitor
// chose to watch). The visitor's player is one they started with a tap on a
// poster, or an automatic one they touched inside (sound, pause, full screen,
// PiP). It stays out of view, with the tab hidden and under an open menu, and
// nothing automatic starts while it holds the turn. It only goes when the
// visitor starts another player (one at a time still) or pauses it with the
// site's control, or when it drops under the 200x200 minimum. Out of view is
// the PiP case: the page cannot see a PiP inside a cross-origin iframe, the
// visitor scrolls or changes tab while it plays, and removing the iframe would
// close it.
//
// No iframe_api, no enablejsapi, no postMessage (Developer Policies III.D.7:
// no undocumented APIs): "stop" means removing the iframe, and the next short
// is a new iframe mounted on a timer.

// Tie-break when two players show the same visible area: the event's live
// broadcast, UFC TV live, the hero short, UFC TV's loop.
export const PRIORITY: Readonly<Record<string, number>> = {
  evento: 4,
  "tv-directo": 3,
  hero: 2,
  "tv-bucle": 1,
};

// RMF: "must not initiate an automatic playback until ... more than half of
// the player is visible". The 400 ms keep a fast scroll from starting things.
export const DWELL_MS = 400;
export const HALF = 0.5;

// RMF: "a viewport that is at least 200px by 200px". Every player, the sheet too.
export const MIN_PLAYER_PX = 200;

const EMBED = "https://www.youtube-nocookie.com/embed/";

export type TurnOwner = "auto" | "user";

export type Turn = { id: string; owner: TurnOwner };

export type TurnPlayer = {
  id: string;
  priority: number;
  // Visible fraction (0-1) and visible area in px², header band excluded.
  ratio: number;
  area: number;
  // When it went MORE than half visible (same clock as `now`), or null.
  aboveSince: number | null;
  paused: boolean;
  // Big enough (fitsMinimum) and ready to be mounted.
  eligible: boolean;
};

export type TurnState = {
  now: number;
  pageVisible: boolean;
  blocked: boolean;
  reducedMotion: boolean;
  current: Turn | null;
  players: TurnPlayer[];
};

export type TimerAction = "stay" | "next" | "release";

/** Is this box (a getBoundingClientRect) big enough for a legal player? */
export function fitsMinimum(rect: { width: number; height: number }): boolean {
  return rect.width >= MIN_PLAYER_PX && rect.height >= MIN_PLAYER_PX;
}

function isAutoCandidate(p: TurnPlayer, now: number): boolean {
  return (
    p.eligible &&
    !p.paused &&
    p.ratio > HALF &&
    p.aboveSince != null &&
    now - p.aboveSince >= DWELL_MS
  );
}

/** Who may have a mounted player right now. Returns { id, owner } or null. */
export function decideTurn(state: TurnState): Turn | null {
  const autoplayAllowed = state.pageVisible && !state.blocked && !state.reducedMotion;

  const current = state.current;
  const holder = current ? state.players.find((p) => p.id === current.id) : undefined;
  if (current && holder && holder.eligible && !holder.paused) {
    // The visitor's player is theirs: out of view, tab hidden, menu open.
    if (current.owner === "user") {
      return { id: holder.id, owner: "user" };
    }
    // An automatic one only while MORE than half of it is visible.
    if (autoplayAllowed && holder.ratio > HALF) {
      return { id: holder.id, owner: "auto" };
    }
  }

  if (!autoplayAllowed) return null;
  const candidates = state.players.filter((p) => isAutoCandidate(p, state.now));
  if (candidates.length === 0) return null;
  candidates.sort((a, b) => b.area - a.area || b.priority - a.priority);
  return { id: candidates[0].id, owner: "auto" };
}

/** May `id` start a NEW automatic playback now? Every carousel short is one. */
export function mayAutoplay(state: TurnState, id: string): boolean {
  if (!state.pageVisible || state.blocked || state.reducedMotion) return false;
  const p = state.players.find((x) => x.id === id);
  return Boolean(p) && isAutoCandidate(p as TurnPlayer, state.now);
}

/**
 * What the carousel timer does when it fires (the API duration + 2.5 s after
 * the iframe's load). Without the JS API a short the visitor paused, unmuted
 * or put in full screen looks the same as one that ended, so one they TOUCHED
 * inside stays as they left it: "stay". Otherwise the next short is a new
 * automatic start and needs rule 1 again: "next", or "release" (back to the
 * poster; the turn is free).
 */
export function timerAction(state: TurnState, id: string, touched: boolean): TimerAction {
  if (touched) return "stay";
  return mayAutoplay(state, id) ? "next" : "release";
}

/**
 * 9:16 only, unless every format is allowed: then the 4:5 ones go 2nd and 5th
 * (and so on, every third place), so they show up early in the carousel.
 */
export function orderShorts<T extends { format: string }>(all: T[], allFormats: boolean): T[] {
  const vertical = all.filter((s) => s.format === "9:16");
  if (!allFormats) return vertical;
  const out = [...vertical];
  all
    .filter((s) => s.format !== "9:16")
    .forEach((s, i) => out.splice(Math.min(1 + i * 3, out.length), 0, s));
  return out;
}

export type EmbedOptions = { mute: boolean };

function playerParams({ mute }: EmbedOptions): string {
  return mute ? "autoplay=1&mute=1&playsinline=1" : "autoplay=1&playsinline=1";
}

export function shortEmbedUrl(id: string, opts: EmbedOptions): string {
  return `${EMBED}${id}?${playerParams(opts)}`;
}

// Same shape as UFC TV in production (lib/ufc-tv.ts loopEmbedUrl, which is
// server-only): the first id goes in the path AND in `playlist`, or loop=1
// skips it.
export function loopEmbedUrl(ids: string[], opts: EmbedOptions): string {
  return `${EMBED}${ids[0]}?playlist=${ids.join(",")}&loop=1&${playerParams(opts)}`;
}
