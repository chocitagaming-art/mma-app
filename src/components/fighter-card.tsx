import type { ReactNode } from "react";
import Link from "next/link";
import { ArrowRightLeft } from "lucide-react";

import { ChampionBadge } from "@/components/champion-badge";
import { CountryFlag } from "@/components/country-flag";
import { FighterHeadshot } from "@/components/fighter-headshot";
import { fightCountLabel } from "@/lib/fight-count";
import { formatRecord, formatStance, formatWeight, formatWeightClass } from "@/lib/format";
import type { FighterCardData } from "@/lib/types";
import { cn } from "@/lib/utils";

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

// The face: a 160×100 box, the ufc.com face's own 1.6:1, so the cut-out fills
// it (ESPN's 600×436 is contained at 138×100). Until 29-oct-2026 it was a 64 px
// framed square with the 256 copy; the owner asked for «las cabezas más
// grandes y nítidas»: 3.9 times the area, and the head ~2.4 times. `sizes` is
// exact at every width (the box never resizes; the text column takes what is
// left: 128 px at 360, 148 at the 2-column 768):
//   ufc.com  1x 256 copy 1.60 · 2x original 1.56 · 3x original 1.04
// so a 1x screen keeps the 256 copy and retina takes the 500w original.
const PHOTO_SIZES = "160px";

export function FighterCard({ fighter }: FighterCardProps) {
  const fightLabel = fightCountLabel(fighter);
  // A CURRENT champion's card goes in gold, like on /fighters (owner,
  // 29-oct-2026): gold bar, gold border and glow, gold halo behind the face,
  // and the «Campeón» badge. Its colours live in globals.css (.p4p-card--*):
  // the border/shadow utilities of the other cards are left off, they would
  // beat that layer and turn it red on hover.
  const champion = fighter.isChampion;

  return (
    <div
      data-fighter-card
      data-champion={champion ? "true" : undefined}
      className={cn(
        "p4p-card group relative flex h-full flex-col overflow-hidden rounded-lg border bg-card transition-all duration-200 hover:-translate-y-0.5",
        champion
          ? "p4p-card--champion"
          : "border-border shadow-[0_1px_2px_rgba(190,30,20,0.05),0_10px_28px_-14px_rgba(140,35,25,0.16)] hover:border-primary/50 hover:shadow-lg hover:shadow-primary/15 dark:shadow-none dark:hover:shadow-lg dark:hover:shadow-foreground/5",
      )}
    >
      {/* Corner accent: gold for a champion. */}
      <div
        className={cn(
          "absolute inset-x-0 top-0 z-10 h-1 transition-[height] duration-200 group-hover:h-1.5",
          champion ? "bg-(--champion-gold)" : "bg-corner-red",
        )}
      />

      {/* The face stands on this header's bottom border, in relief, as on
          /fighters and /clasificacion. pt-7 leaves the badge (8 → 28 px) its
          own band ABOVE the face box, so it never covers the head and keeps
          2 px off the bar when it grows on hover. Every card of a row keeps
          the same header: the face sets its height (28 + 100), and a name in
          two lines still fits beside it. */}
      <Link
        href={`/fighters/${fighter.id}`}
        className={cn(
          "p4p-card-header relative flex items-end gap-3 border-b pl-2 pr-5 pt-7 sm:gap-4",
          champion ? "border-amber-500/40 dark:border-amber-400/30" : "border-border",
        )}
      >
        {champion ? <ChampionBadge className="absolute left-3 top-2 z-10" /> : null}
        {/* Hidden from screen readers: the link already says the name. */}
        <div
          data-p4p-photo
          aria-hidden="true"
          className="p4p-card-photo relative h-[100px] w-[160px] shrink-0"
        >
          <FighterHeadshot
            name={fighter.name}
            headshotUrl={fighter.headshotUrl}
            division={fighter.latestWeightClass}
            variant="cutout"
            quality="hd"
            sizes={PHOTO_SIZES}
            className="p4p-card-cutout absolute inset-0"
          />
        </div>
        {/* No ellipsis any more: the name and the nickname wrap (at 360 px
            «ALEXANDER VOLKANOVSKI» takes two lines of a 128 px column, at 768
            of a 148 px one). py-1 and not more: name in two lines (44) +
            nickname (22) + division (20) + 8 = 94 px, inside the face's 100,
            so that card's header is as tall as its neighbours' (with py-2 it
            was 2 px taller, measured at 768 by e2e/portada-p4p.spec.ts). */}
        <div className="min-w-0 flex-1 self-center py-1">
          <p
            className={cn(
              "break-words font-display text-xl font-bold uppercase leading-[1.1] tracking-tight text-foreground transition-colors",
              champion
                ? "group-hover:text-amber-700 dark:group-hover:text-amber-400"
                : "group-hover:text-primary",
            )}
          >
            {fighter.name}
          </p>
          <p className="mt-0.5 break-words text-sm text-muted-foreground">
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

      <div
        data-card-footer
        className="flex items-center justify-between gap-3 border-t border-border bg-muted/40 px-5 py-3 text-sm text-muted-foreground"
      >
        {/* El total sale del MISMO récord que se pinta arriba (29-1-0 → «30
            peleas»): cuadra por construcción. Sin récord cae a «N en UFC», y
            sin eso no se pinta. Ver src/lib/fight-count.ts.
            whitespace-nowrap: el número no se separa nunca de su «peleas». Si
            el pie no cupiera, cederían los enlaces, y eso lo caza
            e2e/portada-p4p.spec.ts midiendo el alto del pie. */}
        {fightLabel ? (
          <span data-fight-count className="tabular whitespace-nowrap">
            {fightLabel}
          </span>
        ) : null}
        {/* ml-auto: sin contador, los enlaces siguen a la derecha. */}
        <div className="ml-auto flex items-center gap-4">
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
