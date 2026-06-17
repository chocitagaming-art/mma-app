import { sql } from "@/lib/db";
import type { NewsArticle, NewsListResult } from "@/lib/types";

type NewsRow = {
  id: number;
  headline: string;
  summary: string | null;
  source: string | null;
  url: string;
  published_at: string | null;
  fighter_id: number | null;
  fighter_name: string | null;
  category: string | null;
  relevance: string | null;
};

function mapNewsArticle(row: NewsRow): NewsArticle {
  return {
    id: row.id,
    headline: row.headline,
    summary: row.summary,
    source: row.source,
    url: row.url,
    publishedAt: row.published_at,
    fighterId: row.fighter_id,
    fighterName: row.fighter_name,
    category: row.category,
    relevance: row.relevance ? Number(row.relevance) : null,
  };
}

export async function getNews(category?: string): Promise<NewsListResult> {
  const trimmedCategory = category?.trim() ?? "";
  const values: unknown[] = [];
  const whereClause = trimmedCategory
    ? `where n.category = $1`
    : "";

  if (trimmedCategory) {
    values.push(trimmedCategory);
  }

  const [articleRows, categoryRows] = await Promise.all([
    sql<NewsRow>(
      `select
        n.id,
        n.headline,
        n.summary,
        n.source,
        n.url,
        n.published_at,
        n.fighter_id,
        f.name as fighter_name,
        n.category,
        n.relevance::text
      from news n
      left join fighters f on f.id = n.fighter_id
      ${whereClause}
      order by n.published_at desc nulls last, n.relevance desc nulls last, n.id desc`,
      values,
    ),
    sql<{ category: string }>(
      `select distinct category
       from news
       where category is not null
       order by category asc`,
    ),
  ]);

  return {
    articles: articleRows.map(mapNewsArticle),
    categories: categoryRows.map((row) => row.category),
    activeCategory: trimmedCategory,
  };
}