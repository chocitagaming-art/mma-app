import type { NewsArticle } from "@/lib/types";
import { safeExternalUrl } from "@/lib/utils";

export function NewsMarquee({ articles }: { articles: NewsArticle[] }) {
  if (articles.length === 0) return null;

  // Duplicate the list so the RTL animation can loop without a visible seam.
  const items = [...articles, ...articles];

  return (
    <div className="marquee-host group relative overflow-hidden border-y border-border bg-card">
      {/* Fixed "NOTICIAS" label pinned to the left, with a fade into the reel. */}
      <div className="pointer-events-none absolute inset-y-0 left-0 z-10 flex items-center">
        <span className="flex h-full items-center bg-primary px-3 font-mono text-[10px] font-semibold uppercase tracking-widest text-primary-foreground">
          Noticias
        </span>
        <span className="h-full w-10 bg-gradient-to-r from-card to-transparent" />
      </div>

      <div className="animate-marquee flex w-max items-center gap-8 py-2.5">
        {items.map((article, index) => (
          <a
            key={`${article.id}-${index}`}
            href={safeExternalUrl(article.url)}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-2.5 whitespace-nowrap px-1 transition-colors hover:text-primary"
          >
            {article.category ? (
              <span className="font-mono text-[10px] uppercase tracking-widest text-primary">
                {article.category}
              </span>
            ) : null}
            <span className="text-sm font-medium text-foreground">
              {article.headline}
            </span>
            <span className="text-primary">&rarr;</span>
          </a>
        ))}
      </div>
    </div>
  );
}
