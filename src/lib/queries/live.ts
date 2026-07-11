import { sql } from "@/lib/db";

import type { LiveEventTimes } from "@/lib/live-event";
import { mapLiveFightStatsRow, type LiveFightStats } from "@/lib/live-stats";

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

type LiveFightStatsRow = {
  fight_id: number;
  state: string | null;
  status_name: string | null;
  status_detail: string | null;
  period: number | null;
  display_clock: string | null;
  stats: unknown;
  updated_at: string | null;
};

// T3-A fase B: filas vivas de live_fight_stats para la cartelera de /en-vivo
// (1 SELECT batcheado por render; el bucle de mma-ingesta las escribe cada
// ~2 min durante el evento). DEGRADA a mapa vacío ante cualquier error: el
// panel de stats es un extra y un fallo aquí no debe mandar la página al
// error boundary (que en /en-vivo reintenta y "parpadea" el directo entero).
export async function getLiveFightStats(
  fightIds: number[],
): Promise<Map<number, LiveFightStats>> {
  if (fightIds.length === 0) {
    return new Map();
  }
  try {
    const rows = await sql<LiveFightStatsRow>(
      `SELECT fight_id, state, status_name, status_detail, period,
              display_clock, stats, updated_at::text AS updated_at
       FROM live_fight_stats
       WHERE fight_id = ANY($1)`,
      [fightIds],
    );
    const map = new Map<number, LiveFightStats>();
    for (const row of rows) {
      const mapped = mapLiveFightStatsRow(row);
      if (mapped) {
        map.set(mapped.fightId, mapped);
      }
    }
    return map;
  } catch (error) {
    console.error("getLiveFightStats degraded to empty map:", error);
    return new Map();
  }
}
