import { parseEventTimestamp } from "@/lib/event-time";

// T3-A (fase A): estado "en directo" derivado de la BD. live-results (mma-ingesta)
// rellena fights.winner_id/method/end_round/end_time durante el evento; aquí solo
// se INFIERE qué pelea está en curso a partir del orden del cartel y los horarios
// de cada tramo — la BD no guarda ningún estado "live" por pelea.

export type LivePhase = "none" | "pre" | "live";

export type BoutLiveState = "finished" | "live" | "next" | "pending";

// Horarios de un evento tal y como llegan de las queries (timestamptz ::text).
export type LiveEventTimes = {
  eventDate: string | null;
  startTime: string | null;
  prelimsTime: string | null;
  earlyPrelimsTime: string | null;
};

// Subconjunto de EventBout que necesita la inferencia (compatible con EventBout).
export type LiveBoutInput = {
  fightId: number;
  boutOrder: number | null;
  cardSegment: string | null;
  method: string | null;
  winnerId: number | null;
};

// Respuesta de /api/live/now (la consumen el chip de nav y el banner de la home).
export type LiveNowPayload = {
  phase: LivePhase;
  live: boolean;
  eventId: number | null;
  eventName: string | null;
};

// La ventana "live" se abre un poco antes del primer combate (la gente llega
// pronto) y se cierra unas horas después del inicio del main card (los eventos
// más largos rondan las 4-5 h de cartelera estelar + prelims ya consumidos).
const LIVE_EARLY_MARGIN_MS = 30 * 60_000;
const LIVE_AFTER_MAIN_MS = 8 * 3_600_000;
// "pre" = el evento arranca dentro de las próximas 24 h.
const PRE_WINDOW_MS = 24 * 3_600_000;

// Primer tramo con horario conocido: early prelims → prelims → main card.
export function firstSegmentStart(times: LiveEventTimes): Date | null {
  const candidates = [times.earlyPrelimsTime, times.prelimsTime, times.startTime]
    .map(parseEventTimestamp)
    .filter((date): date is Date => date != null);
  if (candidates.length === 0) {
    return null;
  }
  return candidates.reduce((min, date) => (date < min ? date : min));
}

// Fase del evento respecto a `now`. Sin ningún timestamptz (evento histórico o
// muy lejano sin horarios), cae al día natural UTC de event_date: es la mejor
// aproximación disponible y solo afecta a eventos que el scraper aún no enriqueció.
export function resolveLivePhase(times: LiveEventTimes, now: Date): LivePhase {
  const first = firstSegmentStart(times);

  if (first == null) {
    if (!times.eventDate) {
      return "none";
    }
    const dayIso = times.eventDate.slice(0, 10);
    const nowIso = now.toISOString().slice(0, 10);
    return dayIso === nowIso ? "live" : "none";
  }

  const main = parseEventTimestamp(times.startTime) ?? first;
  const liveFrom = first.getTime() - LIVE_EARLY_MARGIN_MS;
  const liveTo = main.getTime() + LIVE_AFTER_MAIN_MS;
  const nowMs = now.getTime();

  if (nowMs >= liveFrom && nowMs <= liveTo) {
    return "live";
  }
  if (nowMs < liveFrom && first.getTime() - nowMs <= PRE_WINDOW_MS) {
    return "pre";
  }
  return "none";
}

// Horario del tramo de una pelea; sin card_segment usamos el primer tramo del
// evento (mejor pecar de "ya empezó" que retrasar el EN CURSO indefinidamente).
function segmentStart(
  cardSegment: string | null,
  times: LiveEventTimes,
): Date | null {
  switch (cardSegment) {
    case "main":
      return parseEventTimestamp(times.startTime);
    case "prelims":
      return parseEventTimestamp(times.prelimsTime) ?? parseEventTimestamp(times.startTime);
    case "early_prelims":
      return (
        parseEventTimestamp(times.earlyPrelimsTime) ??
        parseEventTimestamp(times.prelimsTime) ??
        parseEventTimestamp(times.startTime)
      );
    default:
      return firstSegmentStart(times);
  }
}

// Estado por pelea. Reglas:
// - "finished": ya hay resultado (winner_id o method; empates/NC llegan solo
//   con method — mismo criterio que FightLastResult), O ESPN ya dio la pelea
//   por terminada en su fila viva (liveFinishedIds: state='post'). Esto último
//   cubre empates/NC, que el pipeline de resultados deja sin escribir en
//   `fights` hasta ufcstats — sin la señal, la pelea acabada seguía saliendo
//   "En curso" con punto rojo mientras su panel decía "Final" (hallazgo 6).
// - "live"/"next": la CRONOLÓGICAMENTE siguiente sin resultado. El cartel corre
//   en bout_order DESCENDENTE (1 = estelar cierra la noche), así que la próxima
//   es la de MAYOR bout_order sin terminar. Si su tramo aún no ha empezado
//   (huecos entre prelims y estelares) es "next"; si ya empezó, "live".
// - "pending": el resto. Con fase != "live" nadie está en curso.
// Vía de escape (revisión adversarial): si una pelea con bout_order MENOR que
// la candidata ya terminó, la cronología demuestra que la candidata fue SALTADA
// (cancelación del día no marcada aún, o live-results sin match para ella) —
// sin esto el puntero EN CURSO se estancaría en ella el resto de la noche.
// Las saltadas quedan "pending" y el puntero avanza a la siguiente real.
// Las peleas con bout_order NULL (no debería pasar en eventos upcoming) nunca
// se marcan live: no hay forma fiable de ordenarlas en la cronología.
export function computeBoutStates(
  bouts: LiveBoutInput[],
  phase: LivePhase,
  times: LiveEventTimes,
  now: Date,
  liveFinishedIds?: ReadonlySet<number>,
): Map<number, BoutLiveState> {
  const states = new Map<number, BoutLiveState>();

  for (const bout of bouts) {
    const finished =
      bout.method != null ||
      bout.winnerId != null ||
      (liveFinishedIds?.has(bout.fightId) ?? false);
    states.set(bout.fightId, finished ? "finished" : "pending");
  }

  if (phase !== "live") {
    return states;
  }

  let minFinishedOrder = Infinity;
  for (const bout of bouts) {
    if (
      states.get(bout.fightId) === "finished" &&
      bout.boutOrder != null &&
      bout.boutOrder < minFinishedOrder
    ) {
      minFinishedOrder = bout.boutOrder;
    }
  }

  let candidate: LiveBoutInput | null = null;
  for (const bout of bouts) {
    if (states.get(bout.fightId) === "finished" || bout.boutOrder == null) {
      continue;
    }
    if (bout.boutOrder >= minFinishedOrder) {
      // Saltada: una pelea posterior en la cronología ya tiene resultado.
      continue;
    }
    if (candidate == null || bout.boutOrder > (candidate.boutOrder as number)) {
      candidate = bout;
    }
  }

  if (candidate) {
    const start = segmentStart(candidate.cardSegment, times);
    const started = start == null || now.getTime() >= start.getTime();
    states.set(candidate.fightId, started ? "live" : "next");
  }

  return states;
}
