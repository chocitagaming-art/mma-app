import Link from "next/link";
import { ChevronDown, ChevronUp, Trophy } from "lucide-react";

import { CountryFlag } from "@/components/country-flag";
import { FighterHeadshot } from "@/components/fighter-headshot";
import { formatRecord } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { DivisionRanking, RankingEntry } from "@/lib/types";

function Movement({ change }: { change: number | null }) {
  if (change == null || change === 0) {
    return (
      <span
        role="img"
        aria-label="sin cambios"
        className="w-9 shrink-0 text-center font-mono text-xs text-muted-foreground"
      >
        —
      </span>
    );
  }

  if (change >= 900) {
    return (
      <span
        role="img"
        aria-label="nuevo en el ranking"
        className="flex w-9 shrink-0 items-center justify-center"
      >
        <span className="rounded bg-primary/15 px-1 py-0.5 font-mono text-[0.55rem] font-bold uppercase leading-none tracking-wide text-primary">
          Nuevo
        </span>
      </span>
    );
  }

  const up = change > 0;
  const count = Math.abs(change);
  const positionWord = count === 1 ? "posición" : "posiciones";
  return (
    <span
      role="img"
      aria-label={`${up ? "sube" : "baja"} ${count} ${positionWord}`}
      className={cn(
        "inline-flex w-9 shrink-0 items-center justify-center gap-0.5 font-mono text-xs font-semibold tabular",
        up ? "text-win" : "text-loss",
      )}
    >
      {up ? <ChevronUp className="size-3" aria-hidden /> : <ChevronDown className="size-3" aria-hidden />}
      {count}
    </span>
  );
}

function FighterName({ entry }: { entry: RankingEntry }) {
  const inner = (
    <>
      <CountryFlag nationality={entry.nationality} />
      <span className="truncate font-medium text-foreground group-hover:text-primary">
        {entry.fighterName}
      </span>
    </>
  );

  if (!entry.fighterId) {
    return <span className="flex min-w-0 items-center gap-2">{inner}</span>;
  }

  return (
    <Link
      href={`/fighters/${entry.fighterId}`}
      className="group flex min-w-0 items-center gap-2 transition-colors"
    >
      {inner}
    </Link>
  );
}

export function RankingDivisionCard({
  division,
  showPhotos = false,
}: {
  division: DivisionRanking;
  showPhotos?: boolean;
}) {
  const { label, champion, ranked } = division;

  return (
    <div className="flex flex-col overflow-hidden rounded-lg border border-border bg-card">
      <div className="relative border-b border-border px-5 py-3">
        <span className="absolute inset-y-0 left-0 w-1 bg-corner-red" />
        <h3 className="font-display text-lg font-bold uppercase tracking-tight text-foreground">
          {label}
        </h3>
      </div>

      {champion ? (
        <div className="flex items-center gap-3 border-b border-border bg-gradient-to-r from-amber-400/10 via-muted/40 to-transparent px-5 py-4">
          <FighterHeadshot
            name={champion.fighterName}
            headshotUrl={champion.headshotUrl}
            division={division.division}
            size="md"
            className="size-[4.5rem] shrink-0 border-2 border-amber-400/70 shadow-[0_0_18px_rgba(251,191,36,0.18)]"
          />
          <div className="min-w-0 flex-1">
            <p className="flex items-center gap-1 font-mono text-[0.6rem] font-semibold uppercase tracking-[0.18em] text-amber-400">
              <Trophy className="size-3" aria-hidden />
              Campeón
            </p>
            <div className="mt-1 text-[0.95rem]">
              <FighterName entry={champion} />
            </div>
            {champion.wins != null ? (
              <p className="mt-0.5 font-mono text-xs tabular text-muted-foreground">
                {formatRecord(champion.wins, champion.losses ?? 0, champion.draws ?? 0)}
              </p>
            ) : null}
          </div>
        </div>
      ) : null}

      <ol className="divide-y divide-border">
        {ranked.map((entry, index) => {
          const rank = index + 1;
          return (
            <li
              key={`${index}-${entry.fighterId ?? entry.fighterName}`}
              className={cn(
                "flex items-center gap-3 px-5 py-2 transition-colors hover:bg-muted/50",
                rank === 1 && "bg-primary/[0.05]",
              )}
            >
              <span
                className={cn(
                  "w-7 shrink-0 text-right font-display text-lg font-extrabold tabular leading-none",
                  rank === 1 ? "text-primary" : "text-muted-foreground",
                )}
              >
                {rank}
              </span>
              {showPhotos ? (
                <FighterHeadshot
                  name={entry.fighterName}
                  headshotUrl={entry.headshotUrl}
                  division={division.division}
                  size="sm"
                  className="size-9 shrink-0"
                />
              ) : null}
              <div className="min-w-0 flex-1">
                <FighterName entry={entry} />
              </div>
              <Movement change={entry.rankChange} />
            </li>
          );
        })}
      </ol>
    </div>
  );
}
