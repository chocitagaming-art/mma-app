import { formatDate } from "@/lib/format";
import { toIsoDateOnly } from "@/lib/structured-data";
import type { FighterHistoryItem, FighterUpcomingBout } from "@/lib/types";

// Helpers puros para los destacados del hero de la ficha de luchador (fase 3).
// Sin dependencias de Next/DB para poder testearlos aislados (como fighter-form).

// Edad en años cumplidos a partir de birth_date. La BD guarda DATE, que pg
// puede entregar como string ISO ("1991-02-27") o como Date según el parser,
// así que aceptamos ambos. Devuelve null si falta o no es parseable.
export function computeAge(
  birthDate: string | Date | null | undefined,
  now: Date = new Date(),
): number | null {
  if (!birthDate) {
    return null;
  }

  const birth =
    birthDate instanceof Date
      ? birthDate
      : new Date(`${birthDate.slice(0, 10)}T00:00:00Z`);

  if (Number.isNaN(birth.getTime())) {
    return null;
  }

  let age = now.getUTCFullYear() - birth.getUTCFullYear();
  const monthDiff = now.getUTCMonth() - birth.getUTCMonth();
  if (monthDiff < 0 || (monthDiff === 0 && now.getUTCDate() < birth.getUTCDate())) {
    age -= 1;
  }

  // Fechas futuras o absurdas (errores de scraping) no son una edad mostrable.
  return age >= 0 && age <= 130 ? age : null;
}

// Mismos buckets (y misma prioridad) que la query de winMethods en
// fighters.detail.ts: 'decision' excluye, luego KO/TKO, luego sumisión.
const DECISION_RE = /\bdecision\b/iu;
const KO_RE = /\b(?:ko|tko)\b|knockout/iu;
const SUBMISSION_RE =
  /submission|choke|armbar|kimura|guillotine|triangle|americana|rear|naked|crank|\block\b/iu;

// Clasifica un método de victoria como finalización (KO/TKO o sumisión).
// Devuelve null para decisiones, DQ, métodos desconocidos o ausentes.
export function classifyFinish(
  method: string | null | undefined,
): "ko" | "submission" | null {
  if (!method) {
    return null;
  }

  if (DECISION_RE.test(method)) {
    return null;
  }
  if (KO_RE.test(method)) {
    return "ko";
  }
  if (SUBMISSION_RE.test(method)) {
    return "submission";
  }

  return null;
}

// 'Finalizaciones en 1er asalto': victorias con end_round = 1 terminadas por
// KO/TKO o sumisión. Calculado sobre el historial que la ficha ya carga.
export function countFirstRoundFinishes(history: FighterHistoryItem[]): number {
  return history.filter(
    (fight) =>
      fight.result === "win" &&
      fight.endRound === 1 &&
      classifyFinish(fight.method) !== null,
  ).length;
}

// 1A: el desglose de acabados del hero (KO / sumisión / finalizaciones en 1er
// asalto) usa los totales de CARRERA de ufc.com (guardados, migración 021)
// cuando existen — consistentes con el record W-L-D total del hero. Si el
// luchador no tiene ficha ufc.com (prospecto), cae al cálculo UFC-only. Se
// resuelve por campo con `?? computed`; como el scraper escribe los 3 juntos,
// en la práctica es todo-o-nada.
export type FinishHighlights = {
  winsByKo: number;
  winsBySubmission: number;
  firstRoundFinishes: number;
};

export function resolveFinishHighlights(
  stored: {
    winsByKo?: number | null;
    winsBySubmission?: number | null;
    firstRoundFinishes?: number | null;
  },
  computed: { koTko: number; submission: number; firstRoundFinishes: number },
): FinishHighlights {
  return {
    winsByKo: stored.winsByKo ?? computed.koTko,
    winsBySubmission: stored.winsBySubmission ?? computed.submission,
    firstRoundFinishes: stored.firstRoundFinishes ?? computed.firstRoundFinishes,
  };
}

// El historial llega ordenado del más reciente al más antiguo. El guard de
// 'draw' + method null ya no alcanza a ninguna fila UFC (ver fighter-form.ts);
// se mantiene por las de ESPN. La "última pelea" es el primer combate ya
// disputado, y desde el arreglo de los no contest eso incluye un 'nc': un
// combate anulado SÍ es la última vez que ese luchador se subió a la jaula.
export function lastCompletedFight(
  history: FighterHistoryItem[],
): FighterHistoryItem | null {
  return (
    history.find(
      (fight) => !(fight.result === "draw" && fight.method === null),
    ) ?? null
  );
}

// Fallback regional del tile "Última pelea" (S3-G): para un fichaje sin combate
// UFC disputado, la última pelea es la más reciente de fight_history_espn.
// Mismo criterio que LAST_FIGHT_ESPN_SQL (queries/fights.ts): solo desenlaces
// win/loss/draw — una 'nc' no encaja en el label del tile. La lista ya llega
// ordenada por fecha desc desde getFighterDetail, así que basta con la primera
// fila decisiva (las espn no traen placeholders futuros que saltar).
export function latestRegionalFight(
  espnHistory: FighterHistoryItem[],
): FighterHistoryItem | null {
  return espnHistory.find((fight) => fight.result !== "nc") ?? null;
}

// ---------------------------------------------------------------------------
// «Debut en UFC» (bio row): from our fights, not from ufc.com (owner, 21-oct-2026)
// ---------------------------------------------------------------------------
//
// The row used to print fighters.octagon_debut as ufc.com serves it, and on
// 21-oct-2026 that was wrong or missing on 1,541 of 2,892 fighters: 1,176
// empty, 222 one or two days late (ufc.com's time zone), 78 earlier than the
// UFC debut (Contender Series, Strikeforce, Road to UFC, bookings that fell
// through), 51 with the date of the day ufc.com's page broke, 9 later and 5 for
// someone who has never fought in the UFC. This rule (R2 of the measurement)
// leaves 6 wrong, and those 6 are holes in `fights`, not in the rule.

/**
 * First day of `events`: UFC 5. UFC 1-4 are not in the table, so for the 16
 * veterans who debuted there ufc.com is the only source (Royce Gracie,
 * 1993-11-12, would otherwise get 1995-04-07). ufc.com's broken page prints the
 * day it is generated, so it can never produce a date this old.
 */
export const UFC_EVENTS_COVERAGE_START = "1995-04-07";

/** `scheduled`: never fought in the UFC, but booked for this day. */
export type UfcDebut = { date: string; scheduled: boolean };

// The calendar day of a DATE column, as "YYYY-MM-DD", in any of the three
// shapes it reaches this page in:
//   - "2015-07-12", cast with ::text (octagon_debut, upcoming event_date);
//   - a Date at LOCAL midnight, which node-postgres builds from a bare DATE
//     (history event_date, selected without a cast);
//   - "2015-07-11T22:00:00.000Z": that same Date after unstable_cache stored it
//     as JSON and read it back (a cache hit; a miss hands over the Date).
// The last two are an instant whose LOCAL day is the stored one, and the
// process that reads the cache back is the one that wrote it. 🪤 Formatting
// either in UTC, or slicing the string, is the trap: on the laptop (Europe/
// Madrid) Luque's 12-jul-2015 debut came out as 11-jul. In UTC (Vercel) the two
// readings agree, so production never showed it.
function calendarDay(value: string | Date | null | undefined): string | null {
  if (typeof value === "string" && !/^\d{4}-\d{2}-\d{2}$/.test(value.trim())) {
    return value.trim() === "" ? null : toIsoDateOnly(new Date(value));
  }
  return toIsoDateOnly(value);
}

// "YYYY-MM-DD" strings sort as days, so the smallest one is the earliest.
function earliestDay(values: readonly (string | Date | null | undefined)[]): string | null {
  let earliest: string | null = null;
  for (const value of values) {
    const day = calendarDay(value);
    if (day && (earliest === null || day < earliest)) {
      earliest = day;
    }
  }
  return earliest;
}

/**
 * The «Debut en UFC» of the fighter page, or null for no row.
 *
 * 1. The first UFC fight fought in `fights`. `history` only holds bouts with a
 *    result (winner or method), so a NC or a draw counts and a placeholder
 *    does not. Neither a cancelled bout nor a Road to UFC one (events.tier)
 *    counts. The event's status is not asked on purpose: on 21-oct-2026 not a
 *    single fight with a result hung from a non-completed event (same first
 *    date for all 2,892 either way), and the ingestion only flips an event to
 *    'completed' once its date has passed, so asking would hide a result
 *    written on fight night until the next day.
 * 2. Unless ufc.com says before UFC_EVENTS_COVERAGE_START and earlier than (1):
 *    then ufc.com. Any later date from ufc.com is ignored, whatever it says.
 * 3. Never fought: the first booked bout (upcomingBouts already drops the
 *    cancelled ones and the past events), Road to UFC excluded, «(programado)».
 *
 * `history` must be the UFC history (`fights`): ESPN rows are skipped anyway,
 * because the Contender Series lives there and it is not the UFC debut.
 */
export function resolveUfcDebut({
  history,
  upcomingBouts,
  octagonDebut,
}: {
  history: readonly FighterHistoryItem[];
  upcomingBouts: readonly Pick<FighterUpcomingBout, "eventDate" | "eventTier">[];
  octagonDebut: string | null | undefined;
}): UfcDebut | null {
  const firstFought = earliestDay(
    history
      .filter(
        (fight) =>
          fight.origin !== "espn" &&
          fight.fightStatus !== "cancelled" &&
          fight.eventTier !== "road_to_ufc" &&
          !(fight.result === "draw" && fight.method === null),
      )
      .map((fight) => fight.eventDate),
  );

  const ufcCom = calendarDay(octagonDebut);
  if (
    ufcCom !== null &&
    ufcCom < UFC_EVENTS_COVERAGE_START &&
    (firstFought === null || ufcCom < firstFought)
  ) {
    return { date: ufcCom, scheduled: false };
  }

  if (firstFought !== null) {
    return { date: firstFought, scheduled: false };
  }

  const firstBooked = earliestDay(
    upcomingBouts
      .filter((bout) => bout.eventTier !== "road_to_ufc")
      .map((bout) => bout.eventDate),
  );
  return firstBooked !== null ? { date: firstBooked, scheduled: true } : null;
}

/** «12 jul 2015», or «24 oct 2026 (programado)» for a booked debut. */
export function formatUfcDebut(debut: UfcDebut): string {
  return `${formatDate(debut.date)}${debut.scheduled ? " (programado)" : ""}`;
}
