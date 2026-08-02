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
  // Días lógicos (Madrid, con corte de madrugada) hasta la velada: 0 = hoy,
  // 1 = mañana, null = sin fecha. Lo calcula la ruta con `diasHastaLaVelada`.
  //
  // POR QUÉ HACE FALTA: `phase === "pre"` significa «faltan menos de 24 h», que
  // NO es «hoy». El chip y el CTA lo traducían mal, así que el viernes por la
  // noche anunciaban "Hoy" un evento del sábado. El cálculo vive en la ruta y
  // no aquí para no importar `ufc-today.ts`, que ya importa este módulo.
  daysUntil: number | null;
};

// La ventana "live" se abre un poco antes del primer combate (la gente llega
// pronto) y se cierra unas horas después del inicio del main card (los eventos
// más largos rondan las 4-5 h de cartelera estelar + prelims ya consumidos).
const LIVE_EARLY_MARGIN_MS = 30 * 60_000;
const LIVE_AFTER_MAIN_MS = 8 * 3_600_000;
// "pre" = el evento arranca dentro de las próximas 24 h.
const PRE_WINDOW_MS = 24 * 3_600_000;

// ── Qué dicen el chip del header y el CTA de la home ────────────────────────
//
// EL BUG QUE ARREGLAN (31-jul, cazado de nuevo el 2-ago): estos dos rótulos se
// decidían con `payload.live`, así que TODO lo que no fuera "en directo" se
// etiquetaba como «hoy» — y "no live" incluye la fase `pre`, que son las 24 h
// previas. El viernes por la noche el header anunciaba "Hoy" un evento del
// sábado, mientras /ufc-hoy decía "dentro de 1 día": la web se contradecía a sí
// misma. Ahora el "cuándo" sale de `daysUntil`, que usa el día lógico de
// Madrid, el MISMO criterio que /ufc-hoy.
//
// `daysUntil` puede ser null (evento sin fecha) o >1 (la fase `pre` no llega
// tan lejos, pero el chip también se pinta desde caché de sesión): en los dos
// casos se cae a un rótulo que no afirma ningún día.

export function etiquetaChipDirecto(live: boolean, daysUntil: number | null): string {
  if (live) {
    return "En vivo";
  }
  if (daysUntil === 0) {
    return "Hoy";
  }
  if (daysUntil === 1) {
    return "Mañana";
  }
  return "Pronto";
}

export function etiquetaCtaDirecto(live: boolean, daysUntil: number | null): string {
  if (live) {
    return "Ver en directo";
  }
  if (daysUntil === 0) {
    return "Ver en directo (hoy)";
  }
  if (daysUntil === 1) {
    return "Ver en directo (mañana)";
  }
  return "Ver en directo";
}

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
// - "live": si ESPN dice qué combate se está disputando (liveInProgressIds:
//   state='in' Y asalto >= 1), ESE es, y no hay nada que deducir. Es el DATO.
// - "live"/"next" (respaldo, sin esa señal): la CRONOLÓGICAMENTE siguiente sin
//   resultado. El cartel corre en bout_order DESCENDENTE (1 = estelar cierra la
//   noche), así que la próxima es la de MAYOR bout_order sin terminar. Si su
//   tramo aún no ha empezado (huecos entre prelims y estelares) es "next"; si ya
//   empezó, "live".
// - "pending": el resto. Con fase != "live" nadie está en curso.
// Vía de escape (revisión adversarial): si una pelea con bout_order MENOR que
// la candidata ya terminó, la cronología demuestra que la candidata fue SALTADA
// (cancelación del día no marcada aún, o live-results sin match para ella) —
// sin esto el puntero EN CURSO se estancaría en ella el resto de la noche.
// Las saltadas quedan "pending" y el puntero avanza a la siguiente real.
// Las peleas con bout_order NULL (no debería pasar en eventos upcoming) nunca
// se marcan live: no hay forma fiable de ordenarlas en la cronología.
//
// ⚠️ POR QUÉ LA DEDUCCIÓN NO BASTA (evento 1062, 25-jul, visto en producción):
// ESPN retiró Dulatov-Turman (#3) de la cartelera EN MITAD de la velada. Se
// quedó sin resultado y sin marcar cancelada, así que era la de mayor
// bout_order sin terminar por debajo de la #4 → la web la pintó "EN CURSO" con
// punto rojo mientras Erceg (#2) peleaba de verdad con sus stats en pantalla.
// La vía de escape de arriba no salta porque exige que una pelea POSTERIOR haya
// terminado, y la #2 aún no había acabado. La lección, que en esa jornada
// apareció cinco veces en sitios distintos: mirar el dato, no deducirlo del
// orden, y no dar por hecho que lo programado se celebra.
//
// ⚠️ Y state='in' NO basta por sí solo: ESPN lo marca ya en los paseíllos
// (STATUS_FIGHTERS_WALKING, con todas las stats a 0). Por eso quien construye
// liveInProgressIds debe exigir además asalto >= 1.
export function computeBoutStates(
  bouts: LiveBoutInput[],
  phase: LivePhase,
  times: LiveEventTimes,
  now: Date,
  liveFinishedIds?: ReadonlySet<number>,
  liveInProgressIds?: ReadonlySet<number>,
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

  // El dato manda sobre la deducción. Un resultado ya escrito gana igualmente:
  // un snapshot 'in' rancio no debe resucitar una pelea cerrada.
  const enCurso = bouts.filter(
    (bout) =>
      (liveInProgressIds?.has(bout.fightId) ?? false) &&
      states.get(bout.fightId) !== "finished",
  );
  if (enCurso.length > 0) {
    for (const bout of enCurso) {
      states.set(bout.fightId, "live");
    }
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

// Un cartel se considera TERMINADO cuando su combate estelar (el de MENOR
// bout_order — 1 = estelar, cierra la noche) ya tiene resultado. Es la señal
// de dato que faltaba: la fase 'live' es solo temporal (main + 8 h) y no sabe
// que la velada acabó, así que sin esto la web seguía anunciando "EN DIRECTO",
// "¡ES HOY!" y "Ver en directo" horas después del último combate. Con el
// estelar resuelto (o cerrado por ESPN en su fila viva 'post', que cubre
// empates/NC sin resultado en `fights`) el evento deja de estar en directo.
// bout_order NULL se ignora (no situable en la cronología); sin ningún
// bout_order no se afirma "terminado". Las canceladas ya vienen excluidas de
// `bouts` (getEventDetail las separa), así que el menor bout_order presente es
// el estelar efectivo aunque el nº1 original se cayera.
export function isMainEventFinished(
  bouts: LiveBoutInput[],
  liveFinishedIds?: ReadonlySet<number>,
): boolean {
  let main: LiveBoutInput | null = null;
  for (const bout of bouts) {
    if (bout.boutOrder == null) {
      continue;
    }
    if (main == null || bout.boutOrder < (main.boutOrder as number)) {
      main = bout;
    }
  }
  if (main == null) {
    return false;
  }
  return (
    main.method != null ||
    main.winnerId != null ||
    (liveFinishedIds?.has(main.fightId) ?? false)
  );
}
