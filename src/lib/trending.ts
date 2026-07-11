import type { NewsArticle } from "@/lib/types";
import type { YouTubeVideo } from "@/lib/youtube";

// T3-B: feed unificado de /tendencias — noticias (tabla news) + vídeos
// (getUfcVideos) mezclados por fecha desc, estilo ufc.com/trending.
// Helper PURO (patrón mergeFightHistories): sin Next, sin BD; el import de
// YouTubeVideo es solo de tipo (youtube.ts es server-only en runtime).

export type TrendingItem =
  | { type: "news"; date: string | null; article: NewsArticle }
  | { type: "video"; date: string | null; video: YouTubeVideo };

// news.published_at llega como ISO string o como Date del driver de pg
// (mismo gotcha que eventTime en fight-history.ts); los vídeos traen ISO
// string o null. Normalizamos a ISO string parseable o null.
export function normalizeDateValue(value: unknown): string | null {
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value.toISOString();
  }
  if (typeof value === "string" && value.trim()) {
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? null : value;
  }
  return null;
}

function itemTime(item: TrendingItem): number {
  if (!item.date) {
    return Number.NEGATIVE_INFINITY;
  }
  const parsed = new Date(item.date).getTime();
  return Number.isNaN(parsed) ? Number.NEGATIVE_INFINITY : parsed;
}

export function mergeTrendingItems(
  news: NewsArticle[],
  videos: YouTubeVideo[],
): TrendingItem[] {
  const items: TrendingItem[] = [
    ...news.map(
      (article): TrendingItem => ({
        type: "news",
        date: normalizeDateValue(article.publishedAt),
        article,
      }),
    ),
    ...videos.map(
      (video): TrendingItem => ({
        type: "video",
        date: normalizeDateValue(video.publishedAt),
        video,
      }),
    ),
  ];
  // sort es estable: a fecha igual se conserva noticia antes que vídeo y el
  // orden interno que ya traía cada fuente (ambas llegan desc). Fechas
  // nulas/rotas al fondo.
  return items.sort((a, b) => itemTime(b) - itemTime(a));
}

// Cuántos ítems enseña /tendencias: "Cargar más" enlaza a ?mostrar=N+PASO
// (paginación del feed fusionado EN MEMORIA — los vídeos no tienen offset).
export const TRENDING_STEP = 12;

export function parseShowParam(value: string | undefined, total: number): number {
  const parsed = Number.parseInt(value ?? "", 10);
  const requested =
    Number.isFinite(parsed) && parsed > 0 ? parsed : TRENDING_STEP;
  // Nunca menos que un paso ni más que el feed disponible.
  return Math.min(Math.max(requested, TRENDING_STEP), Math.max(total, TRENDING_STEP));
}

// Tarjeta destacada (grande, 2 columnas) cada ~7 ítems, como ufc.com/trending.
export function isFeaturedIndex(index: number): boolean {
  return index % 7 === 0;
}
