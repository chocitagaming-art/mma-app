import { cache } from "react";

import { sql } from "@/lib/db";
import type {
  EventBout,
  EventDetail,
  EventListItem,
  EventListResult,
  EventSearchResult,
  EventWeighIn,
  LastEventResults,
  NextEventHero,
  NextEventHeroFighter,
  UpcomingEventItem,
} from "@/lib/types";

const PAGE_SIZE = 24;

// SQL: true si el combate ESTELAR del evento `e` (el de MENOR bout_order no
// cancelado) ya está terminado. Espejo de isMainEventFinished() de
// live-event.ts: cuenta como terminado si tiene winner/method O si ESPN marcó
// su fila viva state='post' (esto último cubre empates/NC/decisiones sin
// puntuar, que el pipeline NO escribe en fights hasta el backfill tardío de
// ufcstats — sin esta rama, un estelar en tablas dejaba la web "EN DIRECTO"
// toda la noche). Exige bout_order NOT NULL para no "adivinar" el estelar por id
// cuando la cartelera aún no trae orden (igual que el helper, que salta los
// bout_order NULL). Marca el evento como "terminado" sin esperar al cron de
// status='completed' (que va con retraso). Requiere el alias `e` para events.
export const MAIN_EVENT_FINISHED_SQL = `COALESCE((
  SELECT f.winner_id IS NOT NULL
      OR f.method IS NOT NULL
      OR EXISTS (
           SELECT 1 FROM live_fight_stats lfs
           WHERE lfs.fight_id = f.id AND lfs.state = 'post'
         )
  FROM fights f
  WHERE f.event_id = e.id
    AND f.status IS DISTINCT FROM 'cancelled'
    AND f.bout_order IS NOT NULL
  ORDER BY f.bout_order ASC, f.id ASC
  LIMIT 1
), false)`;

// Algunos pósters de ufc.com vienen como ruta relativa (/s3/files/...). Los absolutizamos
// para que el <img> no los busque en localhost y den 404.
function absolutePoster(url: string | null): string | null {
  return url && url.startsWith("/") ? `https://www.ufc.com${url}` : url;
}

type EventListRow = {
  id: number;
  name: string;
  event_date: string | null;
  location: string | null;
  fight_count: string;
};

// "Pasados" = eventos ya celebrados (event_date < hoy, o sin fecha histórica).
// El filtro por fecha excluye los futuros automáticamente cuando el backend añada upcoming.
// `year` (FE7) restringe a un año concreto; los eventos sin fecha quedan fuera
// del filtro anual porque no tienen año que comparar.
export async function getPastEvents(
  page: number,
  year?: number,
): Promise<EventListResult> {
  const currentPage = Math.max(1, page);
  const offset = (currentPage - 1) * PAGE_SIZE;

  const whereClause =
    year != null
      ? `WHERE e.event_date < CURRENT_DATE
           AND extract(year FROM e.event_date) = $1`
      : `WHERE e.event_date < CURRENT_DATE OR e.event_date IS NULL`;
  const whereParams = year != null ? [year] : [];

  const countRows = await sql<{ total: string }>(
    `SELECT count(*)::text AS total
     FROM events e
     ${whereClause}`,
    whereParams,
  );
  const total = Number(countRows[0]?.total ?? "0");
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const rows = await sql<EventListRow>(
    `SELECT e.id, e.name, e.event_date::text AS event_date, e.location,
            count(f.id)::text AS fight_count
     FROM events e
     -- BE7: las peleas canceladas no cuentan en el "N peleas" del listado.
     LEFT JOIN fights f
       ON f.event_id = e.id AND f.status IS DISTINCT FROM 'cancelled'
     ${whereClause}
     GROUP BY e.id, e.name, e.event_date, e.location
     ORDER BY e.event_date DESC NULLS LAST, e.id DESC
     LIMIT $${whereParams.length + 1} OFFSET $${whereParams.length + 2}`,
    [...whereParams, PAGE_SIZE, offset],
  );

  const events: EventListItem[] = rows.map((row) => ({
    id: row.id,
    name: row.name,
    eventDate: row.event_date,
    location: row.location,
    fightCount: Number(row.fight_count),
  }));

  return { events, total, page: currentPage, totalPages };
}

// FE7: años con eventos ya celebrados (DESC) para el <select> de la vista
// "Pasados". Los eventos sin fecha no aportan año, así que no entran.
export async function getEventYears(): Promise<number[]> {
  const rows = await sql<{ year: number | string }>(
    `SELECT DISTINCT extract(year FROM event_date)::int AS year
     FROM events
     WHERE event_date < CURRENT_DATE
     ORDER BY year DESC`,
  );

  return rows.map((row) => Number(row.year));
}

type EventSearchRow = {
  id: number;
  name: string;
  event_date: string | null;
  location: string | null;
  image_url: string | null;
};

// Búsqueda de eventos por nombre/ubicación para el buscador global.
// Prioriza los más próximos (futuros) y luego los más recientes.
export async function searchEvents(
  query: string,
  limit = 5,
): Promise<EventSearchResult[]> {
  const trimmedQuery = query.trim();

  if (!trimmedQuery) {
    return [];
  }

  const rows = await sql<EventSearchRow>(
    `SELECT e.id, e.name, e.event_date::text AS event_date, e.location, e.image_url
     FROM events e
     WHERE f_unaccent(e.name) ILIKE f_unaccent($1) OR f_unaccent(e.location) ILIKE f_unaccent($1)
     ORDER BY
       CASE WHEN lower(f_unaccent(e.name)) = lower(f_unaccent($2)) THEN 0 ELSE 1 END,
       CASE WHEN lower(f_unaccent(e.name)) LIKE lower(f_unaccent($3)) THEN 0 ELSE 1 END,
       e.event_date DESC NULLS LAST,
       e.id DESC
     LIMIT $4`,
    [`%${trimmedQuery}%`, trimmedQuery, `${trimmedQuery}%`, limit],
  );

  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    eventDate: row.event_date,
    location: row.location,
    imageUrl: absolutePoster(row.image_url),
  }));
}

type UpcomingEventRow = {
  id: number;
  name: string;
  headliner: string | null;
  event_date: string | null;
  start_time: string | null;
  location: string | null;
  image_url: string | null;
  broadcast: string | null;
  ticket_url: string | null;
  tagline: string | null;
  fight_count: string;
};

export async function getUpcomingEvents(): Promise<UpcomingEventItem[]> {
  const rows = await sql<UpcomingEventRow>(
    `SELECT e.id, e.name, e.headliner, e.event_date::text AS event_date,
            e.start_time::text AS start_time, e.location, e.image_url,
            e.broadcast, e.ticket_url, e.tagline,
            count(f.id)::text AS fight_count
     FROM events e
     -- BE7: las canceladas fuera del conteo, igual que en getPastEvents.
     LEFT JOIN fights f
       ON f.event_id = e.id AND f.status IS DISTINCT FROM 'cancelled'
     -- status='upcoming' marca la intención, pero un evento puede quedarse en
     -- 'upcoming' hasta que el scraper lo complete. El guard de fecha lo saca de
     -- "Próximos" en cuanto pasa su día (la lista de "Pasados" lo recoge por fecha).
     WHERE e.status = 'upcoming'
       AND (e.event_date >= CURRENT_DATE OR e.event_date IS NULL)
     GROUP BY e.id, e.name, e.headliner, e.event_date, e.start_time,
              e.location, e.image_url, e.broadcast, e.ticket_url, e.tagline
     ORDER BY e.event_date ASC, e.id ASC`,
  );

  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    headliner: row.headliner,
    eventDate: row.event_date,
    startTime: row.start_time,
    location: row.location,
    imageUrl: absolutePoster(row.image_url),
    broadcast: row.broadcast,
    ticketUrl: row.ticket_url,
    tagline: row.tagline,
    fightCount: Number(row.fight_count),
  }));
}

type EventRow = {
  id: number;
  name: string;
  event_date: string | null;
  location: string | null;
  status: string | null;
  start_time: string | null;
  image_url: string | null;
  broadcast: string | null;
  ticket_url: string | null;
  tagline: string | null;
  headliner: string | null;
  // FE9: procedencia del evento; con source='ufc.com', source_id es el slug.
  source: string | null;
  source_id: string | null;
  // FE5b (migración 011): horarios de los tramos previos al main card.
  early_prelims_time: string | null;
  prelims_time: string | null;
};

// BE3 (migración 010): bonos del evento. FOTN referencia la pelea (fight_id);
// POTN referencia al luchador (fighter_id). La columna contraria queda NULL.
type FightBonusRow = {
  fight_id: number | null;
  fighter_id: number | null;
  bonus_type: string;
};

type BoutRow = {
  fight_id: number;
  weight_class: string | null;
  method: string | null;
  end_round: number | null;
  end_time: string | null;
  scheduled_rounds: number | null;
  winner_id: number | null;
  bout_order: number | null;
  card_segment: string | null;
  // BE7/BE9b (migración 010): NULL o 'cancelled'; boolean de pelea titular.
  status: string | null;
  is_title_fight: boolean | null;
  odds_red: string | null;
  odds_blue: string | null;
  red_fighter_name: string;
  blue_fighter_name: string;
  red_id: number | null;
  red_name: string | null;
  red_nickname: string | null;
  red_headshot: string | null;
  red_nationality: string | null;
  red_wins: number | null;
  red_losses: number | null;
  red_draws: number | null;
  // Ficha física para el mini tale-of-the-tape (FE6). height/reach son numeric
  // en la BD: se seleccionan ::text y se convierten con Number() (como fights.ts).
  red_height_cm: string | null;
  red_reach_cm: string | null;
  red_stance: string | null;
  red_birth_date: string | null;
  blue_id: number | null;
  blue_name: string | null;
  blue_nickname: string | null;
  blue_headshot: string | null;
  blue_nationality: string | null;
  blue_wins: number | null;
  blue_losses: number | null;
  blue_draws: number | null;
  blue_height_cm: string | null;
  blue_reach_cm: string | null;
  blue_stance: string | null;
  blue_birth_date: string | null;
  red_rank: number | null;
  blue_rank: number | null;
};

// Cartelera completa de un evento, ya mapeada a EventBout. Privada del módulo:
// la comparten getEventDetail y getLastEventResults (FE10) para no duplicar la
// query LATERAL de rankings ni el mapeo de esquinas.
//
// LEFT JOIN: los próximos pueden tener luchadores TBD (fighter_red_id/blue_id NULL).
// En esos casos usamos fighter_red_name/fighter_blue_name (siempre rellenos).
// bout_order ordena el cartel (1 = estelar); NULLS LAST para eventos lejanos sin orden.
// Ranking (FE2): LATERAL por esquina contra el ÚLTIMO snapshot de rankings (mismo
// patrón que fighters.detail). Se excluye P4P: queremos la posición en SU división;
// rank_position 0 = campeón, y ORDER BY rank_position elige la mejor si hay varias.
//
// BE7: por defecto EXCLUYE las peleas canceladas (fights.status='cancelled');
// getEventDetail pasa includeCancelled=true para separarlas él mismo y poder
// pintar la sección "Peleas canceladas" en eventos futuros.
async function fetchEventBouts(
  eventId: number,
  includeCancelled = false,
): Promise<EventBout[]> {
  const cancelledFilter = includeCancelled
    ? ""
    : " AND fi.status IS DISTINCT FROM 'cancelled'";
  const boutRows = await sql<BoutRow>(
    `WITH latest_ranking AS (SELECT MAX(snapshot_date) AS d FROM rankings)
     SELECT fi.id AS fight_id, fi.weight_class, fi.method, fi.end_round, fi.end_time,
            fi.scheduled_rounds, fi.winner_id, fi.bout_order, fi.card_segment,
            fi.status, fi.is_title_fight,
            fi.odds_red, fi.odds_blue,
            fi.fighter_red_name AS red_fighter_name,
            fi.fighter_blue_name AS blue_fighter_name,
            red.id AS red_id, red.name AS red_name, red.nickname AS red_nickname,
            red.headshot_url AS red_headshot, red.nationality AS red_nationality,
            red.wins AS red_wins, red.losses AS red_losses, red.draws AS red_draws,
            red.height_cm::text AS red_height_cm, red.reach_cm::text AS red_reach_cm,
            red.stance AS red_stance, red.birth_date::text AS red_birth_date,
            blue.id AS blue_id, blue.name AS blue_name, blue.nickname AS blue_nickname,
            blue.headshot_url AS blue_headshot, blue.nationality AS blue_nationality,
            blue.wins AS blue_wins, blue.losses AS blue_losses, blue.draws AS blue_draws,
            blue.height_cm::text AS blue_height_cm, blue.reach_cm::text AS blue_reach_cm,
            blue.stance AS blue_stance, blue.birth_date::text AS blue_birth_date,
            red_rank.rank_position AS red_rank,
            blue_rank.rank_position AS blue_rank
     FROM fights fi
     LEFT JOIN fighters red ON red.id = fi.fighter_red_id
     LEFT JOIN fighters blue ON blue.id = fi.fighter_blue_id
     LEFT JOIN LATERAL (
       SELECT r.rank_position
       FROM rankings r
       WHERE r.fighter_id = red.id
         AND r.snapshot_date = (SELECT d FROM latest_ranking)
         AND r.division NOT IN ('mens_pound_for_pound', 'womens_pound_for_pound')
       ORDER BY r.rank_position ASC
       LIMIT 1
     ) red_rank ON true
     LEFT JOIN LATERAL (
       SELECT r.rank_position
       FROM rankings r
       WHERE r.fighter_id = blue.id
         AND r.snapshot_date = (SELECT d FROM latest_ranking)
         AND r.division NOT IN ('mens_pound_for_pound', 'womens_pound_for_pound')
       ORDER BY r.rank_position ASC
       LIMIT 1
     ) blue_rank ON true
     WHERE fi.event_id = $1${cancelledFilter}
     ORDER BY fi.bout_order ASC NULLS LAST, fi.id ASC`,
    [eventId],
  );

  return boutRows.map((row) => ({
    fightId: row.fight_id,
    weightClass: row.weight_class,
    method: row.method,
    endRound: row.end_round,
    endTime: row.end_time,
    scheduledRounds: row.scheduled_rounds,
    winnerId: row.winner_id,
    boutOrder: row.bout_order,
    cardSegment: row.card_segment,
    status: row.status,
    isTitleFight: row.is_title_fight ?? false,
    oddsRed: row.odds_red != null ? Number(row.odds_red) : null,
    oddsBlue: row.odds_blue != null ? Number(row.odds_blue) : null,
    red:
      row.red_id != null
        ? {
            id: row.red_id,
            name: row.red_name ?? row.red_fighter_name,
            nickname: row.red_nickname,
            headshotUrl: row.red_headshot,
            nationality: row.red_nationality,
            wins: row.red_wins ?? 0,
            losses: row.red_losses ?? 0,
            draws: row.red_draws ?? 0,
            rank: row.red_rank,
            heightCm: row.red_height_cm ? Number(row.red_height_cm) : null,
            reachCm: row.red_reach_cm ? Number(row.red_reach_cm) : null,
            stance: row.red_stance,
            birthDate: row.red_birth_date,
          }
        : {
            id: null,
            name: row.red_fighter_name,
            nickname: null,
            headshotUrl: null,
            nationality: null,
            wins: 0,
            losses: 0,
            draws: 0,
            rank: null,
            heightCm: null,
            reachCm: null,
            stance: null,
            birthDate: null,
          },
    blue:
      row.blue_id != null
        ? {
            id: row.blue_id,
            name: row.blue_name ?? row.blue_fighter_name,
            nickname: row.blue_nickname,
            headshotUrl: row.blue_headshot,
            nationality: row.blue_nationality,
            wins: row.blue_wins ?? 0,
            losses: row.blue_losses ?? 0,
            draws: row.blue_draws ?? 0,
            rank: row.blue_rank,
            heightCm: row.blue_height_cm ? Number(row.blue_height_cm) : null,
            reachCm: row.blue_reach_cm ? Number(row.blue_reach_cm) : null,
            stance: row.blue_stance,
            birthDate: row.blue_birth_date,
          }
        : {
            id: null,
            name: row.blue_fighter_name,
            nickname: null,
            headshotUrl: null,
            nationality: null,
            wins: 0,
            losses: 0,
            draws: 0,
            rank: null,
            heightCm: null,
            reachCm: null,
            stance: null,
            birthDate: null,
          },
  }));
}

// cache(): la página de detalle ejecuta esta misma query dos veces por request
// (generateMetadata + render). Dedupe intra-request sin cambiar firma ni resultado (#7).
export const getEventDetail = cache(async (
  id: number,
): Promise<EventDetail | null> => {
  const eventRows = await sql<EventRow>(
    `SELECT id, name, event_date::text AS event_date, location,
            status, start_time::text AS start_time, image_url,
            broadcast, ticket_url, tagline, headliner, source, source_id,
            early_prelims_time::text AS early_prelims_time,
            prelims_time::text AS prelims_time
     FROM events WHERE id = $1`,
    [id],
  );
  const event = eventRows[0];
  if (!event) {
    return null;
  }

  // BE7: pedimos TAMBIÉN las canceladas para separarlas en cancelledBouts.
  // BE3: los bonos del evento van en query aparte (una tabla pequeña; el JOIN
  // ensancharía las filas de la query LATERAL para 2-3 matches como mucho).
  const [allBouts, bonusRows] = await Promise.all([
    fetchEventBouts(id, true),
    sql<FightBonusRow>(
      `SELECT fight_id, fighter_id, bonus_type
       FROM fight_bonuses
       WHERE event_id = $1`,
      [id],
    ),
  ]);

  // FOTN premia la pelea; POTN premia al luchador (en cualquiera de sus esquinas).
  const fotnFightIds = new Set(
    bonusRows
      .filter((row) => row.bonus_type === "FOTN" && row.fight_id != null)
      .map((row) => row.fight_id),
  );
  const potnFighterIds = new Set(
    bonusRows
      .filter((row) => row.bonus_type === "POTN" && row.fighter_id != null)
      .map((row) => row.fighter_id),
  );

  const decorated = allBouts.map((bout) => ({
    ...bout,
    isFotn: fotnFightIds.has(bout.fightId),
    red:
      bout.red.id != null && potnFighterIds.has(bout.red.id)
        ? { ...bout.red, isPotn: true }
        : bout.red,
    blue:
      bout.blue.id != null && potnFighterIds.has(bout.blue.id)
        ? { ...bout.blue, isPotn: true }
        : bout.blue,
  }));

  const bouts = decorated.filter((bout) => bout.status !== "cancelled");
  const cancelledBouts = decorated.filter(
    (bout) => bout.status === "cancelled",
  );

  return {
    id: event.id,
    name: event.name,
    eventDate: event.event_date,
    location: event.location,
    status: event.status,
    startTime: event.start_time,
    imageUrl: absolutePoster(event.image_url),
    broadcast: event.broadcast,
    ticketUrl: event.ticket_url,
    tagline: event.tagline,
    headliner: event.headliner,
    source: event.source,
    sourceId: event.source_id,
    earlyPrelimsTime: event.early_prelims_time,
    prelimsTime: event.prelims_time,
    bouts,
    cancelledBouts,
  };
});

type NextEventRow = {
  id: number;
  name: string;
  event_date: string | null;
  start_time: string | null;
  location: string | null;
  image_url: string | null;
  broadcast: string | null;
};

type MainEventRow = {
  fight_id: number;
  weight_class: string | null;
  red_fighter_name: string;
  blue_fighter_name: string;
  red_id: number | null;
  red_name: string | null;
  red_nickname: string | null;
  red_headshot: string | null;
  red_standing_body: string | null;
  red_standing_body_l: string | null;
  red_standing_body_r: string | null;
  red_full_body: string | null;
  red_nationality: string | null;
  red_wins: number | null;
  red_losses: number | null;
  red_draws: number | null;
  blue_id: number | null;
  blue_name: string | null;
  blue_nickname: string | null;
  blue_headshot: string | null;
  blue_standing_body: string | null;
  blue_standing_body_l: string | null;
  blue_standing_body_r: string | null;
  blue_full_body: string | null;
  blue_nationality: string | null;
  blue_wins: number | null;
  blue_losses: number | null;
  blue_draws: number | null;
  red_rank: number | null;
  blue_rank: number | null;
};

// Columnas de una esquina del combate estelar ya desprefijadas (red_/blue_).
type HeroCornerCols = {
  id: number | null;
  name: string | null;
  fallbackName: string; // fights.fighter_*_name, siempre relleno
  nickname: string | null;
  headshot: string | null;
  standingBody: string | null;
  standingBodyL: string | null;
  standingBodyR: string | null;
  fullBody: string | null;
  nationality: string | null;
  wins: number | null;
  losses: number | null;
  draws: number | null;
  rank: number | null;
};

// Esquina del combate estelar (FE1). Mismo criterio TBD que fetchEventBouts:
// sin ficha (id NULL) caemos al nombre plano de la tabla fights.
// La ficha física (FE6) va siempre a NULL: el hero de la home no la pinta y
// así la query no arrastra columnas que nadie usa.
function toHeroFighter(cols: HeroCornerCols): NextEventHeroFighter {
  if (cols.id == null) {
    return {
      id: null,
      name: cols.fallbackName,
      nickname: null,
      headshotUrl: null,
      nationality: null,
      wins: 0,
      losses: 0,
      draws: 0,
      rank: null,
      heightCm: null,
      reachCm: null,
      stance: null,
      birthDate: null,
      fullBodyUrl: null,
      standingBodyUrl: null,
      standingBodyUrlL: null,
      standingBodyUrlR: null,
    };
  }

  return {
    id: cols.id,
    name: cols.name ?? cols.fallbackName,
    nickname: cols.nickname,
    headshotUrl: cols.headshot,
    nationality: cols.nationality,
    wins: cols.wins ?? 0,
    losses: cols.losses ?? 0,
    draws: cols.draws ?? 0,
    rank: cols.rank,
    heightCm: null,
    reachCm: null,
    stance: null,
    birthDate: null,
    fullBodyUrl: cols.fullBody,
    standingBodyUrl: cols.standingBody,
    standingBodyUrlL: cols.standingBodyL,
    standingBodyUrlR: cols.standingBodyR,
  };
}

// FE1: el próximo evento (el de fecha >= hoy más cercana) con su COMBATE
// ESTELAR para el módulo "Up Next" de la home. El estelar es la primera pelea
// según el mismo orden que usa la cartelera (bout_order ASC NULLS LAST, 1 =
// estelar) y el ranking de cada esquina reutiliza el patrón LATERAL de
// fetchEventBouts. Devuelve null si no hay eventos futuros.
export async function getNextEventHero(): Promise<NextEventHero | null> {
  const eventRows = await sql<NextEventRow>(
    `SELECT e.id, e.name, e.event_date::text AS event_date,
            e.start_time::text AS start_time, e.location, e.image_url, e.broadcast
     FROM events e
     WHERE COALESCE(
             e.start_time,
             (e.event_date + interval '1 day')::timestamptz
           ) > now() - interval '6 hours'
       AND e.status IS DISTINCT FROM 'completed'
       -- Un evento cuyo estelar ya cayó deja de ser "el próximo": pasa a
       -- "Último evento" (getLastEventResults) aunque el cron aún no lo haya
       -- marcado completed. Sin esto la home seguía con "¡ES HOY!/Ver en directo".
       AND NOT ${MAIN_EVENT_FINISHED_SQL}
     ORDER BY e.event_date ASC, e.id ASC
     LIMIT 1`,
  );
  const event = eventRows[0];
  if (!event) {
    return null;
  }

  const boutRows = await sql<MainEventRow>(
    `WITH latest_ranking AS (SELECT MAX(snapshot_date) AS d FROM rankings)
     SELECT fi.id AS fight_id, fi.weight_class,
            fi.fighter_red_name AS red_fighter_name,
            fi.fighter_blue_name AS blue_fighter_name,
            red.id AS red_id, red.name AS red_name, red.nickname AS red_nickname,
            red.headshot_url AS red_headshot,
            red.standing_body_url AS red_standing_body,
            red.standing_body_url_l AS red_standing_body_l,
            red.standing_body_url_r AS red_standing_body_r,
            red.full_body_url AS red_full_body,
            red.nationality AS red_nationality,
            red.wins AS red_wins, red.losses AS red_losses, red.draws AS red_draws,
            blue.id AS blue_id, blue.name AS blue_name, blue.nickname AS blue_nickname,
            blue.headshot_url AS blue_headshot,
            blue.standing_body_url AS blue_standing_body,
            blue.standing_body_url_l AS blue_standing_body_l,
            blue.standing_body_url_r AS blue_standing_body_r,
            blue.full_body_url AS blue_full_body,
            blue.nationality AS blue_nationality,
            blue.wins AS blue_wins, blue.losses AS blue_losses, blue.draws AS blue_draws,
            red_rank.rank_position AS red_rank,
            blue_rank.rank_position AS blue_rank
     FROM fights fi
     LEFT JOIN fighters red ON red.id = fi.fighter_red_id
     LEFT JOIN fighters blue ON blue.id = fi.fighter_blue_id
     LEFT JOIN LATERAL (
       SELECT r.rank_position
       FROM rankings r
       WHERE r.fighter_id = red.id
         AND r.snapshot_date = (SELECT d FROM latest_ranking)
         AND r.division NOT IN ('mens_pound_for_pound', 'womens_pound_for_pound')
       ORDER BY r.rank_position ASC
       LIMIT 1
     ) red_rank ON true
     LEFT JOIN LATERAL (
       SELECT r.rank_position
       FROM rankings r
       WHERE r.fighter_id = blue.id
         AND r.snapshot_date = (SELECT d FROM latest_ranking)
         AND r.division NOT IN ('mens_pound_for_pound', 'womens_pound_for_pound')
       ORDER BY r.rank_position ASC
       LIMIT 1
     ) blue_rank ON true
     -- BE7: si el estelar se cae, el hero debe enseñar la siguiente pelea viva.
     WHERE fi.event_id = $1
       AND fi.status IS DISTINCT FROM 'cancelled'
     ORDER BY fi.bout_order ASC NULLS LAST, fi.id ASC
     LIMIT 1`,
    [event.id],
  );
  const mainEventRow = boutRows[0];

  return {
    id: event.id,
    name: event.name,
    eventDate: event.event_date,
    startTime: event.start_time,
    location: event.location,
    imageUrl: absolutePoster(event.image_url),
    broadcast: event.broadcast,
    mainEvent: mainEventRow
      ? {
          fightId: mainEventRow.fight_id,
          weightClass: mainEventRow.weight_class,
          red: toHeroFighter({
            id: mainEventRow.red_id,
            name: mainEventRow.red_name,
            fallbackName: mainEventRow.red_fighter_name,
            nickname: mainEventRow.red_nickname,
            headshot: mainEventRow.red_headshot,
            standingBody: mainEventRow.red_standing_body,
            standingBodyL: mainEventRow.red_standing_body_l,
            standingBodyR: mainEventRow.red_standing_body_r,
            fullBody: mainEventRow.red_full_body,
            nationality: mainEventRow.red_nationality,
            wins: mainEventRow.red_wins,
            losses: mainEventRow.red_losses,
            draws: mainEventRow.red_draws,
            rank: mainEventRow.red_rank,
          }),
          blue: toHeroFighter({
            id: mainEventRow.blue_id,
            name: mainEventRow.blue_name,
            fallbackName: mainEventRow.blue_fighter_name,
            nickname: mainEventRow.blue_nickname,
            headshot: mainEventRow.blue_headshot,
            standingBody: mainEventRow.blue_standing_body,
            standingBodyL: mainEventRow.blue_standing_body_l,
            standingBodyR: mainEventRow.blue_standing_body_r,
            fullBody: mainEventRow.blue_full_body,
            nationality: mainEventRow.blue_nationality,
            wins: mainEventRow.blue_wins,
            losses: mainEventRow.blue_losses,
            draws: mainEventRow.blue_draws,
            rank: mainEventRow.blue_rank,
          }),
        }
      : null,
  };
}

type LastEventRow = {
  id: number;
  name: string;
  event_date: string | null;
  location: string | null;
};

// FE10: el último evento con resultados (el de fecha más reciente) con las 5
// primeras peleas de su cartelera estelar, en formato EventBout para reutilizar
// EventBoutRow. Incluye tanto los ya marcados 'completed' por el cron como el
// que ACABA de terminar (su estelar ya cayó) aunque siga 'upcoming': así pasa a
// "Último evento" al instante, en cuanto getNextEventHero lo saca de "Próximo".
export async function getLastEventResults(): Promise<LastEventResults | null> {
  const rows = await sql<LastEventRow>(
    `SELECT e.id, e.name, e.event_date::text AS event_date, e.location
     FROM events e
     WHERE (e.event_date < CURRENT_DATE AND e.status = 'completed')
        OR ${MAIN_EVENT_FINISHED_SQL}
     -- NULLS LAST: la rama OR readmite eventos sin fecha (event_date NULL); sin
     -- esto, el DESC los pondría los PRIMEROS (NULLS FIRST por defecto en PG) y
     -- un evento histórico sin fecha se colaría como "Último evento".
     ORDER BY e.event_date DESC NULLS LAST, e.id DESC
     LIMIT 1`,
  );
  const event = rows[0];
  if (!event) {
    return null;
  }

  const bouts = await fetchEventBouts(event.id);
  // "Main card": si el evento tiene segmentos nos quedamos con 'main'; en
  // eventos históricos sin card_segment la cartelera completa ya viene en el
  // orden correcto (estelar primero), así que vale tal cual.
  const hasSegments = bouts.some((bout) => bout.cardSegment != null);
  const mainCard = hasSegments
    ? bouts.filter((bout) => bout.cardSegment === "main")
    : bouts;

  return {
    id: event.id,
    name: event.name,
    eventDate: event.event_date,
    location: event.location,
    bouts: mainCard.slice(0, 5),
  };
}

type WeighInRow = {
  fight_id: number;
  fighter_id: number;
  fighter_name: string;
  headshot_url: string | null;
  weight_lbs: string | null;
  missed_weight: boolean | null;
};

// BE2 (migración 011): pesaje oficial de un evento. weigh_ins referencia la
// pelea y al luchador; el evento se resuelve vía fights. JOIN interno con
// fighters: una fila de báscula sin ficha de luchador no se puede pintar.
// NO filtramos canceladas a propósito: el pesaje ocurrió aunque la pelea se
// cayera después (a menudo precisamente por no dar el peso).
// weight_lbs es NUMERIC: ::text + Number() como el resto de numéricos del módulo.
export async function getEventWeighIns(
  eventId: number,
): Promise<EventWeighIn[]> {
  const rows = await sql<WeighInRow>(
    `SELECT w.fight_id, w.fighter_id, f.name AS fighter_name,
            f.headshot_url, w.weight_lbs::text AS weight_lbs, w.missed_weight
     FROM weigh_ins w
     JOIN fights fi ON fi.id = w.fight_id
     JOIN fighters f ON f.id = w.fighter_id
     WHERE fi.event_id = $1
     ORDER BY fi.bout_order ASC NULLS LAST, fi.id ASC, w.fighter_id ASC`,
    [eventId],
  );

  return rows.map((row) => ({
    fightId: row.fight_id,
    fighterId: row.fighter_id,
    fighterName: row.fighter_name,
    headshotUrl: row.headshot_url,
    weightLbs: row.weight_lbs != null ? Number(row.weight_lbs) : null,
    missedWeight: row.missed_weight ?? false,
  }));
}
