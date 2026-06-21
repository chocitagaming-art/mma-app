import { sql } from "@/lib/db";
import type {
  EventBout,
  EventDetail,
  EventListItem,
  EventListResult,
  UpcomingEventItem,
} from "@/lib/types";

const PAGE_SIZE = 24;

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
export async function getPastEvents(page: number): Promise<EventListResult> {
  const currentPage = Math.max(1, page);
  const offset = (currentPage - 1) * PAGE_SIZE;

  const countRows = await sql<{ total: string }>(
    `SELECT count(*)::text AS total
     FROM events
     WHERE event_date < CURRENT_DATE OR event_date IS NULL`,
  );
  const total = Number(countRows[0]?.total ?? "0");
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const rows = await sql<EventListRow>(
    `SELECT e.id, e.name, e.event_date::text AS event_date, e.location,
            count(f.id)::text AS fight_count
     FROM events e
     LEFT JOIN fights f ON f.event_id = e.id
     WHERE e.event_date < CURRENT_DATE OR e.event_date IS NULL
     GROUP BY e.id, e.name, e.event_date, e.location
     ORDER BY e.event_date DESC NULLS LAST, e.id DESC
     LIMIT $1 OFFSET $2`,
    [PAGE_SIZE, offset],
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
     LEFT JOIN fights f ON f.event_id = e.id
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
  blue_id: number | null;
  blue_name: string | null;
  blue_nickname: string | null;
  blue_headshot: string | null;
  blue_nationality: string | null;
  blue_wins: number | null;
  blue_losses: number | null;
  blue_draws: number | null;
};

export async function getEventDetail(id: number): Promise<EventDetail | null> {
  const eventRows = await sql<EventRow>(
    `SELECT id, name, event_date::text AS event_date, location,
            status, start_time::text AS start_time, image_url,
            broadcast, ticket_url, tagline, headliner
     FROM events WHERE id = $1`,
    [id],
  );
  const event = eventRows[0];
  if (!event) {
    return null;
  }

  // LEFT JOIN: los próximos pueden tener luchadores TBD (fighter_red_id/blue_id NULL).
  // En esos casos usamos fighter_red_name/fighter_blue_name (siempre rellenos).
  // bout_order ordena el cartel (1 = estelar); NULLS LAST para eventos lejanos sin orden.
  const boutRows = await sql<BoutRow>(
    `SELECT fi.id AS fight_id, fi.weight_class, fi.method, fi.end_round, fi.end_time,
            fi.scheduled_rounds, fi.winner_id, fi.bout_order, fi.card_segment,
            fi.fighter_red_name AS red_fighter_name,
            fi.fighter_blue_name AS blue_fighter_name,
            red.id AS red_id, red.name AS red_name, red.nickname AS red_nickname,
            red.headshot_url AS red_headshot, red.nationality AS red_nationality,
            red.wins AS red_wins, red.losses AS red_losses, red.draws AS red_draws,
            blue.id AS blue_id, blue.name AS blue_name, blue.nickname AS blue_nickname,
            blue.headshot_url AS blue_headshot, blue.nationality AS blue_nationality,
            blue.wins AS blue_wins, blue.losses AS blue_losses, blue.draws AS blue_draws
     FROM fights fi
     LEFT JOIN fighters red ON red.id = fi.fighter_red_id
     LEFT JOIN fighters blue ON blue.id = fi.fighter_blue_id
     WHERE fi.event_id = $1
     ORDER BY fi.bout_order ASC NULLS LAST, fi.id ASC`,
    [id],
  );

  const bouts: EventBout[] = boutRows.map((row) => ({
    fightId: row.fight_id,
    weightClass: row.weight_class,
    method: row.method,
    endRound: row.end_round,
    endTime: row.end_time,
    scheduledRounds: row.scheduled_rounds,
    winnerId: row.winner_id,
    boutOrder: row.bout_order,
    cardSegment: row.card_segment,
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
          },
  }));

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
    bouts,
  };
}
