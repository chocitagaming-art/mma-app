import Link from "next/link";
import type { CSSProperties } from "react";

import { CountryFlag } from "@/components/country-flag";
import { FighterHeadshot } from "@/components/fighter-headshot";
import { formatRecord, formatStance, formatWeightClass } from "@/lib/format";
import type { FighterCardData } from "@/lib/types";
import { cn } from "@/lib/utils";

type FighterRosterCardProps = {
  fighter: FighterCardData;
  // The first cards are above the fold on desktop: their photo loads eagerly.
  priority?: boolean;
  className?: string;
  style?: CSSProperties;
};

// One card of the /fighters grid (redesign of 17-oct-2026, validated by the
// owner on a live prototype). The WHOLE card is a single link to the profile:
// its accessible name is just the fighter's name (aria-labelledby) and the rest
// (nickname, record, division, nationality, stance) goes in the description, so
// a screen reader does not read a run-on name. The photo is hidden from it: its
// alt would only repeat the name the link already has. The cut-out photo stands on the photo
// zone's bottom border; the hover/focus effects live in globals.css
// (.roster-card*), because they cross elements (card hover → photo scale).
export function FighterRosterCard({ fighter, priority = false, className, style }: FighterRosterCardProps) {
  const nameId = `roster-card-${fighter.id}-name`;
  const nicknameId = `roster-card-${fighter.id}-nickname`;
  const detailsId = `roster-card-${fighter.id}-details`;
  const weightClass = fighter.latestWeightClass
    ? formatWeightClass(fighter.latestWeightClass)
    : "Sin límite";

  return (
    <Link
      href={`/fighters/${fighter.id}`}
      aria-labelledby={nameId}
      aria-describedby={fighter.nickname ? `${nicknameId} ${detailsId}` : detailsId}
      data-testid="roster-card"
      style={style}
      className={cn(
        "roster-card relative flex flex-col overflow-hidden rounded-[16px] border border-border bg-card text-foreground transition-[border-color] duration-200 motion-reduce:transition-none hover:border-primary/75 focus-visible:border-primary/75",
        className,
      )}
    >
      <div
        data-testid="roster-card-photo"
        aria-hidden="true"
        className="roster-card-photo relative h-[138px] border-b border-border lg:h-[186px]"
      >
        <FighterHeadshot
          name={fighter.name}
          headshotUrl={fighter.headshotUrl}
          division={fighter.latestWeightClass}
          variant="cutout"
          priority={priority}
          // The box is 112 % of the card wide (the validated bleed) and 94 % tall.
          sizes="(min-width: 1024px) 330px, (min-width: 640px) 260px, 200px"
          className="roster-card-cutout absolute -inset-x-[6%] bottom-0 h-[94%]"
        />
      </div>
      {/* flex-1 + mt-auto: the cards of a row share one height (grid stretch),
          so when a long name wraps to two lines (≈3 % of them at 360 px) the
          record and the division of EVERY card in the row stay on one line. */}
      <div className="flex flex-1 flex-col px-2.5 pb-3.5 pt-2.5 text-center">
        {/* The line is kept even without a nickname, so the cards of a row align. */}
        <p
          id={fighter.nickname ? nicknameId : undefined}
          className="min-h-[1.25em] truncate font-mono text-[11px] font-medium leading-[1.25] text-muted-foreground"
        >
          {fighter.nickname ? `"${fighter.nickname}"` : null}
        </p>
        <p
          id={nameId}
          className="mt-0.5 break-words font-display text-base font-extrabold uppercase leading-[1.05] tracking-[-0.01em] lg:text-[19px]"
        >
          {fighter.name}
        </p>
        <div id={detailsId} className="mt-auto pt-1.5">
          <p className="font-display text-xl font-extrabold leading-none tabular-nums">
            {formatRecord(fighter.wins, fighter.losses, fighter.draws)}
          </p>
          <p className="mt-1.5 flex items-center justify-center gap-1.5 overflow-hidden whitespace-nowrap text-xs/[1.5] text-muted-foreground">
            <CountryFlag nationality={fighter.nationality} className="h-3 w-4" />
            <span className="truncate">{weightClass}</span>
            {/* Not on screen (the flag shows it), but read out and searchable. */}
            <span className="sr-only">
              {`. Nacionalidad: ${fighter.nationality ?? "Desconocida"}. Guardia: ${
                fighter.stance ? formatStance(fighter.stance) : "Desconocida"
              }`}
            </span>
          </p>
        </div>
      </div>
    </Link>
  );
}
