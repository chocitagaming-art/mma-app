import {
  formatControlTime,
  formatHeight,
  formatPercentage,
  formatReach,
  formatRecord,
  formatStance,
} from "@/lib/format";
import type { FighterComparisonProfile } from "@/lib/types";
import { cn } from "@/lib/utils";

import { formatAverage, type TaleRow } from "./helpers";

export function buildTaleRows(
  red: FighterComparisonProfile,
  blue: FighterComparisonProfile,
): TaleRow[] {
  return [
    {
      label: "Récord",
      red: formatRecord(red.wins, red.losses, red.draws),
      blue: formatRecord(blue.wins, blue.losses, blue.draws),
      redNum: red.wins,
      blueNum: blue.wins,
    },
    {
      label: "Altura",
      red: formatHeight(red.heightCm),
      blue: formatHeight(blue.heightCm),
      redNum: red.heightCm,
      blueNum: blue.heightCm,
    },
    {
      label: "Alcance",
      red: formatReach(red.reachCm),
      blue: formatReach(blue.reachCm),
      redNum: red.reachCm,
      blueNum: blue.reachCm,
    },
    {
      label: "Guardia",
      red: formatStance(red.stance),
      blue: formatStance(blue.stance),
    },
    {
      label: "Golpes sig. / pelea",
      red: formatAverage(red.aggregateStats.sigStrikesLandedPerFight),
      blue: formatAverage(blue.aggregateStats.sigStrikesLandedPerFight),
      redNum: red.aggregateStats.sigStrikesLandedPerFight,
      blueNum: blue.aggregateStats.sigStrikesLandedPerFight,
    },
    {
      label: "Precisión golpes",
      red: formatPercentage(red.aggregateStats.sigStrikeAccuracy),
      blue: formatPercentage(blue.aggregateStats.sigStrikeAccuracy),
      redNum: red.aggregateStats.sigStrikeAccuracy,
      blueNum: blue.aggregateStats.sigStrikeAccuracy,
    },
    {
      label: "Knockdowns / pelea",
      red: formatAverage(red.aggregateStats.knockdownsPerFight),
      blue: formatAverage(blue.aggregateStats.knockdownsPerFight),
      redNum: red.aggregateStats.knockdownsPerFight,
      blueNum: blue.aggregateStats.knockdownsPerFight,
    },
    {
      label: "Derribos / pelea",
      red: formatAverage(red.aggregateStats.takedownsLandedPerFight),
      blue: formatAverage(blue.aggregateStats.takedownsLandedPerFight),
      redNum: red.aggregateStats.takedownsLandedPerFight,
      blueNum: blue.aggregateStats.takedownsLandedPerFight,
    },
    {
      label: "Precisión derribos",
      red: formatPercentage(red.aggregateStats.takedownAccuracy),
      blue: formatPercentage(blue.aggregateStats.takedownAccuracy),
      redNum: red.aggregateStats.takedownAccuracy,
      blueNum: blue.aggregateStats.takedownAccuracy,
    },
    {
      label: "Sumisiones int. / pelea",
      red: formatAverage(red.aggregateStats.submissionAttemptsPerFight),
      blue: formatAverage(blue.aggregateStats.submissionAttemptsPerFight),
      redNum: red.aggregateStats.submissionAttemptsPerFight,
      blueNum: blue.aggregateStats.submissionAttemptsPerFight,
    },
    {
      label: "Tiempo control / pelea",
      red: formatControlTime(
        Math.round(red.aggregateStats.controlTimePerFightSeconds),
      ),
      blue: formatControlTime(
        Math.round(blue.aggregateStats.controlTimePerFightSeconds),
      ),
      redNum: red.aggregateStats.controlTimePerFightSeconds,
      blueNum: blue.aggregateStats.controlTimePerFightSeconds,
    },
  ];
}

export function TaleStatRow({ row }: { row: TaleRow }) {
  const both = row.redNum != null && row.blueNum != null;
  const redBetter = both && (row.redNum as number) > (row.blueNum as number);
  const blueBetter = both && (row.blueNum as number) > (row.redNum as number);

  return (
    <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-4 border-b border-border py-3 last:border-b-0">
      <p
        className={cn(
          "tabular text-right font-display text-lg font-bold leading-none sm:text-xl",
          redBetter ? "text-corner-red" : "text-foreground",
        )}
      >
        {row.red}
      </p>
      <p className="w-28 text-center font-mono text-[0.65rem] uppercase leading-tight tracking-[0.12em] text-muted-foreground sm:w-40 sm:text-[0.7rem]">
        {row.label}
      </p>
      <p
        className={cn(
          "tabular text-left font-display text-lg font-bold leading-none sm:text-xl",
          blueBetter ? "text-corner-blue" : "text-foreground",
        )}
      >
        {row.blue}
      </p>
    </div>
  );
}
