"use client";

import { X } from "lucide-react";
import { useEffect, useId, useRef } from "react";
import { createPortal } from "react-dom";

import { ClickToPlay } from "@/components/playback/click-to-play";
import { useTurnBlocker } from "@/components/playback/playback-turn-provider";
import { isYouTubeVideoId } from "@/lib/playback-turn";

// Large centered lightbox for playing a YouTube video over the whole page.
// Mounts into document.body via a portal (avoids z-index/overflow traps of the
// card grid). Closes on the ✕ button, the Escape key, or a click on the dim
// backdrop. Locks body scroll and moves focus to the close button while open.
//
// Used by every lightbox facade (youtube-facade.tsx): the home's «Noticias y
// vídeos», /videos and /tendencias.
//
// Its player is INSIDE the turn manager (R10, the owner's decision of
// 18-oct-2026: «uno a la vez»). It is a ClickToPlay started on mount, as the
// visitor's: whatever was playing goes back to its poster — UFC TV, the
// event's broadcast, and also the UFC TV or the short the VISITOR had put
// on. On close, what had started on its own comes back if it is seen; what
// the visitor had put on does NOT come back on its own ("parked",
// turn-controller.ts). Before R10 the visitor's player went on playing behind
// the modal: two players at once.
//
// It covers the page (an 80 % black backdrop), and YouTube wants nothing in
// front of a player: while it is mounted (open) it is also a blocker of the
// turn manager, like the mobile menu, so nothing automatic starts behind it.
// Its own player is exempt (ownBlocker), and so it is from every other
// blocker: the modal sits above everything, the open mobile menu included
// (z-100 over the header's z-40). Under the open menu its start used to be
// refused ("blocked") and the poster's «Ver en YouTube» did nothing (QA, R10).
// Each modal has its own blocker name: two stacked modals were one name in
// the turn manager's Set, and closing the top one lifted the other's block.
//
// If the turn manager refuses the start anyway (a box under 200x200, a
// screen under ~232 px), the modal still blocks and its poster is a plain
// link to the video on YouTube (ClickToPlay, `startOnMount`).
//
// The focus stays in the modal, as in the Hall of Fame's
// (hall-of-fame-inductee-modal.tsx): the rest of the page is `inert` while it
// is open, and two sentinels send Tab and Shift+Tab round to the other end.
// Without that, Tab reached the cards behind it and Enter opened a second
// modal on top. 🪤 Escape does not arrive from inside the player (a
// cross-origin iframe keeps its keys): the ✕ is always on screen instead,
// landscape phones included (the player's cap leaves room for it above).

const FOCUSABLE =
  'a[href], button:not([disabled]), iframe, input:not([disabled]), [tabindex]:not([tabindex="-1"])';

function focusables(root: HTMLElement | null): HTMLElement[] {
  if (!root) return [];
  return Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
    (el) => !el.hasAttribute("data-focus-sentinel"),
  );
}

export function VideoModal({
  videoId,
  title,
  onClose,
}: {
  videoId: string;
  title: string;
  onClose: () => void;
}) {
  const closeRef = useRef<HTMLButtonElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const frameRef = useRef<HTMLDivElement>(null);
  const blocker = `video-modal-${useId()}`;
  useTurnBlocker(blocker, true);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    // What is behind, out of reach (keyboard and screen reader). Only what
    // was not inert already, to give it back as it was.
    const dialog = dialogRef.current;
    const silenced = Array.from(document.body.children).filter(
      (el): el is HTMLElement => el instanceof HTMLElement && el !== dialog && !el.inert,
    );
    for (const el of silenced) el.inert = true;
    closeRef.current?.focus();
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
      // The facade puts the focus back on its ▶ after this (youtube-facade.tsx).
      for (const el of silenced) el.inert = false;
    };
  }, [onClose]);

  const wrapToEnd = () => focusables(frameRef.current).at(-1)?.focus();
  const wrapToStart = () => closeRef.current?.focus();

  if (typeof document === "undefined") return null;

  return createPortal(
    <div
      ref={dialogRef}
      role="dialog"
      aria-modal="true"
      aria-label={title}
      onClick={onClose}
      // grid-cols-[minmax(0,1fr)]: with the default auto column the track
      // grew to the player's min-content width (the 202 px minimum height
      // carried into the width through the 16:9) and ate the 16 px margin
      // (measured at 220 px: a 202 px box in a 188 px slot).
      className="fixed inset-0 z-[100] grid grid-cols-[minmax(0,1fr)] place-items-center bg-black/80 p-4 backdrop-blur-sm"
    >
      {/* The player. Width is capped so the 16:9 box always fits the viewport
          (never taller than 82vh) AND leaves room above it for the ✕ (44 px
          over the box, centred: 6rem off the height). With the 82vh cap only,
          a landscape phone cut the ✕ off the top (844x390: y=-9..27).
          Clicks inside don't bubble to the backdrop. */}
      <div
        ref={frameRef}
        onClick={(e) => e.stopPropagation()}
        className="relative aspect-video w-full max-w-[min(92vw,calc(min(82vh,100vh_-_6rem)*16/9))]"
      >
        <span tabIndex={0} data-focus-sentinel onFocus={wrapToEnd} className="sr-only" />
        <button
          ref={closeRef}
          onClick={onClose}
          aria-label="Cerrar vídeo"
          className="absolute -top-11 right-0 grid size-9 place-items-center rounded-full bg-white/10 text-white transition hover:bg-white/20 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
        >
          <X className="size-5" />
        </button>
        {/* The turn's box is the player's box: ClickToPlay gives it 16:9,
            full width and min-h-[202px], i.e. at least 200px tall INSIDE the
            1px border (YouTube's minimum is 200x200; on a 360px phone the
            16:9 box alone was 183px). The width is explicit (w-full, in a
            minmax(0,1fr) column), so the minimum height cannot widen it past
            its slot; the wrapper just grows taller with it.
            e2e/portada-noticias.spec.ts measures it at 360 and at 220. */}
        {isYouTubeVideoId(videoId) ? (
          <ClickToPlay
            videoId={videoId}
            title={title}
            label="Ver en YouTube"
            hint="Se abre en otra pestaña"
            linkLabel="Ver en YouTube (se abre en otra pestaña)"
            startOnMount
            ownBlocker={blocker}
            className="rounded-lg border border-border shadow-2xl"
          />
        ) : null}
        <span tabIndex={0} data-focus-sentinel onFocus={wrapToStart} className="sr-only" />
      </div>
    </div>,
    document.body,
  );
}
