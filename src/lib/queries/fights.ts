import { sql } from "@/lib/db";
import type { FightCompetitorStats, FightDetail } from "@/lib/types";

type FightRow = {
  id: number;
  event_id: number | null;
  event_name: string | null;
  event_date: string | null;
  location: string | null;
  weight_class: string | null;
  scheduled_rounds: number | null;
  method: string | null;
  end_round: number | null;
  end_time: string | null;
  winner_id: number | null;
  red_id: number;
  red_name: string;
  red_nickname: string | null;
  red_nationality: string | null;
  red_stance: string | null;
  red_height_cm: string | null;
  red_reach_cm: string | null;
  red_wins: number;
  red_losses: number;
  red_draws: number;
  blue_id: number;
  blue_name: string;
  blue_nickname: string | null;
  blue_nationality: string | null;
  blue_stance: string | null;
  blue_height_cm: string | null;
  blue_reach_cm: string | null;
  blue_wins: number;
  blue_losses: number;
  blue_draws: number;
};

type FightStatsRow = {
  fighter_id: number;
  sig_strikes_landed: number | null;
  sig_strikes_attempted: number | null;
  takedowns_landed: number | null;
  takedowns_attempted: number | null;
  submission_attempts: number | null;
  control_time_seconds: number | null;
  knockdowns: number | null;
};

function mapStats(row?: FightStatsRow): FightCompetitorStats | null {
  if (!row) {
    return null;
  }

  const sigStrikesLanded = row.sig_strikes_landed ?? 0;
  const sigStrikesAttempted = row.sig_strikes_attempted ?? 0;
  const takedownsLanded = row.takedowns_landed ?? 0;
  const takedownsAttempted = row.takedowns_attempted ?? 0;

  return {
    fighterId: row.fighter_id,
    sigStrikesLanded,
    sigStrikesAttempted,
    sigStrikeAccuracy:
      sigStrikesAttempted > 0 ? sigStrikesLanded / sigStrikesAttempted : 0,
    takedownsLanded,
    takedownsAttempted,
    takedownAccuracy:
      takedownsAttempted > 0 ? takedownsLanded / takedownsAttempted : 0,
    submissionAttempts: row.submission_attempts ?? 0,
    controlTimeSeconds: row.control_time_seconds ?? 0,
    knockdowns: row.knockdowns ?? 0,
  };
}

export async function getFightDetail(id: number): Promise<FightDetail | null> {
  const rows = await sql<FightRow>(
    `select
      fi.id,
      fi.event_id,
      e.name as event_name,
      e.event_date,
      e.location,
      fi.weight_class,
      fi.scheduled_rounds,
      fi.method,
      fi.end_round,
      fi.end_time,
      fi.winner_id,
      red.id as red_id,
      red.name as red_name,
      red.nickname as red_nickname,
      red.nationality as red_nationality,
      red.stance as red_stance,
      red.height_cm::text as red_height_cm,
      red.reach_cm::text as red_reach_cm,
      red.wins as red_wins,
      red.losses as red_losses,
      red.draws as red_draws,
      blue.id as blue_id,
      blue.name as blue_name,
      blue.nickname as blue_nickname,
      blue.nationality as blue_nationality,
      blue.stance as blue_stance,
      blue.height_cm::text as blue_height_cm,
      blue.reach_cm::text as blue_reach_cm,
      blue.wins as blue_wins,
      blue.losses as blue_losses,
      blue.draws as blue_draws
    from fights fi
    left join events e on e.id = fi.event_id
    inner join fighters red on red.id = fi.fighter_red_id
    inner join fighters blue on blue.id = fi.fighter_blue_id
    where fi.id = $1`,
    [id],
  );

  const fight = rows[0];

  if (!fight) {
    return null;
  }

  const statsRows = await sql<FightStatsRow>(
    `select
      fighter_id,
      sig_strikes_landed,
      sig_strikes_attempted,
      takedowns_landed,
      takedowns_attempted,
      submission_attempts,
      control_time_seconds,
      knockdowns
    from fight_stats
    where fight_id = $1`,
    [id],
  );

  const redStats = mapStats(statsRows.find((row) => row.fighter_id === fight.red_id));
  const blueStats = mapStats(
    statsRows.find((row) => row.fighter_id === fight.blue_id),
  );

  return {
    id: fight.id,
    eventId: fight.event_id,
    eventName: fight.event_name,
    eventDate: fight.event_date,
    location: fight.location,
    weightClass: fight.weight_class,
    scheduledRounds: fight.scheduled_rounds,
    method: fight.method,
    endRound: fight.end_round,
    endTime: fight.end_time,
    winnerId: fight.winner_id,
    red: {
      id: fight.red_id,
      name: fight.red_name,
      nickname: fight.red_nickname,
      nationality: fight.red_nationality,
      stance: fight.red_stance,
      heightCm: fight.red_height_cm ? Number(fight.red_height_cm) : null,
      reachCm: fight.red_reach_cm ? Number(fight.red_reach_cm) : null,
      wins: fight.red_wins,
      losses: fight.red_losses,
      draws: fight.red_draws,
    },
    blue: {
      id: fight.blue_id,
      name: fight.blue_name,
      nickname: fight.blue_nickname,
      nationality: fight.blue_nationality,
      stance: fight.blue_stance,
      heightCm: fight.blue_height_cm ? Number(fight.blue_height_cm) : null,
      reachCm: fight.blue_reach_cm ? Number(fight.blue_reach_cm) : null,
      wins: fight.blue_wins,
      losses: fight.blue_losses,
      draws: fight.blue_draws,
    },
    redStats,
    blueStats,
  };
}