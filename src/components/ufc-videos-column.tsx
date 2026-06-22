import { getUfcVideos, type YouTubeCategory } from "@/lib/youtube";
import { YtLite } from "@/components/yt-lite";
import { SectionHeading } from "@/components/section-heading";

// Server Component: fetches official UFC videos and renders them as a vertical
// column of facade players (YtLite). Safe to import server-side only — it pulls
// getUfcVideos, which reads the server-only YOUTUBE_API_KEY.
export async function UfcVideosColumn({
  limit = 5,
  category,
  title = "Publicaciones UFC",
  eyebrow = "Oficial · YouTube",
  description,
}: {
  limit?: number;
  category?: YouTubeCategory;
  title?: string;
  eyebrow?: string;
  description?: string;
}) {
  const videos = await getUfcVideos({ limit, category });
  if (!videos.length) return null;

  return (
    <aside className="space-y-5">
      <SectionHeading eyebrow={eyebrow} title={title} description={description} />
      <div className="space-y-4">
        {videos.map((v, i) => (
          <div key={v.videoId} className="space-y-2">
            <YtLite video={v} priority={i === 0} />
            <div>
              <p className="line-clamp-2 text-sm font-medium text-foreground">
                {v.title}
              </p>
              <p className="font-mono text-[11px] uppercase tracking-wide text-muted-foreground">
                {v.channelTitle}
              </p>
            </div>
          </div>
        ))}
      </div>
    </aside>
  );
}
