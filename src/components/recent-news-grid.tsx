import { NewsImage } from "@/components/news-image";
import { getRecentNews } from "@/lib/queries/news";
import { safeExternalUrl } from "@/lib/utils";

export async function RecentNewsGrid({ limit = 6 }: { limit?: number }) {
  const articles = await getRecentNews(limit, { requireImage: true });

  if (!articles.length) {
    return null;
  }

  return (
    <div className="grid gap-5 sm:grid-cols-2">
      {articles.map((article) => (
        <a
          key={article.id}
          href={safeExternalUrl(article.url)}
          target="_blank"
          rel="noreferrer"
          className="group block overflow-hidden rounded-lg border border-border bg-card transition-all duration-200 hover:border-primary/50 hover:shadow-lg"
        >
          <div className="relative overflow-hidden">
            <NewsImage
              src={article.imageUrl}
              alt={article.headline}
              className="aspect-video w-full transition-transform duration-300 group-hover:scale-105"
            />
            {article.category && (
              <span className="absolute left-3 top-3 z-10 rounded bg-primary px-2 py-0.5 font-mono text-[10px] font-semibold uppercase tracking-wide text-primary-foreground">
                {article.category}
              </span>
            )}
          </div>
          <div className="p-4">
            <h3 className="line-clamp-2 font-display text-base font-bold uppercase leading-tight tracking-tight text-foreground">
              {article.headline}
            </h3>
            <p className="mt-2 font-mono text-xs text-muted-foreground">
              {article.source ?? "MMA STATUS"}
            </p>
          </div>
        </a>
      ))}
    </div>
  );
}
