import { unstable_cache } from "next/cache";
import { cache } from "react";

import { sql } from "@/lib/db";
import { fightResultCaseSql, noContestSqlPredicate } from "@/lib/fight-result";
import { containsPattern } from "@/lib/sql-like";
import type {
  DirectMatchupFight,
  FighterComparisonDetail,
  FighterComparisonProfile,
  FighterDetail,
  FighterHistoryItem,
  FighterRanking,
  FighterRateStats,
  FighterStrikeProfile,
  FighterUfcRecord,
} from "@/lib/types";
import type {
  AggregateRow,
  DefenseRow,
  DirectMatchupRow,
  EspnHistoryRow,
  FighterRankingRow,
  FighterRow,
  HistoryRow,
  NewsRow,
  StrikeBreakdownRow,
  WinMethodRow,
} from "./fighters.types";
import {
  computeControlShare,
  mapAggregate,
  mapComparisonAggregate,
  mapDefense,
  mapFighter,
  mapFighterFacts,
  mapFighterQa,
  mapNewsArticle,
  mapStrikeBreakdown,
  mapWinMethods,
  strikeBreakdownSelect,
} from "./fighters.mappers";

// Totales del luchador SOLO en peleas con duración conocida (FE4). Locales a
// este módulo: ninguna otra query los consume.
type PerMinuteRow = {
  total_seconds: string | null;
  // Numerador de la cuota de control, tomado DENTRO de esta misma muestra: la
  // suma global de fighter_stats no lleva ni el filtro de era ni el de duración
  // calculable que sí lleva total_seconds (ver computeControlShare).
  control_time_seconds: string | null;
  sig_strikes_landed: string | null;
  opp_sig_strikes_landed: string | null;
  takedowns_landed: string | null;
  submission_attempts: string | null;
  timed_fights: string | null;
};

// Récord W-L-D derivado de la tabla fights (BE9a). Local a este módulo.
type UfcRecordRow = {
  wins: string | null;
  losses: string | null;
  draws: string | null;
};

async function getFighterDetailUncached(
  id: number,
): Promise<FighterDetail | null> {
  const fighterRows = await sql<FighterRow>(
    `select
      f.*,
      -- BE5: DATE llega como Date de JS vía f.*; el alias ::text (posterior en
      -- la lista, pisa al de f.*) fija el ISO "YYYY-MM-DD" que espera la UI.
      f.octagon_debut::text as octagon_debut,
      (
        select count(*)::text
        from fights fi
        where (fi.fighter_red_id = f.id or fi.fighter_blue_id = f.id)
          and fi.status is distinct from 'cancelled'
      ) as fight_count,
      (
        select fi2.weight_class
        from fights fi2
        where (fi2.fighter_red_id = f.id or fi2.fighter_blue_id = f.id)
          and fi2.status is distinct from 'cancelled'
          and fi2.weight_class is not null
        -- catch/open weight no es división real (misma semántica que
        -- division-history.ts): solo gana si el luchador no tiene otra
        order by (fi2.weight_class ~* '(catch|open)\\s*weight') asc,
          fi2.updated_at desc nulls last, fi2.id desc
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
    perMinuteRows,
    ufcRecordRows,
    espnHistoryRows,
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
          when fi.fighter_red_id = $1 then blue.headshot_url
          else red.headshot_url
        end as opponent_headshot,
        case
          when fi.fighter_red_id = $1 then 'red'
          else 'blue'
        end as corner,
        ${fightResultCaseSql("$1")} as result,
        fi.method,
        fi.end_round,
        fi.end_time,
        fi.weight_class,
        fi.video_url,
        fi.is_title_fight
      from fights fi
      left join events e on e.id = fi.event_id
      left join fighters red on red.id = fi.fighter_red_id
      left join fighters blue on blue.id = fi.fighter_blue_id
      where (fi.fighter_red_id = $1 or fi.fighter_blue_id = $1)
        -- Solo combates YA disputados: winner y method ambos NULL = bout
        -- programado, que saldría como "Empate" fantasma en el historial.
        -- Los programados ya se muestran en la tarjeta "Próximo combate"
        -- (getFighterUpcomingBouts), no aquí.
        and not (fi.winner_id is null and fi.method is null)
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
        count(*)::text as total_fight_stats,
        count(control_time_seconds)::text as fights_with_control
      from fight_stats
      where fighter_id = $1`,
      [id],
    ),
    // Noticias del luchador: además del enlace directo (news.fighter_id apunta
    // a UN solo luchador por noticia), incluimos artículos que mencionan su
    // NOMBRE COMPLETO en titular o resumen (parametrizado y con escape LIKE;
    // el nombre completo minimiza homónimos frente a buscar solo el apellido).
    // El OR no multiplica filas (el join a fighters es 1:1), así que cada
    // noticia sale una única vez aunque cumpla ambas condiciones.
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
        or n.headline ilike $2
        or n.summary ilike $2
      order by n.published_at desc nulls last, n.relevance desc nulls last, n.id desc`,
      [id, containsPattern(fighterRow.name)],
    ),
    // Defensa: lo que el RIVAL intentó contra este luchador (su fila en el mismo combate).
    sql<DefenseRow>(
      `select
        sum(opp.sig_strikes_landed)::text as opp_sig_strikes_landed,
        sum(opp.sig_strikes_attempted)::text as opp_sig_strikes_attempted,
        sum(opp.takedowns_landed)::text as opp_takedowns_landed,
        sum(opp.takedowns_attempted)::text as opp_takedowns_attempted,
        -- 🪤 Los combates ANULADOS quedan fuera del denominador. Al anularse,
        -- el método se reescribe a 'Overturned - <técnica>' y el ganador pasa a
        -- NULL, así que la sumisión deja de contar arriba mientras su intento
        -- seguía contando abajo: una sumisión encajada se convertía en un
        -- intento "superado". Pasaba en 8 fichas, todas por encima del umbral
        -- (Dalby publicaba 100 % con una estrangulación en su propia tabla).
        -- Fuera del numerador y fuera del denominador: los no contest no
        -- cuentan, igual que en el récord W-L-D.
        (sum(opp.submission_attempts) filter (
          where not ${noContestSqlPredicate()}
        ))::text as opp_submission_attempts,
        -- Sumisiones consumadas: no hay columna, se derivan del método. El
        -- join a fights no multiplica filas (una por combate en \`me\`).
        (count(*) filter (
          where fi.winner_id is not null
            and fi.winner_id <> $1
            and fi.method ilike 'sub%'
        ))::text as submissions_lost
      from fight_stats me
      join fight_stats opp
        on opp.fight_id = me.fight_id
       and opp.fighter_id <> me.fighter_id
      join fights fi
        on fi.id = me.fight_id
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
    // Métricas POR MINUTO (FE4). Duración real = (end_round-1)*300 + M:SS del
    // asalto final. Solo peleas con end_round/end_time válidos Y con fila en
    // fight_stats para este luchador (inner join): así numerador (golpes,
    // derribos...) y denominador (minutos) salen de las MISMAS peleas.
    // Absorbidos = conectados por el rival en esas peleas (mismo patrón
    // me/opp que la query de defensa de arriba). Se excluye la era pre-2001
    // (asaltos de duración no estándar + overtimes de 3:00: la fórmula
    // infla el SLpM de los pioneros — Shamrock salía con SLpM x2).
    sql<PerMinuteRow>(
      `select
        sum(
          (fi.end_round - 1) * 300
          + split_part(fi.end_time, ':', 1)::int * 60
          + split_part(fi.end_time, ':', 2)::int
        )::text as total_seconds,
        sum(me.control_time_seconds)::text as control_time_seconds,
        sum(me.sig_strikes_landed)::text as sig_strikes_landed,
        sum(opp.sig_strikes_landed)::text as opp_sig_strikes_landed,
        sum(me.takedowns_landed)::text as takedowns_landed,
        sum(me.submission_attempts)::text as submission_attempts,
        count(*)::text as timed_fights
      from fights fi
      join events e
        on e.id = fi.event_id
       and e.event_date >= '2001-01-01'
      join fight_stats me
        on me.fight_id = fi.id
       and me.fighter_id = $1
      left join fight_stats opp
        on opp.fight_id = fi.id
       and opp.fighter_id <> $1
      where fi.end_round >= 1
        and fi.end_time ~ '^[0-9]+:[0-9]{2}$'`,
      [id],
    ),
    // Récord UFC (BE9a): W-L-D contando SOLO combates registrados en la BD ya
    // disputados. Empate = winner_id NULL con method registrado, EXCLUYENDO
    // los No Contest, que comparten esa firma pero no son empates (92 peleas
    // el 9-ago-2026: Aspinall-Gane, Oliveira-Lentz...). Los NC no cuentan como
    // W, L ni D, igual que el récord oficial. winner y method ambos NULL =
    // combate programado (excluido, evita el "empate fantasma").
    //
    // El criterio sale de fight-result.ts, el mismo que rotula la tabla del
    // historial. Antes estaba escrito aquí por separado y AÑADÍA 'Other' a los
    // no contest: sus dos únicas filas son Gracie-Shamrock (UFC 5) y
    // Taktarov-Shamrock (UFC 7), los empates por límite de tiempo de 1995, así
    // que el récord de esos tres se quedaba un empate corto.
    //
    // 🪤 Y el predicado va en LOS TRES contadores, no solo en los empates. Un
    // no contest CON ganador no existe hoy (0 filas), pero es el estado natural
    // de una pelea que se anula DESPUÉS: `upsert_fight` conserva el winner_id
    // viejo cuando ufcstats pasa a servir NC/NC, y el método sí se pisa. Con el
    // predicado solo en los empates, esa fila rotularía "Sin resultado" en la
    // tabla y contaría como victoria en el récord de la misma pantalla — la
    // contradicción exacta que este arreglo vino a quitar.
    sql<UfcRecordRow>(
      `select
        (count(*) filter (
          where fi.winner_id = $1 and not ${noContestSqlPredicate()}
        ))::text as wins,
        (count(*) filter (
          where fi.winner_id is not null and fi.winner_id <> $1
            and not ${noContestSqlPredicate()}
        ))::text as losses,
        (count(*) filter (
          where fi.winner_id is null and fi.method is not null
            and not ${noContestSqlPredicate()}
        ))::text as draws
      from fights fi
      where (fi.fighter_red_id = $1 or fi.fighter_blue_id = $1)
        and not (fi.winner_id is null and fi.method is null)`,
      [id],
    ),
    // S3-G: historial no-UFC importado de ESPN (tabla aparte, migración 016).
    // Solo alimenta la TABLA del historial; ninguna stat se calcula sobre él.
    sql<EspnHistoryRow>(
      `select
        h.id,
        h.promotion,
        h.event_name,
        h.event_date,
        h.opponent_name,
        h.opponent_fighter_id,
        h.result,
        h.method,
        h.end_round,
        h.end_time,
        h.is_title_fight
      from fight_history_espn h
      where h.fighter_id = $1
      order by h.event_date desc nulls last, h.id desc`,
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
    opponentHeadshotUrl: row.opponent_headshot,
    corner: row.corner,
    result: row.result,
    method: row.method,
    endRound: row.end_round,
    endTime: row.end_time,
    weightClass: row.weight_class,
    videoUrl: row.video_url,
    isTitleFight: row.is_title_fight,
  }));

  // S3-G: filas espn -> misma forma que el historial UFC. Sin eventId (los
  // eventos no-UFC no existen en `events`, el nombre se pinta sin link), sin
  // esquina ni weight_class (ESPN no los da en el eventsMap), y con
  // origin/promotion para el badge. El método ya llega en el formato
  // canónico de ufcstats (lo normaliza la ingesta), así formatMethod lo
  // traduce igual que el resto.
  const espnHistory: FighterHistoryItem[] = espnHistoryRows.map((row) => ({
    fightId: row.id,
    eventId: null,
    eventName: row.event_name,
    eventDate: row.event_date,
    opponentId: row.opponent_fighter_id,
    opponentName: row.opponent_name,
    opponentHeadshotUrl: null,
    result: row.result,
    method: row.method,
    endRound: row.end_round,
    endTime: row.end_time,
    weightClass: null,
    videoUrl: null,
    origin: "espn" as const,
    promotion: row.promotion,
    isTitleFight: row.is_title_fight,
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
  // Tasas por minuto (FE4): totales y segundos salen de la MISMA muestra de
  // peleas (las que tienen duración conocida), así que dividir es legítimo.
  const perMinuteRow = perMinuteRows[0];
  const totalSeconds = Number(perMinuteRow?.total_seconds ?? 0);
  const timedFights = Number(perMinuteRow?.timed_fights ?? 0);
  const totalMinutes = totalSeconds / 60;
  const perMinute = (total: string | null | undefined) =>
    totalMinutes > 0 ? Number(total ?? 0) / totalMinutes : 0;
  const per15Min = (total: string | null | undefined) =>
    totalSeconds > 0 ? (Number(total ?? 0) * 900) / totalSeconds : 0;
  const rateStats: FighterRateStats = {
    sigStrikesLandedPerFight: aggregateStats.sigStrikesLanded / denom,
    sigStrikesAbsorbedPerFight: defenseStats.oppSigStrikesLanded / denom,
    fightStatsCount: aggregateStats.totalFightStats,
    slpm: perMinute(perMinuteRow?.sig_strikes_landed),
    sapm: perMinute(perMinuteRow?.opp_sig_strikes_landed),
    takedownsPer15Min: per15Min(perMinuteRow?.takedowns_landed),
    submissionAttemptsPer15Min: per15Min(perMinuteRow?.submission_attempts),
    avgFightSeconds: timedFights > 0 ? totalSeconds / timedFights : 0,
    timedFightsCount: timedFights,
    controlShare: computeControlShare(
      Number(perMinuteRow?.control_time_seconds ?? 0),
      totalSeconds,
      timedFights,
      aggregateStats.totalFightStats,
    ),
  };
  const ufcRecordRow = ufcRecordRows[0];
  const ufcRecord: FighterUfcRecord = {
    wins: Number(ufcRecordRow?.wins ?? 0),
    losses: Number(ufcRecordRow?.losses ?? 0),
    draws: Number(ufcRecordRow?.draws ?? 0),
  };

  return {
    fighter: mapFighter(fighterRow),
    latestWeightClass: fighterRow.latest_weight_class ?? null,
    fightCount: Number(fighterRow.fight_count ?? 0),
    history,
    espnHistory,
    aggregateStats,
    news: newsRows.map(mapNewsArticle),
    fighterFacts: mapFighterFacts(fighterRow.fighter_facts),
    fighterQa: mapFighterQa(fighterRow.fighter_qa),
    defenseStats,
    winMethods: mapWinMethods(winMethodRows[0]),
    rateStats,
    ufcRecord,
    ranking,
  };
}

// La ficha de luchador es la ruta más visitada y la más cara: 14 consultas por
// render. Sin unstable_cache cada visita (y cada bot) las mandaba enteras a Neon,
// que es lo que mantenía el compute despierto 24/7 hasta fundir la cuota.
//
// 30 min: los datos de un luchador solo cambian cuando pelea, y la ingesta llama
// a /api/revalidate con el tag "fighters" cuando eso pasa, así que el TTL solo
// cubre el caso de que la revalidación por tag no llegue.
const getFighterDetailCached = unstable_cache(
  getFighterDetailUncached,
  ["fighter-detail"],
  { revalidate: 1800, tags: ["fighters"] },
);

// cache(): la página de detalle ejecuta esta misma query dos veces por request
// (generateMetadata + render). Dedupe intra-request sin cambiar firma ni resultado (#7).
export const getFighterDetail = cache(
  (id: number): Promise<FighterDetail | null> => getFighterDetailCached(id),
);

export async function getFighterComparisonDetail(
  fighterAId: number,
  fighterBId: number,
): Promise<FighterComparisonDetail | null> {
  const fighterRows = await sql<FighterRow>(
    `select
      f.*,
      -- BE5: mismo cast que getFighterDetail para que octagon_debut nunca
      -- llegue como Date de JS a mapFighter.
      f.octagon_debut::text as octagon_debut,
      (
        select count(*)::text
        from fights fi
        where (fi.fighter_red_id = f.id or fi.fighter_blue_id = f.id)
          and fi.status is distinct from 'cancelled'
      ) as fight_count,
      (
        select fi2.weight_class
        from fights fi2
        where (fi2.fighter_red_id = f.id or fi2.fighter_blue_id = f.id)
          and fi2.status is distinct from 'cancelled'
          and fi2.weight_class is not null
        -- catch/open weight no es división real (misma semántica que
        -- division-history.ts): solo gana si el luchador no tiene otra
        order by (fi2.weight_class ~* '(catch|open)\\s*weight') asc,
          fi2.updated_at desc nulls last, fi2.id desc
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
          (
            (fi.fighter_red_id = $1 and fi.fighter_blue_id = $2)
            or
            (fi.fighter_red_id = $2 and fi.fighter_blue_id = $1)
          )
          -- Sin canceladas: winner/method NULL se pintaría como "Combate
          -- programado" eterno en el cara a cara.
          and fi.status is distinct from 'cancelled'
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
