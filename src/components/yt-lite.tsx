"use client";

import type { YouTubeVideo } from "@/lib/youtube";
import Image from "next/image";
import { Play } from "lucide-react";
import { useState } from "react";

// "Facade" pattern: render the thumbnail + play button first and only mount the
// YouTube iframe after the user clicks. Keeps the home page fast (no third-party
// player scripts until intent).
export function YtLite({
  video,
  priority = false,
}: {
  video: YouTubeVideo;
  priority?: boolean;
}) {
  const [playing, setPlaying] = useState(false);

  if (playing) {
    return (
      <iframe
        src={`https://www.youtube-nocookie.com/embed/${video.videoId}?autoplay=1`}
        title={video.title}
        allow="accelerated-rotation; autoplay; encrypted-media; picture-in-picture; fullscreen"
        allowFullScreen
        className="aspect-video w-full rounded-lg border border-border"
      />
    );
  }

  return (
    <button
      onClick={() => setPlaying(true)}
      aria-label={`Reproducir: ${video.title}`}
      className="group relative block aspect-video w-full overflow-hidden rounded-lg border border-border bg-muted"
    >
      <Image
        src={video.thumbnail}
        alt=""
        fill
        sizes="(max-width:768px) 100vw, 360px"
        preload={priority || undefined}
        className="object-cover transition-transform duration-300 group-hover:scale-105"
      />
      <span className="absolute inset-0 bg-black/30 transition group-hover:bg-black/45" />
      <span className="absolute left-1/2 top-1/2 grid size-14 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full bg-primary/90 text-primary-foreground shadow-lg transition group-hover:scale-110">
        <Play className="size-6 translate-x-0.5" fill="currentColor" />
      </span>
    </button>
  );
}
