import type { PlayerView, StartResult } from "@/components/playback/turn-controller";

// What a click on a player's poster does: the hero short, UFC TV and the
// event's live broadcast (poster-link.tsx). Pure, so it runs in the node tests
// (poster-activation.test.ts).
//
// The poster is a REAL link to the video on YouTube: without the page's
// JavaScript (off, blocked, or not downloaded yet) it opens the video there,
// in a new tab. Until 30-sep-2026 it was a <button> that only the turn manager
// understood, and without JavaScript it did nothing. With JavaScript the
// click is intercepted and the player mounts here, as before.
//
// And the keyboard: the poster is REPLACED by the <iframe> when the player
// mounts, so the focus of a keyboard start fell on <body>. It now goes into
// the player it mounted, and only into that one. A focused iframe is exactly
// how the turn manager recognises a player the visitor touched (window blur
// + document.activeElement, turn-controller.ts): fine for what the visitor
// started (it is theirs already), never for an automatic mount.

export type ClickLike = {
  button: number;
  ctrlKey: boolean;
  metaKey: boolean;
  shiftKey: boolean;
  altKey: boolean;
};

/**
 * Ctrl/⌘/Shift/Alt, or not the main button: the browser's own link action
 * (a new tab or window on YouTube), as with any link. Not intercepted.
 */
export function isModifiedClick(click: ClickLike): boolean {
  return click.button !== 0 || click.ctrlKey || click.metaKey || click.shiftKey || click.altKey;
}

/**
 * Does the poster take this click from its link (to mount the player here)?
 * Only a plain one, on a poster that CAN play here. The hero under 200x200 (a
 * screen under 340 px) cannot: it is a link all the way, and never asks the
 * turn manager. It used to, and the turn manager looks at the menu and at
 * «ready» BEFORE the size: during the hero's intro, or under the open menu,
 * the answer was "not-ready" or "blocked" and the tap did nothing.
 */
export function interceptsClick(click: ClickLike, playsHere: boolean): boolean {
  return playsHere && !isModifiedClick(click);
}

/**
 * Enter on the link (and a screen reader's activation) clicks with detail 0;
 * a mouse or a finger, with 1 or more. Space on the poster turned button is
 * sent here as a click too (poster-link.tsx), so it counts as the keyboard.
 */
export function isKeyboardClick(click: { detail: number }): boolean {
  return click.detail === 0;
}

// For a poster that plays here (interceptsClick). "play-here": the player
// mounts in place and the link must NOT open YouTube. "youtube": the turn
// manager measured it under 200x200 (no legal inline player), so the link does
// what it says (it replaces the old window.open of that case). "nothing": not
// ready, blocked by a menu... the tap does nothing, as it did before the link.
export type PosterOutcome = "play-here" | "youtube" | "nothing";

/** What the poster does with the turn manager's answer to the visitor's start. */
export function posterOutcome(result: StartResult): PosterOutcome {
  if (result === "started") return "play-here";
  if (result === "too-small") return "youtube";
  return "nothing";
}

/**
 * After the commit that follows a KEYBOARD start: the element to focus, from
 * the turn's box (the TurnSlot <div>, which stays while its poster turns into
 * the iframe). Only a mounted player the VISITOR holds; an automatic one would
 * be marked «touched» by the focus, and the carousel timer would stop for good.
 */
export function playerToFocus<T>(
  slot: { querySelector(selectors: "iframe"): T | null } | null,
  view: Pick<PlayerView, "mounted" | "owner">,
): T | null {
  if (!slot || !view.mounted || view.owner !== "user") return null;
  return slot.querySelector("iframe");
}
