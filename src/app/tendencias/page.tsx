import Link from "next/link";
import type { Metadata } from "next";

import { SectionHeading } from "@/components/section-heading";
import { TrendingCard } from "@/components/trending-card";
import { formatNewsCategory } from "@/lib/format";
import { getNewsCategories, getTrendingNews } from "@/lib/queries/news";
import {
  TRENDING_STEP,
  isFeaturedIndex,
  mergeTrendingItems,
  parseShowParam,
} from "@/lib/trending";
import { cn } from "@/lib/utils";
import { getUfcVideos, YOUTUBE_CATEGORIES, type YouTubeCategory } from "@/lib/youtube";

// T3-B: Tendencias — noticias + vídeos unificados en tarjetas (sustituye al
// chip Noticias; /news redirige aquí). La página es dinámica por searchParams,
// pero la cuota de YouTube queda protegida por el revalidate 1800 A NIVEL DE
// FETCH dentro de youtube.ts — jamás poner force-dynamic aquí (mismo aviso
// que /videos). Paginación: feed fusionado EN MEMORIA con ?mostrar=N
// acumulativo ("Cargar más"), porque los vídeos no tienen offset de API.

export const metadata: Metadata = {
  title: "Tendencias",
  description:
    "Lo último de UFC/MMA en un solo sitio: noticias y vídeos en español ordenados por fecha, estilo tarjetas.",
};

type TendenciasPageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

function getSingleValue(value: string | string[] | undefined) {
  return Array.isArray(value) ? (value[0] ?? "") : (value ?? "");
}

const NEWS_POOL = 48;
const VIDEO_POOL = 24;

type FeedKind = "todo" | "noticias" | "videos";

function parseKind(value: string): FeedKind {
  return value === "noticias" || value === "videos" ? value : "todo";
}

const VIDEO_CATEGORY_KEYS = new Set(YOUTUBE_CATEGORIES.map((cat) => cat.key));

export default async function TendenciasPage({ searchParams }: TendenciasPageProps) {
  const params = await searchParams;
  const kind = parseKind(getSingleValue(params.tipo));
  const rawCategory = getSingleValue(params.categoria);

  // La categoría solo aplica dentro de su pestaña (taxonomías distintas:
  // slugs de la tabla news vs las 4 categorías fijas de YouTube).
  const newsCategory = kind === "noticias" ? rawCategory : "";
  const videoCategory =
    kind === "videos" && VIDEO_CATEGORY_KEYS.has(rawCategory as YouTubeCategory)
      ? (rawCategory as YouTubeCategory)
      : undefined;

  const [news, videos, newsCategories] = await Promise.all([
    kind === "videos"
      ? Promise.resolve([])
      : getTrendingNews(NEWS_POOL, newsCategory),
    kind === "noticias"
      ? Promise.resolve([])
      : // getUfcVideos ya degrada por canal, pero un fallo total (API caída
        // sin fallback RSS) no debe tumbar Tendencias: solo-noticias.
        getUfcVideos({
          limit: kind === "videos" ? NEWS_POOL : VIDEO_POOL,
          category: videoCategory,
        }).catch(() => []),
    getNewsCategories().catch(() => []),
  ]);

  const feed = mergeTrendingItems(news, videos);
  const shown = parseShowParam(getSingleValue(params.mostrar), feed.length);
  const items = feed.slice(0, shown);
  const hasMore = feed.length > items.length;

  const createHref = (next: {
    tipo?: FeedKind;
    categoria?: string;
    mostrar?: number;
  }) => {
    const search = new URLSearchParams();
    const tipo = next.tipo ?? kind;
    const categoria = next.categoria ?? "";
    if (tipo !== "todo") {
      search.set("tipo", tipo);
    }
    if (categoria) {
      search.set("categoria", categoria);
    }
    if (next.mostrar && next.mostrar > TRENDING_STEP) {
      search.set("mostrar", String(next.mostrar));
    }
    const query = search.toString();
    return query ? `/tendencias?${query}` : "/tendencias";
  };

  const primaryTabs: { key: FeedKind; label: string }[] = [
    { key: "todo", label: "Todo" },
    { key: "noticias", label: "Noticias" },
    { key: "videos", label: "Vídeos" },
  ];

  const secondaryChips: { key: string; label: string }[] =
    kind === "noticias"
      ? newsCategories.map((category) => ({
          key: category,
          label: formatNewsCategory(category),
        }))
      : kind === "videos"
        ? YOUTUBE_CATEGORIES.map((cat) => ({ key: cat.key, label: cat.label }))
        : [];

  const activeCategory = kind === "noticias" ? newsCategory : (videoCategory ?? "");

  return (
    <div className="mx-auto max-w-7xl space-y-8 px-4 py-12 sm:px-6 lg:px-8 lg:py-16">
      <SectionHeading
        eyebrow="Tendencias"
        title="Lo último de la MMA"
        description="Noticias y vídeos en español, mezclados y ordenados por fecha. Los vídeos se reproducen aquí mismo."
      />

      <div className="space-y-3">
        <div className="flex flex-wrap gap-2" role="tablist" aria-label="Tipo de contenido">
          {primaryTabs.map((tab) => {
            const isActive = tab.key === kind;
            return (
              <Link
                key={tab.key}
                role="tab"
                aria-selected={isActive}
                href={createHref({ tipo: tab.key, categoria: "", mostrar: 0 })}
                className={cn(
                  "rounded-full border px-4 py-1.5 font-mono text-xs font-semibold uppercase tracking-[0.12em] transition-colors",
                  isActive
                    ? "border-primary bg-primary text-primary-foreground"
                    : "border-border bg-card text-muted-foreground hover:border-primary/50 hover:text-foreground",
                )}
              >
                {tab.label}
              </Link>
            );
          })}
        </div>

        {secondaryChips.length > 0 ? (
          <div className="flex flex-wrap gap-2">
            <Link
              href={createHref({ categoria: "", mostrar: 0 })}
              className={cn(
                "rounded-full border px-3 py-1 font-mono text-[0.65rem] uppercase tracking-[0.1em] transition-colors",
                !activeCategory
                  ? "border-primary/50 bg-primary/10 text-primary"
                  : "border-border text-muted-foreground hover:text-foreground",
              )}
            >
              Todas
            </Link>
            {secondaryChips.map((chip) => {
              const isActive = chip.key === activeCategory;
              return (
                <Link
                  key={chip.key}
                  href={createHref({ categoria: isActive ? "" : chip.key, mostrar: 0 })}
                  className={cn(
                    "rounded-full border px-3 py-1 font-mono text-[0.65rem] uppercase tracking-[0.1em] transition-colors",
                    isActive
                      ? "border-primary/50 bg-primary/10 text-primary"
                      : "border-border text-muted-foreground hover:text-foreground",
                  )}
                >
                  {chip.label}
                </Link>
              );
            })}
          </div>
        ) : null}
      </div>

      {items.length ? (
        <>
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {items.map((item, i) => (
              <TrendingCard
                key={item.type === "news" ? `n-${item.article.id}` : `v-${item.video.videoId}`}
                item={item}
                featured={isFeaturedIndex(i)}
                priority={i < 2}
              />
            ))}
          </div>

          {hasMore ? (
            <div className="flex justify-center pt-2">
              {/* scroll={false}: el feed es acumulativo (slice 0..N), así que
                  la página no salta arriba al cargar más. */}
              <Link
                href={createHref({
                  categoria: activeCategory,
                  mostrar: shown + TRENDING_STEP,
                })}
                scroll={false}
                className="inline-flex items-center gap-2 rounded-md border border-primary px-5 py-2.5 font-mono text-xs font-semibold uppercase tracking-[0.12em] text-primary transition-colors hover:bg-primary/10"
              >
                Cargar más
              </Link>
            </div>
          ) : null}
        </>
      ) : (
        <p className="rounded-lg border border-dashed border-border bg-card p-10 text-center font-mono text-sm text-muted-foreground">
          No hay contenido disponible ahora mismo. Vuelve en un rato.
        </p>
      )}
    </div>
  );
}
