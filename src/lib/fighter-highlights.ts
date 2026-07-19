import type { FighterHistoryItem } from "@/lib/types";

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

// El historial llega ordenado del más reciente al más antiguo e incluye
// combates futuros como placeholder (result 'draw' + method null, ver
// fighter-form.ts). La "última pelea" es el primer combate ya disputado.
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
