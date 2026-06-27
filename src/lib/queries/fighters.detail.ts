import { cache } from "react";

import { sql } from "@/lib/db";
import type {
  DirectMatchupFight,
  FighterComparisonDetail,
  FighterComparisonProfile,
  FighterDetail,
  FighterHistoryItem,
  FighterRanking,
  FighterRateStats,
  FighterStrikeProfile,
} from "@/lib/types";
import type {
  AggregateRow,
  DefenseRow,
  DirectMatchupRow,
  FighterRankingRow,
  FighterRow,
  HistoryRow,
  NewsRow,
  StrikeBreakdownRow,
  WinMethodRow,
} from "./fighters.types";
import {
  mapAggregate,
  mapComparisonAggregate,
  mapDefense,
  mapFighter,
  mapNewsArticle,
  mapStrikeBreakdown,
  mapWinMethods,
  strikeBreakdownSelect,
} from "./fighters.mappers";

// cache(): la página de detalle ejecuta esta misma query dos veces por request
// (generateMetadata + render). Dedupe intra-request sin cambiar firma ni resultado (#7).
export const getFighterDetail = cache(async (
  id: number,
): Promise<FighterDetail | null> => {
  const fighterRows = await sql<FighterRow>(
    `select
      f.*,
      (
        select count(*)::text
        from fights fi
        where fi.fighter_red_id = f.id or fi.fighter_blue_id = f.id
      ) as fight_count,
      (
        select fi2.weight_class
        from fights fi2
        where fi2.fighter_red_id = f.id or fi2.fighter_blue_id = f.id
        order by fi2.updated_at desc nulls last, fi2.id desc
        limit 1
      ) as latest_weight_class
    from fighters f
    where f.id = $1`,
    [id],
  );

  const fighterRow = fighterRows[0];

  if (!fighterRow) {
    return null;
  }

  const [
    historyRows,
    aggregateRows,
    newsRows,
    defenseRows,
    winMethodRows,
    rankingRows,
  ] = await Promise.all([
    sql<HistoryRow>(
      `select
        fi.id as fight_id,
        fi.event_id,
        e.name as event_name,
        e.event_date,
        case
          when fi.fighter_red_id = $1 then blue.id
          else red.id
        end as opponent_id,
        case
          when fi.fighter_red_id = $1 then blue.name
          else red.name
        end as opponent_name,
        case
          when fi.fighter_red_id = $1 then 'red'
          else 'blue'
        end as corner,
        case
          when fi.winner_id is null then 'draw'
          when fi.winner_id = $1 then 'win'
          else 'loss'
        end as result,
        fi.method,
        fi.end_round,
        fi.end_time,
        fi.weight_class,
        fi.video_url
      from fights fi
      left join events e on e.id = fi.event_id
      left join fighters red on red.id = fi.fighter_red_id
      left join fighters blue on blue.id = fi.fighter_blue_id
      where fi.fighter_red_id = $1 or fi.fighter_blue_id = $1
      order by e.event_date desc nulls last, fi.id desc`,
      [id],
    ),
    sql<AggregateRow>(
      `select
        sum(sig_strikes_landed)::text as sig_strikes_landed,
        sum(sig_strikes_attempted)::text as sig_strikes_attempted,
        sum(takedowns_landed)::text as takedowns_landed,
        sum(takedowns_attempted)::text as takedowns_attempted,
        sum(submission_attempts)::text as submission_attempts,
        sum(control_time_seconds)::text as control_time_seconds,
        sum(knockdowns)::text as knockdowns,
        count(*)::text as total_fight_stats
      from fight_stats
      where fighter_id = $1`,
      [id],
    ),
    sql<NewsRow>(
      `select
        n.id,
        n.headline,
        n.summary,
        n.source,
        n.url,
        n.published_at,
        n.fighter_id,
        f.name as fighter_name,
        n.category,
        n.relevance::text,
        n.image_url
      from news n
      left join fighters f on f.id = n.fighter_id
      where n.fighter_id = $1
      order by n.published_at desc nulls last, n.relevance desc nulls last, n.id desc`,
      [id],
    ),
    // Defensa: lo que el RIVAL intentó contra este luchador (su fila en el mismo combate).
    sql<DefenseRow>(
      `select
        sum(opp.sig_strikes_landed)::text as opp_sig_strikes_landed,
        sum(opp.sig_strikes_attempted)::text as opp_sig_strikes_attempted,
        sum(opp.takedowns_landed)::text as opp_takedowns_landed,
        sum(opp.takedowns_attempted)::text as opp_takedowns_attempted
      from fight_stats me
      join fight_stats opp
        on opp.fight_id = me.fight_id
       and opp.fighter_id <> me.fighter_id
      where me.fighter_id = $1`,
      [id],
    ),
    // Victorias por método. Buckets MUTUAMENTE EXCLUYENTES por prioridad
    // (decisión -> ko/tko -> sumisión -> otro), con palabras ancladas (\y) para
    // no doble-contar ni matchear subcadenas ('decked', 'subdued', 'crowbar'...).
    // Así los buckets suman exactamente el total de victorias.
    sql<WinMethodRow>(
      `select
        (count(*) filter (where m ~* '\\ydecision\\y'))::text as decision,
        (count(*) filter (
          where m !~* '\\ydecision\\y'
            and m ~* '(\\y(ko|tko)\\y|knockout)'
        ))::text as ko_tko,
        (count(*) filter (
          where m !~* '\\ydecision\\y'
            and m !~* '(\\y(ko|tko)\\y|knockout)'
            and m ~* '(submission|choke|armbar|kimura|guillotine|triangle|americana|rear|naked|crank|\\ylock\\y)'
        ))::text as submission,
        (count(*) filter (
          where m !~* '\\ydecision\\y'
            and m !~* '(\\y(ko|tko)\\y|knockout)'
            and m !~* '(submission|choke|armbar|kimura|guillotine|triangle|americana|rear|naked|crank|\\ylock\\y)'
        ))::text as other
      from (
        select lower(coalesce(fi.method, '')) as m
        from fights fi
        where fi.winner_id = $1
      ) wins`,
      [id],
    ),
    // Ranking en el ÚLTIMO snapshot (#14). Un luchador puede aparecer en su
    // división real Y en libra por libra (P4P): priorizamos la división real
    // (P4P al final), luego el flag de campeón, luego la mejor posición.
    sql<FighterRankingRow>(
      `with latest as (select max(snapshot_date) as d from rankings)
      select
        r.division,
        r.rank_position,
        r.is_champion
      from rankings r
      where r.fighter_id = $1
        and r.snapshot_date = (select d from latest)
      order by
        (r.division in ('mens_pound_for_pound', 'womens_pound_for_pound')) asc,
        r.is_champion desc,
        r.rank_position asc
      limit 1`,
      [id],
    ),
  ]);

  const history: FighterHistoryItem[] = historyRows.map((row) => ({
    fightId: row.fight_id,
    eventId: row.event_id,
    eventName: row.event_name,
    eventDate: row.event_date,
    opponentId: row.opponent_id,
    opponentName: row.opponent_name,
    corner: row.corner,
    result: row.result,
    method: row.method,
    endRound: row.end_round,
    endTime: row.end_time,
    weightClass: row.weight_class,
    videoUrl: row.video_url,
  }));

  const aggregateStats = mapAggregate(aggregateRows[0]);
  const defenseStats = mapDefense(defenseRows[0]);
  const rankingRow = rankingRows[0];
  const ranking: FighterRanking | null = rankingRow
    ? {
        division: rankingRow.division,
        position: rankingRow.rank_position,
        isChampion: rankingRow.is_champion,
      }
    : null;
  const denom = Math.max(1, aggregateStats.totalFightStats);
  const rateStats: FighterRateStats = {
    sigStrikesLandedPerFight: aggregateStats.sigStrikesLanded / denom,
    sigStrikesAbsorbedPerFight: defenseStats.oppSigStrikesLanded / denom,
    fightStatsCount: aggregateStats.totalFightStats,
  };

  return {
    fighter: mapFighter(fighterRow),
    latestWeightClass: fighterRow.latest_weight_class ?? null,
    fightCount: Number(fighterRow.fight_count ?? 0),
    history,
    aggregateStats,
    news: newsRows.map(mapNewsArticle),
    defenseStats,
    winMethods: mapWinMethods(winMethodRows[0]),
    rateStats,
    ranking,
  };
});

export async function getFighterComparisonDetail(
  fighterAId: number,
  fighterBId: number,
): Promise<FighterComparisonDetail | null> {
  const fighterRows = await sql<FighterRow>(
    `select
      f.*,
      (
        select count(*)::text
        from fights fi
        where fi.fighter_red_id = f.id or fi.fighter_blue_id = f.id
      ) as fight_count,
      (
        select fi2.weight_class
        from fights fi2
        where fi2.fighter_red_id = f.id or fi2.fighter_blue_id = f.id
        order by fi2.updated_at desc nulls last, fi2.id desc
        limit 1
      ) as latest_weight_class
    from fighters f
    where f.id in ($1, $2)`,
    [fighterAId, fighterBId],
  );

  if (fighterRows.length !== 2) {
    return null;
  }

  // Aggregates, direct matchups y el strike breakdown (ofensa = lo que conecta,
  // defensa = lo que recibe del rival) son independientes: una sola pasada en
  // paralelo en vez de round-trips en serie (espeja getFighterDetail). Reutiliza
  // strikeBreakdownSelect y el patrón de getFighterStrikeProfile (#45).
  const [aggregateRows, directMatchupRows, strikeOffenseRows, strikeDefenseRows] =
    await Promise.all([
      sql<AggregateRow & { fighter_id: number }>(
        `select
          fighter_id,
          sum(sig_strikes_landed)::text as sig_strikes_landed,
          sum(sig_strikes_attempted)::text as sig_strikes_attempted,
          sum(takedowns_landed)::text as takedowns_landed,
          sum(takedowns_attempted)::text as takedowns_attempted,
          sum(submission_attempts)::text as submission_attempts,
          sum(control_time_seconds)::text as control_time_seconds,
          sum(knockdowns)::text as knockdowns,
          count(*)::text as total_fight_stats
        from fight_stats
        where fighter_id in ($1, $2)
        group by fighter_id`,
        [fighterAId, fighterBId],
      ),
      sql<DirectMatchupRow>(
        `select
          fi.id as fight_id,
          e.name as event_name,
          e.event_date,
          fi.winner_id,
          fi.method,
          fi.end_round,
          fi.end_time,
          fi.weight_class
        from fights fi
        left join events e on e.id = fi.event_id
        where
          (fi.fighter_red_id = $1 and fi.fighter_blue_id = $2)
          or
          (fi.fighter_red_id = $2 and fi.fighter_blue_id = $1)
        order by e.event_date desc nulls last, fi.id desc`,
        [fighterAId, fighterBId],
      ),
      sql<StrikeBreakdownRow & { fighter_id: number }>(
        `select fighter_id, ${strikeBreakdownSelect("")}
         from fight_stats
         where fighter_id in ($1, $2)
         group by fighter_id`,
        [fighterAId, fighterBId],
      ),
      sql<StrikeBreakdownRow & { fighter_id: number }>(
        `select me.fighter_id, ${strikeBreakdownSelect("opp.")}
         from fight_stats me
         join fight_stats opp
           on opp.fight_id = me.fight_id
          and opp.fighter_id <> me.fighter_id
         where me.fighter_id in ($1, $2)
         group by me.fighter_id`,
        [fighterAId, fighterBId],
      ),
    ]);

  const aggregateMap = new Map(
    aggregateRows.map((row) => [row.fighter_id, mapComparisonAggregate(row)]),
  );
  const offenseMap = new Map(
    strikeOffenseRows.map((row) => [row.fighter_id, mapStrikeBreakdown(row)]),
  );
  const defenseMap = new Map(
    strikeDefenseRows.map((row) => [row.fighter_id, mapStrikeBreakdown(row)]),
  );

  const profileMap = new Map<number, FighterComparisonProfile>(
    fighterRows.map((row) => [
      row.id,
      {
        ...mapFighter(row),
        aggregateStats: aggregateMap.get(row.id) ?? mapComparisonAggregate(),
        strikeProfile: {
          offense: offenseMap.get(row.id) ?? mapStrikeBreakdown(),
          defense: defenseMap.get(row.id) ?? mapStrikeBreakdown(),
        },
      },
    ]),
  );

  const fighterA = profileMap.get(fighterAId);
  const fighterB = profileMap.get(fighterBId);

  if (!fighterA || !fighterB) {
    return null;
  }

  const directMatchups: DirectMatchupFight[] = directMatchupRows.map((row) => ({
    fightId: row.fight_id,
    eventName: row.event_name,
    eventDate: row.event_date,
    winnerId: row.winner_id,
    method: row.method,
    endRound: row.end_round,
    endTime: row.end_time,
    weightClass: row.weight_class,
  }));

  return {
    fighterA,
    fighterB,
    directMatchups,
  };
}

// #45 — Desglose de golpes significativos por zona (cabeza/cuerpo/pierna) y
// posición (a distancia/clinch/suelo), tanto OFENSIVO (lo que conecta) como
// DEFENSIVO (lo que recibe = columnas del rival en cada combate).
export async function getFighterStrikeProfile(
  id: number,
): Promise<FighterStrikeProfile> {
  const [offenseRows, defenseRows] = await Promise.all([
    sql<StrikeBreakdownRow>(
      `select ${strikeBreakdownSelect("")}
       from fight_stats
       where fighter_id = $1`,
      [id],
    ),
    sql<StrikeBreakdownRow>(
      `select ${strikeBreakdownSelect("opp.")}
       from fight_stats me
       join fight_stats opp
         on opp.fight_id = me.fight_id
        and opp.fighter_id <> me.fighter_id
       where me.fighter_id = $1`,
      [id],
    ),
  ]);

  return {
    offense: mapStrikeBreakdown(offenseRows[0]),
    defense: mapStrikeBreakdown(defenseRows[0]),
  };
}
