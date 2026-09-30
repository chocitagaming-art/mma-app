"use client";

import {
  useCallback,
  useLayoutEffect,
  useRef,
  useSyncExternalStore,
  type KeyboardEvent,
  type MouseEvent,
  type ReactNode,
} from "react";

import {
  interceptsClick,
  isKeyboardClick,
  playerToFocus,
  posterOutcome,
} from "@/components/playback/poster-activation";
import type { PlayerView, StartResult } from "@/components/playback/turn-controller";

// The poster (▶) of a player under the turn manager: the hero short
// (components/home/shorts-hero.tsx), and UFC TV and the event's broadcast
// (live-embed-player.tsx). The rules are in poster-activation.ts, with tests.
//
// Progressive enhancement, as a facade should be:
//   · In the HTML it is a real <a> to the video on YouTube, in a new tab. So
//     with the page's JavaScript off, blocked, or not downloaded yet, the ▶
//     opens the video there. It used to be a <button> that did nothing
//     (measured on 30-sep-2026 with the app's bundles blocked).
//   · Once React runs, a plain click or Enter is intercepted and the player
//     mounts HERE, as before; only then is it announced as a button
//     (role="button", with Space too). Ctrl/⌘/Shift/Alt and the middle button
//     keep the link's own action: the video on YouTube.
//   · Under 200x200 there is no legal inline player: the link does what it
//     says (no window.open any more). The hero knows its size (playsHere
//     false): then it is a plain link all the way and never asks the turn
//     manager, whose "blocked" under the open menu (and "not-ready" during
//     the hero's intro, until 30-sep-2026) used to swallow the tap. UFC TV and
//     the broadcast ask, and a "too-small" answer lets it through.
//   · A keyboard start sends the focus into the player it mounted (see
//     useKeyboardStartFocus): the poster is replaced by the <iframe>, and the
//     focus used to fall on <body>.
//
// Nothing over the player: the poster is gone while the iframe is there.

function subscribeToNothing() {
  return () => {};
}

/**
 * The focus half: the parent of the poster (it stays when the poster goes)
 * gets a function to hand to <PosterLink onKeyboardStart>. After the commit
 * that mounts the player a KEYBOARD start asked for, the focus goes into its
 * iframe; nothing else ever moves it.
 *
 * 🪤 A focused iframe is how the turn manager spots a player the visitor
 * touched (window blur + document.activeElement, turn-controller.ts). That is
 * fine for what the visitor started (it is theirs already), but it must never
 * happen to an automatic mount: playerToFocus only answers for a mounted player
 * whose owner is "user", and the request is dropped at the first commit.
 */
export function useKeyboardStartFocus(view: PlayerView): (slot: Element | null) => void {
  const pending = useRef<Element | null>(null);
  const { mounted, owner, mountCount } = view;

  // A layout effect: the iframe is in the DOM (and TurnSlot has handed it to
  // the turn manager) and the focus moves before the browser paints.
  useLayoutEffect(() => {
    const slot = pending.current;
    if (!slot) return;
    pending.current = null;
    playerToFocus<HTMLIFrameElement>(slot, { mounted, owner })?.focus();
  }, [mounted, owner, mountCount]);

  return useCallback((slot: Element | null) => {
    pending.current = slot;
  }, []);
}

export function PosterLink({
  href,
  label,
  className,
  playsHere = true,
  onStart,
  onKeyboardStart,
  children,
}: {
  // The video on YouTube (youtube.com/watch or /shorts), from the tested
  // builders (youtubeWatchUrl in lib/ufc-tv.ts, shortWatchUrl): never written
  // here.
  href: string;
  // The accessible name: what the ▶ does, and what it plays.
  label: string;
  className?: string;
  // False when a tap can only open YouTube (the hero under 200x200): then it
  // stays a link for assistive technology too, and no click is taken from it.
  playsHere?: boolean;
  // The visitor's start: the turn manager's userStart, plus whatever the
  // player needs first (the hero queues its short). Only on a plain click,
  // Enter or Space, and only when it plays here.
  onStart: () => StartResult;
  // useKeyboardStartFocus's function.
  onKeyboardStart?: (slot: Element | null) => void;
  children: ReactNode;
}) {
  // False on the server and while hydrating (the HTML is a plain link), true
  // once React runs in the browser: same pattern as the reduced-motion query.
  const hydrated = useSyncExternalStore(
    subscribeToNothing,
    () => true,
    () => false,
  );
  const asButton = hydrated && playsHere;
  // Space activates a button on keyup, and only if it went down here.
  const spaceDown = useRef(false);

  const onClick = (event: MouseEvent<HTMLAnchorElement>) => {
    if (!interceptsClick(event, playsHere)) return;
    // Asked BEFORE the start, and only by the keyboard: the commit that mounts
    // the player follows the start, and a mouse or a finger never moves it.
    // The box is the turn's (TurnSlot's <div>): it stays when the poster goes.
    onKeyboardStart?.(isKeyboardClick(event) ? event.currentTarget.closest("[data-turn]") : null);
    const result = onStart();
    if (result !== "started") onKeyboardStart?.(null);
    if (posterOutcome(result) !== "youtube") event.preventDefault();
  };

  const onKeyDown = (event: KeyboardEvent<HTMLAnchorElement>) => {
    if (event.key !== " ") return;
    event.preventDefault(); // no page scroll
    spaceDown.current = true;
  };

  const onKeyUp = (event: KeyboardEvent<HTMLAnchorElement>) => {
    if (event.key !== " " || !spaceDown.current) return;
    spaceDown.current = false;
    // The same path as Enter: a click with detail 0, which is the keyboard's.
    event.currentTarget.click();
  };

  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      role={asButton ? "button" : undefined}
      aria-label={label}
      onClick={onClick}
      onKeyDown={asButton ? onKeyDown : undefined}
      onKeyUp={asButton ? onKeyUp : undefined}
      onBlur={() => {
        spaceDown.current = false;
      }}
      className={className}
    >
      {children}
    </a>
  );
}
