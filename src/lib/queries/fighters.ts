import { sql } from "@/lib/db";
import type {
  DirectMatchupFight,
  FighterAggregateStats,
  FighterComparisonDetail,
  FighterComparisonProfile,
  FighterComparisonAverages,
  FighterCardData,
  FighterDetail,
  FighterFilters,
  FighterHistoryItem,
  FighterListResult,
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

type SearchRow = {
  id: number;
  name: string;
  nickname: string | null;
  wins: number;
  losses: number;
  draws: number;
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

function mapFighter(row: FighterRow): FighterCardData {
  return {
    id: row.id,
    name: row.name,
    nickname: row.nickname,
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
  const rows = await sql<FighterRow>(
    `select
      f.*,
      count(fi.id)::text as fight_count,
      (
        select fi2.weight_class
        from fights fi2
        where fi2.fighter_red_id = f.id or fi2.fighter_blue_id = f.id
        order by fi2.updated_at desc nulls last, fi2.id desc
        limit 1
      ) as latest_weight_class
    from fighters f
    left join fights fi on fi.fighter_red_id = f.id or fi.fighter_blue_id = f.id
    group by f.id
    order by count(fi.id) desc, f.updated_at desc nulls last, f.id desc
    limit $1`,
    [limit],
  );

  return rows.map(mapFighter);
}

export async function getFighters(
  filters: FighterFilters = {},
): Promise<FighterListResult> {
  const page = Math.max(1, filters.page ?? 1);
  const pageSize = Math.min(24, Math.max(1, filters.pageSize ?? 12));
  const query = filters.query?.trim() ?? "";
  const sort = filters.sort ?? "name";
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
  const orderBy =
    sort === "wins"
      ? "f.wins desc, f.losses asc, f.name asc"
      : sort === "losses"
        ? "f.losses desc, f.wins desc, f.name asc"
        : "f.name asc";

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

  const [historyRows, aggregateRows] = await Promise.all([
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

  return {
    fighter: mapFighter(fighterRow),
    latestWeightClass: fighterRow.latest_weight_class ?? null,
    fightCount: Number(fighterRow.fight_count ?? 0),
    history,
    aggregateStats: mapAggregate(aggregateRows[0]),
  };
}

export async function searchFighters(
  query: string,
  limit = 8,
): Promise<FighterSearchResult[]> {
  const trimmedQuery = query.trim();

  if (!trimmedQuery) {
    return [];
  }

  const rows = await sql<SearchRow>(
    `select id, name, nickname, wins, losses, draws
     from fighters
     where name ilike $1
     order by
       case when lower(name) = lower($2) then 0 else 1 end,
       case when lower(name) like lower($3) then 0 else 1 end,
       wins desc,
       name asc
     limit $4`,
    [`%${trimmedQuery}%`, trimmedQuery, `${trimmedQuery}%`, limit],
  );

  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    nickname: row.nickname,
    wins: row.wins,
    losses: row.losses,
    draws: row.draws,
  }));
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