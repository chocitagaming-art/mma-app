import type { Metadata } from "next";

import { SectionHeading } from "@/components/section-heading";
import { YtLite } from "@/components/yt-lite";
import { getUfcVideos, YOUTUBE_CATEGORIES } from "@/lib/youtube";

// Los vídeos se cachean por la revalidación del módulo (30 min). NO force-dynamic:
// anularía esa caché y dispararía la cuota de la API de YouTube en cada visita.
export const revalidate = 1800;

export const metadata: Metadata = {
  title: "Vídeos",
  description:
    "Historias de luchadores, resúmenes de eventos, análisis y entrevistas de UFC/MMA desde canales en español de YouTube.",
};

export default async function VideosPage() {
  const sections = await Promise.all(
    YOUTUBE_CATEGORIES.map(async (cat) => ({
      ...cat,
      videos: await getUfcVideos({ category: cat.key, limit: 6 }),
    })),
  );
  const withVideos = sections.filter((s) => s.videos.length > 0);

  return (
    <div className="mx-auto max-w-7xl space-y-12 px-4 py-12 sm:px-6 lg:px-8 lg:py-16">
      <SectionHeading
        eyebrow="Vídeos · Canales en español"
        title="Vídeos UFC"
        description="Historias, resúmenes de eventos, análisis y entrevistas, desde canales en español de YouTube. Se reproducen aquí mismo."
      />

      {withVideos.length ? (
        withVideos.map((section) => (
          <section key={section.key} className="space-y-6">
            <h2 className="font-display text-2xl font-bold uppercase tracking-tight text-foreground">
              {section.label}
            </h2>
            <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
              {section.videos.map((video, i) => (
                <div key={video.videoId} className="space-y-2">
                  <YtLite video={video} priority={i < 3} />
                  <div>
                    <p className="line-clamp-2 text-sm font-medium text-foreground">
                      {video.title}
                    </p>
                    <p className="font-mono text-[11px] uppercase tracking-wide text-muted-foreground">
                      {video.channelTitle}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </section>
        ))
      ) : (
        <p className="rounded-lg border border-dashed border-border bg-card p-10 text-center font-mono text-sm text-muted-foreground">
          No hay vídeos disponibles ahora mismo.
        </p>
      )}
    </div>
  );
}
