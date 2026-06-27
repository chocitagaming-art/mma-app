import type { ReactNode } from "react";
import Link from "next/link";
import { ArrowRightLeft } from "lucide-react";

import { CountryFlag } from "@/components/country-flag";
import { FighterHeadshot } from "@/components/fighter-headshot";
import { formatRecord, formatStance, formatWeight, formatWeightClass } from "@/lib/format";
import type { FighterCardData } from "@/lib/types";

type FighterCardProps = {
  fighter: FighterCardData;
};

function Stat({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div>
      <p className="font-mono text-[0.65rem] uppercase tracking-[0.18em] text-muted-foreground">
        {label}
      </p>
      <p className="mt-1 font-medium text-foreground">{value}</p>
    </div>
  );
}

export function FighterCard({ fighter }: FighterCardProps) {
  return (
    <div className="group relative flex h-full flex-col overflow-hidden rounded-lg border border-border bg-card transition-all duration-200 hover:-translate-y-0.5 hover:border-primary/50 hover:shadow-lg hover:shadow-foreground/5">
      {/* Corner accent */}
      <div className="absolute inset-x-0 top-0 z-10 h-1 bg-corner-red transition-[height] duration-200 group-hover:h-1.5" />

      <Link
        href={`/fighters/${fighter.id}`}
        className="flex items-center gap-4 border-b border-border p-5"
      >
        <FighterHeadshot
          name={fighter.name}
          headshotUrl={fighter.headshotUrl}
          size="md"
          className="shrink-0"
        />
        <div className="min-w-0 flex-1">
          <p className="truncate font-display text-xl font-bold uppercase leading-tight tracking-tight text-foreground transition-colors group-hover:text-primary">
            {fighter.name}
          </p>
          <p className="truncate text-sm text-muted-foreground">
            {fighter.nickname ? `"${fighter.nickname}"` : "Sin apodo registrado"}
          </p>
          <p className="mt-1 font-mono text-xs uppercase tracking-wide text-muted-foreground">
            {fighter.latestWeightClass ? formatWeightClass(fighter.latestWeightClass) : "Sin límite"}
          </p>
        </div>
      </Link>

      <Link href={`/fighters/${fighter.id}`} className="flex-1 p-5">
        <div className="grid grid-cols-2 gap-4 text-sm">
          <Stat
            label="Récord"
            value={formatRecord(fighter.wins, fighter.losses, fighter.draws)}
          />
          <Stat label="Peso" value={formatWeight(fighter.weightGrams)} />
          <Stat
            label="Nacionalidad"
            value={
              fighter.nationality ? (
                <span className="inline-flex items-center gap-1.5">
                  <CountryFlag nationality={fighter.nationality} />
                  <span className="truncate">{fighter.nationality}</span>
                </span>
              ) : (
                "—"
              )
            }
          />
          <Stat label="Guardia" value={formatStance(fighter.stance)} />
        </div>
      </Link>

      <div className="flex items-center justify-between gap-3 border-t border-border bg-muted/40 px-5 py-3 text-sm text-muted-foreground">
        <span className="tabular">{fighter.fightCount} peleas</span>
        <div className="flex items-center gap-4">
          <Link
            href={`/enfrentamiento?red=${fighter.id}`}
            className="inline-flex items-center gap-1.5 font-medium text-foreground transition-colors hover:text-primary"
          >
            <ArrowRightLeft className="size-3.5" />
            Comparar
          </Link>
          <Link
            href={`/fighters/${fighter.id}`}
            className="font-medium text-primary transition-transform group-hover:translate-x-0.5"
          >
            Ver perfil →
          </Link>
        </div>
      </div>
    </div>
  );
}
