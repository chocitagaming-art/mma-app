import Link from "next/link";
import type { CSSProperties } from "react";

import { ChampionBadge } from "@/components/champion-badge";
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
  const championId = `roster-card-${fighter.id}-champion`;
  const weightClass = fighter.latestWeightClass
    ? formatWeightClass(fighter.latestWeightClass)
    : "Sin límite";
  // A CURRENT champion's card goes in gold (owner, 29-oct-2026), and the
  // description starts with the visible «Campeón» badge. Every other card
  // renders exactly the markup it had before.
  const champion = fighter.isChampion;
  const describedBy = fighter.nickname ? `${nicknameId} ${detailsId}` : detailsId;

  return (
    <Link
      href={`/fighters/${fighter.id}`}
      aria-labelledby={nameId}
      aria-describedby={champion ? `${championId} ${describedBy}` : describedBy}
      data-testid="roster-card"
      data-champion={champion ? "true" : undefined}
      style={style}
      className={cn(
        // The champion's border colour, glow and hover live in globals.css
        // (.roster-card--champion): no border-colour utility here, it would
        // beat that layer and turn the card red on hover.
        champion
          ? "roster-card roster-card--champion relative flex flex-col overflow-hidden rounded-[16px] border bg-card text-foreground transition-[border-color,box-shadow] duration-200 motion-reduce:transition-none"
          : "roster-card relative flex flex-col overflow-hidden rounded-[16px] border border-border bg-card text-foreground transition-[border-color] duration-200 motion-reduce:transition-none hover:border-primary/75 focus-visible:border-primary/75",
        className,
      )}
    >
      {champion ? (
        // Over the photo's top-left corner, where the ufc.com bust leaves
        // transparent background (the head is centred), compact below lg
        // (see champion-badge.tsx). Outside the aria-hidden photo zone: it is
        // read, as the start of the description.
        <ChampionBadge
          id={championId}
          compact
          className="absolute left-1.5 top-1 z-10 lg:left-2.5 lg:top-2.5"
        />
      ) : null}
      <div
        data-testid="roster-card-photo"
        aria-hidden="true"
        className={
          // The line the champion stands on: the /clasificacion block's own.
          champion
            ? "roster-card-photo relative h-[138px] border-b border-amber-500/40 lg:h-[186px] dark:border-amber-400/30"
            : "roster-card-photo relative h-[138px] border-b border-border lg:h-[186px]"
        }
      >
        <FighterHeadshot
          name={fighter.name}
          headshotUrl={fighter.headshotUrl}
          division={fighter.latestWeightClass}
          variant="cutout"
          priority={priority}
          // R5: the card is where a face is shown big, so it offers the ufc.com
          // original too (srcset 256w/500w). `sizes` is the width the PICTURE is
          // painted at, not the box's: the box is 112 % of the card wide and
          // 94 % of 138/186 px tall, and the 1.6:1 face is contained in it, so
          // it is never wider than 130×1.6 ≈ 208 px below lg nor 175×1.6 = 280
          // px from lg (measured on 18-oct from 360 to 1920). A 1x phone keeps
          // downloading the 256 copy; retina screens and desktop take the 500.
          quality="hd"
          sizes="(min-width: 1024px) 280px, 208px"
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
