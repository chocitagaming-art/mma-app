import { sql } from "@/lib/db";

import type { LiveEventTimes } from "@/lib/live-event";

export type LiveEventCandidate = LiveEventTimes & {
  id: number;
  name: string;
  location: string | null;
  broadcast: string | null;
};

type LiveEventRow = {
  id: number;
  name: string;
  event_date: string | null;
  start_time: string | null;
  prelims_time: string | null;
  early_prelims_time: string | null;
  location: string | null;
  broadcast: string | null;
};

// T3-A: el candidato a "evento de hoy" para /en-vivo. Mismo criterio temporal
// que getNextEventHero (FE1): el evento no completado cuyo inicio (o su día
// natural si no hay hora) todavía no queda más de 10 h atrás. La fase concreta
// (none/pre/live) la decide resolveLivePhase con estos horarios.
export async function getLiveEventCandidate(): Promise<LiveEventCandidate | null> {
  const rows = await sql<LiveEventRow>(
    `SELECT e.id, e.name, e.event_date::text AS event_date,
            e.start_time::text AS start_time,
            e.prelims_time::text AS prelims_time,
            e.early_prelims_time::text AS early_prelims_time,
            e.location, e.broadcast
     FROM events e
     WHERE COALESCE(
             e.start_time,
             (e.event_date + interval '1 day')::timestamptz
           ) > now() - interval '10 hours'
       AND e.status IS DISTINCT FROM 'completed'
     ORDER BY e.event_date ASC, e.id ASC
     LIMIT 1`,
  );
  const row = rows[0];
  if (!row) {
    return null;
  }

  return {
    id: row.id,
    name: row.name,
    eventDate: row.event_date,
    startTime: row.start_time,
    prelimsTime: row.prelims_time,
    earlyPrelimsTime: row.early_prelims_time,
    location: row.location,
    broadcast: row.broadcast,
  };
}
