import { cache } from "react";

import { sql } from "@/lib/db";
import type {
  FightCompetitorStats,
  FightDetail,
  FightLastResult,
  FightRoundStats,
  FightScorecard,
} from "@/lib/types";

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
  referee: string | null;
  winner_id: number | null;
  status: string | null;
  video_url: string | null;
  odds_red: string | null;
  odds_blue: string | null;
  red_fighter_name: string;
  red_id: number | null;
  red_name: string | null;
  red_nickname: string | null;
  red_headshot: string | null;
  red_full_body: string | null;
  red_standing_body: string | null;
  red_standing_body_l: string | null;
  red_standing_body_r: string | null;
  red_nationality: string | null;
  red_stance: string | null;
  red_height_cm: string | null;
  red_reach_cm: string | null;
  red_leg_reach_cm: string | null;
  red_weight_grams: number | null;
  red_birth_date: string | null;
  red_wins: number | null;
  red_losses: number | null;
  red_draws: number | null;
  blue_fighter_name: string;
  blue_id: number | null;
  blue_name: string | null;
  blue_nickname: string | null;
  blue_headshot: string | null;
  blue_full_body: string | null;
  blue_standing_body: string | null;
  blue_standing_body_l: string | null;
  blue_standing_body_r: string | null;
  blue_nationality: string | null;
  blue_stance: string | null;
  blue_height_cm: string | null;
  blue_reach_cm: string | null;
  blue_leg_reach_cm: string | null;
  blue_weight_grams: number | null;
  blue_birth_date: string | null;
  blue_wins: number | null;
  blue_losses: number | null;
  blue_draws: number | null;
};

type LastFightRow = {
  fight_id: number;
  event_name: string | null;
  event_date: string | null;
  result: "win" | "loss" | "draw";
  method: string | null;
};

// Fallback regional: fila de fight_history_espn (Bellator/regionales vía ESPN),
// sin fight_id porque esas peleas no viven en `fights`.
type LastFightEspnRow = {
  event_name: string | null;
  event_date: string | null;
  result: "win" | "loss" | "draw";
  method: string | null;
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

// BE8: una tarjeta de juez (fight_scorecards). Solo hay filas en decisiones.
type ScorecardRow = {
  judge_name: string;
  red_score: number;
  blue_score: number;
};

// BE4: fila de fight_stats_rounds (un luchador en un asalto).
type FightRoundStatsRow = FightStatsRow & {
  round: number;
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

// Última pelea COMPLETADA de un luchador (method IS NOT NULL descarta combates
// futuros), excluyendo la pelea que se está viendo: en una pelea terminada la
// fila "Última pelea" debe apuntar a la anterior, no a sí misma. Mismo patrón
// (JOIN events + CASE winner_id + ORDER BY event_date DESC LIMIT 1) que el
// historial de getFighterDetail.
const LAST_FIGHT_SQL = `select
    fi.id as fight_id,
    e.name as event_name,
    e.event_date,
    case
      when fi.winner_id is null then 'draw'
      when fi.winner_id = $1 then 'win'
      else 'loss'
    end as result,
    fi.method
  from fights fi
  left join events e on e.id = fi.event_id
  where (fi.fighter_red_id = $1 or fi.fighter_blue_id = $1)
    and fi.method is not null
    and fi.id <> $2
  order by e.event_date desc nulls last, fi.id desc
  limit 1`;

function mapLastFight(row?: LastFightRow): FightLastResult | null {
  if (!row) {
    return null;
  }

  return {
    fightId: row.fight_id,
    eventName: row.event_name,
    eventDate: row.event_date,
    result: row.result,
    method: row.method,
  };
}

// Última pelea REGIONAL (fallback): para un debutante sin combate UFC previo,
// su "última pelea" es el más reciente de fight_history_espn. Solo desenlaces
// win/loss/draw (una 'nc' no encaja en el label de la fila del cara a cara).
// fightId = null: no vive en `fights`, no hay ficha de combate a la que enlazar.
const LAST_FIGHT_ESPN_SQL = `select
    event_name,
    event_date,
    result,
    method
  from fight_history_espn
  where fighter_id = $1
    and result in ('win', 'loss', 'draw')
  order by event_date desc nulls last, id desc
  limit 1`;

function mapLastFightEspn(row?: LastFightEspnRow): FightLastResult | null {
  if (!row) {
    return null;
  }

  return {
    fightId: null,
    eventName: row.event_name,
    eventDate: row.event_date,
    result: row.result,
    method: row.method,
  };
}

// cache(): la página de detalle ejecuta esta misma query dos veces por request
// (generateMetadata + render). Dedupe intra-request sin cambiar firma ni resultado (#7).
export const getFightDetail = cache(async (
  id: number,
): Promise<FightDetail | null> => {
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
      fi.referee,
      fi.winner_id,
      fi.status,
      fi.video_url,
      fi.odds_red,
      fi.odds_blue,
      fi.fighter_red_name as red_fighter_name,
      fi.fighter_blue_name as blue_fighter_name,
      red.id as red_id,
      red.name as red_name,
      red.nickname as red_nickname,
      red.headshot_url as red_headshot,
      red.full_body_url as red_full_body,
      red.standing_body_url as red_standing_body,
      red.standing_body_url_l as red_standing_body_l,
      red.standing_body_url_r as red_standing_body_r,
      red.nationality as red_nationality,
      red.stance as red_stance,
      red.height_cm::text as red_height_cm,
      red.reach_cm::text as red_reach_cm,
      red.leg_reach_cm::text as red_leg_reach_cm,
      red.weight_grams as red_weight_grams,
      red.birth_date::text as red_birth_date,
      red.wins as red_wins,
      red.losses as red_losses,
      red.draws as red_draws,
      blue.id as blue_id,
      blue.name as blue_name,
      blue.nickname as blue_nickname,
      blue.headshot_url as blue_headshot,
      blue.full_body_url as blue_full_body,
      blue.standing_body_url as blue_standing_body,
      blue.standing_body_url_l as blue_standing_body_l,
      blue.standing_body_url_r as blue_standing_body_r,
      blue.nationality as blue_nationality,
      blue.stance as blue_stance,
      blue.height_cm::text as blue_height_cm,
      blue.reach_cm::text as blue_reach_cm,
      blue.leg_reach_cm::text as blue_leg_reach_cm,
      blue.weight_grams as blue_weight_grams,
      blue.birth_date::text as blue_birth_date,
      blue.wins as blue_wins,
      blue.losses as blue_losses,
      blue.draws as blue_draws
    from fights fi
    left join events e on e.id = fi.event_id
    left join fighters red on red.id = fi.fighter_red_id
    left join fighters blue on blue.id = fi.fighter_blue_id
    where fi.id = $1`,
    [id],
  );

  const fight = rows[0];

  if (!fight) {
    return null;
  }

  // Stats del combate + tarjetas de los jueces + última pelea de cada esquina
  // (UFC y su fallback regional): independientes entre sí, una sola pasada en
  // paralelo (espeja getFighterDetail). El fallback regional se resuelve solo si
  // la esquina no tiene pelea UFC previa (debutante). Esquina TBD (id null) no
  // tiene historial que consultar.
  const [
    statsRows,
    scorecardRows,
    redLastRows,
    blueLastRows,
    redEspnLastRows,
    blueEspnLastRows,
  ] = await Promise.all([
    sql<FightStatsRow>(
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
    ),
    // BE8: tarjetas de los jueces. Orden alfabético por juez para que la
    // mini-tabla sea determinista (la tabla no tiene un orden natural).
    sql<ScorecardRow>(
      `select
        judge_name,
        red_score,
        blue_score
      from fight_scorecards
      where fight_id = $1
      order by judge_name asc`,
      [id],
    ),
    fight.red_id != null
      ? sql<LastFightRow>(LAST_FIGHT_SQL, [fight.red_id, id])
      : Promise.resolve<LastFightRow[]>([]),
    fight.blue_id != null
      ? sql<LastFightRow>(LAST_FIGHT_SQL, [fight.blue_id, id])
      : Promise.resolve<LastFightRow[]>([]),
    fight.red_id != null
      ? sql<LastFightEspnRow>(LAST_FIGHT_ESPN_SQL, [fight.red_id])
      : Promise.resolve<LastFightEspnRow[]>([]),
    fight.blue_id != null
      ? sql<LastFightEspnRow>(LAST_FIGHT_ESPN_SQL, [fight.blue_id])
      : Promise.resolve<LastFightEspnRow[]>([]),
  ]);

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
    referee: fight.referee,
    winnerId: fight.winner_id,
    status: fight.status,
    videoUrl: fight.video_url,
    oddsRed: fight.odds_red != null ? Number(fight.odds_red) : null,
    oddsBlue: fight.odds_blue != null ? Number(fight.odds_blue) : null,
    red: {
      id: fight.red_id,
      // fighter_red_name siempre viene relleno; cubre el caso TBD (red.id NULL).
      name: fight.red_name ?? fight.red_fighter_name,
      nickname: fight.red_nickname,
      headshotUrl: fight.red_headshot,
      fullBodyUrl: fight.red_full_body,
      standingBodyUrl: fight.red_standing_body,
      standingBodyUrlL: fight.red_standing_body_l,
      standingBodyUrlR: fight.red_standing_body_r,
      nationality: fight.red_nationality,
      stance: fight.red_stance,
      heightCm: fight.red_height_cm ? Number(fight.red_height_cm) : null,
      reachCm: fight.red_reach_cm ? Number(fight.red_reach_cm) : null,
      legReachCm: fight.red_leg_reach_cm ? Number(fight.red_leg_reach_cm) : null,
      weightGrams: fight.red_weight_grams,
      birthDate: fight.red_birth_date,
      wins: fight.red_wins ?? 0,
      losses: fight.red_losses ?? 0,
      draws: fight.red_draws ?? 0,
      lastFight:
        mapLastFight(redLastRows[0]) ?? mapLastFightEspn(redEspnLastRows[0]),
    },
    blue: {
      id: fight.blue_id,
      name: fight.blue_name ?? fight.blue_fighter_name,
      nickname: fight.blue_nickname,
      headshotUrl: fight.blue_headshot,
      fullBodyUrl: fight.blue_full_body,
      standingBodyUrl: fight.blue_standing_body,
      standingBodyUrlL: fight.blue_standing_body_l,
      standingBodyUrlR: fight.blue_standing_body_r,
      nationality: fight.blue_nationality,
      stance: fight.blue_stance,
      heightCm: fight.blue_height_cm ? Number(fight.blue_height_cm) : null,
      reachCm: fight.blue_reach_cm ? Number(fight.blue_reach_cm) : null,
      legReachCm: fight.blue_leg_reach_cm
        ? Number(fight.blue_leg_reach_cm)
        : null,
      weightGrams: fight.blue_weight_grams,
      birthDate: fight.blue_birth_date,
      wins: fight.blue_wins ?? 0,
      losses: fight.blue_losses ?? 0,
      draws: fight.blue_draws ?? 0,
      lastFight:
        mapLastFight(blueLastRows[0]) ?? mapLastFightEspn(blueEspnLastRows[0]),
    },
    redStats,
    blueStats,
    scorecards: scorecardRows.map(
      (row): FightScorecard => ({
        judgeName: row.judge_name,
        redScore: row.red_score,
        blueScore: row.blue_score,
      }),
    ),
  };
});

// BE4: stats por asalto de AMBOS luchadores (fight_stats_rounds), ordenadas
// por asalto. Devuelve [] para peleas sin desglose (antiguas o próximas): el
// componente "Por asaltos" solo se pinta cuando hay filas.
export async function getFightRoundStats(
  fightId: number,
): Promise<FightRoundStats[]> {
  const rows = await sql<FightRoundStatsRow>(
    `select
      fighter_id,
      round,
      sig_strikes_landed,
      sig_strikes_attempted,
      takedowns_landed,
      takedowns_attempted,
      submission_attempts,
      control_time_seconds,
      knockdowns
    from fight_stats_rounds
    where fight_id = $1
    order by round asc, fighter_id asc`,
    [fightId],
  );

  return rows.map((row) => ({
    fighterId: row.fighter_id,
    round: row.round,
    sigStrikesLanded: row.sig_strikes_landed ?? 0,
    sigStrikesAttempted: row.sig_strikes_attempted ?? 0,
    takedownsLanded: row.takedowns_landed ?? 0,
    takedownsAttempted: row.takedowns_attempted ?? 0,
    submissionAttempts: row.submission_attempts ?? 0,
    controlTimeSeconds: row.control_time_seconds ?? 0,
    knockdowns: row.knockdowns ?? 0,
  }));
}