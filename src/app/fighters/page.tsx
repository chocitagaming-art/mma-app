import Link from "next/link";
import type { Metadata } from "next";

import { CountryFlag } from "@/components/country-flag";
import { FightersFilterBar } from "@/components/fighters-filter-bar";
import { FighterHeadshot } from "@/components/fighter-headshot";
import { PaginationControls } from "@/components/pagination-controls";
import { SectionHeading } from "@/components/section-heading";
import { formatRecord, formatWeightClass } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { getFighters } from "@/lib/queries/fighters";

type FightersPageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export const metadata: Metadata = {
  title: "Luchadores",
  description: "Busca, filtra y ordena perfiles de peleadores desde la base de datos de MMA en vivo.",
};

function getSingleValue(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] ?? "" : value ?? "";
}

export default async function FightersPage({ searchParams }: FightersPageProps) {
  const params = await searchParams;
  const page = Number(getSingleValue(params.page) || "1");
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

      <Card className="border-border bg-card">
        <CardContent className="space-y-6 p-6">
          <FightersFilterBar
            weightClasses={result.filterOptions.weightClasses}
            stances={result.filterOptions.stances}
            nationalities={result.filterOptions.nationalities}
            current={{ q: query, weightClass, stance, nationality, sort }}
          />
          <div className="flex flex-wrap items-center justify-between gap-3 text-sm text-muted-foreground">
            <p>
              Mostrando{" "}
              <span className="font-semibold text-foreground">{result.fighters.length}</span> of{" "}
              <span className="font-semibold text-foreground">{result.total}</span> luchadores
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
          <div className="overflow-hidden rounded-3xl border border-border bg-card">
            <div className="hidden grid-cols-[minmax(0,2.2fr)_repeat(4,minmax(0,1fr))] gap-4 border-b border-border px-6 py-4 text-xs font-semibold uppercase tracking-[0.25em] text-muted-foreground md:grid">
              <span>Luchador</span>
              <span>Récord</span>
              <span>Categoría de peso</span>
              <span>Nacionalidad</span>
              <span>Guardia</span>
            </div>
            {result.fighters.map((fighter, i) => (
              <Link
                key={fighter.id}
                href={`/fighters/${fighter.id}`}
                style={{ animationDelay: `${Math.min(i, 10) * 40}ms` }}
                className="animate-rise grid gap-4 border-b border-border px-6 py-5 transition hover:bg-accent md:grid-cols-[minmax(0,2.2fr)_repeat(4,minmax(0,1fr))] md:items-center"
              >
                <div className="flex items-center gap-4">
                  <FighterHeadshot
                    name={fighter.name}
                    headshotUrl={fighter.headshotUrl}
                    size="sm"
                    className="shrink-0"
                  />
                  <div className="min-w-0">
                    <p className="truncate text-lg font-semibold text-foreground">{fighter.name}</p>
                    <p className="truncate text-sm text-muted-foreground">
                      {fighter.nickname ? `"${fighter.nickname}"` : "Sin apodo registrado"}
                    </p>
                  </div>
                </div>
                <div>
                  <p className="text-xs uppercase tracking-[0.25em] text-muted-foreground md:hidden">
                    Récord
                  </p>
                  <p className="mt-1 text-sm font-medium text-foreground md:mt-0">
                    {formatRecord(fighter.wins, fighter.losses, fighter.draws)}
                  </p>
                </div>
                <div>
                  <p className="text-xs uppercase tracking-[0.25em] text-muted-foreground md:hidden">
                    Categoría de peso
                  </p>
                  <p className="mt-1 text-sm text-muted-foreground md:mt-0">
                    {fighter.latestWeightClass ? formatWeightClass(fighter.latestWeightClass) : "Sin límite"}
                  </p>
                </div>
                <div>
                  <p className="text-xs uppercase tracking-[0.25em] text-muted-foreground md:hidden">
                    Nacionalidad
                  </p>
                  <p className="mt-1 flex items-center gap-1.5 text-sm text-muted-foreground md:mt-0">
                    <CountryFlag nationality={fighter.nationality} />
                    {fighter.nationality ?? "Unknown"}
                  </p>
                </div>
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <p className="text-xs uppercase tracking-[0.25em] text-muted-foreground md:hidden">
                      Guardia
                    </p>
                    <p className="mt-1 text-sm text-muted-foreground md:mt-0">
                      {fighter.stance ?? "Unknown"}
                    </p>
                  </div>
                  <span className="text-sm font-medium text-primary">Ver perfil →</span>
                </div>
              </Link>
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
              <Button className="bg-primary text-primary-foreground hover:bg-primary/90">
                Ver plantilla completa
              </Button>
            </Link>
          </CardContent>
        </Card>
      )}
    </div>
  );
}