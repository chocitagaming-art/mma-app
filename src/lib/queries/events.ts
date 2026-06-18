import { sql } from "@/lib/db";
import type {
  EventBout,
  EventDetail,
  EventListItem,
  EventListResult,
} from "@/lib/types";

const PAGE_SIZE = 24;

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

type EventRow = {
  id: number;
  name: string;
  event_date: string | null;
  location: string | null;
};

type BoutRow = {
  fight_id: number;
  weight_class: string | null;
  method: string | null;
  end_round: number | null;
  end_time: string | null;
  scheduled_rounds: number | null;
  winner_id: number | null;
  red_id: number;
  red_name: string;
  red_nickname: string | null;
  red_headshot: string | null;
  red_nationality: string | null;
  red_wins: number;
  red_losses: number;
  red_draws: number;
  blue_id: number;
  blue_name: string;
  blue_nickname: string | null;
  blue_headshot: string | null;
  blue_nationality: string | null;
  blue_wins: number;
  blue_losses: number;
  blue_draws: number;
};

export async function getEventDetail(id: number): Promise<EventDetail | null> {
  const eventRows = await sql<EventRow>(
    `SELECT id, name, event_date::text AS event_date, location
     FROM events WHERE id = $1`,
    [id],
  );
  const event = eventRows[0];
  if (!event) {
    return null;
  }

  // Sin bout_order todavía (vendrá con la migración de eventos): el orden por id
  // aproxima el orden del cartel (ufcstats lista la estelar primero).
  const boutRows = await sql<BoutRow>(
    `SELECT fi.id AS fight_id, fi.weight_class, fi.method, fi.end_round, fi.end_time,
            fi.scheduled_rounds, fi.winner_id,
            red.id AS red_id, red.name AS red_name, red.nickname AS red_nickname,
            red.headshot_url AS red_headshot, red.nationality AS red_nationality,
            red.wins AS red_wins, red.losses AS red_losses, red.draws AS red_draws,
            blue.id AS blue_id, blue.name AS blue_name, blue.nickname AS blue_nickname,
            blue.headshot_url AS blue_headshot, blue.nationality AS blue_nationality,
            blue.wins AS blue_wins, blue.losses AS blue_losses, blue.draws AS blue_draws
     FROM fights fi
     INNER JOIN fighters red ON red.id = fi.fighter_red_id
     INNER JOIN fighters blue ON blue.id = fi.fighter_blue_id
     WHERE fi.event_id = $1
     ORDER BY fi.id ASC`,
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
    red: {
      id: row.red_id,
      name: row.red_name,
      nickname: row.red_nickname,
      headshotUrl: row.red_headshot,
      nationality: row.red_nationality,
      wins: row.red_wins,
      losses: row.red_losses,
      draws: row.red_draws,
    },
    blue: {
      id: row.blue_id,
      name: row.blue_name,
      nickname: row.blue_nickname,
      headshotUrl: row.blue_headshot,
      nationality: row.blue_nationality,
      wins: row.blue_wins,
      losses: row.blue_losses,
      draws: row.blue_draws,
    },
  }));

  return {
    id: event.id,
    name: event.name,
    eventDate: event.event_date,
    location: event.location,
    bouts,
  };
}
