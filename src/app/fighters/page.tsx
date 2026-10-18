import Link from "next/link";
import type { Metadata } from "next";

import { FighterRosterCard } from "@/components/fighter-roster-card";
import { FightersFilterBar } from "@/components/fighters-filter-bar";
import { PaginationControls } from "@/components/pagination-controls";
import { SectionHeading } from "@/components/section-heading";
import { formatCount } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { getFighters } from "@/lib/queries/fighters";
import { parsePageParam } from "@/lib/route-params";

type FightersPageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export const metadata: Metadata = {
  title: "Luchadores",
  description: "Busca, filtra y ordena perfiles de peleadores desde la base de datos de MMA en vivo.",
  // Canónica sin parámetros a propósito: esta ruta acepta búsqueda, filtros y
  // orden, y cada combinación es la MISMA página. Sin esto, Google indexaría
  // decenas de variantes compitiendo entre sí.
  alternates: { canonical: "/fighters" },
};

function getSingleValue(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] ?? "" : value ?? "";
}

export default async function FightersPage({ searchParams }: FightersPageProps) {
  const params = await searchParams;
  const page = parsePageParam(params.page);
  const query = getSingleValue(params.q);
  const weightClass = getSingleValue(params.weightClass);
  const stance = getSingleValue(params.stance);
  const nationality = getSingleValue(params.nationality);
  const rawSort = getSingleValue(params.sort) || "relevance";
  const sort: "relevance" | "name" | "wins" | "losses" =
    rawSort === "name" || rawSort === "wins" || rawSort === "losses"
      ? rawSort
      : "relevance";

  const result = await getFighters({
    page,
    query,
    weightClass,
    stance,
    nationality,
    sort,
  });

  const createHref = (nextPage: number) => {
    const next = new URLSearchParams();

    if (query) next.set("q", query);
    if (weightClass) next.set("weightClass", weightClass);
    if (stance) next.set("stance", stance);
    if (nationality) next.set("nationality", nationality);
    if (sort && sort !== "relevance") next.set("sort", sort);
    if (nextPage > 1) next.set("page", String(nextPage));

    return `/fighters${next.toString() ? `?${next.toString()}` : ""}`;
  };

  return (
    <div className="mx-auto max-w-7xl space-y-10 px-4 py-12 sm:px-6 lg:px-8">
      <SectionHeading
        eyebrow="Explorador de plantilla"
        title="Explora cada luchador de la base de datos"
        description="Filtra por categoría de peso, guardia y nacionalidad, y luego ordena la plantilla para encontrar los perfiles que buscas."
      />

      {/* overflow-visible: the base Card clips, and the search suggestions are
          an absolute dropdown INSIDE it. With the selects folded away on phones
          the card ends 44 px under the search box, so it cut the list to 2 of 10
          results (on desktop it already cut it). Nothing in here needs clipping. */}
      <Card className="overflow-visible border-border bg-card">
        <CardContent className="space-y-6 p-4 md:p-6">
          <FightersFilterBar
            weightClasses={result.filterOptions.weightClasses}
            stances={result.filterOptions.stances}
            nationalities={result.filterOptions.nationalities}
            current={{ q: query, weightClass, stance, nationality, sort }}
          />
          <div className="flex flex-wrap items-center justify-between gap-3 text-sm text-muted-foreground">
            <p>
              Mostrando{" "}
              <span className="font-semibold text-foreground">{formatCount(result.fighters.length)}</span> de{" "}
              <span className="font-semibold text-foreground">{formatCount(result.total)}</span> luchadores
            </p>
            <Link href="/fighters">
              <Button variant="ghost" className="text-muted-foreground hover:bg-accent hover:text-foreground">
                Restablecer filtros
              </Button>
            </Link>
          </div>
        </CardContent>
      </Card>

      {result.fighters.length ? (
        <>
          {/* 2 columns on phones, 3 from 640 px, 4 from 1024 px: a page of 12 is 4×3. */}
          <div
            data-testid="roster-grid"
            className="grid grid-cols-2 gap-3.5 sm:grid-cols-3 sm:gap-[18px] lg:grid-cols-4 lg:gap-5"
          >
            {result.fighters.map((fighter, i) => (
              <FighterRosterCard
                key={fighter.id}
                fighter={fighter}
                priority={i < 4}
                style={{ animationDelay: `${Math.min(i, 10) * 40}ms` }}
                className="animate-rise"
              />
            ))}
          </div>
          <PaginationControls
            page={result.page}
            totalPages={result.totalPages}
            createHref={createHref}
          />
        </>
      ) : (
        <Card className="border-dashed border-border bg-card">
          <CardContent className="flex flex-col items-center gap-4 px-6 py-16 text-center">
            <p className="text-2xl font-semibold text-foreground">No se encontraron luchadores</p>
            <p className="max-w-md text-sm text-muted-foreground">
              Intenta ampliar tu búsqueda o quitar uno de los filtros activos.
            </p>
            <Link href="/fighters">
              <Button className="bg-primary text-primary-foreground hover:ring-3 hover:ring-primary/40">
                Ver plantilla completa
              </Button>
            </Link>
          </CardContent>
        </Card>
      )}
    </div>
  );
}