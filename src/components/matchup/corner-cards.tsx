import Link from "next/link";

import { FighterFullBody } from "@/components/fighter/fighter-full-body";
import type { BodyPhotoPreference } from "@/lib/fighter-photo";
import { formatPercentage, formatRecord, formatWeightClass } from "@/lib/format";
import type { FighterHistorySummary } from "@/lib/prediction";
import type { FighterComparisonProfile } from "@/lib/types";
import { cn } from "@/lib/utils";

import { formatSignalPercent } from "./helpers";

export function CornerBlock({
  corner,
  fighter,
  preference = "full-first",
  className,
}: {
  corner: "red" | "blue";
  fighter: FighterComparisonProfile;
  // Cadena de foto elegida POR PAREJA en matchup-client: cuerpo entero
  // (standing) cuando ambas esquinas lo tienen; medio cuerpo si no, para que
  // los dos encuadres siempre coincidan (dueño, 11-jul).
  preference?: BodyPhotoPreference;
  // Permite al caller pasar los order-* del grid 3 columnas (ver FaceOffCorner
  // en tale-of-the-tape.tsx, mismo patrón).
  className?: string;
}) {
  const isRed = corner === "red";
  return (
    <div
      className={cn(
        "flex min-w-0 flex-col items-center gap-1.5 text-center",
        className,
      )}
    >
      {/* Foto de cuerpo entero (Ronda B): standing → full body → headshot. */}
      <Link
        href={`/fighters/${fighter.id}`}
        className="w-full transition-opacity hover:opacity-80"
      >
        <FighterFullBody
          name={fighter.name}
          fullBodyUrl={fighter.fullBodyUrl ?? null}
          standingBodyUrl={fighter.standingBodyUrl ?? null}
          headshotUrl={fighter.headshotUrl}
          division={fighter.latestWeightClass}
          preference={preference}
          className="h-[220px] w-full sm:h-[300px] md:h-[420px]"
        />
      </Link>
      <span
        className={cn(
          "font-mono text-[0.7rem] font-semibold uppercase tracking-[0.18em]",
          isRed ? "text-corner-red" : "text-corner-blue",
        )}
      >
        Esquina {isRed ? "roja" : "azul"}
      </span>
      <Link
        href={`/fighters/${fighter.id}`}
        className="break-words font-display text-xl font-extrabold uppercase leading-[0.95] tracking-tight text-foreground transition-colors hover:text-primary sm:text-2xl lg:text-3xl"
      >
        {fighter.name}
      </Link>
      <p className="tabular font-mono text-sm text-muted-foreground">
        {formatRecord(fighter.wins, fighter.losses, fighter.draws)}
      </p>
      <span className="rounded-sm border border-border px-2 py-0.5 font-mono text-[0.65rem] uppercase tracking-wide text-muted-foreground">
        {formatWeightClass(fighter.latestWeightClass || "Open Weight")}
      </span>
    </div>
  );
}

// Señales que YA calcula el modelo por esquina (context.redHistory/blueHistory),
// no diffs. Se diferencian visualmente de "Factores clave" (que son red-blue).
export function CornerSignals({
  corner,
  name,
  history,
}: {
  corner: "red" | "blue";
  name: string;
  history: FighterHistorySummary;
}) {
  const isRed = corner === "red";
  const rows: { label: string; value: string }[] = [
    { label: "Racha de victorias", value: `${history.win_streak}` },
    { label: "Victorias (últ. 5)", value: `${history.wins_last_5} / 5` },
    {
      label: "Calidad del rival",
      value: formatSignalPercent(history.avg_opponent_prior_win_rate),
    },
  ];
  if (history.sig_strike_defense != null) {
    rows.push({
      label: "Defensa de golpeo",
      value: formatPercentage(history.sig_strike_defense),
    });
  }
  if (history.takedown_defense != null) {
    rows.push({
      label: "Defensa de derribo",
      value: formatPercentage(history.takedown_defense),
    });
  }

  return (
    <div
      className={cn(
        "rounded-2xl border bg-muted/40 p-5",
        isRed ? "border-corner-red/30" : "border-corner-blue/30",
      )}
    >
      <p
        className={cn(
          "font-mono text-[0.7rem] font-semibold uppercase tracking-[0.18em]",
          isRed ? "text-corner-red" : "text-corner-blue",
        )}
      >
        Esquina {isRed ? "roja" : "azul"}
      </p>
      <p className="mt-1 font-display text-lg font-bold uppercase leading-tight tracking-tight text-foreground">
        {name}
      </p>
      <dl className="mt-4 space-y-2.5">
        {rows.map((row) => (
          <div
            key={row.label}
            className="flex items-center justify-between gap-3 border-b border-border/60 pb-2.5 last:border-b-0 last:pb-0"
          >
            <dt className="text-sm text-muted-foreground">{row.label}</dt>
            <dd className="tabular text-sm font-semibold text-foreground">
              {row.value}
            </dd>
          </div>
        ))}
      </dl>
    </div>
  );
}
