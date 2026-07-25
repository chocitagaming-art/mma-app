import Link from "next/link";

import { CountryFlag } from "@/components/country-flag";
import { FightOfficials } from "@/components/fight/officials";
import { SkillRadarChart } from "@/components/fight/skill-radar";
import { FighterFullBody } from "@/components/fighter/fighter-full-body";
import { VsGlove } from "@/components/vs-glove";
import { countryNameEs } from "@/lib/flags";
import {
  ageFromBirthDate,
  formatControlTime,
  formatDate,
  formatHeight,
  formatMethod,
  formatPercentage,
  formatRecord,
  formatReach,
  formatStance,
  formatWeight,
  formatWeightClass,
} from "@/lib/format";
import { cn } from "@/lib/utils";
import { SKILL_AXES, type FightSkillRadar } from "@/lib/skill-radar";
import type { FightCompetitor, FightDetail, FightLastResult } from "@/lib/types";

type Row = {
  label: string;
  red: string;
  blue: string;
  redNum?: number | null;
  blueNum?: number | null;
  // Clase de color por lado (p.ej. Victoria/Derrota en verde/rojo).
  redClass?: string;
  blueClass?: string;
  // Valores largos (país, última pelea) se pintan más compactos.
  size?: "sm" | "lg";
};

function TaleRow({ row }: { row: Row }) {
  const both = row.redNum != null && row.blueNum != null;
  const redBetter = both && (row.redNum as number) > (row.blueNum as number);
  const blueBetter = both && (row.blueNum as number) > (row.redNum as number);
  const valueBase =
    row.size === "sm"
      ? "text-sm font-semibold leading-tight"
      : "font-display text-lg font-bold leading-none sm:text-xl";

  return (
    <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3 border-b border-border py-2.5 last:border-b-0 sm:gap-4">
      <p
        className={cn(
          "tabular min-w-0 break-words text-right",
          valueBase,
          redBetter ? "text-corner-red" : "text-foreground",
          row.redClass,
        )}
      >
        {row.red}
      </p>
      <p className="w-24 text-center font-mono text-[0.6rem] uppercase leading-tight tracking-[0.12em] text-muted-foreground sm:w-28 sm:text-[0.65rem]">
        {row.label}
      </p>
      <p
        className={cn(
          "tabular min-w-0 break-words text-left",
          valueBase,
          blueBetter ? "text-corner-blue" : "text-foreground",
          row.blueClass,
        )}
      >
        {row.blue}
      </p>
    </div>
  );
}

const LAST_RESULT_LABEL: Record<FightLastResult["result"], string> = {
  win: "Victoria",
  loss: "Derrota",
  draw: "Empate",
};

// Valor + color de la fila "Última pelea" (verde victoria / rojo derrota),
// mismos tokens win/loss que el historial del luchador.
function lastFightValue(last: FightLastResult | null | undefined) {
  if (!last) {
    return { text: "—", className: undefined };
  }

  return {
    text: LAST_RESULT_LABEL[last.result],
    className:
      last.result === "win"
        ? "text-win"
        : last.result === "loss"
          ? "text-loss"
          : "text-muted-foreground",
  };
}

// Columna de un luchador en el cara a cara: esquina, foto de cuerpo entero,
// apodo, nombre y bandera + país debajo (referencia: bout view de ufc.com).
function FaceOffCorner({
  corner,
  fighter,
  isWinner,
  weightClass,
  className,
}: {
  corner: "red" | "blue";
  fighter: FightCompetitor;
  isWinner: boolean;
  // Clase de peso del combate: solo para la silueta de fallback por género.
  weightClass?: string | null;
  className?: string;
}) {
  const isRed = corner === "red";
  // Enlazable solo con ficha real (los combates próximos pueden tener rival TBD).
  const href = fighter.id != null ? `/fighters/${fighter.id}` : null;
  const country = countryNameEs(fighter.nationality);

  const photo = (
    <FighterFullBody
      name={fighter.name}
      fullBodyUrl={fighter.fullBodyUrl ?? null}
      standingBodyUrl={fighter.standingBodyUrl ?? null}
      standingBodyUrlL={fighter.standingBodyUrlL ?? null}
      standingBodyUrlR={fighter.standingBodyUrlR ?? null}
      headshotUrl={fighter.headshotUrl}
      division={weightClass}
      // F1: la esquina elige su variante direccional y se espeja si hace falta
      // para que ambos se miren; preference queda de respaldo sin corner.
      corner={corner}
      // Cadena Ronda B: foto de pie primero, luego full body, luego headshot.
      preference="standing-first"
      // Alturas fijas anti-CLS: pequeñas lado a lado en móvil, ~420px desktop.
      className="h-[220px] w-full sm:h-[300px] md:h-[420px]"
    />
  );

  return (
    <div
      className={cn(
        "flex min-w-0 flex-col items-center gap-1.5 text-center",
        className,
      )}
    >
      <span
        className={cn(
          "font-mono text-[0.65rem] font-semibold uppercase tracking-[0.18em]",
          isRed ? "text-corner-red" : "text-corner-blue",
        )}
      >
        Esquina {isRed ? "roja" : "azul"}
      </span>
      {href ? (
        <Link href={href} className="w-full transition-opacity hover:opacity-85">
          {photo}
        </Link>
      ) : (
        <div className="w-full">{photo}</div>
      )}
      {/* Siempre presente (aunque no haya apodo) para que ambas columnas
          tengan la misma estructura y las esquinas queden alineadas. */}
      <p className="min-h-4 font-mono text-xs italic leading-tight text-muted-foreground">
        {fighter.nickname ? <>“{fighter.nickname}”</> : null}
      </p>
      {href ? (
        <Link
          href={href}
          className="font-display text-xl font-extrabold uppercase leading-[0.95] tracking-tight text-foreground transition-colors hover:text-primary sm:text-2xl lg:text-3xl"
        >
          {fighter.name}
        </Link>
      ) : (
        <p className="font-display text-xl font-extrabold uppercase leading-[0.95] tracking-tight text-foreground sm:text-2xl lg:text-3xl">
          {fighter.name}
        </p>
      )}
      <span className="flex items-center justify-center gap-1.5 font-mono text-xs text-muted-foreground">
        <CountryFlag nationality={fighter.nationality} />
        {country ?? "País desconocido"}
      </span>
      {isWinner ? (
        <span
          className={cn(
            "inline-flex items-center rounded-sm px-2 py-0.5 font-mono text-[0.7rem] font-bold uppercase tracking-[0.15em] text-white",
            isRed ? "bg-corner-red" : "bg-corner-blue",
          )}
        >
          Ganador
        </span>
      ) : null}
    </div>
  );
}

// Aviso del radar cuando falta algún lado. Un TBD (id null) NO es un debutante:
// no atribuirle peleas. Y "sin datos suficientes" no dice "debuta en UFC" a
// propósito — muchos son veteranos regionales con historial fuera de la UFC.
// Con los DOS lados vacíos se dice una sola vez: repetir la misma frase con dos
// nombres es lo que salía al levantar el guard, y se lee fatal.
function skillRadarNotice(
  radar: FightSkillRadar,
  red: FightCompetitor,
  blue: FightCompetitor,
): string {
  const MOTIVO = "menos de 3 peleas UFC con estadísticas registradas";
  const SIN_DATOS = `sin datos suficientes (${MOTIVO})`;

  if (!radar.red && !radar.blue) {
    if (red.id == null && blue.id == null) return "Rivales por confirmar.";
    if (red.id != null && blue.id != null) {
      return `Ninguno de los dos tiene datos suficientes (${MOTIVO}).`;
    }
  }

  return [
    !radar.red
      ? red.id != null
        ? `${red.name}: ${SIN_DATOS}.`
        : "Esquina roja: rival por confirmar."
      : null,
    !radar.blue
      ? blue.id != null
        ? `${blue.name}: ${SIN_DATOS}.`
        : "Esquina azul: rival por confirmar."
      : null,
  ]
    .filter(Boolean)
    .join(" ");
}

export function TaleOfTheTape({
  fight,
  radar,
}: {
  fight: FightDetail;
  // Percentiles del radar de habilidades; opcional para no romper otros usos.
  radar?: FightSkillRadar | null;
}) {
  const { red, blue, redStats, blueStats } = fight;
  // Cancelado: sin resultado que pintar; su banner ocupa el hueco de la barra.
  const isCancelled = fight.status === "cancelled";
  // Mismo criterio que la página de detalle: sin ganador ni método = pendiente.
  const isUpcoming = fight.winnerId == null && fight.method == null;
  const redWins = fight.winnerId != null && fight.winnerId === red.id;
  const blueWins = fight.winnerId != null && fight.winnerId === blue.id;

  const redAge = ageFromBirthDate(red.birthDate);
  const blueAge = ageFromBirthDate(blue.birthDate);
  const redLast = lastFightValue(red.lastFight);
  const blueLast = lastFightValue(blue.lastFight);
  const showLegReach = red.legReachCm != null || blue.legReachCm != null;

  // Columna central estilo ufc.com: valor rojo | ETIQUETA | valor azul.
  // Se resalta la ventaja solo donde "más" es objetivamente mejor
  // (récord/altura/alcance); los NULL individuales muestran "—".
  const rows: Row[] = [
    {
      label: "Récord",
      red: formatRecord(red.wins, red.losses, red.draws),
      blue: formatRecord(blue.wins, blue.losses, blue.draws),
      redNum: red.wins,
      blueNum: blue.wins,
    },
    {
      label: "Última pelea",
      red: redLast.text,
      blue: blueLast.text,
      redClass: redLast.className,
      blueClass: blueLast.className,
      size: "sm",
    },
    {
      label: "País",
      red: countryNameEs(red.nationality) ?? "—",
      blue: countryNameEs(blue.nationality) ?? "—",
      size: "sm",
    },
    {
      label: "Altura",
      red: formatHeight(red.heightCm),
      blue: formatHeight(blue.heightCm),
      redNum: red.heightCm,
      blueNum: blue.heightCm,
    },
    {
      label: "Peso",
      red: formatWeight(red.weightGrams ?? null),
      blue: formatWeight(blue.weightGrams ?? null),
    },
    {
      label: "Alcance",
      red: formatReach(red.reachCm),
      blue: formatReach(blue.reachCm),
      redNum: red.reachCm,
      blueNum: blue.reachCm,
    },
    ...(showLegReach
      ? [
          {
            label: "Alcance de pierna",
            red: formatReach(red.legReachCm ?? null),
            blue: formatReach(blue.legReachCm ?? null),
            redNum: red.legReachCm,
            blueNum: blue.legReachCm,
          } satisfies Row,
        ]
      : []),
    {
      label: "Edad",
      red: redAge != null ? String(redAge) : "—",
      blue: blueAge != null ? String(blueAge) : "—",
    },
    {
      label: "Guardia",
      red: formatStance(red.stance),
      blue: formatStance(blue.stance),
    },
  ];

  // Estadísticas del combate (solo peleas terminadas con stats registradas).
  const statRows: Row[] =
    redStats && blueStats
      ? [
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
        ]
      : [];

  return (
    <div className="overflow-hidden rounded-lg border border-border bg-card">
      {/* Cara a cara estilo ufc.com: cuerpos enteros enfrentados con la columna
          de datos en medio (desktop) o a ancho completo debajo (móvil). */}
      <div className="relative p-4 pb-6 sm:p-6 lg:p-8">
        <span className="absolute inset-y-0 left-0 w-1 bg-corner-red" />
        <span className="absolute inset-y-0 right-0 w-1 bg-corner-blue" />
        <div className="relative grid grid-cols-2 gap-x-3 gap-y-5 md:grid-cols-[minmax(0,1fr)_minmax(250px,330px)_minmax(0,1fr)] md:items-start md:gap-x-6 lg:gap-x-8">
          {/* VS entre las dos fotos, solo móvil (en desktop separa la columna). */}
          <span
            aria-hidden
            className="pointer-events-none absolute left-1/2 top-32 z-10 -translate-x-1/2 md:hidden"
          >
            <VsGlove size={40} className="size-10" />
          </span>
          <FaceOffCorner
            corner="red"
            fighter={red}
            isWinner={redWins}
            weightClass={fight.weightClass}
            className="order-1"
          />
          <div className="order-3 col-span-2 md:order-2 md:col-span-1 md:self-center">
            {isUpcoming && fight.weightClass ? (
              <p className="mb-3 text-center">
                <span className="rounded-sm border border-border px-2 py-0.5 font-mono text-xs uppercase tracking-wide text-muted-foreground">
                  {formatWeightClass(fight.weightClass)}
                  {fight.scheduledRounds
                    ? ` · ${fight.scheduledRounds} asaltos`
                    : ""}
                </span>
              </p>
            ) : null}
            <p className="mb-2 text-center font-mono text-xs font-semibold uppercase tracking-[0.2em] text-primary">
              Comparativa
            </p>
            <div>
              {rows.map((row) => (
                <TaleRow key={row.label} row={row} />
              ))}
            </div>
          </div>
          <FaceOffCorner
            corner="blue"
            fighter={blue}
            isWinner={blueWins}
            weightClass={fight.weightClass}
            className="order-2 md:order-3"
          />
        </div>
      </div>

      {/* Aviso de cancelación: ocupa el hueco de la barra de resultado para
          que la pelea no parezca un combate programado eterno. */}
      {isCancelled ? (
        <div className="border-t border-destructive/30 bg-destructive/10 px-6 py-4 text-center">
          <span className="font-display text-lg font-bold uppercase tracking-tight text-destructive">
            Combate cancelado
          </span>
        </div>
      ) : null}

      {/* Barra de resultado: solo peleas terminadas */}
      {!isUpcoming ? (
        <div className="flex flex-wrap items-center justify-center gap-x-6 gap-y-1 border-t border-border bg-muted/40 px-6 py-4 text-center">
          <span className="font-display text-lg font-bold uppercase tracking-tight text-foreground">
            {fight.method ? formatMethod(fight.method) : "Resultado no disponible"}
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
      ) : null}

      {/* Árbitro + tarjetas de los jueces (BE8), justo bajo la barra de
          resultado. El componente no pinta nada si no hay datos. */}
      {!isUpcoming ? (
        <FightOfficials referee={fight.referee} scorecards={fight.scorecards} />
      ) : null}

      {/* Estadísticas del combate: golpes/derribos/control (peleas terminadas) */}
      {!isUpcoming && statRows.length > 0 ? (
        <div className="border-t border-border p-6 sm:p-8">
          <p className="mb-4 text-center font-mono text-xs font-semibold uppercase tracking-[0.2em] text-primary">
            Estadísticas del combate
          </p>
          <div className="mx-auto max-w-xl">
            {statRows.map((row) => (
              <TaleRow key={row.label} row={row} />
            ))}
          </div>
        </div>
      ) : null}

      {/* Radar de habilidades (percentiles por división, maqueta 19-jul). Con un
          solo lado se pinta el polígono de ese lado y se avisa del vacío. Cuando
          NINGUNO tiene datos no hay nada que dibujar, pero la sección sigue
          apareciendo con la explicación: hasta el 25-jul el bloque entero
          desaparecía sin decir nada, y el lector no podía distinguir "falta el
          dato" de "esta web está rota". */}
      {radar ? (
        <div className="border-t border-border p-6 sm:p-8">
          <p className="mb-1 text-center font-mono text-xs font-semibold uppercase tracking-[0.2em] text-primary">
            Radar de habilidades
          </p>
          {radar.red || radar.blue ? (
            <>
              <p className="mb-4 text-center text-xs text-muted-foreground">
                Percentil 0–100 respecto a{" "}
                {radar.divisionLabel ?? "su división"} (peleas UFC con
                estadísticas)
              </p>
              <SkillRadarChart
                radar={radar}
                redName={red.name}
                blueName={blue.name}
              />
              <div className="mx-auto mt-4 max-w-xl">
                {SKILL_AXES.map((axis) => (
                  <TaleRow
                    key={axis.key}
                    row={{
                      label: axis.label,
                      red: radar.red ? String(radar.red[axis.key]) : "—",
                      blue: radar.blue ? String(radar.blue[axis.key]) : "—",
                      redNum: radar.red?.[axis.key] ?? null,
                      blueNum: radar.blue?.[axis.key] ?? null,
                    }}
                  />
                ))}
              </div>
            </>
          ) : null}
          {!radar.red || !radar.blue ? (
            <p
              className={cn(
                "text-center text-xs text-muted-foreground",
                // Sin gráfico encima el aviso es lo único que hay: no necesita
                // separarse de nada.
                radar.red || radar.blue ? "mt-3" : "mt-1",
              )}
            >
              {skillRadarNotice(radar, red, blue)}
            </p>
          ) : null}
        </div>
      ) : null}

      {/* Pie: evento / fecha / lugar */}
      <div className="border-t border-border px-6 py-4 text-center font-mono text-xs text-muted-foreground">
        {fight.eventName ?? "Evento desconocido"} · {formatDate(fight.eventDate)}
        {fight.location ? ` · ${fight.location}` : ""}
      </div>
    </div>
  );
}
