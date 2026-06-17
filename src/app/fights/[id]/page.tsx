import { notFound } from "next/navigation";
import type { Metadata } from "next";

import { FightComparisonCard } from "@/components/fight-comparison-card";
import { SectionHeading } from "@/components/section-heading";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { formatDate } from "@/lib/format";
import { getFightDetail } from "@/lib/queries/fights";

type FightDetailPageProps = {
  params: Promise<{ id: string }>;
};

export async function generateMetadata({
  params,
}: FightDetailPageProps): Promise<Metadata> {
  const { id } = await params;
  const fight = await getFightDetail(Number(id));

  if (!fight) {
    return {
      title: "Fight not found | MMA Stats",
    };
  }

  return {
    title: `${fight.red.name} vs ${fight.blue.name} | MMA Stats`,
    description: `Fight result and stat comparison for ${fight.red.name} vs ${fight.blue.name}.`,
  };
}

export default async function FightDetailPage({ params }: FightDetailPageProps) {
  const { id } = await params;
  const fight = await getFightDetail(Number(id));

  if (!fight) {
    notFound();
  }

  return (
    <div className="mx-auto max-w-7xl space-y-10 px-4 py-12 sm:px-6 lg:px-8">
      <section className="space-y-6">
        <SectionHeading
          eyebrow="Fight breakdown"
          title={`${fight.red.name} vs ${fight.blue.name}`}
          description="Side-by-side fighter comparison with official result details and tracked fight stats."
        />
        <Card className="border-white/10 bg-gradient-to-r from-red-950/40 via-black/40 to-blue-950/40">
          <CardContent className="grid gap-6 p-8 md:grid-cols-[1fr_auto_1fr] md:items-center">
            <div className="space-y-2">
              <p className="text-sm uppercase tracking-[0.3em] text-red-300">Red corner</p>
              <p className="text-3xl font-semibold text-white">{fight.red.name}</p>
            </div>
            <div className="space-y-4 text-center">
              <Badge className="border-white/10 bg-white/10 text-zinc-100">
                {fight.weightClass ?? "Weight class unavailable"}
              </Badge>
              <div>
                <p className="text-sm uppercase tracking-[0.3em] text-zinc-500">Result</p>
                <p className="mt-2 text-2xl font-semibold text-white">
                  {fight.method ?? "Method unavailable"}
                </p>
                <p className="mt-2 text-sm text-zinc-400">
                  Round {fight.endRound ?? "—"} · {fight.endTime ?? "—"}
                </p>
              </div>
              <div className="text-sm text-zinc-400">
                <p>{fight.eventName ?? "Unknown event"}</p>
                <p>{formatDate(fight.eventDate)}</p>
                <p>{fight.location ?? "Location unavailable"}</p>
              </div>
            </div>
            <div className="space-y-2 text-left md:text-right">
              <p className="text-sm uppercase tracking-[0.3em] text-blue-300">Blue corner</p>
              <p className="text-3xl font-semibold text-white">{fight.blue.name}</p>
            </div>
          </CardContent>
        </Card>
      </section>

      <section className="grid gap-6 lg:grid-cols-2">
        <FightComparisonCard
          fighter={fight.red}
          stats={fight.redStats}
          corner="red"
          isWinner={fight.winnerId === fight.red.id}
        />
        <FightComparisonCard
          fighter={fight.blue}
          stats={fight.blueStats}
          corner="blue"
          isWinner={fight.winnerId === fight.blue.id}
        />
      </section>
    </div>
  );
}