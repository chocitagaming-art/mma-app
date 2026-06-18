import Link from "next/link";
import type { Metadata } from "next";

import { SectionHeading } from "@/components/section-heading";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { formatDate } from "@/lib/format";
import { getNews } from "@/lib/queries/news";

type NewsPageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export const metadata: Metadata = {
  title: "Noticias",
  description: "Últimos artículos de noticias de MMA vinculados a luchadores en la base de datos en vivo.",
};

function getSingleValue(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] ?? "" : value ?? "";
}

function truncateSummary(summary: string | null, maxLength = 180) {
  if (!summary) {
    return "No hay resumen disponible para este artículo.";
  }

  if (summary.length <= maxLength) {
    return summary;
  }

  return `${summary.slice(0, maxLength).trimEnd()}…`;
}

export default async function NewsPage({ searchParams }: NewsPageProps) {
  const params = await searchParams;
  const category = getSingleValue(params.category);
  const result = await getNews(category);

  const createCategoryHref = (nextCategory: string) =>
    nextCategory ? `/news?category=${encodeURIComponent(nextCategory)}` : "/news";

  return (
    <div className="mx-auto max-w-7xl space-y-10 px-4 py-12 sm:px-6 lg:px-8">
      <SectionHeading
        eyebrow="Noticias"
        title="Últimos titulares de MMA"
        description="Sigue historias recientes desde la tabla de noticias, filtra por categoría y salta directamente a perfiles de luchadores vinculados."
      />

      <Card className="border-white/10 bg-white/5">
        <CardContent className="space-y-4 p-6">
          <div className="flex flex-wrap gap-3">
            <Link href={createCategoryHref("")}>
              <Button
                variant={result.activeCategory ? "secondary" : "default"}
                className={
                  result.activeCategory
                    ? "bg-white/10 text-zinc-200 hover:bg-white/15 hover:text-white"
                    : "bg-red-500 text-white hover:bg-red-400"
                }
              >
                Todas
              </Button>
            </Link>
            {result.categories.map((item) => {
              const isActive = item === result.activeCategory;

              return (
                <Link key={item} href={createCategoryHref(item)}>
                  <Button
                    variant={isActive ? "default" : "secondary"}
                    className={
                      isActive
                        ? "bg-red-500 text-white hover:bg-red-400"
                        : "bg-white/10 text-zinc-200 hover:bg-white/15 hover:text-white"
                    }
                  >
                    {item}
                  </Button>
                </Link>
              );
            })}
          </div>
          <p className="text-sm text-zinc-400">
            Mostrando <span className="font-semibold text-white">{result.articles.length}</span>{" "}
            artículos{result.activeCategory ? ` en ${result.activeCategory}` : ""}.
          </p>
        </CardContent>
      </Card>

      <div className="grid gap-5">
        {result.articles.length ? (
          result.articles.map((article) => (
            <Card
              key={article.id}
              className="border-white/10 bg-white/5 transition hover:border-red-400/30 hover:bg-white/[0.07]"
            >
              <CardContent className="space-y-4 p-6">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="space-y-3">
                    <div className="flex flex-wrap gap-2">
                      <Badge className="border-red-400/20 bg-red-500/10 text-red-200">
                        {article.category ?? "General"}
                      </Badge>
                      <Badge variant="secondary" className="bg-white/10 text-zinc-200">
                        {article.source ?? "Unknown source"}
                      </Badge>
                    </div>
                    <a
                      href={article.url}
                      target="_blank"
                      rel="noreferrer"
                      className="block text-2xl font-semibold tracking-tight text-white transition hover:text-red-200"
                    >
                      {article.headline}
                    </a>
                  </div>
                  <p className="text-sm text-zinc-400">{formatDate(article.publishedAt)}</p>
                </div>
                <p className="max-w-4xl text-sm leading-7 text-zinc-300">
                  {truncateSummary(article.summary)}
                </p>
                <div className="flex flex-wrap items-center justify-between gap-3 border-t border-white/10 pt-4">
                  <div className="text-sm text-zinc-400">
                    {article.fighterId && article.fighterName ? (
                      <>
                        Luchador vinculado:{" "}
                        <Link
                          href={`/fighters/${article.fighterId}`}
                          className="font-medium text-red-200 transition hover:text-red-100"
                        >
                          {article.fighterName}
                        </Link>
                      </>
                    ) : (
                      "Sin luchador vinculado"
                    )}
                  </div>
                  <a
                    href={article.url}
                    target="_blank"
                    rel="noreferrer"
                    className="text-sm font-medium text-red-200 transition hover:text-red-100"
                  >
                    Leer artículo →
                  </a>
                </div>
              </CardContent>
            </Card>
          ))
        ) : (
          <Card className="border-dashed border-white/10 bg-white/5">
            <CardContent className="px-6 py-16 text-center">
              <p className="text-2xl font-semibold text-white">No se encontraron artículos de noticias</p>
              <p className="mt-3 text-sm text-zinc-400">
                Prueba otra categoría o vuelve más tarde para ver cobertura nueva de MMA.
              </p>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}