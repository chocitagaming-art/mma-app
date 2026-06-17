import type { Metadata } from "next";

import { CompareFightersClient } from "@/components/compare-fighters-client";
import { getFighterComparisonDetail } from "@/lib/queries/fighters";
import type { FighterSearchResult } from "@/lib/types";

type ComparePageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export const metadata: Metadata = {
  title: "Compare fighters | MMA Stats",
  description:
    "Compare two UFC fighters side by side with records, physical stats, striking, grappling, and direct matchup history.",
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
        nickname: comparison.fighterA.nickname,
        headshotUrl: comparison.fighterA.headshotUrl,
        wins: comparison.fighterA.wins,
        losses: comparison.fighterA.losses,
        draws: comparison.fighterA.draws,
      }
    : null;

  const initialFighterB: FighterSearchResult | null = comparison
    ? {
        id: comparison.fighterB.id,
        name: comparison.fighterB.name,
        nickname: comparison.fighterB.nickname,
        headshotUrl: comparison.fighterB.headshotUrl,
        wins: comparison.fighterB.wins,
        losses: comparison.fighterB.losses,
        draws: comparison.fighterB.draws,
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