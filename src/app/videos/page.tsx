import type { Metadata } from "next";

import { ChannelDirectoryCard } from "@/components/channel-directory-card";
import { SectionHeading } from "@/components/section-heading";
import { getChannelDirectory } from "@/lib/youtube";

// Los datos se cachean por la revalidación del módulo (30 min). NO force-dynamic:
// anularía esa caché y dispararía la cuota de la API de YouTube en cada visita.
export const revalidate = 1800;

export const metadata: Metadata = {
  title: "Vídeos",
  description:
    "Directorio de canales de MMA en español en YouTube: historias, resúmenes de eventos, análisis, entrevistas y noticias de UFC.",
};

export default async function VideosPage() {
  const channels = await getChannelDirectory(6);
  // Muestra un canal si tiene vídeos o al menos avatar (identidad). Solo se ocultan
  // los que fallan por completo (API caída y sin metadatos).
  const visible = channels.filter((c) => c.videos.length > 0 || c.avatar);

  return (
    <div className="mx-auto max-w-7xl space-y-8 px-4 py-12 sm:px-6 lg:px-8 lg:py-16">
      <SectionHeading
        eyebrow="Vídeos · Canales en español"
        title="Canales de MMA"
        description="Los mejores canales de MMA en español de YouTube. Explora sus últimos vídeos —se reproducen aquí mismo— y suscríbete a los que más te gusten."
      />

      {visible.length ? (
        <div className="space-y-6">
          {visible.map((channel) => (
            <ChannelDirectoryCard key={channel.channelId} channel={channel} />
          ))}
        </div>
      ) : (
        <p className="rounded-lg border border-dashed border-border bg-card p-10 text-center font-mono text-sm text-muted-foreground">
          No hay canales disponibles ahora mismo.
        </p>
      )}
    </div>
  );
}
