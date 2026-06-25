import { sql } from "@/lib/db";
import type {
  DirectMatchupFight,
  FighterAggregateStats,
  FighterComparisonDetail,
  FighterComparisonProfile,
  FighterComparisonAverages,
  FighterCardData,
  FighterDefenseStats,
  FighterDetail,
  FighterFilters,
  FighterHistoryItem,
  FighterListResult,
  FighterRanking,
  FighterRateStats,
  FighterStrikeBreakdown,
  FighterStrikeProfile,
  FighterUpcomingBout,
  FighterWinMethods,
  StrikeZoneStat,
  NewsArticle,
  FighterSearchResult,
  HomeStats,
} from "@/lib/types";

type CountRow = {
  fighters: string;
  events: string;
  fights: string;
  fight_stats: string;
};

type FighterRow = {
  id: number;
  name: string;
  nickname: string | null;
  headshot_url: string | null;
  nationality: string | null;
  birth_date: string | null;
  height_cm: string | null;
  reach_cm: string | null;
  stance: string | null;
  weight_grams: number | null;
  wins: number;
  losses: number;
  draws: number;
  updated_at: string | null;
  fight_count?: string;
  latest_weight_class?: string | null;
};

type HistoryRow = {
  fight_id: number;
  event_id: number | null;
  event_name: string | null;
  event_date: string | null;
  opponent_id: number | null;
  opponent_name: string | null;
  corner: "red" | "blue";
  result: "win" | "loss" | "draw" | "nc";
  method: string | null;
  end_round: number | null;
  end_time: string | null;
  weight_class: string | null;
};

type AggregateRow = {
  sig_strikes_landed: string | null;
  sig_strikes_attempted: string | null;
  takedowns_landed: string | null;
  takedowns_attempted: string | null;
  submission_attempts: string | null;
  control_time_seconds: string | null;
  knockdowns: string | null;
  total_fight_stats: string | null;
};

type DefenseRow = {
  opp_sig_strikes_landed: string | null;
  opp_sig_strikes_attempted: string | null;
  opp_takedowns_landed: string | null;
  opp_takedowns_attempted: string | null;
};

type WinMethodRow = {
  ko_tko: string | null;
  submission: string | null;
  decision: string | null;
  other: string | null;
};

type FighterRankingRow = {
  division: string;
  rank_position: number;
  is_champion: boolean;
};

type SearchRow = {
  id: number;
  name: string;
  headshot_url: string | null;
  nationality: string | null;
};

type DirectMatchupRow = {
  fight_id: number;
  event_name: string | null;
  event_date: string | null;
  winner_id: number | null;
  method: string | null;
  end_round: number | null;
  end_time: string | null;
  weight_class: string | null;
};

type NewsRow = {
  id: number;
  headline: string;
  summary: string | null;
  source: string | null;
  url: string;
  published_at: string | null;
  fighter_id: number | null;
  fighter_name: string | null;
  category: string | null;
  relevance: string | null;
  image_url: string | null;
};

function mapFighter(row: FighterRow): FighterCardData {
  return {
    id: row.id,
    name: row.name,
    nickname: row.nickname,
    headshotUrl: row.headshot_url,
    nationality: row.nationality,
    birthDate: row.birth_date,
    heightCm: row.height_cm ? Number(row.height_cm) : null,
    reachCm: row.reach_cm ? Number(row.reach_cm) : null,
    stance: row.stance,
    weightGrams: row.weight_grams,
    wins: row.wins,
    losses: row.losses,
    draws: row.draws,
    updatedAt: row.updated_at,
    fightCount: Number(row.fight_count ?? 0),
    latestWeightClass: row.latest_weight_class ?? null,
  };
}

function mapAggregate(row?: AggregateRow): FighterAggregateStats {
  const sigStrikesLanded = Number(row?.sig_strikes_landed ?? 0);
  const sigStrikesAttempted = Number(row?.sig_strikes_attempted ?? 0);
  const takedownsLanded = Number(row?.takedowns_landed ?? 0);
  const takedownsAttempted = Number(row?.takedowns_attempted ?? 0);

  return {
    sigStrikesLanded,
    sigStrikesAttempted,
    sigStrikeAccuracy:
      sigStrikesAttempted > 0 ? sigStrikesLanded / sigStrikesAttempted : 0,
    takedownsLanded,
    takedownsAttempted,
    takedownAccuracy:
      takedownsAttempted > 0 ? takedownsLanded / takedownsAttempted : 0,
    submissionAttempts: Number(row?.submission_attempts ?? 0),
    controlTimeSeconds: Number(row?.control_time_seconds ?? 0),
    knockdowns: Number(row?.knockdowns ?? 0),
    totalFightStats: Number(row?.total_fight_stats ?? 0),
  };
}

function mapComparisonAggregate(row?: AggregateRow): FighterComparisonAverages {
  const totals = mapAggregate(row);
  const fightCount = Math.max(1, totals.totalFightStats);

  return {
    sigStrikesLandedPerFight: totals.sigStrikesLanded / fightCount,
    sigStrikeAccuracy: totals.sigStrikeAccuracy,
    knockdownsPerFight: totals.knockdowns / fightCount,
    takedownsLandedPerFight: totals.takedownsLanded / fightCount,
    takedownAccuracy: totals.takedownAccuracy,
    submissionAttemptsPerFight: totals.submissionAttempts / fightCount,
    controlTimePerFightSeconds: totals.controlTimeSeconds / fightCount,
    totalFightStats: totals.totalFightStats,
  };
}

function mapDefense(row?: DefenseRow): FighterDefenseStats {
  const oppSigLanded = Number(row?.opp_sig_strikes_landed ?? 0);
  const oppSigAtt = Number(row?.opp_sig_strikes_attempted ?? 0);
  const oppTdLanded = Number(row?.opp_takedowns_landed ?? 0);
  const oppTdAtt = Number(row?.opp_takedowns_attempted ?? 0);

  return {
    strikingDefense: oppSigAtt > 0 ? 1 - oppSigLanded / oppSigAtt : 0,
    takedownDefense: oppTdAtt > 0 ? 1 - oppTdLanded / oppTdAtt : 0,
    oppSigStrikesLanded: oppSigLanded,
    oppSigStrikesAttempted: oppSigAtt,
    oppTakedownsLanded: oppTdLanded,
    oppTakedownsAttempted: oppTdAtt,
  };
}

function mapWinMethods(row?: WinMethodRow): FighterWinMethods {
  const koTko = Number(row?.ko_tko ?? 0);
  const submission = Number(row?.submission ?? 0);
  const decision = Number(row?.decision ?? 0);
  const other = Number(row?.other ?? 0);

  return {
    koTko,
    submission,
    decision,
    other,
    total: koTko + submission + decision + other,
  };
}

function mapNewsArticle(row: NewsRow): NewsArticle {
  return {
    id: row.id,
    headline: row.headline,
    summary: row.summary,
    source: row.source,
    url: row.url,
    publishedAt: row.published_at,
    fighterId: row.fighter_id,
    fighterName: row.fighter_name,
    category: row.category,
    relevance: row.relevance ? Number(row.relevance) : null,
    imageUrl: row.image_url,
  };
}

export async function getHomeStats(): Promise<HomeStats> {
  const [row] = await sql<CountRow>(
    `select
      (select count(*) from fighters) as fighters,
      (select count(*) from events) as events,
      (select count(*) from fights) as fights,
      (select count(*) from fight_stats) as fight_stats`,
  );

  return {
    fighters: Number(row.fighters),
    events: Number(row.events),
    fights: Number(row.fights),
    fightStats: Number(row.fight_stats),
  };
}

export async function getFeaturedFighters(
  limit = 6,
): Promise<FighterCardData[]> {
  const latestWeightClass = `(
        select fi2.weight_class
        from fights fi2
        where fi2.fighter_red_id = f.id or fi2.fighter_blue_id = f.id
        order by fi2.updated_at desc nulls last, fi2.id desc
        limit 1
      ) as latest_weight_class`;

  // Destacados = los mejores libra por libra (hombres) del último ranking oficial.
  let rows = await sql<FighterRow>(
    `with latest as (select max(snapshot_date) as d from rankings)
    select
      f.*,
      count(fi.id)::text as fight_count,
      ${latestWeightClass}
    from rankings r
    join fighters f on f.id = r.fighter_id
    left join fights fi on fi.fighter_red_id = f.id or fi.fighter_blue_id = f.id
    where r.snapshot_date = (select d from latest)
      and r.division = 'mens_pound_for_pound'
      and r.rank_position between 1 and $1
    group by f.id, r.rank_position
    order by r.rank_position`,
    [limit],
  );

  // Fallback si la tabla rankings aún no está poblada: por nº de peleas históricas.
  if (rows.length === 0) {
    rows = await sql<FighterRow>(
      `select
        f.*,
        count(fi.id)::text as fight_count,
        ${latestWeightClass}
      from fighters f
      left join fights fi on fi.fighter_red_id = f.id or fi.fighter_blue_id = f.id
      group by f.id
      order by count(fi.id) desc, f.updated_at desc nulls last, f.id desc
      limit $1`,
      [limit],
    );
  }

  return rows.map(mapFighter);
}

export async function getFighters(
  filters: FighterFilters = {},
): Promise<FighterListResult> {
  const page = Math.max(1, filters.page ?? 1);
  const pageSize = Math.min(24, Math.max(1, filters.pageSize ?? 12));
  const query = filters.query?.trim() ?? "";
  const sort = filters.sort ?? "relevance";
  const values: unknown[] = [];
  const conditions: string[] = [];

  if (query) {
    values.push(`%${query}%`);
    conditions.push(`f.name ilike $${values.length}`);
  }

  if (filters.stance) {
    values.push(filters.stance);
    conditions.push(`f.stance = $${values.length}`);
  }

  if (filters.nationality) {
    values.push(filters.nationality);
    conditions.push(`f.nationality = $${values.length}`);
  }

  if (filters.weightClass) {
    values.push(filters.weightClass);
    conditions.push(`exists (
      select 1 from fights fi
      where (fi.fighter_red_id = f.id or fi.fighter_blue_id = f.id)
      and fi.weight_class = $${values.length}
    )`);
  }

  const whereClause = conditions.length ? `where ${conditions.join(" and ")}` : "";
  // Relevancia (default): rankeados primero (campeón=0, contendiente por posición),
  // luego por nº de peleas (leyendas/veteranos), y nombre como desempate.
  const relevanceOrder =
    "rel.best_rank asc nulls last, coalesce(fc.n, 0) desc, f.name asc";
  const orderBy =
    sort === "wins"
      ? "f.wins desc, f.losses asc, f.name asc"
      : sort === "losses"
        ? "f.losses desc, f.wins desc, f.name asc"
        : sort === "name"
          ? "f.name asc"
          : relevanceOrder;

  const countRows = await sql<{ total: string }>(
    `select count(*)::text as total
     from fighters f
     ${whereClause}`,
    values,
  );

  const total = Number(countRows[0]?.total ?? 0);
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const safePage = Math.min(page, totalPages);
  const offset = (safePage - 1) * pageSize;

  values.push(pageSize, offset);

  const fighters = await sql<FighterRow>(
    `with latest as (select max(snapshot_date) as d from rankings),
    rel as (
      select fighter_id,
             min(case when is_champion then 0 else rank_position end) as best_rank
      from rankings
      where snapshot_date = (select d from latest)
      group by fighter_id
    ),
    fight_counts as (
      select fighter_id, count(*) as n
      from (
        select fighter_red_id as fighter_id from fights where fighter_red_id is not null
        union all
        select fighter_blue_id as fighter_id from fights where fighter_blue_id is not null
      ) s
      group by fighter_id
    )
    select
      f.*,
      coalesce(fc.n, 0)::text as fight_count,
      (
        select fi2.weight_class
        from fights fi2
        where fi2.fighter_red_id = f.id or fi2.fighter_blue_id = f.id
        order by fi2.updated_at desc nulls last, fi2.id desc
        limit 1
      ) as latest_weight_class
    from fighters f
    left join rel on rel.fighter_id = f.id
    left join fight_counts fc on fc.fighter_id = f.id
    ${whereClause}
    order by ${orderBy}
    limit $${values.length - 1} offset $${values.length}`,
    values,
  );

  const [weightClasses, stances, nationalities] = await Promise.all([
    sql<{ weight_class: string }>(
      `select distinct weight_class
       from fights
       where weight_class is not null
       order by weight_class asc`,
    ),
    sql<{ stance: string }>(
      `select distinct stance
       from fighters
       where stance is not null
       order by stance asc`,
    ),
    sql<{ nationality: string }>(
      `select distinct nationality
       from fighters
       where nationality is not null
       order by nationality asc`,
    ),
  ]);

  return {
    fighters: fighters.map(mapFighter),
    total,
    page: safePage,
    pageSize,
    totalPages,
    filterOptions: {
      weightClasses: weightClasses.map((row) => row.weight_class),
      stances: stances.map((row) => row.stance),
      nationalities: nationalities.map((row) => row.nationality),
    },
  };
}

export async function getFighterDetail(id: number): Promise<FighterDetail | null> {
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
        fi.weight_class
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
}

export async function searchFighters(
  query: string,
  limit = 10,
): Promise<FighterSearchResult[]> {
  const trimmedQuery = query.trim();

  if (!trimmedQuery) {
    return [];
  }

  const rows = await sql<SearchRow>(
    `select distinct on (lower(name))
        id,
        name,
        headshot_url,
        nationality
     from fighters
     where name ilike $1
     order by
       lower(name),
       case when headshot_url is not null then 0 else 1 end,
       case when lower(name) = lower($2) then 0 else 1 end,
       case when lower(name) like lower($3) then 0 else 1 end,
       id asc
     limit $4`,
    [`%${trimmedQuery}%`, trimmedQuery, `${trimmedQuery}%`, limit],
  );

  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    headshotUrl: row.headshot_url,
    nationality: row.nationality,
  }));
}

export async function getFighterSearchResultById(
  fighterId: number,
): Promise<FighterSearchResult | null> {
  const rows = await sql<SearchRow>(
    `select
      id,
      name,
      headshot_url,
      nationality
     from fighters
     where id = $1
     limit 1`,
    [fighterId],
  );

  const row = rows[0];

  if (!row) {
    return null;
  }

  return {
    id: row.id,
    name: row.name,
    headshotUrl: row.headshot_url,
    nationality: row.nationality,
  };
}

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

  const aggregateRows = await sql<AggregateRow & { fighter_id: number }>(
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
  );

  const directMatchupRows = await sql<DirectMatchupRow>(
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
  );

  const aggregateMap = new Map(
    aggregateRows.map((row) => [row.fighter_id, mapComparisonAggregate(row)]),
  );

  const profileMap = new Map<number, FighterComparisonProfile>(
    fighterRows.map((row) => [
      row.id,
      {
        ...mapFighter(row),
        aggregateStats: aggregateMap.get(row.id) ?? mapComparisonAggregate(),
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

type StrikeBreakdownRow = {
  head_landed: string | null;
  head_attempted: string | null;
  body_landed: string | null;
  body_attempted: string | null;
  leg_landed: string | null;
  leg_attempted: string | null;
  distance_landed: string | null;
  distance_attempted: string | null;
  clinch_landed: string | null;
  clinch_attempted: string | null;
  ground_landed: string | null;
  ground_attempted: string | null;
};

type UpcomingBoutRow = {
  fight_id: number;
  event_id: number | null;
  event_name: string | null;
  event_date: string | null;
  opponent_id: number | null;
  opponent_name: string | null;
  opponent_headshot: string | null;
  opponent_wins: number | null;
  opponent_losses: number | null;
  opponent_draws: number | null;
  corner: "red" | "blue";
};

function zoneStat(
  landed: string | null | undefined,
  attempted: string | null | undefined,
): StrikeZoneStat {
  return { landed: Number(landed ?? 0), attempted: Number(attempted ?? 0) };
}

function mapStrikeBreakdown(row?: StrikeBreakdownRow): FighterStrikeBreakdown {
  const head = zoneStat(row?.head_landed, row?.head_attempted);
  const body = zoneStat(row?.body_landed, row?.body_attempted);
  const leg = zoneStat(row?.leg_landed, row?.leg_attempted);

  return {
    head,
    body,
    leg,
    distance: zoneStat(row?.distance_landed, row?.distance_attempted),
    clinch: zoneStat(row?.clinch_landed, row?.clinch_attempted),
    ground: zoneStat(row?.ground_landed, row?.ground_attempted),
    // head+body+leg == golpes significativos conectados (invariante de la BD).
    totalLanded: head.landed + body.landed + leg.landed,
  };
}

// Columnas de golpes por zona/posición con COALESCE(SUM(...),0): peleas antiguas
// pueden tener NULL. `prefix` permite reutilizar el bloque para el rival (opp.).
function strikeBreakdownSelect(prefix: string): string {
  const col = (name: string) => `coalesce(sum(${prefix}${name}), 0)::text`;
  return `
    ${col("sig_str_head_landed")} as head_landed,
    ${col("sig_str_head_attempted")} as head_attempted,
    ${col("sig_str_body_landed")} as body_landed,
    ${col("sig_str_body_attempted")} as body_attempted,
    ${col("sig_str_leg_landed")} as leg_landed,
    ${col("sig_str_leg_attempted")} as leg_attempted,
    ${col("sig_str_distance_landed")} as distance_landed,
    ${col("sig_str_distance_attempted")} as distance_attempted,
    ${col("sig_str_clinch_landed")} as clinch_landed,
    ${col("sig_str_clinch_attempted")} as clinch_attempted,
    ${col("sig_str_ground_landed")} as ground_landed,
    ${col("sig_str_ground_attempted")} as ground_attempted`;
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

// #48 — Próximos combates del luchador (eventos 'upcoming' aún no celebrados).
export async function getFighterUpcomingBouts(
  id: number,
): Promise<FighterUpcomingBout[]> {
  const rows = await sql<UpcomingBoutRow>(
    `select
      fi.id as fight_id,
      fi.event_id,
      e.name as event_name,
      e.event_date::text as event_date,
      case
        when fi.fighter_red_id = $1 then fi.fighter_blue_id
        else fi.fighter_red_id
      end as opponent_id,
      case
        when fi.fighter_red_id = $1 then coalesce(blue.name, fi.fighter_blue_name)
        else coalesce(red.name, fi.fighter_red_name)
      end as opponent_name,
      case
        when fi.fighter_red_id = $1 then blue.headshot_url
        else red.headshot_url
      end as opponent_headshot,
      case when fi.fighter_red_id = $1 then blue.wins else red.wins end as opponent_wins,
      case when fi.fighter_red_id = $1 then blue.losses else red.losses end as opponent_losses,
      case when fi.fighter_red_id = $1 then blue.draws else red.draws end as opponent_draws,
      case when fi.fighter_red_id = $1 then 'red' else 'blue' end as corner
    from fights fi
    left join events e on e.id = fi.event_id
    left join fighters red on red.id = fi.fighter_red_id
    left join fighters blue on blue.id = fi.fighter_blue_id
    where (fi.fighter_red_id = $1 or fi.fighter_blue_id = $1)
      and e.status = 'upcoming'
      and (e.event_date >= current_date or e.event_date is null)
    order by e.event_date asc nulls last, fi.id asc`,
    [id],
  );

  return rows.map((row) => ({
    fightId: row.fight_id,
    eventId: row.event_id,
    eventName: row.event_name,
    eventDate: row.event_date,
    opponentId: row.opponent_id,
    opponentName: row.opponent_name,
    opponentHeadshotUrl: row.opponent_headshot,
    opponentWins: row.opponent_wins,
    opponentLosses: row.opponent_losses,
    opponentDraws: row.opponent_draws,
    corner: row.corner,
  }));
}