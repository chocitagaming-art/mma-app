import type { Metadata } from "next";

import { PredictFightClient } from "@/components/predict-fight-client";
import { getFighterSearchResultById } from "@/lib/queries/fighters";
import type { FighterSearchResult } from "@/lib/types";

type PredictPageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export const metadata: Metadata = {
  title: "Predicción de peleas | MMA Stats",
  description:
    "Genera probabilidades de victoria para peleas UFC, revisa los factores principales del modelo y lee una explicación de IA en español.",
};

function getSingleValue(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] ?? "" : value ?? "";
}

async function getInitialFighter(idValue: string): Promise<FighterSearchResult | null> {
  const fighterId = Number(idValue || "0");
  if (fighterId <= 0) {
    return null;
  }

  return getFighterSearchResultById(fighterId);
}

export default async function PredictPage({ searchParams }: PredictPageProps) {
  const params = await searchParams;
  const red = getSingleValue(params.red);
  const blue = getSingleValue(params.blue);

  const [initialRedFighter, initialBlueFighter] = await Promise.all([
    getInitialFighter(red),
    getInitialFighter(blue),
  ]);

  return (
    <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-8">
      <PredictFightClient
        initialRedFighter={initialRedFighter}
        initialBlueFighter={initialBlueFighter}
      />
    </div>
  );
}