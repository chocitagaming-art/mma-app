import Link from "next/link";
import { ArrowRightLeft } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardFooter, CardHeader } from "@/components/ui/card";
import { FighterHeadshot } from "@/components/fighter-headshot";
import { formatRecord, formatWeight } from "@/lib/format";
import type { FighterCardData } from "@/lib/types";

type FighterCardProps = {
  fighter: FighterCardData;
};

export function FighterCard({ fighter }: FighterCardProps) {
  return (
    <Card className="group flex h-full flex-col overflow-hidden border-white/10 bg-gradient-to-br from-zinc-950 via-zinc-900 to-zinc-950 transition duration-300 hover:-translate-y-1 hover:border-red-400/40 hover:shadow-2xl hover:shadow-red-950/30">
      <Link href={`/fighters/${fighter.id}`} className="block">
        <CardHeader className="space-y-4 border-b border-white/5 pb-5">
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-center gap-4">
              <FighterHeadshot
                name={fighter.name}
                headshotUrl={fighter.headshotUrl}
                size="sm"
                className="shrink-0"
              />
              <div className="space-y-2">
                <p className="text-xl font-semibold text-white transition group-hover:text-red-200">
                  {fighter.name}
                </p>
                <p className="text-sm text-zinc-400">
                  {fighter.nickname ? `"${fighter.nickname}"` : "Sin apodo registrado"}
                </p>
              </div>
            </div>
            <Badge className="border-red-400/20 bg-red-500/10 text-red-200">
              {fighter.latestWeightClass ?? "Open Weight"}
            </Badge>
          </div>
        </CardHeader>
      </Link>
      <Link href={`/fighters/${fighter.id}`} className="block flex-1">
        <CardContent className="flex-1 space-y-5 p-6">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <p className="text-xs uppercase tracking-[0.25em] text-zinc-500">
                Récord
              </p>
              <p className="mt-2 text-lg font-semibold text-white">
                {formatRecord(fighter.wins, fighter.losses, fighter.draws)}
              </p>
            </div>
            <div>
              <p className="text-xs uppercase tracking-[0.25em] text-zinc-500">
                Peso
              </p>
              <p className="mt-2 text-lg font-semibold text-white">
                {formatWeight(fighter.weightGrams)}
              </p>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4 text-sm text-zinc-300">
            <div>
              <p className="text-xs uppercase tracking-[0.25em] text-zinc-500">
                Nacionalidad
              </p>
              <p className="mt-2">{fighter.nationality ?? "Unknown"}</p>
            </div>
            <div>
              <p className="text-xs uppercase tracking-[0.25em] text-zinc-500">
                Guardia
              </p>
              <p className="mt-2">{fighter.stance ?? "Unknown"}</p>
            </div>
          </div>
        </CardContent>
      </Link>
      <CardFooter className="flex items-center justify-between gap-3 border-t border-white/5 px-6 py-4 text-sm text-zinc-400">
        <span>{fighter.fightCount} peleas registradas</span>
        <div className="flex items-center gap-2">
          <Link href={`/compare?a=${fighter.id}`}>
            <Button
              variant="ghost"
              size="sm"
              className="text-zinc-300 hover:bg-white/5 hover:text-white"
            >
              <ArrowRightLeft />
              Comparar
            </Button>
          </Link>
          <Link href={`/fighters/${fighter.id}`}>
            <span className="text-red-200 transition group-hover:translate-x-1">
              Ver perfil →
            </span>
          </Link>
        </div>
      </CardFooter>
    </Card>
  );
}