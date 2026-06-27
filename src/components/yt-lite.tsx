"use client";

import { YouTubeFacade } from "@/components/youtube-facade";
import type { YouTubeVideo } from "@/lib/youtube";

// Thin adapter over the shared <YouTubeFacade> for the YouTubeVideo objects the
// /videos page works with. Keeps the home/videos grid fast (no player until click).
export function YtLite({
  video,
  priority = false,
}: {
  video: YouTubeVideo;
  priority?: boolean;
}) {
  return (
    <YouTubeFacade
      videoId={video.videoId}
      title={video.title}
      thumbnail={video.thumbnail}
      sizes="(max-width:768px) 100vw, 360px"
      priority={priority}
    />
  );
}
