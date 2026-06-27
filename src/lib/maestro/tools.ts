import { z } from "zod";

import { sql } from "@/lib/db";
import { getFighterComparisonDetail } from "@/lib/queries/fighters";
import { getFighterRankingHistory } from "@/lib/queries/rankings";
import { buildRankingTrajectory } from "@/lib/ranking-trajectory";
import { DIVISION_SLUGS } from "@/lib/maestro/prompt";

// El modelo pasa argumentos libres; validamos y acotamos SIEMPRE antes de tocar SQL.
const idSchema = z.coerce.number().int().positive();
const textSchema = z.string().trim().min(1).max(80);

const num = (v: unknown): number => Number(v ?? 0);

type ToolResult = unknown;

async function buscarLuchador(input: unknown): Promise<ToolResult> {
  const nombre = textSchema.parse((input as { nombre?: unknown })?.nombre);
  const rows = await sql<{
    id: number;
    name: string;
    nickname: string | null;
    nationality: string | null;
    wins: number;
    losses: number;
    draws: number;
  }>(
    `select id, name, nickname, nationality, wins, losses, draws
     from fighters
     where name ilike $1
     order by
       case when headshot_url is not null then 0 else 1 end,
       case when lower(name) = lower($2) then 0 else 1 end,
       id asc
     limit 8`,
    [`%${nombre}%`, nombre],
  );
  if (rows.length === 0) return { resultados: [], nota: "Sin coincidencias para ese nombre." };
  return {
    resultados: rows.map((r) => ({
      id: r.id,
      nombre: r.name,
      apodo: r.nickname,
      nacionalidad: r.nationality,
      record: `${r.wins}-${r.losses}-${r.draws}`,
    })),
  };
}

async function fichaYStats(input: unknown): Promise<ToolResult> {
  const id = idSchema.parse((input as { id?: unknown })?.id);
  const [fighter] = await sql<Record<string, unknown>>(
    `select f.id, f.name, f.nickname, f.nationality,
            f.birth_date::text as birth_date,
            f.height_cm::text as height_cm, f.reach_cm::text as reach_cm,
            f.stance, f.weight_grams, f.wins, f.losses, f.draws,
            (select count(*) from fights fi
              where fi.fighter_red_id = f.id or fi.fighter_blue_id = f.id) as fight_count,
            (select fi2.weight_class from fights fi2
              where fi2.fighter_red_id = f.id or fi2.fighter_blue_id = f.id
              order by fi2.updated_at desc nulls last, fi2.id desc limit 1) as latest_weight_class
     from fighters f where f.id = $1`,
    [id],
  );
  if (!fighter) return { error: "No encontré ningún luchador con ese id." };

  const [agg] = await sql<Record<string, unknown>>(
    `select sum(sig_strikes_landed) as sig_strikes_landed,
            sum(sig_strikes_attempted) as sig_strikes_attempted,
            sum(takedowns_landed) as takedowns_landed,
            sum(takedowns_attempted) as takedowns_attempted,
            sum(submission_attempts) as submission_attempts,
            sum(control_time_seconds) as control_time_seconds,
            sum(knockdowns) as knockdowns,
            count(*) as total_fight_stats
     from fight_stats where fighter_id = $1`,
    [id],
  );

  const sl = num(agg?.sig_strikes_landed);
  const sa = num(agg?.sig_strikes_attempted);
  const tl = num(agg?.takedowns_landed);
  const ta = num(agg?.takedowns_attempted);

  return {
    ficha: {
      id: fighter.id,
      nombre: fighter.name,
      apodo: fighter.nickname,
      nacionalidad: fighter.nationality,
      record: `${num(fighter.wins)}-${num(fighter.losses)}-${num(fighter.draws)}`,
      altura_cm: fighter.height_cm,
      alcance_cm: fighter.reach_cm,
      peso_gramos: fighter.weight_grams,
      guardia: fighter.stance,
      categoria: fighter.latest_weight_class,
      peleas_registradas: num(fighter.fight_count),
    },
    stats_carrera: {
      golpes_sig_conectados: sl,
      golpes_sig_intentados: sa,
      precision_golpeo: sa > 0 ? `${Math.round((sl / sa) * 100)}%` : "—",
      derribos_conectados: tl,
      derribos_intentados: ta,
      precision_derribo: ta > 0 ? `${Math.round((tl / ta) * 100)}%` : "—",
      intentos_sumision: num(agg?.submission_attempts),
      tiempo_control_seg: num(agg?.control_time_seconds),
      knockdowns: num(agg?.knockdowns),
      peleas_con_stats: num(agg?.total_fight_stats),
    },
    nota:
      num(agg?.total_fight_stats) === 0
        ? "Sin estadísticas detalladas registradas para este luchador."
        : undefined,
  };
}

async function historialPeleas(input: unknown): Promise<ToolResult> {
  const obj = (input ?? {}) as { id?: unknown; limit?: unknown };
  const id = idSchema.parse(obj.id);
  const limit = Math.min(25, Math.max(1, Number(obj.limit ?? 15) || 15));
  const rows = await sql<Record<string, unknown>>(
    `select fi.id as fight_id, e.name as event_name, e.event_date::text as event_date,
            case when fi.fighter_red_id = $1 then blue.name else red.name end as opponent_name,
            case when fi.winner_id is null then 'empate'
                 when fi.winner_id = $1 then 'victoria'
                 else 'derrota' end as result,
            fi.method, fi.end_round, fi.end_time, fi.weight_class
     from fights fi
     left join events e on e.id = fi.event_id
     left join fighters red on red.id = fi.fighter_red_id
     left join fighters blue on blue.id = fi.fighter_blue_id
     where fi.fighter_red_id = $1 or fi.fighter_blue_id = $1
     order by e.event_date desc nulls last, fi.id desc
     limit $2`,
    [id, limit],
  );
  if (rows.length === 0) return { peleas: [], nota: "Sin peleas registradas para este luchador." };
  return {
    peleas: rows.map((r) => ({
      oponente: r.opponent_name,
      resultado: r.result,
      metodo: r.method,
      ronda: r.end_round,
      tiempo: r.end_time,
      evento: r.event_name,
      fecha: r.event_date,
      categoria: r.weight_class,
    })),
  };
}

async function evento(input: unknown): Promise<ToolResult> {
  const arg = textSchema.parse((input as { nombre_o_fecha?: unknown })?.nombre_o_fecha);
  const isDate = /^\d{4}-\d{2}-\d{2}$/.test(arg);
  const candidates = await sql<Record<string, unknown>>(
    isDate
      ? `select id, name, event_date::text as event_date, location, status, headliner
         from events where event_date = $1::date order by id desc limit 5`
      : `select id, name, event_date::text as event_date, location, status, headliner
         from events where name ilike $1 order by event_date desc nulls last, id desc limit 5`,
    [isDate ? arg : `%${arg}%`],
  );
  if (candidates.length === 0) return { eventos: [], nota: "No encontré ningún evento con eso." };
  if (candidates.length > 1) {
    return {
      eventos: candidates.map((e) => ({
        id: e.id,
        nombre: e.name,
        fecha: e.event_date,
        sede: e.location,
        estado: e.status,
      })),
      nota: "Varios eventos coinciden; pide al usuario que elija o usa el más relevante.",
    };
  }
  const ev = candidates[0];
  const bouts = await sql<Record<string, unknown>>(
    `select fi.bout_order, fi.card_segment, fi.weight_class, fi.method,
            fi.end_round, fi.end_time, fi.winner_id,
            coalesce(red.name, fi.fighter_red_name) as red_name,
            coalesce(blue.name, fi.fighter_blue_name) as blue_name
     from fights fi
     left join fighters red on red.id = fi.fighter_red_id
     left join fighters blue on blue.id = fi.fighter_blue_id
     where fi.event_id = $1
     order by fi.bout_order asc nulls last, fi.id asc
     limit 16`,
    [ev.id],
  );
  return {
    evento: {
      nombre: ev.name,
      fecha: ev.event_date,
      sede: ev.location,
      estado: ev.status,
      estelar: ev.headliner,
    },
    cartelera: bouts.map((b) => ({
      rojo: b.red_name,
      azul: b.blue_name,
      categoria: b.weight_class,
      segmento: b.card_segment,
      metodo: b.method,
      ronda: b.end_round,
    })),
  };
}

async function ranking(input: unknown): Promise<ToolResult> {
  const division = z
    .enum(DIVISION_SLUGS)
    .parse((input as { division?: unknown })?.division);
  try {
    const rows = await sql<Record<string, unknown>>(
      `with latest as (select max(snapshot_date) as d from rankings)
       select r.rank_position, r.is_champion, r.rank_change,
              coalesce(f.name, r.fighter_name) as fighter_name,
              f.wins, f.losses, f.draws
       from rankings r
       left join fighters f on f.id = r.fighter_id
       where r.snapshot_date = (select d from latest) and r.division = $1
       order by r.is_champion desc, r.rank_position asc, r.id
       limit 20`,
      [division],
    );
    if (rows.length === 0) return { division, ranking: [], nota: "Sin datos de ranking para esa división." };
    return {
      division,
      ranking: rows.map((r) => ({
        posicion: r.is_champion ? "Campeón" : num(r.rank_position),
        luchador: r.fighter_name,
        record:
          r.wins == null ? null : `${num(r.wins)}-${num(r.losses)}-${num(r.draws)}`,
      })),
    };
  } catch {
    return { division, ranking: [], nota: "El ranking no está disponible ahora mismo." };
  }
}

async function comparar(input: unknown): Promise<ToolResult> {
  const obj = (input ?? {}) as { a?: unknown; b?: unknown };
  const a = idSchema.parse(obj.a);
  const b = idSchema.parse(obj.b);
  if (a === b) {
    return { error: "Es el mismo luchador; elige dos luchadores distintos para comparar." };
  }
  const detail = await getFighterComparisonDetail(a, b);
  if (!detail) return { error: "No encontré a uno de los dos luchadores." };
  const trim = (p: (typeof detail)["fighterA"]) => ({
    nombre: p.name,
    record: `${p.wins}-${p.losses}-${p.draws}`,
    altura_cm: p.heightCm,
    alcance_cm: p.reachCm,
    guardia: p.stance,
    categoria: p.latestWeightClass,
    promedios_por_pelea: p.aggregateStats,
  });
  return {
    luchadorA: trim(detail.fighterA),
    luchadorB: trim(detail.fighterB),
    enfrentamientos_directos: detail.directMatchups.map((m) => ({
      evento: m.eventName,
      fecha: m.eventDate,
      ganador_id: m.winnerId,
      metodo: m.method,
    })),
  };
}

async function noticias(input: unknown): Promise<ToolResult> {
  const raw = (input as { tema?: unknown })?.tema;
  const tema =
    typeof raw === "string" && raw.trim() ? raw.trim().slice(0, 80) : null;
  const rows = await sql<Record<string, unknown>>(
    `select n.id, n.headline, n.source, n.url, n.published_at::text as published_at,
            n.category, f.name as fighter_name
     from news n
     left join fighters f on f.id = n.fighter_id
     where ($1::text is null
            or n.headline ilike $1
            or n.summary ilike $1
            or f.name ilike $1
            or n.category ilike $1)
     order by n.published_at desc nulls last, n.relevance desc nulls last, n.id desc
     limit 8`,
    [tema ? `%${tema}%` : null],
  );
  if (rows.length === 0) return { noticias: [], nota: "Sin noticias para ese tema." };
  return {
    noticias: rows.map((n) => ({
      titular: n.headline,
      fuente: n.source,
      fecha: n.published_at,
      luchador: n.fighter_name,
      url: n.url,
    })),
  };
}

async function trayectoriaRanking(input: unknown): Promise<ToolResult> {
  // safeParse para devolver {error} legible (mismo shape que el resto) en vez de
  // lanzar ante un id ausente o inválido.
  const parsed = idSchema.safeParse((input as { id?: unknown })?.id);
  if (!parsed.success) {
    return { error: "Necesito un id de luchador válido (usa buscar_luchador primero)." };
  }

  const rows = await getFighterRankingHistory(parsed.data);
  if (rows.length === 0) {
    return {
      trayectoria: [],
      nota: "Este luchador no tiene historial de ranking registrado.",
    };
  }

  const { series } = buildRankingTrajectory(rows);
  return {
    trayectoria: series.map((s) => ({
      division: s.label,
      puntos: s.points.map((p) => ({
        fecha: p.date,
        posicion: p.isChampion ? "Campeón" : `#${p.position}`,
      })),
    })),
  };
}

const HANDLERS: Record<string, (input: unknown) => Promise<ToolResult>> = {
  buscar_luchador: buscarLuchador,
  ficha_y_stats: fichaYStats,
  historial_peleas: historialPeleas,
  evento,
  ranking,
  comparar,
  noticias,
  trayectoria_ranking: trayectoriaRanking,
};

export async function runMaestroTool(name: string, input: unknown): Promise<ToolResult> {
  const handler = HANDLERS[name];
  if (!handler) return { error: `Herramienta desconocida: ${name}` };
  return handler(input);
}
