import Link from "next/link";
import { ChevronDown, ChevronUp } from "lucide-react";

import { CountryFlag } from "@/components/country-flag";
import { FighterHeadshot } from "@/components/fighter-headshot";
import { formatRecord } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { DivisionRanking, RankingEntry } from "@/lib/types";

function Movement({ change }: { change: number | null }) {
  if (change == null || change === 0) {
    return (
      <span className="w-9 shrink-0 text-center font-mono text-xs text-muted-foreground">—</span>
    );
  }

  if (change >= 900) {
    return (
      <span className="w-9 shrink-0 text-center font-mono text-[0.6rem] font-bold uppercase tracking-wide text-primary">
        Nuevo
      </span>
    );
  }

  const up = change > 0;
  return (
    <span
      className={cn(
        "inline-flex w-9 shrink-0 items-center justify-center gap-0.5 font-mono text-xs font-semibold tabular",
        up ? "text-win" : "text-loss",
      )}
    >
      {up ? <ChevronUp className="size-3" /> : <ChevronDown className="size-3" />}
      {Math.abs(change)}
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
        <div className="flex items-center gap-3 border-b border-border bg-muted/40 px-5 py-4">
          <FighterHeadshot
            name={champion.fighterName}
            headshotUrl={champion.headshotUrl}
            size="md"
            className="shrink-0 border-2 border-corner-red"
          />
          <div className="min-w-0">
            <p className="font-mono text-[0.6rem] font-semibold uppercase tracking-[0.18em] text-primary">
              Campeón
            </p>
            <div className="mt-1">
              <FighterName entry={champion} />
            </div>
            {champion.wins != null ? (
              <p className="mt-1 font-mono text-xs tabular text-muted-foreground">
                {formatRecord(champion.wins, champion.losses ?? 0, champion.draws ?? 0)}
              </p>
            ) : null}
          </div>
        </div>
      ) : null}

      <ol className="divide-y divide-border">
        {ranked.map((entry, index) => (
          <li
            key={`${index}-${entry.fighterId ?? entry.fighterName}`}
            className="flex items-center gap-3 px-5 py-2 transition-colors hover:bg-muted/50"
          >
            <span className="w-5 shrink-0 text-right font-mono text-sm font-semibold tabular text-muted-foreground">
              {index + 1}
            </span>
            {showPhotos ? (
              <FighterHeadshot
                name={entry.fighterName}
                headshotUrl={entry.headshotUrl}
                size="sm"
                className="size-9 shrink-0"
              />
            ) : null}
            <div className="min-w-0 flex-1">
              <FighterName entry={entry} />
            </div>
            <Movement change={entry.rankChange} />
          </li>
        ))}
      </ol>
    </div>
  );
}
