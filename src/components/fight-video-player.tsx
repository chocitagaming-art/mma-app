"use client";

import { YouTubeFacade } from "@/components/youtube-facade";

// Curated fight video (#43, Fase 10): a single YouTube id (no YouTubeVideo
// object). Delegates to the shared facade so it can't drift from <YtLite>.
export function FightVideoPlayer({
  videoId,
  title,
}: {
  videoId: string;
  title: string;
}) {
  return (
    <YouTubeFacade
      videoId={videoId}
      title={title}
      thumbnail={`https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`}
      sizes="(max-width:768px) 100vw, 768px"
    />
  );
}
