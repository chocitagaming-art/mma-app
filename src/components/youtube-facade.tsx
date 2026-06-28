"use client";

import Image from "next/image";
import { Play } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { VideoModal } from "@/components/video-modal";

// Shared "facade": render the thumbnail + play button first and only mount the
// player after the user clicks (keeps pages fast, no 3rd-party player scripts
// until intent).
//
// Two play modes:
//  - in-place (default): the youtube-nocookie iframe replaces the thumbnail in
//    the same slot. Used by the hero reel and the fight-page player.
//  - lightbox: clicking opens a large centered <VideoModal> overlay; the
//    thumbnail stays in place. Used by the /videos grid and the home column.
export function YouTubeFacade({
  videoId,
  title,
  thumbnail,
  sizes = "(max-width:768px) 100vw, 768px",
  priority = false,
  lightbox = false,
}: {
  videoId: string;
  title: string;
  thumbnail: string;
  sizes?: string;
  priority?: boolean;
  lightbox?: boolean;
}) {
  const [playing, setPlaying] = useState(false);
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);

  // In-place mode: move focus to the iframe so keyboard / screen-reader users
  // don't lose context when the trigger button unmounts.
  useEffect(() => {
    if (playing && !lightbox) {
      iframeRef.current?.focus();
    }
  }, [playing, lightbox]);

  if (playing && !lightbox) {
    return (
      <iframe
        ref={iframeRef}
        src={`https://www.youtube-nocookie.com/embed/${videoId}?autoplay=1`}
        title={title}
        allow="accelerated-rotation; autoplay; encrypted-media; picture-in-picture; fullscreen"
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
        className="group relative block aspect-video w-full overflow-hidden rounded-lg border border-border bg-muted"
      >
        <Image
          src={thumbnail}
          alt=""
          fill
          sizes={sizes}
          preload={priority || undefined}
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
            setPlaying(false);
            buttonRef.current?.focus();
          }}
        />
      )}
    </>
  );
}
