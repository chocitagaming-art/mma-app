// The "turn manager" of the home page players: who may have a MOUNTED YouTube
// player right now. Pure logic, no DOM and no clock, so it runs the same in
// the browser, on the server and in the tests.
//
// Ported one to one from the owner's mockup (maqueta-shorts/escena.js, 29-sep-
// 2026, table tests in turno.test.js → lib/playback-turn.test.ts). The rules
// changed twice on 30-sep-2026, in both the same way (see below).
// The browser wiring (IntersectionObserver, hidden tab, "touched" detection)
// lives in components/playback/turn-controller.ts and only feeds this module.
//
// Two kinds of player (autoStart, set by each one):
//   · UFC TV and the event's live broadcast START ON THEIR OWN when they are
//     seen, muted.
//   · The hero short does NOT (the owner's decision, 30-sep-2026, night): it
//     plays only when the visitor starts it (its poster's ▶ or «Siguiente»),
//     and when it ends no other short starts. It is never a candidate here.
//
// What it enforces for what starts on its own (YouTube RMF and Developer
// Policies, see DECISIONS.md, 29-sep-2026):
//   - An automatic player is mounted only when MORE than half of it is visible
//     (the sticky header band does not count) for DWELL_MS in a row.
//   - At most ONE player mounted. An automatic one goes (back to its poster)
//     when it drops to half or less, with the tab hidden, with a blocker open
//     (the mobile menu) or with prefers-reduced-motion.
//   - Hidden tab, a blocker or prefers-reduced-motion: nothing starts on its own.
//   - Nor a player with the keyboard focus inside its box (its poster): the
//     poster is replaced by the iframe, and an automatic mount dropped the
//     focus on <body> (final review of the shorts branch, 30-sep-2026). It
//     starts when the focus leaves; Enter or Space on the poster start it as
//     the visitor's, and then the focus goes into the player.
//   - Two candidates at once: the larger visible area wins, then PRIORITY. No
//     page has two today (the home's slot shows ONE of the three; /en-vivo and
//     the event page, the broadcast): the tie-break keeps the rule defined.
//   - No player under MIN_PLAYER_PX x MIN_PLAYER_PX, the visitor's included.
//
// What the visitor chose is theirs (the owner's decision, DECISIONS.md,
// 30-sep-2026: YouTube's rules are about autoplay, not about what the visitor
// chose to watch). The visitor's player is one they started with a tap (the
// hero short is always one), or an automatic one they touched inside (sound,
// pause, full screen, PiP). It stays out of view, with the tab hidden (a
// pagehide too: the page may come back from the back/forward cache) and under
// an open menu, and nothing automatic starts while it holds the turn: if the
// visitor puts a short on, UFC TV makes way. It only goes when the visitor
// starts another player (one at a time still), or when it drops under the
// 200x200 minimum. Out of view is the PiP case: the page cannot see a PiP
// inside a cross-origin iframe, the visitor scrolls or changes tab while it
// plays, and removing the iframe would close it.
//
// One more exit, the hero short's end (timerAction): without the JS API its
// timer cannot tell the end from a pause. Untouched inside, it goes back to
// its poster (which shows the next short, ready for a tap) and the turn is
// free, so UFC TV may start on its own if it is seen; a PiP opened with the
// browser's own button, with no tap inside, closes there. Touched inside, it
// stays as the visitor left it.
//
// No iframe_api, no enablejsapi, no postMessage (Developer Policies III.D.7:
// no undocumented APIs): "stop" means removing the iframe, and each short the
// visitor starts is a new iframe.

// Tie-break when two AUTOMATIC players show the same visible area: the
// event's live broadcast, UFC TV live, UFC TV's loop. The hero short is never
// one, so it has no entry.
export const PRIORITY: Readonly<Record<string, number>> = {
  evento: 3,
  "tv-directo": 2,
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
  // May it start on its own (UFC TV, the event's broadcast)? The hero short
  // may not: only the visitor starts it.
  autoStart: boolean;
  // Visible fraction (0-1) and visible area in px², header band excluded.
  ratio: number;
  area: number;
  // When it went MORE than half visible (same clock as `now`), or null.
  aboveSince: number | null;
  // Big enough for a legal player (fitsMinimum).
  eligible: boolean;
  // The keyboard focus is inside its box (its poster): no automatic start.
  focused?: boolean;
};

export type TurnState = {
  now: number;
  pageVisible: boolean;
  blocked: boolean;
  reducedMotion: boolean;
  current: Turn | null;
  players: TurnPlayer[];
};

export type TimerAction = "stay" | "release";

/** Is this box (a getBoundingClientRect) big enough for a legal player? */
export function fitsMinimum(rect: { width: number; height: number }): boolean {
  return rect.width >= MIN_PLAYER_PX && rect.height >= MIN_PLAYER_PX;
}

function isAutoCandidate(p: TurnPlayer, now: number): boolean {
  return (
    p.autoStart &&
    p.eligible &&
    !p.focused &&
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
  if (current && holder && holder.eligible) {
    // The visitor's player is theirs: out of view, tab hidden, menu open.
    if (current.owner === "user") {
      return { id: holder.id, owner: "user" };
    }
    // An automatic one only while it may start on its own and MORE than half
    // of it is visible.
    if (autoplayAllowed && holder.autoStart && holder.ratio > HALF) {
      return { id: holder.id, owner: "auto" };
    }
  }

  if (!autoplayAllowed) return null;
  const candidates = state.players.filter((p) => isAutoCandidate(p, state.now));
  if (candidates.length === 0) return null;
  candidates.sort((a, b) => b.area - a.area || b.priority - a.priority);
  return { id: candidates[0].id, owner: "auto" };
}

/**
 * What the hero short's timer does when it fires (the API duration + 2.5 s
 * after the iframe's load). Without the JS API a short the visitor paused,
 * unmuted or put in full screen looks the same as one that ended, so one they
 * TOUCHED inside stays as they left it: "stay". Otherwise it goes back to its
 * poster and the turn is free: "release". Never a next short on its own: the
 * poster shows it, and the visitor starts it (or «Siguiente»).
 */
export function timerAction(touched: boolean): TimerAction {
  return touched ? "stay" : "release";
}

/**
 * 9:16 only, unless every format is allowed: then the 4:5 ones go 2nd and 5th
 * (and so on, every third place), so they show up early in the list.
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
