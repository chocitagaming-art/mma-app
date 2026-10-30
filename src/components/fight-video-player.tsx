"use client";

import { YouTubeFacade } from "@/components/youtube-facade";
import { youtubeThumbnail } from "@/lib/youtube-thumbnail";

// Curated fight video (#43, Fase 10): a single YouTube id (no YouTubeVideo
// object). Delegates to the shared facade so it can't drift from <YtLite>.
// Also the face-off, weigh-in and press conference of an event. The poster is
// sddefault with hqdefault as the fallback (lib/youtube-thumbnail.ts: YouTube
// kept serving a stale hqdefault for hours on 30-oct-2026).
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
      thumbnail={youtubeThumbnail(videoId, "sddefault")}
      fallbackThumbnail={youtubeThumbnail(videoId, "hqdefault")}
      sizes="(max-width:768px) 100vw, 768px"
    />
  );
}
