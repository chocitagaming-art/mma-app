import type { FighterHistoryItem } from "@/lib/types";

export type RecentForm = {
  streakCount: number;
  streakType: "win" | "loss" | "none";
  lastFive: {
    wins: number;
    losses: number;
    draws: number;
    nc: number;
    total: number;
  };
};

// Guard de combates sin disputar. Las filas UFC ya no pueden llegar así: la
// query las excluye en el WHERE y el CASE compartido (fight-result.ts) emitiría
// 'scheduled', no 'draw'. Se mantiene por las filas de fight_history_espn, que
// vienen con el result ya escrito en la BD y sin método.
function isContested(fight: FighterHistoryItem): boolean {
  return !(fight.result === "draw" && fight.method === null);
}

// `history` is newest-first (event_date desc). The current streak runs over
// consecutive bouts with the SAME win/loss result from the most recent contested
// bout; a draw or no-contest breaks the streak.
export function computeRecentForm(history: FighterHistoryItem[]): RecentForm {
  const contested = history.filter(isContested);

  const recent = contested.slice(0, 5);
  const lastFive = {
    wins: recent.filter((fight) => fight.result === "win").length,
    losses: recent.filter((fight) => fight.result === "loss").length,
    draws: recent.filter((fight) => fight.result === "draw").length,
    nc: recent.filter((fight) => fight.result === "nc").length,
    total: recent.length,
  };

  let streakType: "win" | "loss" | "none" = "none";
  let streakCount = 0;
  for (const fight of contested) {
    if (fight.result !== "win" && fight.result !== "loss") {
      break;
    }
    if (streakType === "none") {
      streakType = fight.result;
      streakCount = 1;
      continue;
    }
    if (fight.result === streakType) {
      streakCount += 1;
      continue;
    }
    break;
  }

  return { streakCount, streakType, lastFive };
}
