import Link from "next/link";

import { CountryFlag } from "@/components/country-flag";
import { FighterHeadshot } from "@/components/fighter-headshot";
import { formatRecord, formatWeightClass } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { EventBout } from "@/lib/types";

export function EventBoutRow({ bout }: { bout: EventBout }) {
  const redWon = bout.winnerId != null && bout.winnerId === bout.red.id;
  const blueWon = bout.winnerId != null && bout.winnerId === bout.blue.id;

  const resultLine = bout.method
    ? [bout.method, bout.endRound ? `R${bout.endRound}` : null, bout.endTime]
        .filter(Boolean)
        .join(" · ")
    : null;

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
          </p>
          <p className="font-mono text-xs tabular text-muted-foreground">
            {formatRecord(bout.red.wins, bout.red.losses, bout.red.draws)}
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
          </p>
          <p className="font-mono text-xs tabular text-muted-foreground">
            {blueWon ? <span className="mr-1.5 font-semibold text-win">GANA</span> : null}
            {formatRecord(bout.blue.wins, bout.blue.losses, bout.blue.draws)}
          </p>
        </div>
      </div>
    </Link>
  );
}
