import type { Metadata } from "next";

import { MatchupClient } from "@/components/matchup-client";
import {
  getFighterComparisonDetail,
  getFighterSearchResultById,
} from "@/lib/queries/fighters";
import type { FighterSearchResult } from "@/lib/types";

type EnfrentamientoPageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export const metadata: Metadata = {
  title: "Enfrentamiento",
  description:
    "Arma cualquier enfrentamiento UFC: compara récords, físico, golpeo y grappling lado a lado, y dispara una predicción de IA con probabilidades por esquina.",
};

function getSingleValue(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] ?? "" : value ?? "";
}

export default async function EnfrentamientoPage({
  searchParams,
}: EnfrentamientoPageProps) {
  const params = await searchParams;
  const redId = Number(getSingleValue(params.red) || "0");
  const blueId = Number(getSingleValue(params.blue) || "0");

  // Both ids present and different → load the full comparison (records, physique,
  // aggregate stats, direct matchups). fighterA maps to RED, fighterB maps to BLUE.
  const comparison =
    redId > 0 && blueId > 0 && redId !== blueId
      ? await getFighterComparisonDetail(redId, blueId)
      : null;

  // If only one corner is present in the URL, preload just that fighter so the
  // combobox stays filled while the user picks the other corner.
  const [soloRed, soloBlue] = comparison
    ? [null, null]
    : await Promise.all([
        redId > 0 ? getFighterSearchResultById(redId) : Promise.resolve(null),
        blueId > 0 ? getFighterSearchResultById(blueId) : Promise.resolve(null),
      ]);

  const initialRedFighter: FighterSearchResult | null = comparison
    ? {
        id: comparison.fighterA.id,
        name: comparison.fighterA.name,
        headshotUrl: comparison.fighterA.headshotUrl,
        nationality: comparison.fighterA.nationality,
      }
    : soloRed;

  const initialBlueFighter: FighterSearchResult | null = comparison
    ? {
        id: comparison.fighterB.id,
        name: comparison.fighterB.name,
        headshotUrl: comparison.fighterB.headshotUrl,
        nationality: comparison.fighterB.nationality,
      }
    : soloBlue;

  return (
    <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-8">
      <MatchupClient
        initialRedFighter={initialRedFighter}
        initialBlueFighter={initialBlueFighter}
        comparison={comparison}
      />
    </div>
  );
}
