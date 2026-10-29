import { Trophy } from "lucide-react";

import { cn } from "@/lib/utils";

// The «Campeón» label of a CURRENT champion's card (owner, 29-oct-2026), on
// the /fighters roster card and the home's pound-for-pound card. The gold
// border says it to the eye; this says it in words, so the meaning is not
// carried by colour alone (WCAG 1.4.1).
//
// The text is the /clasificacion «Campeón» (mono, uppercase, amber-700 /
// amber-400), on an OPAQUE card-coloured pill: it sits over a gold wash and
// the corner of a photo, and a background of its own keeps the contrast fixed
// and decidable (amber-700 on white 5.0:1, amber-400 on the dark card 10:1;
// e2e/campeones-oro.spec.ts measures it). A <span>, never a <p>: the roster
// card's tests read its paragraphs by position.
//
// `compact` (the roster card below lg): 10 px text and a 10 px trophy, a
// 75×16 px pill instead of 88×20. On the 157-245 px cards of phones and
// tablets the head is centred and reaches the top of the photo zone, and the
// full-size pill grazed the hair of Joshua Van and Alexander Volkanovski
// (measured on 29-oct at 360, 390 and 768); the compact one ends before it.
export function ChampionBadge({
  id,
  compact = false,
  className,
}: {
  id?: string;
  compact?: boolean;
  className?: string;
}) {
  return (
    <span
      id={id}
      data-champion-badge
      className={cn(
        "inline-flex items-center rounded-full border border-(--champion-gold) bg-card font-mono font-semibold uppercase text-amber-700 shadow-sm dark:text-amber-400",
        compact
          ? "gap-0.5 px-1.5 py-[2px] text-[0.625rem] tracking-[0.1em] lg:gap-1 lg:px-2 lg:py-[3px] lg:text-[0.6875rem] lg:tracking-[0.12em]"
          : "gap-1 px-2 py-[3px] text-[0.6875rem] tracking-[0.12em]",
        // 🪤 AFTER the font size: tailwind-merge drops a leading-* that comes
        // BEFORE a text-* (it pairs them), and the pill grew 4 px and slid over
        // the P4P face box (caught by e2e/portada-p4p.spec.ts on 29-oct).
        "leading-none",
        className,
      )}
    >
      <Trophy className={cn("shrink-0", compact ? "size-2.5 lg:size-3" : "size-3")} aria-hidden />
      Campeón
    </span>
  );
}
