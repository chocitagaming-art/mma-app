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
    <Card>
      <CardHeader className="space-y-4">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.3em] text-muted-foreground">
              esquina {corner === "red" ? "roja" : "azul"}
            </p>
            <Link
              href={`/fighters/${fighter.id}`}
              className="mt-2 block text-2xl font-semibold text-foreground transition hover:text-primary"
            >
              {fighter.name}
            </Link>
            <p className="mt-1 text-sm text-muted-foreground">
              {fighter.nickname ? `"${fighter.nickname}"` : "Sin apodo registrado"}
            </p>
          </div>
          {isWinner ? (
            <Badge className="border-win/20 bg-win/10 text-win">
              Ganador
            </Badge>
          ) : null}
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="grid grid-cols-2 gap-4 text-sm">
          <div>
            <p className="text-xs uppercase tracking-[0.25em] text-muted-foreground">Récord</p>
            <p className="mt-2 text-foreground">
              {formatRecord(fighter.wins, fighter.losses, fighter.draws)}
            </p>
          </div>
          <div>
            <p className="text-xs uppercase tracking-[0.25em] text-muted-foreground">Guardia</p>
            <p className="mt-2 text-foreground">{fighter.stance ?? "Unknown"}</p>
          </div>
          <div>
            <p className="text-xs uppercase tracking-[0.25em] text-muted-foreground">Altura</p>
            <p className="mt-2 text-foreground">{formatHeight(fighter.heightCm)}</p>
          </div>
          <div>
            <p className="text-xs uppercase tracking-[0.25em] text-muted-foreground">Alcance</p>
            <p className="mt-2 text-foreground">{formatReach(fighter.reachCm)}</p>
          </div>
        </div>
        <div className="grid gap-3">
          <div className="rounded-2xl border border-border bg-muted/50 p-4">
            <p className="text-xs uppercase tracking-[0.25em] text-muted-foreground">
              Golpes significativos
            </p>
            <p className="mt-2 text-lg font-semibold text-foreground">
              {stats
                ? `${stats.sigStrikesLanded}/${stats.sigStrikesAttempted}`
                : "Sin estadísticas"}
            </p>
            <p className="mt-1 text-sm text-muted-foreground">
              {stats ? formatPercentage(stats.sigStrikeAccuracy) : "—"}
            </p>
          </div>
          <div className="rounded-2xl border border-border bg-muted/50 p-4">
            <p className="text-xs uppercase tracking-[0.25em] text-muted-foreground">Derribos</p>
            <p className="mt-2 text-lg font-semibold text-foreground">
              {stats
                ? `${stats.takedownsLanded}/${stats.takedownsAttempted}`
                : "Sin estadísticas"}
            </p>
            <p className="mt-1 text-sm text-muted-foreground">
              {stats ? formatPercentage(stats.takedownAccuracy) : "—"}
            </p>
          </div>
          <div className="grid grid-cols-3 gap-3 text-center">
            <div className="rounded-2xl border border-border bg-muted/50 p-4">
              <p className="text-xs uppercase tracking-[0.25em] text-muted-foreground">Subs</p>
              <p className="mt-2 text-lg font-semibold text-foreground">
                {stats?.submissionAttempts ?? 0}
              </p>
            </div>
            <div className="rounded-2xl border border-border bg-muted/50 p-4">
              <p className="text-xs uppercase tracking-[0.25em] text-muted-foreground">KD</p>
              <p className="mt-2 text-lg font-semibold text-foreground">
                {stats?.knockdowns ?? 0}
              </p>
            </div>
            <div className="rounded-2xl border border-border bg-muted/50 p-4">
              <p className="text-xs uppercase tracking-[0.25em] text-muted-foreground">
                Control
              </p>
              <p className="mt-2 text-lg font-semibold text-foreground">
                {formatControlTime(stats?.controlTimeSeconds ?? 0)}
              </p>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}