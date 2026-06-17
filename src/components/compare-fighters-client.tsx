"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowRightLeft, Swords } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import { ComparisonStatRow } from "@/components/comparison-stat-row";
import { FighterSearchCombobox } from "@/components/fighter-search-combobox";
import { SectionHeading } from "@/components/section-heading";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import {
  formatControlTime,
  formatDate,
  formatHeight,
  formatPercentage,
  formatReach,
  formatRecord,
  formatWeight,
} from "@/lib/format";
import type {
  FighterComparisonDetail,
  FighterSearchResult,
} from "@/lib/types";

type CompareFightersClientProps = {
  initialFighterA: FighterSearchResult | null;
  initialFighterB: FighterSearchResult | null;
  comparison: FighterComparisonDetail | null;
};

function formatAverage(value: number) {
  return value.toFixed(1);
}

export function CompareFightersClient({
  initialFighterA,
  initialFighterB,
  comparison,
}: CompareFightersClientProps) {
  const router = useRouter();
  const [fighterA, setFighterA] = useState<FighterSearchResult | null>(initialFighterA);
  const [fighterB, setFighterB] = useState<FighterSearchResult | null>(initialFighterB);

  useEffect(() => {
    const params = new URLSearchParams();

    if (fighterA) {
      params.set("a", String(fighterA.id));
    }

    if (fighterB) {
      params.set("b", String(fighterB.id));
    }

    router.replace(`/compare${params.toString() ? `?${params.toString()}` : ""}`);
  }, [fighterA, fighterB, router]);

  const canCompare = Boolean(fighterA && fighterB);
  const detail = comparison;

  const matchupSummary = useMemo(() => {
    if (!detail) {
      return null;
    }

    const fighterAWins = detail.directMatchups.filter(
      (fight) => fight.winnerId === detail.fighterA.id,
    ).length;
    const fighterBWins = detail.directMatchups.filter(
      (fight) => fight.winnerId === detail.fighterB.id,
    ).length;
    const draws = detail.directMatchups.filter((fight) => fight.winnerId === null).length;

    return { fighterAWins, fighterBWins, draws };
  }, [detail]);

  return (
    <div className="space-y-10">
      <Card className="overflow-visible border-white/10 bg-white/5">
        <CardContent className="space-y-8 p-6 sm:p-8">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <SectionHeading
              eyebrow="Head-to-head"
              title="Compare two UFC fighters"
              description="Search the roster, lock in both corners, and break down striking, grappling, and direct matchup history side by side."
            />
            <div className="rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-sm text-zinc-400">
              Shareable URL updates automatically as you compare.
            </div>
          </div>
          <div className="grid gap-4 lg:grid-cols-[1fr_auto_1fr] lg:items-end">
            <FighterSearchCombobox
              label="Fighter A"
              value={fighterA}
              onSelect={setFighterA}
              excludeId={fighterB?.id}
            />
            <div className="flex justify-center pb-2">
              <div className="flex size-12 items-center justify-center rounded-2xl border border-white/10 bg-black/30 text-red-200 shadow-lg shadow-red-950/20">
                <ArrowRightLeft className="size-5" />
              </div>
            </div>
            <FighterSearchCombobox
              label="Fighter B"
              value={fighterB}
              onSelect={setFighterB}
              excludeId={fighterA?.id}
            />
          </div>
        </CardContent>
      </Card>

      {canCompare && detail ? (
        <>
          <section className="grid gap-6 xl:grid-cols-[1fr_auto_1fr] xl:items-stretch">
            <Card className="border-white/10 bg-gradient-to-br from-zinc-950 via-zinc-900 to-zinc-950">
              <CardContent className="space-y-6 p-6">
                <div className="space-y-2">
                  <p className="text-xs font-semibold uppercase tracking-[0.35em] text-red-300">
                    Fighter A
                  </p>
                  <Link
                    href={`/fighters/${detail.fighterA.id}`}
                    className="text-3xl font-semibold tracking-tight text-white transition hover:text-red-200"
                  >
                    {detail.fighterA.name}
                  </Link>
                  <p className="text-zinc-400">
                    {detail.fighterA.nickname
                      ? `"${detail.fighterA.nickname}"`
                      : "No nickname listed"}
                  </p>
                </div>
                <div className="flex flex-wrap gap-3">
                  <Badge className="border-red-400/20 bg-red-500/10 text-red-200">
                    {formatRecord(
                      detail.fighterA.wins,
                      detail.fighterA.losses,
                      detail.fighterA.draws,
                    )}
                  </Badge>
                  <Badge variant="secondary" className="bg-white/10 text-zinc-200">
                    {detail.fighterA.stance ?? "Unknown stance"}
                  </Badge>
                  <Badge variant="secondary" className="bg-white/10 text-zinc-200">
                    {detail.fighterA.latestWeightClass ?? "Open Weight"}
                  </Badge>
                </div>
                <Separator className="bg-white/10" />
                <div className="grid gap-4 sm:grid-cols-2">
                  <div>
                    <p className="text-xs uppercase tracking-[0.25em] text-zinc-500">
                      Height
                    </p>
                    <p className="mt-2 text-lg font-semibold text-white">
                      {formatHeight(detail.fighterA.heightCm)}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs uppercase tracking-[0.25em] text-zinc-500">
                      Reach
                    </p>
                    <p className="mt-2 text-lg font-semibold text-white">
                      {formatReach(detail.fighterA.reachCm)}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs uppercase tracking-[0.25em] text-zinc-500">
                      Nationality
                    </p>
                    <p className="mt-2 text-lg font-semibold text-white">
                      {detail.fighterA.nationality ?? "Unknown"}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs uppercase tracking-[0.25em] text-zinc-500">
                      Logged fights
                    </p>
                    <p className="mt-2 text-lg font-semibold text-white">
                      {detail.fighterA.fightCount}
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>

            <div className="flex items-center justify-center">
              <div className="flex min-h-24 min-w-24 items-center justify-center rounded-full border border-red-400/20 bg-red-500/10 px-6 text-center shadow-xl shadow-red-950/20">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.35em] text-red-300">
                    Tale of the tape
                  </p>
                  <p className="mt-2 text-2xl font-semibold text-white">VS</p>
                </div>
              </div>
            </div>

            <Card className="border-white/10 bg-gradient-to-br from-zinc-950 via-zinc-900 to-zinc-950">
              <CardContent className="space-y-6 p-6">
                <div className="space-y-2 text-left xl:text-right">
                  <p className="text-xs font-semibold uppercase tracking-[0.35em] text-red-300">
                    Fighter B
                  </p>
                  <Link
                    href={`/fighters/${detail.fighterB.id}`}
                    className="text-3xl font-semibold tracking-tight text-white transition hover:text-red-200"
                  >
                    {detail.fighterB.name}
                  </Link>
                  <p className="text-zinc-400">
                    {detail.fighterB.nickname
                      ? `"${detail.fighterB.nickname}"`
                      : "No nickname listed"}
                  </p>
                </div>
                <div className="flex flex-wrap gap-3 xl:justify-end">
                  <Badge className="border-red-400/20 bg-red-500/10 text-red-200">
                    {formatRecord(
                      detail.fighterB.wins,
                      detail.fighterB.losses,
                      detail.fighterB.draws,
                    )}
                  </Badge>
                  <Badge variant="secondary" className="bg-white/10 text-zinc-200">
                    {detail.fighterB.stance ?? "Unknown stance"}
                  </Badge>
                  <Badge variant="secondary" className="bg-white/10 text-zinc-200">
                    {detail.fighterB.latestWeightClass ?? "Open Weight"}
                  </Badge>
                </div>
                <Separator className="bg-white/10" />
                <div className="grid gap-4 sm:grid-cols-2">
                  <div>
                    <p className="text-xs uppercase tracking-[0.25em] text-zinc-500">
                      Height
                    </p>
                    <p className="mt-2 text-lg font-semibold text-white">
                      {formatHeight(detail.fighterB.heightCm)}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs uppercase tracking-[0.25em] text-zinc-500">
                      Reach
                    </p>
                    <p className="mt-2 text-lg font-semibold text-white">
                      {formatReach(detail.fighterB.reachCm)}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs uppercase tracking-[0.25em] text-zinc-500">
                      Nationality
                    </p>
                    <p className="mt-2 text-lg font-semibold text-white">
                      {detail.fighterB.nationality ?? "Unknown"}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs uppercase tracking-[0.25em] text-zinc-500">
                      Logged fights
                    </p>
                    <p className="mt-2 text-lg font-semibold text-white">
                      {detail.fighterB.fightCount}
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </section>

          <section className="grid gap-6">
            <Card className="border-white/10 bg-white/5">
              <CardHeader>
                <CardTitle className="text-white">Record and physical comparison</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <ComparisonStatRow
                  label="Wins"
                  leftLabel={detail.fighterA.name}
                  rightLabel={detail.fighterB.name}
                  leftValue={detail.fighterA.wins}
                  rightValue={detail.fighterB.wins}
                  leftDisplay={String(detail.fighterA.wins)}
                  rightDisplay={String(detail.fighterB.wins)}
                />
                <ComparisonStatRow
                  label="Losses"
                  leftLabel={detail.fighterA.name}
                  rightLabel={detail.fighterB.name}
                  leftValue={detail.fighterA.losses}
                  rightValue={detail.fighterB.losses}
                  leftDisplay={String(detail.fighterA.losses)}
                  rightDisplay={String(detail.fighterB.losses)}
                  higherIsBetter={false}
                />
                <ComparisonStatRow
                  label="Draws"
                  leftLabel={detail.fighterA.name}
                  rightLabel={detail.fighterB.name}
                  leftValue={detail.fighterA.draws}
                  rightValue={detail.fighterB.draws}
                  leftDisplay={String(detail.fighterA.draws)}
                  rightDisplay={String(detail.fighterB.draws)}
                />
                <ComparisonStatRow
                  label="Height"
                  leftLabel={detail.fighterA.name}
                  rightLabel={detail.fighterB.name}
                  leftValue={detail.fighterA.heightCm}
                  rightValue={detail.fighterB.heightCm}
                  leftDisplay={formatHeight(detail.fighterA.heightCm)}
                  rightDisplay={formatHeight(detail.fighterB.heightCm)}
                />
                <ComparisonStatRow
                  label="Reach"
                  leftLabel={detail.fighterA.name}
                  rightLabel={detail.fighterB.name}
                  leftValue={detail.fighterA.reachCm}
                  rightValue={detail.fighterB.reachCm}
                  leftDisplay={formatReach(detail.fighterA.reachCm)}
                  rightDisplay={formatReach(detail.fighterB.reachCm)}
                />
                <ComparisonStatRow
                  label="Weight"
                  leftLabel={detail.fighterA.name}
                  rightLabel={detail.fighterB.name}
                  leftValue={detail.fighterA.weightGrams ?? 0}
                  rightValue={detail.fighterB.weightGrams ?? 0}
                  leftDisplay={formatWeight(detail.fighterA.weightGrams)}
                  rightDisplay={formatWeight(detail.fighterB.weightGrams)}
                />
              </CardContent>
            </Card>

            <div className="grid gap-6 xl:grid-cols-2">
              <Card className="border-white/10 bg-white/5">
                <CardHeader>
                  <CardTitle className="text-white">Striking stats</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <ComparisonStatRow
                    label="Sig. strikes landed / fight"
                    leftLabel={detail.fighterA.name}
                    rightLabel={detail.fighterB.name}
                    leftValue={detail.fighterA.aggregateStats.sigStrikesLandedPerFight}
                    rightValue={detail.fighterB.aggregateStats.sigStrikesLandedPerFight}
                    leftDisplay={formatAverage(
                      detail.fighterA.aggregateStats.sigStrikesLandedPerFight,
                    )}
                    rightDisplay={formatAverage(
                      detail.fighterB.aggregateStats.sigStrikesLandedPerFight,
                    )}
                  />
                  <ComparisonStatRow
                    label="Sig. strike accuracy"
                    leftLabel={detail.fighterA.name}
                    rightLabel={detail.fighterB.name}
                    leftValue={detail.fighterA.aggregateStats.sigStrikeAccuracy}
                    rightValue={detail.fighterB.aggregateStats.sigStrikeAccuracy}
                    leftDisplay={formatPercentage(
                      detail.fighterA.aggregateStats.sigStrikeAccuracy,
                    )}
                    rightDisplay={formatPercentage(
                      detail.fighterB.aggregateStats.sigStrikeAccuracy,
                    )}
                  />
                  <ComparisonStatRow
                    label="Knockdowns / fight"
                    leftLabel={detail.fighterA.name}
                    rightLabel={detail.fighterB.name}
                    leftValue={detail.fighterA.aggregateStats.knockdownsPerFight}
                    rightValue={detail.fighterB.aggregateStats.knockdownsPerFight}
                    leftDisplay={formatAverage(
                      detail.fighterA.aggregateStats.knockdownsPerFight,
                    )}
                    rightDisplay={formatAverage(
                      detail.fighterB.aggregateStats.knockdownsPerFight,
                    )}
                  />
                </CardContent>
              </Card>

              <Card className="border-white/10 bg-white/5">
                <CardHeader>
                  <CardTitle className="text-white">Grappling stats</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <ComparisonStatRow
                    label="Takedowns landed / fight"
                    leftLabel={detail.fighterA.name}
                    rightLabel={detail.fighterB.name}
                    leftValue={detail.fighterA.aggregateStats.takedownsLandedPerFight}
                    rightValue={detail.fighterB.aggregateStats.takedownsLandedPerFight}
                    leftDisplay={formatAverage(
                      detail.fighterA.aggregateStats.takedownsLandedPerFight,
                    )}
                    rightDisplay={formatAverage(
                      detail.fighterB.aggregateStats.takedownsLandedPerFight,
                    )}
                  />
                  <ComparisonStatRow
                    label="Takedown accuracy"
                    leftLabel={detail.fighterA.name}
                    rightLabel={detail.fighterB.name}
                    leftValue={detail.fighterA.aggregateStats.takedownAccuracy}
                    rightValue={detail.fighterB.aggregateStats.takedownAccuracy}
                    leftDisplay={formatPercentage(
                      detail.fighterA.aggregateStats.takedownAccuracy,
                    )}
                    rightDisplay={formatPercentage(
                      detail.fighterB.aggregateStats.takedownAccuracy,
                    )}
                  />
                  <ComparisonStatRow
                    label="Submission attempts / fight"
                    leftLabel={detail.fighterA.name}
                    rightLabel={detail.fighterB.name}
                    leftValue={detail.fighterA.aggregateStats.submissionAttemptsPerFight}
                    rightValue={detail.fighterB.aggregateStats.submissionAttemptsPerFight}
                    leftDisplay={formatAverage(
                      detail.fighterA.aggregateStats.submissionAttemptsPerFight,
                    )}
                    rightDisplay={formatAverage(
                      detail.fighterB.aggregateStats.submissionAttemptsPerFight,
                    )}
                  />
                  <ComparisonStatRow
                    label="Control time / fight"
                    leftLabel={detail.fighterA.name}
                    rightLabel={detail.fighterB.name}
                    leftValue={detail.fighterA.aggregateStats.controlTimePerFightSeconds}
                    rightValue={detail.fighterB.aggregateStats.controlTimePerFightSeconds}
                    leftDisplay={formatControlTime(
                      Math.round(detail.fighterA.aggregateStats.controlTimePerFightSeconds),
                    )}
                    rightDisplay={formatControlTime(
                      Math.round(detail.fighterB.aggregateStats.controlTimePerFightSeconds),
                    )}
                  />
                </CardContent>
              </Card>
            </div>
          </section>

          <section className="space-y-6">
            <SectionHeading
              eyebrow="Direct matchup history"
              title="Previous meetings"
              description="Every logged fight where these two fighters shared the cage."
            />
            {matchupSummary ? (
              <Card className="border-white/10 bg-gradient-to-r from-red-950/30 via-black/30 to-red-950/30">
                <CardContent className="grid gap-4 p-6 md:grid-cols-3 md:items-center">
                  <div>
                    <p className="text-sm uppercase tracking-[0.3em] text-zinc-500">
                      {detail.fighterA.name}
                    </p>
                    <p className="mt-2 text-3xl font-semibold text-white">
                      {matchupSummary.fighterAWins}
                    </p>
                  </div>
                  <div className="text-center">
                    <p className="text-xs font-semibold uppercase tracking-[0.35em] text-red-300">
                      Head-to-head
                    </p>
                    <p className="mt-2 text-lg text-zinc-300">
                      {matchupSummary.draws} draw
                      {matchupSummary.draws === 1 ? "" : "s"}
                    </p>
                  </div>
                  <div className="text-left md:text-right">
                    <p className="text-sm uppercase tracking-[0.3em] text-zinc-500">
                      {detail.fighterB.name}
                    </p>
                    <p className="mt-2 text-3xl font-semibold text-white">
                      {matchupSummary.fighterBWins}
                    </p>
                  </div>
                </CardContent>
              </Card>
            ) : null}
            <div className="grid gap-4">
              {detail.directMatchups.length ? (
                detail.directMatchups.map((fight) => (
                  <Link key={fight.fightId} href={`/fights/${fight.fightId}`}>
                    <Card className="border-white/10 bg-white/5 transition hover:border-red-400/30 hover:bg-white/[0.07]">
                      <CardContent className="grid gap-4 p-5 md:grid-cols-[1fr_auto] md:items-center">
                        <div className="space-y-2">
                          <div className="flex flex-wrap gap-2">
                            <Badge variant="secondary" className="bg-white/10 text-zinc-200">
                              {fight.weightClass ?? "Weight class unavailable"}
                            </Badge>
                            <Badge className="border-red-400/20 bg-red-500/10 text-red-200">
                              {fight.winnerId === detail.fighterA.id
                                ? `${detail.fighterA.name} won`
                                : fight.winnerId === detail.fighterB.id
                                  ? `${detail.fighterB.name} won`
                                  : "Draw / No contest"}
                            </Badge>
                          </div>
                          <p className="text-lg font-semibold text-white">
                            {fight.eventName ?? "Unknown event"}
                          </p>
                          <p className="text-sm text-zinc-400">
                            {formatDate(fight.eventDate)} · {fight.method ?? "Method unavailable"} ·
                            {" "}Round {fight.endRound ?? "—"} · {fight.endTime ?? "—"}
                          </p>
                        </div>
                        <p className="text-sm font-medium text-red-200">
                          Open fight details →
                        </p>
                      </CardContent>
                    </Card>
                  </Link>
                ))
              ) : (
                <Card className="border-dashed border-white/10 bg-white/5">
                  <CardContent className="flex flex-col items-center gap-4 px-6 py-16 text-center">
                    <Swords className="size-8 text-zinc-500" />
                    <div className="space-y-2">
                      <p className="text-2xl font-semibold text-white">No direct fights found</p>
                      <p className="max-w-xl text-sm text-zinc-400">
                        These fighters do not have a logged head-to-head matchup in the current
                        database.
                      </p>
                    </div>
                  </CardContent>
                </Card>
              )}
            </div>
          </section>
        </>
      ) : (
        <Card className="border-dashed border-white/10 bg-white/5">
          <CardContent className="flex flex-col items-center gap-5 px-6 py-20 text-center">
            <div className="flex size-16 items-center justify-center rounded-3xl border border-red-400/20 bg-red-500/10 text-red-200">
              <Swords className="size-7" />
            </div>
            <div className="space-y-2">
              <p className="text-3xl font-semibold text-white">Build your matchup</p>
              <p className="max-w-2xl text-sm leading-6 text-zinc-400 sm:text-base">
                Pick two fighters to unlock a side-by-side comparison of records, physical tools,
                striking efficiency, grappling output, and any direct matchup history.
              </p>
            </div>
            <Link href="/fighters">
              <Button className="bg-red-500 text-white hover:bg-red-400">
                Browse the roster
              </Button>
            </Link>
          </CardContent>
        </Card>
      )}
    </div>
  );
}