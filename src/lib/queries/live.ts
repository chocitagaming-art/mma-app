import { unstable_cache } from "next/cache";

import { sql } from "@/lib/db";

import {
  mapFightTimelineSample,
  type FightTimelineSample,
} from "@/lib/fight-timeline";
import type { LiveEventTimes } from "@/lib/live-event";
import { mapLiveFightStatsRow, type LiveFightStats } from "@/lib/live-stats";
import { MAIN_EVENT_FINISHED_SQL } from "@/lib/queries/events";

export type LiveEventCandidate = LiveEventTimes & {
  id: number;
  name: string;
  location: string | null;
  broadcast: string | null;
  // El estelar ya cayó: el evento acabó aunque la ventana horaria 'live' siga
  // abierta. /api/live/now devuelve 'none' (chip/CTA/banner off) y /en-vivo lo
  // pinta en modo "Finalizado" en vez de "En directo".
  mainEventFinished: boolean;
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
  main_event_finished: boolean;
};

// T3-A: el candidato a "evento de hoy" para /en-vivo. Mismo criterio temporal
// que getNextEventHero (FE1): el evento no completado cuyo inicio (o su día
// natural si no hay hora) todavía no queda más de 10 h atrás. La fase concreta
// (none/pre/live) la decide resolveLivePhase con estos horarios.
async function getLiveEventCandidateUncached(): Promise<LiveEventCandidate | null> {
  const rows = await sql<LiveEventRow>(
    `SELECT e.id, e.name, e.event_date::text AS event_date,
            e.start_time::text AS start_time,
            e.prelims_time::text AS prelims_time,
            e.early_prelims_time::text AS early_prelims_time,
            e.location, e.broadcast,
            ${MAIN_EVENT_FINISHED_SQL} AS main_event_finished
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
    mainEventFinished: row.main_event_finished,
  };
}

// 60 s. Esta consulta era la que impedía que Neon se durmiera NUNCA: el chip
// "EN VIVO" del header vive en TODAS las páginas y sondea /api/live/now cada 5
// minutos, que es exactamente el autosuspend de Neon. Con una sola pestaña
// abierta en cualquier parte del sitio, el compute no llegaba a suspenderse.
//
// 60 s no cambia nada de lo que se ve: la ventana del criterio es de ±10 h y lo
// único con resolución fina es mainEventFinished — que el chip se apague un
// minuto más tarde al acabar la velada es imperceptible.
const getLiveEventCandidateCached = unstable_cache(
  getLiveEventCandidateUncached,
  ["live-event-candidate"],
  { revalidate: 60, tags: ["events"] },
);

export function getLiveEventCandidate(): Promise<LiveEventCandidate | null> {
  return getLiveEventCandidateCached();
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
      // Guarda de frescura (hallazgo 7c): una fila 'in' rancia (evento
      // abortado tras los walkouts y reprogramado con los mismos fight_ids)
      // no debe pintarse como "en directo" días después. Los finales ('post')
      // sí persisten hasta la poda de 48 h del escritor.
      `SELECT fight_id, state, status_name, status_detail, period,
              display_clock, stats, updated_at::text AS updated_at
       FROM live_fight_stats
       WHERE fight_id = ANY($1)
         AND (state = 'post' OR updated_at > now() - interval '30 minutes')`,
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

type FightSampleRow = {
  fight_id: number;
  state: string | null;
  status_name: string | null;
  period: number | null;
  display_clock: string | null;
  stats: unknown;
  sampled_at: string | null;
};

// Timeline del directo (migración 024): la serie de muestras append-only de
// cada pelea, en orden de captura (1 SELECT batcheado por el índice
// (fight_id, sampled_at)). El escritor del bucle añade una muestra por pasada
// y el backfill de UFC 329 rellenó las históricas. DEGRADA a mapa vacío ante
// cualquier error: la película es un extra, nunca tumba la página (mismo
// criterio que getLiveFightStats).
export async function getFightSampleSeries(
  fightIds: number[],
): Promise<Map<number, FightTimelineSample[]>> {
  if (fightIds.length === 0) {
    return new Map();
  }
  try {
    const rows = await sql<FightSampleRow>(
      `SELECT fight_id, state, status_name, period, display_clock, stats,
              sampled_at::text AS sampled_at
       FROM live_fight_stat_samples
       WHERE fight_id = ANY($1)
       ORDER BY fight_id ASC, sampled_at ASC, id ASC`,
      [fightIds],
    );
    const map = new Map<number, FightTimelineSample[]>();
    for (const row of rows) {
      const mapped = mapFightTimelineSample(row);
      if (!mapped) {
        continue;
      }
      const series = map.get(row.fight_id) ?? [];
      series.push(mapped);
      map.set(row.fight_id, series);
    }
    return map;
  } catch (error) {
    console.error("getFightSampleSeries degraded to empty map:", error);
    return new Map();
  }
}
