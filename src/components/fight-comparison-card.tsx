import Link from "next/link";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { formatControlTime, formatHeight, formatPercentage, formatReach, formatRecord } from "@/lib/format";
import type { FightCompetitor, FightCompetitorStats } from "@/lib/types";

type FightComparisonCardProps = {
  fighter: FightCompetitor;
  stats: FightCompetitorStats | null;
  corner: "red" | "blue";
  isWinner: boolean;
};

export function FightComparisonCard({
  fighter,
  stats,
  corner,
  isWinner,
}: FightComparisonCardProps) {
  return (
    <Card className="border-white/10 bg-white/5">
      <CardHeader className="space-y-4">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.3em] text-zinc-500">
              esquina {corner === "red" ? "roja" : "azul"}
            </p>
            <Link
              href={`/fighters/${fighter.id}`}
              className="mt-2 block text-2xl font-semibold text-white transition hover:text-red-200"
            >
              {fighter.name}
            </Link>
            <p className="mt-1 text-sm text-zinc-400">
              {fighter.nickname ? `"${fighter.nickname}"` : "Sin apodo registrado"}
            </p>
          </div>
          {isWinner ? (
            <Badge className="border-emerald-400/20 bg-emerald-500/10 text-emerald-200">
              Ganador
            </Badge>
          ) : null}
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="grid grid-cols-2 gap-4 text-sm">
          <div>
            <p className="text-xs uppercase tracking-[0.25em] text-zinc-500">Récord</p>
            <p className="mt-2 text-white">
              {formatRecord(fighter.wins, fighter.losses, fighter.draws)}
            </p>
          </div>
          <div>
            <p className="text-xs uppercase tracking-[0.25em] text-zinc-500">Guardia</p>
            <p className="mt-2 text-white">{fighter.stance ?? "Desconocida"}</p>
          </div>
          <div>
            <p className="text-xs uppercase tracking-[0.25em] text-zinc-500">Altura</p>
            <p className="mt-2 text-white">{formatHeight(fighter.heightCm)}</p>
          </div>
          <div>
            <p className="text-xs uppercase tracking-[0.25em] text-zinc-500">Alcance</p>
            <p className="mt-2 text-white">{formatReach(fighter.reachCm)}</p>
          </div>
        </div>
        <div className="grid gap-3">
          <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
            <p className="text-xs uppercase tracking-[0.25em] text-zinc-500">
              Golpes significativos
            </p>
            <p className="mt-2 text-lg font-semibold text-white">
              {stats
                ? `${stats.sigStrikesLanded}/${stats.sigStrikesAttempted}`
                : "Sin estadísticas"}
            </p>
            <p className="mt-1 text-sm text-zinc-400">
              {stats ? formatPercentage(stats.sigStrikeAccuracy) : "—"}
            </p>
          </div>
          <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
            <p className="text-xs uppercase tracking-[0.25em] text-zinc-500">Derribos</p>
            <p className="mt-2 text-lg font-semibold text-white">
              {stats
                ? `${stats.takedownsLanded}/${stats.takedownsAttempted}`
                : "Sin estadísticas"}
            </p>
            <p className="mt-1 text-sm text-zinc-400">
              {stats ? formatPercentage(stats.takedownAccuracy) : "—"}
            </p>
          </div>
          <div className="grid grid-cols-3 gap-3 text-center">
            <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
              <p className="text-xs uppercase tracking-[0.25em] text-zinc-500">Subs</p>
              <p className="mt-2 text-lg font-semibold text-white">
                {stats?.submissionAttempts ?? 0}
              </p>
            </div>
            <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
              <p className="text-xs uppercase tracking-[0.25em] text-zinc-500">KD</p>
              <p className="mt-2 text-lg font-semibold text-white">
                {stats?.knockdowns ?? 0}
              </p>
            </div>
            <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
              <p className="text-xs uppercase tracking-[0.25em] text-zinc-500">
                Control
              </p>
              <p className="mt-2 text-lg font-semibold text-white">
                {formatControlTime(stats?.controlTimeSeconds ?? 0)}
              </p>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}