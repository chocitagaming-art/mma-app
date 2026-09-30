"use client";

import { X } from "lucide-react";
import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";

import { useTurnBlocker } from "@/components/playback/playback-turn-provider";

// Large centered lightbox for playing a YouTube video over the whole page.
// Mounts into document.body via a portal (avoids z-index/overflow traps of the
// card grid). Closes on the ✕ button, the Escape key, or a click on the dim
// backdrop. Locks body scroll and moves focus to the close button while open.
//
// It covers the page (an 80 % black backdrop), and YouTube wants nothing in
// front of a player: while it is mounted (open) it is a blocker of the turn
// manager, like the mobile menu. The automatic player (UFC TV, the event's
// broadcast) goes back to its poster and returns on close; the one the
// visitor started stays (components/playback).
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
  useTurnBlocker("video-modal", true);

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
      className="fixed inset-0 z-[100] grid place-items-center bg-black/80 p-4 backdrop-blur-sm"
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
        {/* At least 200px tall INSIDE the border (YouTube's minimum player
            size is 200x200; on a 360px phone the 16:9 box was 183px). 202
            because the 1px border sits inside the box (border-box). It goes
            on the iframe, not on the wrapper: there the min-height carried
            over into the width through the 16:9 ratio and the box grew wider
            than its slot. The wrapper just grows with it. */}
        <iframe
          src={`https://www.youtube-nocookie.com/embed/${videoId}?autoplay=1`}
          title={title}
          allow="autoplay; encrypted-media; picture-in-picture; fullscreen"
          allowFullScreen
          className="size-full min-h-[202px] rounded-lg border border-border bg-black shadow-2xl"
        />
      </div>
    </div>,
    document.body,
  );
}
