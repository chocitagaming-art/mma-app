import type { Metadata } from "next";
import Link from "next/link";
import { CalendarDays, MapPin, Tv } from "lucide-react";

import { EventBoutRow } from "@/components/event-bout-row";
import { EventStartTime } from "@/components/event-start-time";
import { AutoRefresh } from "@/components/live/auto-refresh";
import {
  LiveBoutStatsPanel,
  hasLiveStatsContent,
} from "@/components/live/live-bout-stats";
import { EventCountdown } from "@/components/home/event-countdown";
import { groupBoutsBySegment } from "@/lib/event-sections";
import { formatDate, formatMethod } from "@/lib/format";
import {
  computeBoutStates,
  resolveLivePhase,
  type BoutLiveState,
} from "@/lib/live-event";
import { getEventDetail } from "@/lib/queries/events";
import { getLiveEventCandidate, getLiveFightStats } from "@/lib/queries/live";
import { cn } from "@/lib/utils";
import type { EventBout } from "@/lib/types";

// T3-A (fase A): el evento de hoy EN DIRECTO. live-results (mma-ingesta) escribe
// los resultados provisionales en la BD durante el evento; esta página los lee
// en cada render (force-dynamic) y AutoRefresh la re-renderiza cada 45 s.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "En vivo",
  description:
    "Sigue el evento de UFC en directo: estado de cada combate y resultados provisionales al momento.",
};

// Chip de estado por pelea. Paletas ya usadas por la cartelera: primary (rojo
// UFC), ámbar del GoldBadge (contraste verificado en claro y oscuro) y --win.
function StateChip({ state }: { state: BoutLiveState }) {
  const base =
    "inline-flex shrink-0 items-center gap-1.5 rounded-sm border px-1.5 py-px font-mono text-[0.6rem] font-bold uppercase tracking-[0.1em]";

  switch (state) {
    case "live":
      return (
        <span className={cn(base, "border-primary/40 bg-primary/10 text-primary")}>
          <span className="live-dot inline-block size-1.5 rounded-full bg-primary shadow-[0_0_8px_1px_var(--primary)]" />
          En curso
        </span>
      );
    case "next":
      return (
        <span
          className={cn(
            base,
            "border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-400",
          )}
        >
          A continuación
        </span>
      );
    case "finished":
      return (
        <span className={cn(base, "border-win/40 bg-win/10 text-win")}>
          Finalizada
        </span>
      );
    default:
      return (
        <span className={cn(base, "border-border bg-muted text-muted-foreground")}>
          Por empezar
        </span>
      );
  }
}

// Línea de resultado (método · asalto · tiempo), visible en la franja de estado
// SOLO en móvil: en pantallas sm+ ya la pinta el centro de EventBoutRow.
function mobileResultLine(bout: EventBout): string | null {
  if (!bout.method) {
    return null;
  }
  return [formatMethod(bout.method), bout.endRound ? `R${bout.endRound}` : null, bout.endTime]
    .filter(Boolean)
    .join(" · ");
}

export default async function LivePage() {
  const candidate = await getLiveEventCandidate();
  const phase = candidate ? resolveLivePhase(candidate, new Date()) : "none";

  // Sin evento en marcha ni a la vista (24 h): estado vacío con el siguiente
  // evento como invitación — una pantalla vacía es una invitación a actuar.
  if (!candidate || phase === "none") {
    return (
      <div className="mx-auto max-w-5xl px-4 py-10 sm:px-6 lg:px-8 lg:py-14">
        <p className="font-mono text-xs font-semibold uppercase tracking-[0.2em] text-primary">
          En vivo
        </p>
        <h1 className="mt-1 font-display text-3xl font-extrabold uppercase leading-[0.95] tracking-tight text-foreground sm:text-4xl">
          Ahora mismo no hay ningún evento en directo
        </h1>
        <p className="mt-3 max-w-xl text-sm text-muted-foreground">
          El día de cada evento, esta página sigue la cartelera en vivo: qué
          combate está en la jaula y los resultados según van cayendo.
        </p>
        <div className="mt-6">
          {candidate ? (
            <Link
              href={`/eventos/${candidate.id}`}
              className="inline-flex items-center gap-2 rounded-md border border-primary px-4 py-2 font-mono text-xs font-semibold uppercase tracking-[0.12em] text-primary transition-colors hover:bg-primary/10"
            >
              Próximo evento: {candidate.name}
              {candidate.eventDate ? ` · ${formatDate(candidate.eventDate)}` : ""}
            </Link>
          ) : (
            <Link
              href="/eventos?view=proximos"
              className="inline-flex items-center gap-2 rounded-md border border-primary px-4 py-2 font-mono text-xs font-semibold uppercase tracking-[0.12em] text-primary transition-colors hover:bg-primary/10"
            >
              Ver próximos eventos
            </Link>
          )}
        </div>
      </div>
    );
  }

  const event = await getEventDetail(candidate.id);

  if (!event) {
    // Candidato sin detalle (no debería pasar): mismo estado vacío.
    return (
      <div className="mx-auto max-w-5xl px-4 py-10 sm:px-6 lg:px-8 lg:py-14">
        <p className="font-mono text-xs font-semibold uppercase tracking-[0.2em] text-primary">
          En vivo
        </p>
        <h1 className="mt-1 font-display text-3xl font-extrabold uppercase leading-[0.95] tracking-tight text-foreground sm:text-4xl">
          Ahora mismo no hay ningún evento en directo
        </h1>
      </div>
    );
  }

  const live = phase === "live";
  const states = computeBoutStates(event.bouts, phase, candidate, new Date());
  const sections = groupBoutsBySegment(event.bouts);
  // T3-A fase B: filas vivas (estado fino + stats por pelea) que el bucle de
  // mma-ingesta escribe cada ~2 min. 1 SELECT batcheado; degrada a mapa vacío
  // ante cualquier fallo (el panel es un extra, nunca tumba el directo).
  const liveStats = await getLiveFightStats(
    event.bouts.map((bout) => bout.fightId),
  );
  const finishedCount = event.bouts.filter(
    (bout) => states.get(bout.fightId) === "finished",
  ).length;
  // Revisión adversarial: la cuenta atrás apunta al PRIMER tramo (23:00) pero
  // la meta-línea muestra la hora del main card (03:00) — sin etiqueta parecen
  // contradictorias. Etiquetamos a qué tramo cuenta.
  const countdownTarget =
    candidate.earlyPrelimsTime ?? candidate.prelimsTime ?? event.startTime;
  const countdownLabel = candidate.earlyPrelimsTime
    ? "las preliminares iniciales"
    : candidate.prelimsTime
      ? "las preliminares"
      : "la cartelera estelar";

  return (
    <div className="mx-auto max-w-5xl px-4 py-10 sm:px-6 lg:px-8 lg:py-14">
      <p className="flex items-center gap-2 font-mono text-xs font-semibold uppercase tracking-[0.2em] text-primary">
        <span className="live-dot inline-block size-2 rounded-full bg-primary shadow-[0_0_12px_2px_var(--primary)]" />
        {live ? "En directo" : "Evento de hoy"}
      </p>
      <h1 className="mt-1 font-display text-3xl font-extrabold uppercase leading-[0.95] tracking-tight text-foreground sm:text-4xl">
        {event.name}
      </h1>

      <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1 font-mono text-xs text-muted-foreground">
        <span className="flex items-center gap-1.5">
          <CalendarDays className="size-3.5" />
          {formatDate(event.eventDate)}
        </span>
        <EventStartTime startTime={event.startTime} />
        {event.location ? (
          <span className="flex items-center gap-1.5">
            <MapPin className="size-3.5" />
            {event.location}
          </span>
        ) : null}
        {event.broadcast ? (
          <span className="flex items-center gap-1.5">
            <Tv className="size-3.5" />
            Emisión: {event.broadcast}
          </span>
        ) : null}
      </div>

      <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-b border-border pb-5">
        {live ? (
          <>
            <AutoRefresh intervalSeconds={45} />
            {/* aria-live: los lectores de pantalla se enteran cuando cae un
                resultado sin re-explorar la lista (revisión adversarial). */}
            <p
              role="status"
              aria-live="polite"
              className="font-mono text-xs tabular text-muted-foreground"
            >
              {finishedCount} de {event.bouts.length} combates resueltos
            </p>
          </>
        ) : (
          <div className="flex w-full flex-col items-center gap-3 py-2">
            <p className="font-mono text-[0.65rem] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
              Empiezan {countdownLabel} en
            </p>
            <EventCountdown
              startTime={countdownTarget}
              eventDate={event.eventDate}
            />
            <p className="text-center text-sm text-muted-foreground">
              Los resultados aparecerán aquí en cuanto arranque la cartelera.
            </p>
            <AutoRefresh intervalSeconds={90} />
          </div>
        )}
        <Link
          href={`/eventos/${event.id}`}
          className="font-mono text-xs uppercase tracking-[0.15em] text-muted-foreground transition-colors hover:text-primary"
        >
          Ver ficha del evento →
        </Link>
      </div>

      {sections.length > 0 ? (
        <div className="mt-8 space-y-8">
          {sections.map((section) => (
            <section key={section.key}>
              <h2 className="mb-3 font-display text-sm font-bold uppercase tracking-[0.12em] text-muted-foreground">
                {section.label}
              </h2>
              <div className="overflow-hidden rounded-lg border border-border bg-card">
                {section.bouts.map((bout) => {
                  const state = states.get(bout.fightId) ?? "pending";
                  const resultLine =
                    state === "finished" ? mobileResultLine(bout) : null;
                  // Panel de stats en vivo (pedido del dueño: al expandir la
                  // flecha, los datos como en el fightcenter de ESPN). Solo
                  // se pasa si de verdad hay algo que pintar — sin fila viva
                  // el acordeón queda como en la fase A.
                  const boutStats = liveStats.get(bout.fightId);
                  const statsPanel =
                    boutStats && hasLiveStatsContent(bout, boutStats) ? (
                      <LiveBoutStatsPanel bout={bout} stats={boutStats} />
                    ) : undefined;
                  return (
                    <div
                      key={bout.fightId}
                      className={cn(
                        "border-b border-border last:border-b-0",
                        state === "live" &&
                          "border-l-2 border-l-primary bg-primary/[0.04]",
                      )}
                    >
                      <div className="flex flex-wrap items-center gap-2 px-4 pt-2.5 sm:px-5">
                        <StateChip state={state} />
                        {state === "finished" ? (
                          <span className="font-mono text-[0.6rem] uppercase tracking-[0.1em] text-muted-foreground">
                            Provisional
                          </span>
                        ) : null}
                        {resultLine ? (
                          <span className="font-mono text-[0.6rem] text-muted-foreground sm:hidden">
                            {resultLine}
                          </span>
                        ) : null}
                      </div>
                      <EventBoutRow
                        bout={bout}
                        showRanks
                        eventDate={event.eventDate}
                        statsPanel={statsPanel}
                        // La pelea EN CURSO llega con sus stats a la vista
                        // (estado inicial; si el usuario la pliega, plegada
                        // se queda entre refrescos).
                        panelDefaultOpen={state === "live" && Boolean(statsPanel)}
                      />
                    </div>
                  );
                })}
              </div>
            </section>
          ))}
        </div>
      ) : (
        <p className="mt-8 text-sm text-muted-foreground">
          Cartelera por confirmar.
        </p>
      )}

      <p className="mt-8 font-mono text-xs text-muted-foreground">
        Los resultados en directo son provisionales (fuente ESPN) y se
        consolidan con los datos oficiales tras el evento.
      </p>
    </div>
  );
}
