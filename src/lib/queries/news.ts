import { sql } from "@/lib/db";
import type {
  NewsArticle,
  NewsListResult,
  NewsSearchResult,
} from "@/lib/types";

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
  image_url: string | null;
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
    imageUrl: row.image_url,
  };
}

const PAGE_SIZE = 12;

// `page` es opcional para no romper consumidores antiguos (por defecto, primera página).
export async function getNews(
  category?: string,
  page = 1,
): Promise<NewsListResult> {
  const trimmedCategory = category?.trim() ?? "";
  const currentPage = Math.max(1, page);
  const offset = (currentPage - 1) * PAGE_SIZE;

  const whereClause = trimmedCategory ? `where n.category = $1` : "";
  // El filtro por categoría ocupa $1 cuando existe; LIMIT/OFFSET van detrás.
  const countValues: unknown[] = trimmedCategory ? [trimmedCategory] : [];
  const limitParam = trimmedCategory ? "$2" : "$1";
  const offsetParam = trimmedCategory ? "$3" : "$2";
  const articleValues: unknown[] = trimmedCategory
    ? [trimmedCategory, PAGE_SIZE, offset]
    : [PAGE_SIZE, offset];

  const [articleRows, categoryRows, countRows] = await Promise.all([
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
        n.relevance::text,
        n.image_url
      from news n
      left join fighters f on f.id = n.fighter_id
      ${whereClause}
      order by n.published_at desc nulls last, n.relevance desc nulls last, n.id desc
      limit ${limitParam} offset ${offsetParam}`,
      articleValues,
    ),
    sql<{ category: string }>(
      `select distinct category
       from news
       where category is not null
       order by category asc`,
    ),
    sql<{ total: string }>(
      `select count(*)::text as total
       from news n
       ${whereClause}`,
      countValues,
    ),
  ]);

  const total = Number(countRows[0]?.total ?? "0");
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return {
    articles: articleRows.map(mapNewsArticle),
    categories: categoryRows.map((row) => row.category),
    activeCategory: trimmedCategory,
    total,
    page: currentPage,
    pageSize: PAGE_SIZE,
    totalPages,
  };
}

type NewsSearchRow = {
  id: number;
  headline: string;
  source: string | null;
  url: string;
  published_at: string | null;
  image_url: string | null;
};

// Búsqueda de noticias por titular/resumen para el buscador global.
export async function searchNews(
  query: string,
  limit = 5,
): Promise<NewsSearchResult[]> {
  const trimmedQuery = query.trim();

  if (!trimmedQuery) {
    return [];
  }

  const rows = await sql<NewsSearchRow>(
    `select
        n.id,
        n.headline,
        n.source,
        n.url,
        n.published_at,
        n.image_url
      from news n
      where n.headline ilike $1 or n.summary ilike $1
      order by
        case when n.headline ilike $2 then 0 else 1 end,
        n.published_at desc nulls last,
        n.relevance desc nulls last,
        n.id desc
      limit $3`,
    [`%${trimmedQuery}%`, `${trimmedQuery}%`, limit],
  );

  return rows.map((row) => ({
    id: row.id,
    headline: row.headline,
    source: row.source,
    publishedAt: row.published_at,
    imageUrl: row.image_url,
    url: row.url,
  }));
}

// Últimas noticias para el Inicio (rejilla estilo ufc.com) y el marquee.
// `requireImage` filtra a las que tienen foto (la rejilla la necesita; el marquee no).
export async function getRecentNews(
  limit = 6,
  opts: { requireImage?: boolean } = {},
): Promise<NewsArticle[]> {
  const rows = await sql<NewsRow>(
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
        n.relevance::text,
        n.image_url
      from news n
      left join fighters f on f.id = n.fighter_id
      ${opts.requireImage ? "where n.image_url is not null" : ""}
      order by n.published_at desc nulls last, n.relevance desc nulls last, n.id desc
      limit $1`,
    [limit],
  );
  return rows.map(mapNewsArticle);
}