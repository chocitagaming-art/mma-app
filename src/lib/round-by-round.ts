import type { FightRoundStats } from "@/lib/types";

// FASE 9 — la lógica del "asalto a asalto", separada del componente para que
// vitest pueda probarla: la configuración solo recoge `src/**/*.test.ts`, no
// `.tsx`, así que cualquier cálculo que viva dentro del JSX no lo prueba nadie.
// Es lo mismo que se hizo con la película del combate (fight-timeline.ts).
//
// OJO, esto NO es la película del combate: aquí el dato viene de
// fight_stats_rounds (ufcstats, oficial y posterior al combate) y existe para
// 8.738 peleas. La película se capta en directo de ESPN y solo existe para 20.
// Son dos cosas distintas que se parecen mucho en pantalla: ver el aviso del
// componente.

export type CornerRoundStats = FightRoundStats | null;

export type RoundPair = {
  round: number;
  red: CornerRoundStats;
  blue: CornerRoundStats;
};

// Suma de un luchador en todo el combate. Mismos campos que FightRoundStats
// menos los que no tienen sentido acumular (fighterId, round).
export type CornerTotals = {
  sigStrikesLanded: number;
  sigStrikesAttempted: number;
  takedownsLanded: number;
  takedownsAttempted: number;
  submissionAttempts: number;
  controlTimeSeconds: number;
  knockdowns: number;
};

export type RoundByRoundData = {
  rounds: RoundPair[];
  totals: { red: CornerTotals; blue: CornerTotals };
  // Golpes conectados en el mejor asalto de cualquiera de los dos. Es la escala
  // de las barras: si cada asalto se normalizara por su cuenta, un asalto de
  // 3 golpes se vería igual de lleno que uno de 40.
  maxSigLanded: number;
  // Solo se pinta la columna de sumisiones si alguien lo intentó alguna vez.
  // Son ~12% de los asaltos: en el resto sería una columna de ceros que
  // estrecha la tabla en móvil a cambio de nada.
  hasSubmissionAttempts: boolean;
};

const CEROS: CornerTotals = {
  sigStrikesLanded: 0,
  sigStrikesAttempted: 0,
  takedownsLanded: 0,
  takedownsAttempted: 0,
  submissionAttempts: 0,
  controlTimeSeconds: 0,
  knockdowns: 0,
};

function acumular(total: CornerTotals, fila: FightRoundStats): CornerTotals {
  return {
    sigStrikesLanded: total.sigStrikesLanded + fila.sigStrikesLanded,
    sigStrikesAttempted: total.sigStrikesAttempted + fila.sigStrikesAttempted,
    takedownsLanded: total.takedownsLanded + fila.takedownsLanded,
    takedownsAttempted: total.takedownsAttempted + fila.takedownsAttempted,
    submissionAttempts: total.submissionAttempts + fila.submissionAttempts,
    controlTimeSeconds: total.controlTimeSeconds + fila.controlTimeSeconds,
    knockdowns: total.knockdowns + fila.knockdowns,
  };
}

// Agrupa las filas (una por luchador y asalto) en pares rojo/azul, ordenados por
// asalto, y suma los totales de cada esquina.
//
// Las filas cuyo fighter_id no case con ninguna esquina se descartan: son datos
// huérfanos y pintarlos daría un asalto con tres luchadores. En la BD hoy no hay
// ninguna, pero la ficha no debe romperse si aparece.
export function buildRoundByRound(
  filas: readonly FightRoundStats[],
  redId: number | null,
  blueId: number | null,
): RoundByRoundData | null {
  const porAsalto = new Map<number, { red: CornerRoundStats; blue: CornerRoundStats }>();
  let red = CEROS;
  let blue = CEROS;
  let maxSigLanded = 0;
  let hasSubmissionAttempts = false;

  for (const fila of filas) {
    const esRojo = redId != null && fila.fighterId === redId;
    const esAzul = blueId != null && fila.fighterId === blueId;
    if (!esRojo && !esAzul) {
      continue;
    }

    const entrada = porAsalto.get(fila.round) ?? { red: null, blue: null };
    if (esRojo) {
      entrada.red = fila;
      red = acumular(red, fila);
    } else {
      entrada.blue = fila;
      blue = acumular(blue, fila);
    }
    porAsalto.set(fila.round, entrada);

    maxSigLanded = Math.max(maxSigLanded, fila.sigStrikesLanded);
    hasSubmissionAttempts ||= fila.submissionAttempts > 0;
  }

  if (porAsalto.size === 0) {
    return null;
  }

  const rounds = [...porAsalto.entries()]
    .sort(([a], [b]) => a - b)
    .map(([round, esquinas]) => ({ round, red: esquinas.red, blue: esquinas.blue }));

  return { rounds, totals: { red, blue }, maxSigLanded, hasSubmissionAttempts };
}

// Ancho de la barra de un asalto, en porcentaje sobre el mejor asalto del
// combate. Devuelve 0 sin datos (no hay barra que pintar) y nunca divide por
// cero: un asalto donde nadie conectó un golpe es real (969 en la BD).
export function anchoBarra(conectados: number | null | undefined, maxSigLanded: number): number {
  if (!conectados || conectados <= 0 || maxSigLanded <= 0) {
    return 0;
  }
  return Math.min(100, (conectados / maxSigLanded) * 100);
}

// ¿El combate se resolvió en las tarjetas? El método llega en DOS formatos y
// hay que reconocer los dos: el abreviado de ufcstats ("U-DEC", "S-DEC",
// "M-DEC") y el largo ("Decision - Unanimous"). Solo los abreviados son 4.088
// combates de los 8.757 con resultado — casi la mitad. Comprobarlo únicamente
// con la palabra "decision" deja marcada como final anticipado media base de
// datos.
export function esDecision(method: string): boolean {
  const m = method.trim().toLowerCase();
  return m.includes("decis") || /(^|[-\s])[usm]-dec(\b|$)/.test(m) || m === "dec";
}

// Texto del final del combate para marcarlo en el asalto donde ocurrió.
// Devuelve null en decisiones y en combates sin resultado: ahí no hay nada que
// señalar porque se llegó al límite.
export function etiquetaFinal(
  method: string | null,
  endRound: number | null,
  endTime: string | null,
  round: number,
): string | null {
  if (!method || endRound == null || endRound !== round) {
    return null;
  }
  if (esDecision(method)) {
    return null;
  }
  return endTime ? `Final · ${endTime}` : "Final";
}
