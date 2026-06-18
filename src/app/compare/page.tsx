import type { Metadata } from "next";

import { CompareFightersClient } from "@/components/compare-fighters-client";
import { getFighterComparisonDetail } from "@/lib/queries/fighters";
import type { FighterSearchResult } from "@/lib/types";

type ComparePageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export const metadata: Metadata = {
  title: "Comparar luchadores | MMA Stats",
  description:
    "Compara dos peleadores de UFC lado a lado con récords, estadísticas físicas, golpeo, grappling e historial directo de enfrentamientos.",
};

function getSingleValue(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] ?? "" : value ?? "";
}

export default async function ComparePage({ searchParams }: ComparePageProps) {
  const params = await searchParams;
  const fighterAId = Number(getSingleValue(params.a) || "0");
  const fighterBId = Number(getSingleValue(params.b) || "0");

  const comparison =
    fighterAId > 0 && fighterBId > 0 && fighterAId !== fighterBId
      ? await getFighterComparisonDetail(fighterAId, fighterBId)
      : null;

  const initialFighterA: FighterSearchResult | null = comparison
    ? {
        id: comparison.fighterA.id,
        name: comparison.fighterA.name,
        headshotUrl: comparison.fighterA.headshotUrl,
        nationality: comparison.fighterA.nationality,
      }
    : null;

  const initialFighterB: FighterSearchResult | null = comparison
    ? {
        id: comparison.fighterB.id,
        name: comparison.fighterB.name,
        headshotUrl: comparison.fighterB.headshotUrl,
        nationality: comparison.fighterB.nationality,
      }
    : null;

  return (
    <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-8">
      <CompareFightersClient
        initialFighterA={initialFighterA}
        initialFighterB={initialFighterB}
        comparison={comparison}
      />
    </div>
  );
}