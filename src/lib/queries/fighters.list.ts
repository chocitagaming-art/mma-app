import { unstable_cache } from "next/cache";

import { sql } from "@/lib/db";
import type {
  FighterCardData,
  FighterFilters,
  FighterListResult,
  FighterSearchResult,
  FighterUpcomingBout,
  HomeStats,
} from "@/lib/types";
import type {
  CountRow,
  FighterFilterOptions,
  FighterRow,
  SearchRow,
  UpcomingBoutRow,
} from "./fighters.types";
import { mapFighter } from "./fighters.mappers";

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

// Las opciones del filtro (categorías de peso, guardias, nacionalidades) sólo
// cambian cuando la ingesta diaria añade luchadores/peleas nuevos. En vez de
// recalcular tres SELECT DISTINCT sobre todo el dataset en cada request (#32),
// las cacheamos una hora. No afecta a los resultados de la lista.
const getFighterFilterOptions = unstable_cache(
  async (): Promise<FighterFilterOptions> => {
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
      weightClasses: weightClasses.map((row) => row.weight_class),
      stances: stances.map((row) => row.stance),
      nationalities: nationalities.map((row) => row.nationality),
    };
  },
  ["fighter-filter-options"],
  { revalidate: 3600, tags: ["fighter-filter-options"] },
);

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

  const filterOptions = await getFighterFilterOptions();

  return {
    fighters: fighters.map(mapFighter),
    total,
    page: safePage,
    pageSize,
    totalPages,
    filterOptions,
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
