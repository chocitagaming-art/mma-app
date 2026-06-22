import Link from "next/link";
import { CalendarDays } from "lucide-react";

import { FighterHeadshot } from "@/components/fighter-headshot";
import { PREMIUM_TILE } from "@/components/fighter/premium-tile";
import { formatDate, formatRecord } from "@/lib/format";
import type { FighterUpcomingBout } from "@/lib/types";
import { cn } from "@/lib/utils";

function BoutCard({ bout }: { bout: FighterUpcomingBout }) {
  const isRed = bout.corner === "red";
  const opponentName = bout.opponentName ?? "Oponente por confirmar";
  const record =
    bout.opponentWins != null &&
    bout.opponentLosses != null &&
    bout.opponentDraws != null
      ? formatRecord(bout.opponentWins, bout.opponentLosses, bout.opponentDraws)
      : null;

  const cornerClass = isRed
    ? "border-corner-red/30 bg-corner-red/10 text-corner-red"
    : "border-corner-blue/30 bg-corner-blue/10 text-corner-blue";

  const headshot = (
    <FighterHeadshot
      name={opponentName}
      headshotUrl={bout.opponentHeadshotUrl}
      size="sm"
      className={cn("border-2", isRed ? "border-corner-red" : "border-corner-blue")}
    />
  );

  return (
    <div className={cn(PREMIUM_TILE, "p-5")}>
      <div className="flex flex-wrap items-center gap-4">
        <span
          className={cn(
            "shrink-0 rounded-sm border px-2 py-0.5 font-mono text-[0.6rem] font-semibold uppercase tracking-[0.14em]",
            cornerClass,
          )}
        >
          Esquina {isRed ? "roja" : "azul"}
        </span>

        {bout.opponentId ? (
          <Link
            href={`/fighters/${bout.opponentId}`}
            className="shrink-0 transition-opacity hover:opacity-80"
          >
            {headshot}
          </Link>
        ) : (
          headshot
        )}

        <div className="min-w-0 flex-1">
          <p className="font-mono text-[0.65rem] uppercase tracking-[0.16em] text-muted-foreground">
            Próximo rival
          </p>
          {bout.opponentId ? (
            <Link
              href={`/fighters/${bout.opponentId}`}
              className="font-display text-xl font-bold uppercase leading-tight tracking-tight text-foreground transition-colors hover:text-primary"
            >
              {opponentName}
            </Link>
          ) : (
            <p className="font-display text-xl font-bold uppercase leading-tight tracking-tight text-foreground">
              {opponentName}
            </p>
          )}
          {record ? (
            <p className="tabular mt-0.5 font-mono text-sm text-muted-foreground">
              {record}
            </p>
          ) : null}
        </div>

        <div className="flex flex-col items-start gap-1 sm:items-end sm:text-right">
          {bout.eventId ? (
            <Link
              href={`/eventos/${bout.eventId}`}
              className="font-semibold text-foreground transition-colors hover:text-primary"
            >
              {bout.eventName ?? "Evento por confirmar"}
            </Link>
          ) : (
            <span className="font-semibold text-foreground">
              {bout.eventName ?? "Evento por confirmar"}
            </span>
          )}
          <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
            <CalendarDays className="size-3.5" />
            {formatDate(bout.eventDate)}
          </p>
        </div>
      </div>
    </div>
  );
}

export function UpcomingBouts({ bouts }: { bouts: FighterUpcomingBout[] }) {
  return (
    <div className="grid gap-4">
      {bouts.map((bout) => (
        <BoutCard key={bout.fightId} bout={bout} />
      ))}
    </div>
  );
}
