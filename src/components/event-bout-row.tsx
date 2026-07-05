import Link from "next/link";

import { CountryFlag } from "@/components/country-flag";
import { FighterHeadshot } from "@/components/fighter-headshot";
import {
  formatMethod,
  formatPercentage,
  formatRecord,
  formatWeightClass,
} from "@/lib/format";
import { marketFavorite, toAmericanOdds } from "@/lib/odds";
import { cn } from "@/lib/utils";
import type { EventBout } from "@/lib/types";

// showRanks: los badges de ranking usan el snapshot ACTUAL, así que solo
// tienen sentido en eventos futuros — en carteleras históricas el "#3" de hoy
// leería como el ranking que tenía el luchador al pelear, y sería falso.
export function EventBoutRow({
  bout,
  showRanks = false,
}: {
  bout: EventBout;
  showRanks?: boolean;
}) {
  const redWon = bout.winnerId != null && bout.winnerId === bout.red.id;
  const blueWon = bout.winnerId != null && bout.winnerId === bout.blue.id;

  const resultLine = bout.method
    ? [formatMethod(bout.method), bout.endRound ? `R${bout.endRound}` : null, bout.endTime]
        .filter(Boolean)
        .join(" · ")
    : null;

  // Favorito del mercado (#41): solo si hay cuotas válidas en ambas esquinas.
  const fav = marketFavorite(bout.oddsRed, bout.oddsBlue);
  const favName = fav
    ? fav.favorite === "red"
      ? bout.red.name
      : bout.blue.name
    : null;
  const favImplied = fav
    ? fav.favorite === "red"
      ? fav.redImplied
      : fav.blueImplied
    : 0;
  const favOdds = fav
    ? fav.favorite === "red"
      ? bout.oddsRed
      : bout.oddsBlue
    : null;

  // Cuotas americanas por esquina (FE8): solo con cuota decimal válida (> 1),
  // para no pintar el "—" de toAmericanOdds cuando no hay línea.
  const redAmerican =
    bout.oddsRed != null && bout.oddsRed > 1 ? toAmericanOdds(bout.oddsRed) : null;
  const blueAmerican =
    bout.oddsBlue != null && bout.oddsBlue > 1 ? toAmericanOdds(bout.oddsBlue) : null;

  return (
    <Link
      href={`/fights/${bout.fightId}`}
      className="group grid grid-cols-[1fr_auto_1fr] items-center gap-2 border-b border-border px-4 py-3 transition-colors last:border-b-0 hover:bg-muted/50 sm:gap-4 sm:px-5"
    >
      {/* Esquina roja */}
      <div className="flex min-w-0 items-center gap-2.5 sm:gap-3">
        <FighterHeadshot
          name={bout.red.name}
          headshotUrl={bout.red.headshotUrl}
          size="sm"
          className={cn("shrink-0", redWon && "ring-2 ring-win")}
        />
        <div className="min-w-0">
          <p
            className={cn(
              "flex items-center gap-1.5 truncate font-display text-sm font-bold uppercase tracking-tight transition-colors group-hover:text-primary",
              redWon ? "text-foreground" : "text-muted-foreground",
            )}
          >
            <CountryFlag nationality={bout.red.nationality} />
            <span className="truncate">{bout.red.name}</span>
            {showRanks && bout.red.rank != null ? (
              // Ranking actual de su división (FE2); 0 = campeón, estilo ufc.com.
              <span className="shrink-0 font-mono text-xs font-medium tracking-normal text-muted-foreground">
                {bout.red.rank === 0 ? "C" : `#${bout.red.rank}`}
              </span>
            ) : null}
          </p>
          <p className="font-mono text-xs tabular text-muted-foreground">
            {formatRecord(bout.red.wins, bout.red.losses, bout.red.draws)}
            {redAmerican ? (
              <span className="ml-1.5 text-muted-foreground/70">{redAmerican}</span>
            ) : null}
            {redWon ? <span className="ml-1.5 font-semibold text-win">GANA</span> : null}
          </p>
        </div>
      </div>

      {/* Centro */}
      <div className="flex shrink-0 flex-col items-center text-center">
        <span className="font-mono text-[0.6rem] font-bold uppercase tracking-[0.15em] text-muted-foreground">
          VS
        </span>
        {bout.weightClass ? (
          <span className="mt-0.5 hidden max-w-[8rem] truncate font-mono text-[0.6rem] uppercase tracking-[0.12em] text-muted-foreground sm:block">
            {formatWeightClass(bout.weightClass)}
          </span>
        ) : null}
        {resultLine ? (
          <span className="mt-0.5 hidden max-w-[10rem] truncate font-mono text-[0.6rem] text-muted-foreground sm:block">
            {resultLine}
          </span>
        ) : null}
        {fav ? (
          <span
            className="mt-1 inline-flex max-w-[7rem] items-center gap-1.5 rounded-full border border-primary/30 bg-primary/10 px-2 py-0.5 font-mono text-[0.6rem] font-semibold uppercase tracking-[0.1em] text-primary sm:max-w-[9rem]"
            title={`Favorito del mercado: ${favName}${favOdds != null ? ` · cuota ${favOdds.toFixed(2)}` : ""}`}
          >
            <span className="truncate">{favName}</span>
            <span className="tabular text-primary/80">
              {formatPercentage(favImplied)}
            </span>
          </span>
        ) : null}
      </div>

      {/* Esquina azul */}
      <div className="flex min-w-0 flex-row-reverse items-center gap-2.5 text-right sm:gap-3">
        <FighterHeadshot
          name={bout.blue.name}
          headshotUrl={bout.blue.headshotUrl}
          size="sm"
          className={cn("shrink-0", blueWon && "ring-2 ring-win")}
        />
        <div className="min-w-0">
          <p
            className={cn(
              "flex flex-row-reverse items-center gap-1.5 truncate font-display text-sm font-bold uppercase tracking-tight transition-colors group-hover:text-primary",
              blueWon ? "text-foreground" : "text-muted-foreground",
            )}
          >
            <CountryFlag nationality={bout.blue.nationality} />
            <span className="truncate">{bout.blue.name}</span>
            {showRanks && bout.blue.rank != null ? (
              // flex-row-reverse: el badge queda a la IZQUIERDA del nombre (espejo de la roja).
              <span className="shrink-0 font-mono text-xs font-medium tracking-normal text-muted-foreground">
                {bout.blue.rank === 0 ? "C" : `#${bout.blue.rank}`}
              </span>
            ) : null}
          </p>
          <p className="font-mono text-xs tabular text-muted-foreground">
            {blueWon ? <span className="mr-1.5 font-semibold text-win">GANA</span> : null}
            {blueAmerican ? (
              <span className="mr-1.5 text-muted-foreground/70">{blueAmerican}</span>
            ) : null}
            {formatRecord(bout.blue.wins, bout.blue.losses, bout.blue.draws)}
          </p>
        </div>
      </div>
    </Link>
  );
}
