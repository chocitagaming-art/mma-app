"use client";

import Image from "next/image";
import { Play } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { VideoModal } from "@/components/video-modal";
import { cn } from "@/lib/utils";
import { isYouTubePlaceholder } from "@/lib/youtube-thumbnail";

// Shared "facade": render the thumbnail + play button first and only mount the
// player after the user clicks (keeps pages fast, no 3rd-party player scripts
// until intent).
//
// Two play modes:
//  - in-place (default): the youtube-nocookie iframe replaces the thumbnail in
//    the same slot. Used by the hero reel and the fight-page player.
//  - lightbox: clicking opens a large centered <VideoModal> overlay; the
//    thumbnail stays in place. Used by /videos, /tendencias and the home's
//    «Noticias y vídeos». The modal's player is in the turn manager.
export function YouTubeFacade({
  videoId,
  title,
  thumbnail,
  fallbackThumbnail,
  sizes = "(max-width:768px) 100vw, 768px",
  priority = false,
  lightbox = false,
}: {
  videoId: string;
  title: string;
  thumbnail: string;
  // Painted instead of `thumbnail` when that one fails or loads as YouTube's
  // grey 120×90 placeholder (a size the video does not have).
  fallbackThumbnail?: string;
  sizes?: string;
  priority?: boolean;
  lightbox?: boolean;
}) {
  const [playing, setPlaying] = useState(false);
  // The thumbnail that failed, so a new one (another video) starts over.
  const [failedThumbnail, setFailedThumbnail] = useState<string | null>(null);
  const src =
    fallbackThumbnail && failedThumbnail === thumbnail ? fallbackThumbnail : thumbnail;
  const switchToFallback = () => {
    if (fallbackThumbnail && failedThumbnail !== thumbnail) setFailedThumbnail(thumbnail);
  };
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  // Lightbox: the focus goes back to this ▶ when the modal closes. After the
  // modal has unmounted, not in its onClose: while it is open the rest of the
  // page is `inert` (video-modal.tsx), and an inert button refuses the focus.
  const returnFocus = useRef(false);

  // In-place mode: move focus to the iframe so keyboard / screen-reader users
  // don't lose context when the trigger button unmounts.
  useEffect(() => {
    if (playing && !lightbox) {
      iframeRef.current?.focus();
    }
  }, [playing, lightbox]);

  useEffect(() => {
    if (!playing && returnFocus.current) {
      returnFocus.current = false;
      buttonRef.current?.focus();
    }
  }, [playing]);

  if (playing && !lightbox) {
    return (
      <iframe
        ref={iframeRef}
        src={`https://www.youtube-nocookie.com/embed/${videoId}?autoplay=1`}
        title={title}
        allow="autoplay; encrypted-media; picture-in-picture; fullscreen"
        allowFullScreen
        className="aspect-video w-full rounded-lg border border-border"
      />
    );
  }

  return (
    <>
      <button
        ref={buttonRef}
        onClick={() => setPlaying(true)}
        aria-label={`Reproducir: ${title}`}
        // Lightbox: the focus ring is drawn by an ::after ON TOP of the
        // thumbnail. On the home and on /tendencias the button is as wide as its
        // card, whose overflow-hidden cut the global outline (2 px outside) down
        // to a line; an outline pulled inside is painted UNDER the positioned
        // next/image fill, so it did not show at all (18-oct QA, 0 px changed).
        className={cn(
          "group relative block aspect-video w-full overflow-hidden rounded-lg border border-border bg-muted",
          lightbox &&
            "focus-visible:outline-none after:pointer-events-none after:absolute after:inset-0 after:z-10 after:rounded-[inherit] focus-visible:after:ring-[3px] focus-visible:after:ring-inset focus-visible:after:ring-ring",
        )}
      >
        <Image
          src={src}
          alt=""
          fill
          sizes={sizes}
          preload={priority || undefined}
          // next/image re-sets the src after hydration when onError is given,
          // so an error that happened before React attached it is not lost.
          onError={fallbackThumbnail ? switchToFallback : undefined}
          onLoad={
            fallbackThumbnail
              ? (event) => {
                  if (isYouTubePlaceholder(event.currentTarget.naturalWidth)) switchToFallback();
                }
              : undefined
          }
          className="object-cover transition-transform duration-300 group-hover:scale-105"
        />
        <span className="absolute inset-0 bg-black/30 transition group-hover:bg-black/45" />
        <span className="absolute left-1/2 top-1/2 grid size-14 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full bg-primary/90 text-primary-foreground shadow-lg transition group-hover:scale-110">
          <Play className="size-6 translate-x-0.5" fill="currentColor" />
        </span>
      </button>
      {playing && lightbox && (
        <VideoModal
          videoId={videoId}
          title={title}
          onClose={() => {
            returnFocus.current = true;
            setPlaying(false);
          }}
        />
      )}
    </>
  );
}
