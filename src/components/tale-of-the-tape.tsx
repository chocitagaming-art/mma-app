import Link from "next/link";

import {
  formatControlTime,
  formatDate,
  formatHeight,
  formatPercentage,
  formatRecord,
  formatReach,
  formatWeightClass,
} from "@/lib/format";
import { cn } from "@/lib/utils";
import { FighterHeadshot } from "@/components/fighter-headshot";
import type { FightCompetitor, FightDetail } from "@/lib/types";

type Row = {
  label: string;
  red: string;
  blue: string;
  redNum?: number | null;
  blueNum?: number | null;
};

function TaleRow({ row }: { row: Row }) {
  const both = row.redNum != null && row.blueNum != null;
  const redBetter = both && (row.redNum as number) > (row.blueNum as number);
  const blueBetter = both && (row.blueNum as number) > (row.redNum as number);

  return (
    <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-4 border-b border-border py-3 last:border-b-0">
      <p
        className={cn(
          "tabular text-right font-display text-lg font-bold leading-none sm:text-xl",
          redBetter ? "text-corner-red" : "text-foreground",
        )}
      >
        {row.red}
      </p>
      <p className="w-28 text-center font-mono text-[0.65rem] uppercase leading-tight tracking-[0.12em] text-muted-foreground sm:w-36 sm:text-[0.7rem]">
        {row.label}
      </p>
      <p
        className={cn(
          "tabular text-left font-display text-lg font-bold leading-none sm:text-xl",
          blueBetter ? "text-corner-blue" : "text-foreground",
        )}
      >
        {row.blue}
      </p>
    </div>
  );
}

function CornerBlock({
  corner,
  fighter,
  isWinner,
}: {
  corner: "red" | "blue";
  fighter: FightCompetitor;
  isWinner: boolean;
}) {
  const isRed = corner === "red";
  // Linkable only when the fighter has a real profile row (upcoming bouts can be TBD).
  const href = fighter.id != null ? `/fighters/${fighter.id}` : null;
  const headshot = (
    <FighterHeadshot
      name={fighter.name}
      headshotUrl={fighter.headshotUrl}
      size="lg"
      className={cn(
        "shrink-0 border-2",
        isRed ? "border-corner-red" : "border-corner-blue",
      )}
    />
  );
  return (
    <div
      className={cn(
        "flex items-center gap-3 sm:gap-4",
        isRed ? "flex-row" : "flex-row-reverse",
      )}
    >
      {href ? (
        <Link href={href} className="shrink-0 transition-opacity hover:opacity-80">
          {headshot}
        </Link>
      ) : (
        headshot
      )}
      <div
        className={cn(
          "flex min-w-0 flex-col gap-1.5",
          isRed ? "items-start text-left" : "items-end text-right",
        )}
      >
        <span
          className={cn(
            "font-mono text-[0.7rem] font-semibold uppercase tracking-[0.18em]",
            isRed ? "text-corner-red" : "text-corner-blue",
          )}
        >
          Esquina {isRed ? "roja" : "azul"}
        </span>
        {href ? (
          <Link
            href={href}
            className="font-display text-2xl font-extrabold uppercase leading-[0.95] tracking-tight text-foreground transition-colors hover:text-primary sm:text-3xl"
          >
            {fighter.name}
          </Link>
        ) : (
          <p className="font-display text-2xl font-extrabold uppercase leading-[0.95] tracking-tight text-foreground sm:text-3xl">
            {fighter.name}
          </p>
        )}
        <p className="tabular font-mono text-sm text-muted-foreground">
          {formatRecord(fighter.wins, fighter.losses, fighter.draws)}
        </p>
        {isWinner ? (
          <span
            className={cn(
              "mt-1 inline-flex items-center rounded-sm px-2 py-0.5 font-mono text-[0.7rem] font-bold uppercase tracking-[0.15em] text-white",
              isRed ? "bg-corner-red" : "bg-corner-blue",
            )}
          >
            Ganador
          </span>
        ) : null}
      </div>
    </div>
  );
}

export function TaleOfTheTape({ fight }: { fight: FightDetail }) {
  const { red, blue, redStats, blueStats } = fight;
  const redWins = fight.winnerId != null && fight.winnerId === red.id;
  const blueWins = fight.winnerId != null && fight.winnerId === blue.id;

  const rows: Row[] = [
    {
      label: "Récord",
      red: formatRecord(red.wins, red.losses, red.draws),
      blue: formatRecord(blue.wins, blue.losses, blue.draws),
      redNum: red.wins,
      blueNum: blue.wins,
    },
    {
      label: "Altura",
      red: formatHeight(red.heightCm),
      blue: formatHeight(blue.heightCm),
      redNum: red.heightCm,
      blueNum: blue.heightCm,
    },
    {
      label: "Alcance",
      red: formatReach(red.reachCm),
      blue: formatReach(blue.reachCm),
      redNum: red.reachCm,
      blueNum: blue.reachCm,
    },
    {
      label: "Guardia",
      red: red.stance ?? "—",
      blue: blue.stance ?? "—",
    },
  ];

  if (redStats && blueStats) {
    rows.push(
      {
        label: "Golpes sig.",
        red: String(redStats.sigStrikesLanded),
        blue: String(blueStats.sigStrikesLanded),
        redNum: redStats.sigStrikesLanded,
        blueNum: blueStats.sigStrikesLanded,
      },
      {
        label: "Precisión golpes",
        red: formatPercentage(redStats.sigStrikeAccuracy),
        blue: formatPercentage(blueStats.sigStrikeAccuracy),
        redNum: redStats.sigStrikeAccuracy,
        blueNum: blueStats.sigStrikeAccuracy,
      },
      {
        label: "Derribos",
        red: String(redStats.takedownsLanded),
        blue: String(blueStats.takedownsLanded),
        redNum: redStats.takedownsLanded,
        blueNum: blueStats.takedownsLanded,
      },
      {
        label: "Sumisiones int.",
        red: String(redStats.submissionAttempts),
        blue: String(blueStats.submissionAttempts),
        redNum: redStats.submissionAttempts,
        blueNum: blueStats.submissionAttempts,
      },
      {
        label: "Knockdowns",
        red: String(redStats.knockdowns),
        blue: String(blueStats.knockdowns),
        redNum: redStats.knockdowns,
        blueNum: blueStats.knockdowns,
      },
      {
        label: "Tiempo control",
        red: formatControlTime(redStats.controlTimeSeconds),
        blue: formatControlTime(blueStats.controlTimeSeconds),
        redNum: redStats.controlTimeSeconds,
        blueNum: blueStats.controlTimeSeconds,
      },
    );
  }

  return (
    <div className="overflow-hidden rounded-lg border border-border bg-card">
      {/* Matchup header */}
      <div className="relative grid grid-cols-2 gap-6 border-b border-border p-6 sm:gap-10 sm:p-8">
        {/* corner accent bars */}
        <span className="absolute inset-y-0 left-0 w-1 bg-corner-red" />
        <span className="absolute inset-y-0 right-0 w-1 bg-corner-blue" />
        {/* center VS octagon — the signature mark */}
        <span className="octagon absolute left-1/2 top-1/2 z-10 hidden size-12 -translate-x-1/2 -translate-y-1/2 place-items-center bg-foreground font-display text-sm font-extrabold uppercase tracking-tight text-background sm:grid">
          VS
        </span>
        <CornerBlock corner="red" fighter={red} isWinner={redWins} />
        <CornerBlock corner="blue" fighter={blue} isWinner={blueWins} />
      </div>

      {/* Result bar */}
      <div className="flex flex-wrap items-center justify-center gap-x-6 gap-y-1 border-b border-border bg-muted/40 px-6 py-4 text-center">
        <span className="font-display text-lg font-bold uppercase tracking-tight text-foreground">
          {fight.method ?? "Resultado no disponible"}
        </span>
        <span className="font-mono text-sm text-muted-foreground">
          Asalto {fight.endRound ?? "—"} · {fight.endTime ?? "—"}
        </span>
        {fight.weightClass ? (
          <span className="rounded-sm border border-border px-2 py-0.5 font-mono text-xs uppercase tracking-wide text-muted-foreground">
            {formatWeightClass(fight.weightClass)}
          </span>
        ) : null}
      </div>

      {/* Tale of the tape ledger */}
      <div className="p-6 sm:p-8">
        <p className="mb-4 text-center font-mono text-xs font-semibold uppercase tracking-[0.2em] text-primary">
          Tale of the tape
        </p>
        <div className="mx-auto max-w-xl">
          {rows.map((row) => (
            <TaleRow key={row.label} row={row} />
          ))}
        </div>
      </div>

      {/* Event footer */}
      <div className="border-t border-border px-6 py-4 text-center font-mono text-xs text-muted-foreground">
        {fight.eventName ?? "Evento desconocido"} · {formatDate(fight.eventDate)}
        {fight.location ? ` · ${fight.location}` : ""}
      </div>
    </div>
  );
}
