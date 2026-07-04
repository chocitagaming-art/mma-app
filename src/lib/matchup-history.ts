import type { DirectMatchupFight } from "@/lib/types";

// Helpers puros para el historial directo de /enfrentamiento. Convención de la
// BD (ver FightLastResult en types.ts): winner_id NULL con method registrado =
// empate/no contest; winner_id NULL y method NULL = combate aún NO disputado
// (programado). Antes se contaba todo winner_id NULL como empate, lo que
// inventaba "1 empate" cuando la pareja tenía un combate futuro en cartelera.

export type DirectMatchupOutcome = "redWin" | "blueWin" | "draw" | "scheduled";

export function classifyDirectMatchup(
  fight: Pick<DirectMatchupFight, "winnerId" | "method">,
  redFighterId: number,
  blueFighterId: number,
): DirectMatchupOutcome {
  if (fight.winnerId === null) {
    return fight.method === null ? "scheduled" : "draw";
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
};

// Resumen del cara a cara SOLO sobre peleas disputadas: los combates
// programados no suman victorias ni empates.
export function summarizeDirectMatchups(
  fights: DirectMatchupFight[],
  redFighterId: number,
  blueFighterId: number,
): DirectMatchupSummary {
  const summary: DirectMatchupSummary = { redWins: 0, blueWins: 0, draws: 0 };

  for (const fight of fights) {
    const outcome = classifyDirectMatchup(fight, redFighterId, blueFighterId);
    if (outcome === "redWin") {
      summary.redWins += 1;
    } else if (outcome === "blueWin") {
      summary.blueWins += 1;
    } else if (outcome === "draw") {
      summary.draws += 1;
    }
    // "scheduled" no cuenta en el resumen.
  }

  return summary;
}
