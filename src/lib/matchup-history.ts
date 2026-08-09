import { isNoContestMethod } from "@/lib/fight-result";
import type { DirectMatchupFight } from "@/lib/types";

// Helpers puros para el historial directo de /enfrentamiento. Convención de la
// BD (ver FightLastResult en types.ts): winner_id NULL con method registrado =
// empate O no contest, y el method es lo único que los separa (fight-result.ts);
// winner_id NULL y method NULL = combate aún NO disputado (programado). Antes se
// contaba todo winner_id NULL como empate, lo que inventaba "1 empate" cuando la
// pareja tenía un combate futuro en cartelera — y también cuando lo que tenía
// era un no contest (Aspinall-Gane, fight 3254).

export type DirectMatchupOutcome =
  | "redWin"
  | "blueWin"
  | "draw"
  | "nc"
  | "scheduled";

export function classifyDirectMatchup(
  fight: Pick<DirectMatchupFight, "winnerId" | "method">,
  redFighterId: number,
  blueFighterId: number,
): DirectMatchupOutcome {
  if (fight.winnerId === null) {
    if (fight.method === null) {
      return "scheduled";
    }
    return isNoContestMethod(fight.method) ? "nc" : "draw";
  }
  return fight.winnerId === redFighterId
    ? "redWin"
    : fight.winnerId === blueFighterId
      ? "blueWin"
      : // winner_id de un tercero no debería existir en una pelea entre estos
        // dos; lo tratamos como resultado sin ganador conocido.
        "draw";
}

export type DirectMatchupSplit = {
  // Peleas ya disputadas (con ganador o empate/NC), para resumen y tarjetas.
  completed: DirectMatchupFight[];
  // Combates programados (sin ganador ni método), para la tarjeta propia.
  scheduled: DirectMatchupFight[];
};

export function splitDirectMatchups(
  fights: DirectMatchupFight[],
): DirectMatchupSplit {
  const completed: DirectMatchupFight[] = [];
  const scheduled: DirectMatchupFight[] = [];

  for (const fight of fights) {
    if (fight.winnerId === null && fight.method === null) {
      scheduled.push(fight);
    } else {
      completed.push(fight);
    }
  }

  return { completed, scheduled };
}

export type DirectMatchupSummary = {
  redWins: number;
  blueWins: number;
  draws: number;
  noContests: number;
};

// Resumen del cara a cara SOLO sobre peleas disputadas: los combates
// programados no suman victorias ni empates. Los no contest van en su propio
// contador: no son empates, y sumarlos ahí es lo que hacía decir "1 empate" a
// dos luchadores que nunca empataron.
export function summarizeDirectMatchups(
  fights: DirectMatchupFight[],
  redFighterId: number,
  blueFighterId: number,
): DirectMatchupSummary {
  const summary: DirectMatchupSummary = {
    redWins: 0,
    blueWins: 0,
    draws: 0,
    noContests: 0,
  };

  for (const fight of fights) {
    const outcome = classifyDirectMatchup(fight, redFighterId, blueFighterId);
    if (outcome === "redWin") {
      summary.redWins += 1;
    } else if (outcome === "blueWin") {
      summary.blueWins += 1;
    } else if (outcome === "draw") {
      summary.draws += 1;
    } else if (outcome === "nc") {
      summary.noContests += 1;
    }
    // "scheduled" no cuenta en el resumen.
  }

  return summary;
}

// Rótulo del centro de la tarjeta "Cara a cara". Los empates y los no contest
// se nombran por separado: son cosas distintas y meterlos en el mismo contador
// es justo lo que hacía que Aspinall-Gane leyera "1 empate".
export function describeMatchupTies(summary: DirectMatchupSummary): string {
  const partes: string[] = [];

  if (summary.draws > 0 || summary.noContests === 0) {
    partes.push(`${summary.draws} ${summary.draws === 1 ? "empate" : "empates"}`);
  }
  if (summary.noContests > 0) {
    // "sin resultado" no tiene plural.
    partes.push(`${summary.noContests} sin resultado`);
  }

  return partes.join(" · ");
}
