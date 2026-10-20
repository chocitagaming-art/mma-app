import Link from "next/link";
import { ChevronDown, ChevronUp, Trophy } from "lucide-react";

import { CountryFlag } from "@/components/country-flag";
import { FighterHeadshot } from "@/components/fighter-headshot";
import { formatRecord } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { DivisionRanking, RankingEntry } from "@/lib/types";

// The /clasificacion card, redesigned on 21-oct-2026 with the language of the
// /fighters roster card (fighter-roster-card.tsx): the transparent ufc.com /
// ESPN face CUT OUT and standing on a border, instead of a 36 px square thumb.
// The effects live in globals.css (.ranking-*), because they cross elements
// (row hover → photo scale, card width → champion layout).
//
// Sharpness = file px / painted px × DPR. Measured on 21-oct-2026 in Chromium
// AND WebKit: both pick the FIRST srcset candidate whose density reaches the
// DPR (no geometric-mean rounding), so the ufc.com 256 copy is kept while
// painted width × DPR ≤ 256 and the 500 original is taken above that.
//
// Rows: a 120×75 box (the ufc.com face's own 1.6:1, so it fills it; ESPN's
// 600×436 is contained at 103×75). sizes = 120px, exact at every width:
//   ufc.com  1x 256 copy 2.13 · 2x 256 copy 1.07 · 3x original 1.39
//   ESPN     1x 5.83 · 2x 2.91 · 3x 1.94 (one 600 file, no srcset to pick)
// So only a 3x screen pays the original in the rows (the 256 copy there would
// be 0.71). 168 of the page's 206 faces are ESPN and do not change at all.
const ROW_PHOTO_SIZES = "120px";

// Champion: a 192×120 box, the head breaking out of the 96 px gold frame by
// 24 px. sizes = 192px, exact at every width (the box does not resize; only
// the text moves, see .ranking-champion-grid):
//   ufc.com  1x 256 copy 1.33 · 2x original 1.30 · 3x original 0.87
//   ESPN     painted 165×120: 1x 3.64 · 2x 1.82 · 3x 1.21
const CHAMPION_PHOTO_SIZES = "192px";

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
        {/* red-800 in light: --primary on its own 15 % tint was 4.23:1 (axe,
            21-oct-2026, already in production); red-800 is 6.3:1. Dark keeps
            --primary, which passes there. */}
        <span className="rounded bg-primary/15 px-1 py-0.5 font-mono text-[0.55rem] font-bold uppercase leading-none tracking-wide text-red-800 dark:text-primary">
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

// The fighter's name, the ONE link of a row (or of the champion block). Its
// ::after is stretched over the whole row, so the photo and the empty space
// are clickable too (a 75 px tall target on a phone) while the accessible
// name stays just the fighter's name. The keyboard ring is drawn on that
// ::after, i.e. around the whole row, not around the text alone.
function FighterName({ entry, className }: { entry: RankingEntry; className?: string }) {
  if (!entry.fighterId) {
    return <span className={className}>{entry.fighterName}</span>;
  }
  return (
    <Link
      href={`/fighters/${entry.fighterId}`}
      className={cn(
        "transition-colors after:absolute after:inset-0 after:content-[''] focus-visible:outline-none focus-visible:after:outline-2 focus-visible:after:-outline-offset-2 focus-visible:after:outline-ring focus-visible:after:outline",
        className,
      )}
    >
      {entry.fighterName}
    </Link>
  );
}

function record(entry: RankingEntry): string | null {
  return entry.wins != null ? formatRecord(entry.wins, entry.losses ?? 0, entry.draws ?? 0) : null;
}

function ChampionBlock({ champion, division }: { champion: RankingEntry; division: string }) {
  const championRecord = record(champion);
  return (
    <div
      data-testid="ranking-champion"
      className="ranking-champion group/champ relative border-b border-amber-500/40 px-4 pb-4 pt-9 dark:border-amber-400/30"
    >
      <div className="ranking-champion-grid">
        {/* The gold frame, the champion's mark since the first version: the
            cut-out is taller than the frame and stands on its bottom edge, so
            the head breaks out over the top border. Hidden from screen
            readers: the name link right after it already says who it is. */}
        <div
          data-testid="ranking-champion-photo"
          aria-hidden="true"
          className="ranking-champion-frame relative h-[100px] w-[196px] rounded-lg border-2 border-amber-500 dark:border-amber-400"
        >
          <FighterHeadshot
            name={champion.fighterName}
            headshotUrl={champion.headshotUrl}
            division={division}
            variant="cutout"
            quality="hd"
            sizes={CHAMPION_PHOTO_SIZES}
            className="ranking-champion-cutout absolute inset-x-0 bottom-0 h-[120px]"
          />
        </div>
        <div className="ranking-champion-label min-w-0">
          <p className="flex items-center gap-1.5 font-mono text-[0.7rem] font-semibold uppercase tracking-[0.18em] text-amber-700 dark:text-amber-400">
            <Trophy className="size-3.5 shrink-0" aria-hidden />
            Campeón
          </p>
          {/* The nickname, as the roster card shows it (mono, in quotes). */}
          {champion.nickname ? (
            <p className="mt-1.5 truncate font-mono text-[11px] font-medium leading-[1.25] text-muted-foreground">
              {`"${champion.nickname}"`}
            </p>
          ) : null}
        </div>
        <p className="ranking-champion-name text-balance font-display text-[1.75rem] font-extrabold uppercase leading-[0.95] tracking-tight [overflow-wrap:anywhere]">
          <FighterName
            entry={champion}
            className="text-foreground group-hover/champ:text-primary"
          />
        </p>
        {championRecord || champion.nationality ? (
          // At 360 px the column beside the photo is 84 px: a long record
          // ("26-10-1") goes whole to its own line under the flag, never split.
          <p className="ranking-champion-record flex flex-wrap items-center gap-x-2 gap-y-1">
            <CountryFlag nationality={champion.nationality} className="h-4 w-[22px]" />
            {championRecord ? (
              <span className="whitespace-nowrap font-display text-2xl font-bold leading-none tabular text-foreground">
                {championRecord}
              </span>
            ) : null}
          </p>
        ) : null}
      </div>
    </div>
  );
}

export function RankingDivisionCard({
  division,
  priority = false,
}: {
  division: DivisionRanking;
  // The first card of the page: its first rows are above the fold at every
  // width, so their faces load eagerly. Everything else is lazy.
  priority?: boolean;
}) {
  const { label, champion, ranked } = division;

  return (
    <div
      data-testid="ranking-card"
      data-division={division.division}
      className="ranking-card flex flex-col overflow-hidden rounded-lg border border-border bg-card"
    >
      <div className="relative border-b border-border px-5 py-3">
        <span className="absolute inset-y-0 left-0 w-1 bg-corner-red" />
        <h3 className="font-display text-lg font-bold uppercase tracking-tight text-foreground">
          {label}
        </h3>
      </div>

      {champion ? <ChampionBlock champion={champion} division={division.division} /> : null}

      <ol className="divide-y divide-border">
        {ranked.map((entry, index) => {
          const rank = index + 1;
          const entryRecord = record(entry);
          return (
            <li
              key={`${index}-${entry.fighterId ?? entry.fighterName}`}
              data-testid="ranking-row"
              className={cn(
                "ranking-row group/row relative flex items-center gap-2 pl-2 pr-3 transition-colors hover:bg-muted/50 sm:gap-3 sm:pr-4",
                rank === 1 && "ranking-row--first bg-primary/[0.05]",
              )}
            >
              <span
                className={cn(
                  "w-7 shrink-0 text-right font-display text-xl font-extrabold tabular leading-none",
                  rank === 1 ? "text-primary" : "text-muted-foreground",
                )}
              >
                {rank}
              </span>
              {/* self-end: the cut-out stands on the row's bottom border. */}
              <div
                data-testid="ranking-row-photo"
                aria-hidden="true"
                className="ranking-row-photo relative h-[75px] w-[120px] shrink-0 self-end"
              >
                <FighterHeadshot
                  name={entry.fighterName}
                  headshotUrl={entry.headshotUrl}
                  division={division.division}
                  variant="cutout"
                  quality="hd"
                  sizes={ROW_PHOTO_SIZES}
                  priority={priority && rank <= 4}
                  className="ranking-row-cutout absolute inset-0"
                />
              </div>
              <div className="min-w-0 flex-1 py-2">
                {/* Two lines at most: the row keeps its 75 px, the skeleton
                    (loading.tsx) matches it, and the longest single word of
                    the rankings (NURMAGOMEDOV, 97 px at 16 px) fits the
                    100 px this column has at 360. */}
                <FighterName
                  entry={entry}
                  className="line-clamp-2 font-display text-base font-extrabold uppercase leading-[1.05] tracking-tight text-foreground [overflow-wrap:anywhere] group-hover/row:text-primary"
                />
                {entryRecord || entry.nationality ? (
                  <p className="mt-1 flex items-center gap-1.5">
                    <CountryFlag nationality={entry.nationality} />
                    {entryRecord ? (
                      <span className="font-mono text-xs tabular text-muted-foreground">
                        {entryRecord}
                      </span>
                    ) : null}
                  </p>
                ) : null}
              </div>
              <Movement change={entry.rankChange} />
            </li>
          );
        })}
      </ol>
    </div>
  );
}
