"use client";

import { X } from "lucide-react";
import { useEffect, useRef } from "react";
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
// Its own player is exempt (ownBlocker). If the turn manager refuses the
// start anyway (a box under 200x200, a screen under ~232 px), the modal still
// blocks and shows our poster, a link to the video on YouTube.
const VIDEO_MODAL_BLOCKER = "video-modal";

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
  useTurnBlocker(VIDEO_MODAL_BLOCKER, true);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    closeRef.current?.focus();
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [onClose]);

  if (typeof document === "undefined") return null;

  return createPortal(
    <div
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
          (never taller than 82vh). Clicks inside don't bubble to the backdrop. */}
      <div
        onClick={(e) => e.stopPropagation()}
        className="relative aspect-video w-full max-w-[min(92vw,calc(82vh*16/9))]"
      >
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
            startOnMount
            ownBlocker={VIDEO_MODAL_BLOCKER}
            className="rounded-lg border border-border shadow-2xl"
          />
        ) : null}
      </div>
    </div>,
    document.body,
  );
}
