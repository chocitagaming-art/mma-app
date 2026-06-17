import Link from "next/link";
import type { Metadata } from "next";

import { FighterCard } from "@/components/fighter-card";
import { FightersFilterBar } from "@/components/fighters-filter-bar";
import { PaginationControls } from "@/components/pagination-controls";
import { SectionHeading } from "@/components/section-heading";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { getFighters } from "@/lib/queries/fighters";

type FightersPageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export const metadata: Metadata = {
  title: "Fighters | MMA Stats",
  description: "Search, filter, and sort fighter profiles from the live MMA database.",
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
  const sort = getSingleValue(params.sort) || "name";

  const result = await getFighters({
    page,
    query,
    weightClass,
    stance,
    nationality,
    sort: sort === "wins" || sort === "losses" ? sort : "name",
  });

  const createHref = (nextPage: number) => {
    const next = new URLSearchParams();

    if (query) next.set("q", query);
    if (weightClass) next.set("weightClass", weightClass);
    if (stance) next.set("stance", stance);
    if (nationality) next.set("nationality", nationality);
    if (sort && sort !== "name") next.set("sort", sort);
    if (nextPage > 1) next.set("page", String(nextPage));

    return `/fighters${next.toString() ? `?${next.toString()}` : ""}`;
  };

  return (
    <div className="mx-auto max-w-7xl space-y-10 px-4 py-12 sm:px-6 lg:px-8">
      <SectionHeading
        eyebrow="Roster explorer"
        title="Browse every fighter in the database"
        description="Filter by weight class, stance, and nationality, then sort the roster to surface the profiles you want."
      />

      <Card className="border-white/10 bg-white/5">
        <CardContent className="space-y-6 p-6">
          <FightersFilterBar
            weightClasses={result.filterOptions.weightClasses}
            stances={result.filterOptions.stances}
            nationalities={result.filterOptions.nationalities}
            current={{ q: query, weightClass, stance, nationality, sort }}
          />
          <div className="flex flex-wrap items-center justify-between gap-3 text-sm text-zinc-400">
            <p>
              Showing{" "}
              <span className="font-semibold text-white">{result.fighters.length}</span> of{" "}
              <span className="font-semibold text-white">{result.total}</span> fighters
            </p>
            <Link href="/fighters">
              <Button variant="ghost" className="text-zinc-300 hover:bg-white/5 hover:text-white">
                Reset filters
              </Button>
            </Link>
          </div>
        </CardContent>
      </Card>

      {result.fighters.length ? (
        <>
          <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-3">
            {result.fighters.map((fighter) => (
              <FighterCard key={fighter.id} fighter={fighter} />
            ))}
          </div>
          <PaginationControls
            page={result.page}
            totalPages={result.totalPages}
            createHref={createHref}
          />
        </>
      ) : (
        <Card className="border-dashed border-white/10 bg-white/5">
          <CardContent className="flex flex-col items-center gap-4 px-6 py-16 text-center">
            <p className="text-2xl font-semibold text-white">No fighters found</p>
            <p className="max-w-md text-sm text-zinc-400">
              Try broadening your search or clearing one of the active filters.
            </p>
            <Link href="/fighters">
              <Button className="bg-red-500 text-white hover:bg-red-400">
                View full roster
              </Button>
            </Link>
          </CardContent>
        </Card>
      )}
    </div>
  );
}