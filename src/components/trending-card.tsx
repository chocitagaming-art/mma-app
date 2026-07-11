import { NewsImage } from "@/components/news-image";
import { YtLite } from "@/components/yt-lite";
import { formatNewsCategory, formatRelativeDate } from "@/lib/format";
import type { TrendingItem } from "@/lib/trending";
import { cn, safeExternalUrl } from "@/lib/utils";

// T3-B: tarjeta unificada del mosaico de /tendencias, estilo ufc.com/trending.
// Dos variantes con la MISMA anatomía (media + chip + titular display +
// fuente/fecha relativa): noticia = <a> externo con NewsImage (CDNs de
// terceros: img nativa + no-referrer, jamás next/image); vídeo = YtLite que
// reproduce IN-PAGE (no navega), con el chip rojo VÍDEO superpuesto.
// featured: tarjeta grande (2 columnas en sm+), una cada ~7 ítems.

function CardChip({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "pointer-events-none absolute left-3 top-3 z-10 rounded bg-primary px-2 py-0.5 font-mono text-[10px] font-semibold uppercase tracking-wide text-primary-foreground",
        className,
      )}
    >
      {children}
    </span>
  );
}

function CardMeta({
  left,
  date,
}: {
  left: string;
  date: string | null;
}) {
  const relative = formatRelativeDate(date);
  return (
    <p className="mt-2 truncate font-mono text-xs uppercase tracking-wide text-muted-foreground">
      {left}
      {relative ? <span className="normal-case"> · {relative}</span> : null}
    </p>
  );
}

export function TrendingCard({
  item,
  featured = false,
  priority = false,
}: {
  item: TrendingItem;
  featured?: boolean;
  priority?: boolean;
}) {
  const titleClass = cn(
    "line-clamp-2 font-display font-bold uppercase leading-tight tracking-tight text-foreground",
    featured ? "text-xl sm:text-2xl" : "text-base",
  );

  if (item.type === "news") {
    const { article } = item;
    return (
      <a
        href={safeExternalUrl(article.url)}
        target="_blank"
        rel="noreferrer"
        className={cn(
          "group block overflow-hidden rounded-lg border border-border bg-card transition-all duration-200 hover:border-primary/50 hover:shadow-lg",
          featured && "sm:col-span-2",
        )}
      >
        <div className="relative overflow-hidden">
          <NewsImage
            src={article.imageUrl}
            alt={article.headline}
            className="aspect-video w-full transition-transform duration-300 group-hover:scale-105"
          />
          <CardChip>{formatNewsCategory(article.category)}</CardChip>
        </div>
        <div className="p-4">
          <h3 className={titleClass}>{article.headline}</h3>
          <CardMeta left={article.source ?? "MMA STATUS"} date={item.date} />
        </div>
      </a>
    );
  }

  const { video } = item;
  return (
    <div
      className={cn(
        "group overflow-hidden rounded-lg border border-border bg-card transition-all duration-200 hover:border-primary/50 hover:shadow-lg",
        featured && "sm:col-span-2",
      )}
    >
      <div className="relative">
        <YtLite video={video} priority={priority} />
        <CardChip>Vídeo</CardChip>
      </div>
      <div className="p-4">
        <h3 className={titleClass}>{video.title}</h3>
        <CardMeta left={video.channelTitle} date={item.date} />
      </div>
    </div>
  );
}
