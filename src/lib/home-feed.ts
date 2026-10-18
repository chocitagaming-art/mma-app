import { mergeTrendingItems, type TrendingItem } from "@/lib/trending";
import type { NewsArticle } from "@/lib/types";
import type { YouTubeVideo } from "@/lib/youtube";

// The home's «Noticias y vídeos» (R10, the owner's decision of 18-oct-2026):
// 9 pieces, 6 news + 3 videos (the ones of the old «Lo último en vídeo»
// column), mixed with THE SAME rule as /tendencias (mergeTrendingItems: news
// get 12 h of advantage, never more than 2 videos in a row). No big card.
//
// Pure (no Next, no database; YouTubeVideo is a type-only import, youtube.ts
// is server-only at runtime), so the quota and the order are unit-tested.
//
// Why 9: it fills whole rows with 1 and 3 columns (at 2 columns the 9th card
// is hidden by the section, see home-news-section.tsx).

export const HOME_FEED_TOTAL = 9;
export const HOME_FEED_VIDEOS = 3;

export type HomeFeedOptions = { total?: number; videos?: number };

export function homeFeedKey(item: TrendingItem): string {
  return item.type === "news" ? `n-${item.article.id}` : `v-${item.video.videoId}`;
}

// The first `count` items of a merge that has only ONE source: that is the
// source sorted by the same score mergeTrendingItems uses (stable, so equal
// dates keep the order they came in), without re-implementing it here.
function newestNews(news: NewsArticle[], count: number): NewsArticle[] {
  return mergeTrendingItems(news, [])
    .slice(0, count)
    .flatMap((item) => (item.type === "news" ? [item.article] : []));
}

function newestVideos(videos: YouTubeVideo[], count: number): YouTubeVideo[] {
  return mergeTrendingItems([], videos)
    .slice(0, count)
    .flatMap((item) => (item.type === "video" ? [item.video] : []));
}

function uniqueBy<T>(list: T[], key: (item: T) => string | number): T[] {
  const seen = new Set<string | number>();
  return list.filter((item) => {
    const k = key(item);
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

/**
 * The pieces of the home's news-and-videos grid, in the order they are shown.
 *
 *   · News only with a photo (a card without one would be an empty box), and
 *     at most `videos` videos. Nothing repeated (same news id or videoId).
 *   · Short of videos (YouTube down, a quiet week): news fill up to `total`.
 *     Short of news: videos fill up to `total`.
 *   · The same input gives the same order on every call (the merge is
 *     deterministic): the ISR page never reshuffles between revalidations.
 */
export function pickHomeFeed(
  news: NewsArticle[],
  videos: YouTubeVideo[],
  { total = HOME_FEED_TOTAL, videos: videoQuota = HOME_FEED_VIDEOS }: HomeFeedOptions = {},
): TrendingItem[] {
  const withPhoto = uniqueBy(
    news.filter((article) => Boolean(article.imageUrl)),
    (article) => article.id,
  );
  const distinctVideos = uniqueBy(videos, (video) => video.videoId);

  let videoCount = Math.min(videoQuota, distinctVideos.length, total);
  const newsCount = Math.min(total - videoCount, withPhoto.length);
  // Not enough news: videos take the places left.
  videoCount = Math.min(distinctVideos.length, total - newsCount);

  return mergeTrendingItems(newestNews(withPhoto, newsCount), newestVideos(distinctVideos, videoCount));
}
