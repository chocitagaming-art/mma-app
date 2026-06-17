import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { ArrowRightLeft } from "lucide-react";

import { FighterHeadshot } from "@/components/fighter-headshot";
import { SectionHeading } from "@/components/section-heading";
import { StatBar } from "@/components/stat-bar";
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
import { getFighterDetail } from "@/lib/queries/fighters";

type FighterDetailPageProps = {
  params: Promise<{ id: string }>;
};

export async function generateMetadata({
  params,
}: FighterDetailPageProps): Promise<Metadata> {
  const { id } = await params;
  const detail = await getFighterDetail(Number(id));

  if (!detail) {
    return {
      title: "Fighter not found | MMA Stats",
    };
  }

  return {
    title: `${detail.fighter.name} | MMA Stats`,
    description: `Fight history and aggregate performance stats for ${detail.fighter.name}.`,
  };
}

export default async function FighterDetailPage({
  params,
}: FighterDetailPageProps) {
  const { id } = await params;
  const detail = await getFighterDetail(Number(id));

  if (!detail) {
    notFound();
  }

  const { fighter, aggregateStats, history } = detail;

  return (
    <div className="mx-auto max-w-7xl space-y-10 px-4 py-12 sm:px-6 lg:px-8">
      <section className="grid gap-6 lg:grid-cols-[1.2fr_0.8fr]">
        <Card className="overflow-hidden border-white/10 bg-gradient-to-br from-zinc-950 via-zinc-900 to-zinc-950">
          <CardContent className="space-y-8 p-8">
            <div className="flex flex-wrap items-start justify-between gap-6">
              <div className="flex flex-wrap items-center gap-6">
                <FighterHeadshot
                  name={fighter.name}
                  headshotUrl={fighter.headshotUrl}
                  size="xl"
                  priority
                  className="border-white/15 bg-black/30"
                  imageClassName="object-contain object-top"
                />
                <div className="space-y-4">
                  <div className="space-y-2">
                    <p className="text-sm font-semibold uppercase tracking-[0.35em] text-red-300">
                      Fighter profile
                    </p>
                    <h1 className="text-4xl font-semibold tracking-tight text-white sm:text-5xl">
                      {fighter.name}
                    </h1>
                    <p className="text-lg text-zinc-400">
                      {fighter.nickname ? `"${fighter.nickname}"` : "No nickname listed"}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-3">
                    <Badge className="border-red-400/20 bg-red-500/10 text-red-200">
                      {detail.latestWeightClass ?? "Weight class unavailable"}
                    </Badge>
                    <Badge variant="secondary" className="bg-white/10 text-zinc-200">
                      {fighter.stance ?? "Unknown stance"}
                    </Badge>
                    <Badge variant="secondary" className="bg-white/10 text-zinc-200">
                      {fighter.nationality ?? "Nationality unavailable"}
                    </Badge>
                    <Link href={`/compare?a=${fighter.id}`}>
                      <Button
                        variant="secondary"
                        className="bg-white/10 text-zinc-200 hover:bg-white/15 hover:text-white"
                      >
                        <ArrowRightLeft />
                        Compare fighter
                      </Button>
                    </Link>
                  </div>
                </div>
              </div>
              <div className="rounded-3xl border border-white/10 bg-black/20 px-6 py-5 text-right">
                <p className="text-xs uppercase tracking-[0.3em] text-zinc-500">Record</p>
                <p className="mt-3 text-4xl font-semibold text-white">
                  {formatRecord(fighter.wins, fighter.losses, fighter.draws)}
                </p>
                <p className="mt-2 text-sm text-zinc-400">{detail.fightCount} logged fights</p>
              </div>
            </div>
            <Separator className="bg-white/10" />
            <div className="grid gap-6 sm:grid-cols-2 xl:grid-cols-4">
              <div>
                <p className="text-xs uppercase tracking-[0.25em] text-zinc-500">Height</p>
                <p className="mt-2 text-lg font-semibold text-white">
                  {formatHeight(fighter.heightCm)}
                </p>
              </div>
              <div>
                <p className="text-xs uppercase tracking-[0.25em] text-zinc-500">Reach</p>
                <p className="mt-2 text-lg font-semibold text-white">
                  {formatReach(fighter.reachCm)}
                </p>
              </div>
              <div>
                <p className="text-xs uppercase tracking-[0.25em] text-zinc-500">Weight</p>
                <p className="mt-2 text-lg font-semibold text-white">
                  {formatWeight(fighter.weightGrams)}
                </p>
              </div>
              <div>
                <p className="text-xs uppercase tracking-[0.25em] text-zinc-500">Nationality</p>
                <p className="mt-2 text-lg font-semibold text-white">
                  {fighter.nationality ?? "Unknown"}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="border-white/10 bg-white/5">
          <CardHeader>
            <CardTitle className="text-white">Performance snapshot</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <StatBar
              label="Significant strike accuracy"
              value={formatPercentage(aggregateStats.sigStrikeAccuracy)}
              progress={aggregateStats.sigStrikeAccuracy}
              helper={`${aggregateStats.sigStrikesLanded}/${aggregateStats.sigStrikesAttempted} landed`}
            />
            <StatBar
              label="Takedown accuracy"
              value={formatPercentage(aggregateStats.takedownAccuracy)}
              progress={aggregateStats.takedownAccuracy}
              helper={`${aggregateStats.takedownsLanded}/${aggregateStats.takedownsAttempted} landed`}
            />
            <StatBar
              label="Control time"
              value={formatControlTime(aggregateStats.controlTimeSeconds)}
              progress={Math.min(1, aggregateStats.controlTimeSeconds / 1800)}
              helper={`${aggregateStats.totalFightStats} tracked stat entries`}
            />
            <div className="grid grid-cols-2 gap-4">
              <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
                <p className="text-xs uppercase tracking-[0.25em] text-zinc-500">
                  Submission attempts
                </p>
                <p className="mt-2 text-2xl font-semibold text-white">
                  {aggregateStats.submissionAttempts}
                </p>
              </div>
              <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
                <p className="text-xs uppercase tracking-[0.25em] text-zinc-500">Knockdowns</p>
                <p className="mt-2 text-2xl font-semibold text-white">
                  {aggregateStats.knockdowns}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </section>

      <section className="space-y-6">
        <SectionHeading
          eyebrow="Fight history"
          title="Every logged matchup"
          description="Review opponents, events, and outcomes from the fights table."
        />
        <div className="grid gap-4">
          {history.length ? (
            history.map((fight) => (
              <Link key={fight.fightId} href={`/fights/${fight.fightId}`}>
                <Card className="border-white/10 bg-white/5 transition hover:border-red-400/30 hover:bg-white/[0.07]">
                  <CardContent className="grid gap-4 p-5 md:grid-cols-[auto_1fr_auto] md:items-center">
                    <div className="flex items-center gap-3">
                      <Badge
                        className={
                          fight.result === "win"
                            ? "border-emerald-400/20 bg-emerald-500/10 text-emerald-200"
                            : fight.result === "loss"
                              ? "border-red-400/20 bg-red-500/10 text-red-200"
                              : "border-white/10 bg-white/10 text-zinc-200"
                        }
                      >
                        {fight.result.toUpperCase()}
                      </Badge>
                      <Badge variant="secondary" className="bg-white/10 text-zinc-200">
                        {fight.weightClass ?? "Weight class unavailable"}
                      </Badge>
                    </div>
                    <div className="space-y-2">
                      <p className="text-lg font-semibold text-white">
                        vs {fight.opponentName ?? "Unknown opponent"}
                      </p>
                      <p className="text-sm text-zinc-400">
                        {fight.eventName ?? "Unknown event"} · {formatDate(fight.eventDate)}
                      </p>
                      <p className="text-sm text-zinc-500">
                        {fight.method ?? "Method unavailable"} · Round {fight.endRound ?? "—"} ·{" "}
                        {fight.endTime ?? "—"}
                      </p>
                    </div>
                    <p className="text-sm font-medium text-red-200">Open fight details →</p>
                  </CardContent>
                </Card>
              </Link>
            ))
          ) : (
            <Card className="border-dashed border-white/10 bg-white/5">
              <CardContent className="px-6 py-16 text-center text-zinc-400">
                No fight history is available for this fighter yet.
              </CardContent>
            </Card>
          )}
        </div>
      </section>
    </div>
  );
}