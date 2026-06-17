import Link from "next/link";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardFooter, CardHeader } from "@/components/ui/card";
import { formatRecord, formatWeight } from "@/lib/format";
import type { FighterCardData } from "@/lib/types";

type FighterCardProps = {
  fighter: FighterCardData;
};

export function FighterCard({ fighter }: FighterCardProps) {
  return (
    <Link href={`/fighters/${fighter.id}`} className="group block h-full">
      <Card className="flex h-full flex-col overflow-hidden border-white/10 bg-gradient-to-br from-zinc-950 via-zinc-900 to-zinc-950 transition duration-300 hover:-translate-y-1 hover:border-red-400/40 hover:shadow-2xl hover:shadow-red-950/30">
        <CardHeader className="space-y-4 border-b border-white/5 pb-5">
          <div className="flex items-start justify-between gap-4">
            <div className="space-y-2">
              <p className="text-xl font-semibold text-white transition group-hover:text-red-200">
                {fighter.name}
              </p>
              <p className="text-sm text-zinc-400">
                {fighter.nickname ? `"${fighter.nickname}"` : "No nickname listed"}
              </p>
            </div>
            <Badge className="border-red-400/20 bg-red-500/10 text-red-200">
              {fighter.latestWeightClass ?? "Open Weight"}
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="flex-1 space-y-5 p-6">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <p className="text-xs uppercase tracking-[0.25em] text-zinc-500">
                Record
              </p>
              <p className="mt-2 text-lg font-semibold text-white">
                {formatRecord(fighter.wins, fighter.losses, fighter.draws)}
              </p>
            </div>
            <div>
              <p className="text-xs uppercase tracking-[0.25em] text-zinc-500">
                Weight
              </p>
              <p className="mt-2 text-lg font-semibold text-white">
                {formatWeight(fighter.weightGrams)}
              </p>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4 text-sm text-zinc-300">
            <div>
              <p className="text-xs uppercase tracking-[0.25em] text-zinc-500">
                Nationality
              </p>
              <p className="mt-2">{fighter.nationality ?? "Unknown"}</p>
            </div>
            <div>
              <p className="text-xs uppercase tracking-[0.25em] text-zinc-500">
                Stance
              </p>
              <p className="mt-2">{fighter.stance ?? "Unknown"}</p>
            </div>
          </div>
        </CardContent>
        <CardFooter className="flex items-center justify-between border-t border-white/5 px-6 py-4 text-sm text-zinc-400">
          <span>{fighter.fightCount} logged fights</span>
          <span className="text-red-200 transition group-hover:translate-x-1">
            View profile →
          </span>
        </CardFooter>
      </Card>
    </Link>
  );
}