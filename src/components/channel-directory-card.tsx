import { ExternalLink } from "lucide-react";

import { YtLite } from "@/components/yt-lite";
import type { ChannelWithVideos } from "@/lib/youtube";

// Suscriptores compactos en español: 399000 → "399 mil", 1010000 → "1 M".
const SUBS_FMT = new Intl.NumberFormat("es-ES", {
  notation: "compact",
  maximumFractionDigits: 1,
});

// Tarjeta de un canal en el directorio de /videos: cabecera (avatar + nombre +
// suscriptores + "Ver canal") y sus últimos vídeos ya filtrados, jugables en el
// sitio (YtLite = facade con lightbox). Server component; YtLite es el único
// trozo cliente.
export function ChannelDirectoryCard({
  channel,
}: {
  channel: ChannelWithVideos;
}) {
  return (
    <section className="rounded-xl border border-border bg-card p-5 sm:p-6">
      <div className="flex items-center gap-4">
        {channel.avatar ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={channel.avatar}
            alt={`Avatar de ${channel.title}`}
            width={56}
            height={56}
            loading="lazy"
            className="size-14 shrink-0 rounded-full border border-border object-cover"
          />
        ) : (
          <div className="grid size-14 shrink-0 place-items-center rounded-full border border-border bg-muted font-display text-lg font-bold text-muted-foreground">
            {channel.title.slice(0, 1).toUpperCase()}
          </div>
        )}
        <div className="min-w-0 flex-1">
          <h2 className="truncate font-display text-lg font-bold uppercase tracking-tight text-foreground">
            {channel.title}
          </h2>
          <p className="font-mono text-[11px] uppercase tracking-wide text-muted-foreground">
            {channel.subscriberCount != null
              ? `${SUBS_FMT.format(channel.subscriberCount)} suscriptores`
              : channel.handle}
          </p>
        </div>
        <a
          href={channel.channelUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex shrink-0 items-center gap-1.5 rounded-md border border-primary px-3 py-1.5 font-mono text-xs font-semibold uppercase tracking-[0.12em] text-primary transition-colors hover:bg-primary/10"
        >
          <ExternalLink className="size-3.5" />
          <span className="hidden sm:inline">Ver canal</span>
          <span className="sm:hidden">Canal</span>
        </a>
      </div>

      {channel.videos.length ? (
        <div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {channel.videos.map((video) => (
            <div key={video.videoId} className="space-y-1.5">
              <YtLite video={video} />
              <p className="line-clamp-2 text-xs font-medium text-foreground">
                {video.title}
              </p>
            </div>
          ))}
        </div>
      ) : (
        <p className="mt-4 font-mono text-xs text-muted-foreground">
          No hay vídeos disponibles ahora mismo.
        </p>
      )}
    </section>
  );
}
