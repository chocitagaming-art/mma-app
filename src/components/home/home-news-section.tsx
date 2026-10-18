import Link from "next/link";

import { SectionHeading } from "@/components/section-heading";
import { TrendingCard } from "@/components/trending-card";
import { Button } from "@/components/ui/button";
import { HOME_FEED_VIDEOS, homeFeedKey, pickHomeFeed } from "@/lib/home-feed";
import type { NewsArticle } from "@/lib/types";
import { getUfcVideos } from "@/lib/youtube";

// The home's «Noticias y vídeos» (R10, the owner's decisions of 18-oct-2026):
// 9 pieces, 6 news + 3 videos mixed with the /tendencias rule
// (lib/home-feed.ts), in ONE full-width grid. The «Lo último en vídeo» column
// that used to sit on the right is gone: its videos are these. (R11, the
// Instagram of UFC Español, would bring a column back on the right.)
//
// Server Component: getUfcVideos reads the server-only YOUTUBE_API_KEY. It
// shares its 30-minute cache with /tendencias and /videos (same fetches), so
// the home spends no YouTube quota of its own. A YouTube failure leaves the
// news alone: pickHomeFeed fills the 9 places with them.
//
// The grid: 1 column on a phone (9 cards), 2 from 640 px, 3 from 1024 px (3
// full rows). At 2 columns an odd last card would sit alone in its row, so it
// is hidden there (8 visible, 4 full rows). 1920 looks like 1280: the home is
// capped at 1280 px (max-w-7xl).
//
// The videos are the lightbox facades of TrendingCard (YtLite): a thumbnail
// and a ▶, nothing of the player until the tap, and then the videos modal,
// whose player is in the turn manager (video-modal.tsx): one at a time.

export async function HomeNewsSection({ articles }: { articles: NewsArticle[] }) {
  const videos = await getUfcVideos({ limit: HOME_FEED_VIDEOS }).catch(() => []);
  const items = pickHomeFeed(articles, videos);
  const hideLastAtTwoColumns = items.length > 1 && items.length % 2 === 1;

  return (
    <section data-home-feed className="mx-auto max-w-7xl space-y-7 px-4 py-12 sm:px-6 lg:px-8 lg:py-16">
      <SectionHeading
        eyebrow="Lo último"
        title="Noticias y vídeos"
        description="Lo más reciente del mundo UFC: noticias con foto y titular, y vídeos de canales en español."
      />
      {items.length > 0 ? (
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {items.map((item, i) => (
            <TrendingCard
              key={homeFeedKey(item)}
              item={item}
              className={hideLastAtTwoColumns && i === items.length - 1 ? "sm:max-lg:hidden" : undefined}
            />
          ))}
        </div>
      ) : null}
      {/* Under the grid: more of the same (/tendencias mixes news and videos
          with the same rule) and the upcoming cards. */}
      <div className="flex flex-col gap-3 pt-1 sm:flex-row sm:justify-center">
        <Link href="/tendencias" className="w-full sm:w-auto">
          <Button size="lg" className="h-10 w-full px-6 sm:w-auto">
            Más noticias y vídeos →
          </Button>
        </Link>
        <Link href="/eventos?view=proximos" className="w-full sm:w-auto">
          <Button size="lg" className="h-10 w-full px-6 sm:w-auto">
            Próximas carteleras →
          </Button>
        </Link>
      </div>
    </section>
  );
}
