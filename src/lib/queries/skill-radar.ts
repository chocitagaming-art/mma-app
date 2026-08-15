import { unstable_cache } from "next/cache";

import { sql } from "@/lib/db";
import type { SkillRadarEntry } from "@/lib/skill-radar";

type SkillRadarRow = {
  fighter_id: number;
  division: string;
  striking: number;
  grappling: number;
  defense: number;
  experience: number;
  cardio: number;
};

// Percentiles 0-100 de las 5 dimensiones del radar, POR DIVISIÓN, para todos
// los luchadores con >= 3 peleas UFC cronometradas con estadísticas.
//
// - Duración y criterio de inclusión = FE4 (fighters.detail.ts): end_round/
//   end_time válidos y eventos desde 2001 (los asaltos pre-2001 inflan el SLpM).
// - La división del luchador se deriva de su última fights.weight_class
//   (patrón latest_weight_class), normalizada a slug con un CASE ordenado:
//   women's antes que men's y 'light heavyweight' ANTES que 'heavyweight'
//   (el texto real es libre: "Lightweight Bout", "UFC Welterweight Title Bout").
// - Cada eje = media de percent_rank() de sus métricas dentro de la división.
//   Las métricas con denominador 0 se coalescen a 0 (van al fondo del
//   percentil: sin intentos no hay evidencia de la habilidad).
// - SApM (golpes absorbidos) puntúa invertido: menos absorbido = mejor Defensa.
async function getSkillRadarEntriesUncached(): Promise<SkillRadarEntry[]> {
  const rows = await sql<SkillRadarRow>(
    `with per_fight as (
      select
        fs.fighter_id,
        (fi.end_round - 1) * 300
          + split_part(fi.end_time, ':', 1)::int * 60
          + split_part(fi.end_time, ':', 2)::int as fight_seconds,
        fs.sig_strikes_landed,
        fs.sig_strikes_attempted,
        fs.takedowns_landed,
        fs.takedowns_attempted,
        fs.submission_attempts,
        fs.control_time_seconds,
        fs.knockdowns,
        opp.sig_strikes_landed as opp_sig_landed,
        opp.sig_strikes_attempted as opp_sig_attempted,
        opp.takedowns_landed as opp_td_landed,
        opp.takedowns_attempted as opp_td_attempted,
        fi.is_title_fight
      from fight_stats fs
      join fights fi on fi.id = fs.fight_id
      join events e on e.id = fi.event_id and e.event_date >= '2001-01-01'
      left join fight_stats opp
        on opp.fight_id = fs.fight_id and opp.fighter_id <> fs.fighter_id
      where fi.end_round >= 1
        and fi.end_time ~ '^[0-9]+:[0-9]{2}$'
    ),
    agg as (
      select
        fighter_id,
        count(*)::float as n_fights,
        sum(fight_seconds)::float as total_seconds,
        (count(*) filter (where is_title_fight))::float as n_title,
        coalesce(sum(sig_strikes_landed)::float * 60 / nullif(sum(fight_seconds), 0), 0) as slpm,
        coalesce(sum(sig_strikes_landed)::float / nullif(sum(sig_strikes_attempted), 0), 0) as sig_acc,
        coalesce(sum(knockdowns)::float * 900 / nullif(sum(fight_seconds), 0), 0) as kd15,
        coalesce(sum(takedowns_landed)::float * 900 / nullif(sum(fight_seconds), 0), 0) as td15,
        coalesce(sum(takedowns_landed)::float / nullif(sum(takedowns_attempted), 0), 0) as td_acc,
        coalesce(sum(submission_attempts)::float * 900 / nullif(sum(fight_seconds), 0), 0) as sub15,
        -- 🪤 NULL NO ES CERO, tercera vez en este proyecto. 'sum()' devuelve
        -- NULL cuando ninguna acta trae el dato, y el 'coalesce(..., 0)' que
        -- había aquí lo convertía en «no controló a nadie» — el mismo bug que
        -- ya se arregló en la ficha del combate, en la del luchador y en el
        -- Maestro, entrando por la cuarta puerta. Y 'fighters.mappers.ts:167'
        -- declara POR ESCRITO que si esta definición diverge de la del tile la
        -- app enseñará dos cuotas de control que no cuadran.
        --
        -- MEDIDO HOY: 0 fichas cambian. El filtro de era de :50
        -- ('event_date >= '2001-01-01'') deja fuera a los 102 luchadores sin
        -- control, que son de 1995-1998, así que el coalesce nunca llegaba a
        -- dispararse por falta de dato: era un no-op documentado como
        -- protección. Se corrige igual — «cero filas en la base» no es «no
        -- puede pasar», y basta con que entre un acta antigua sin control para
        -- que el eje de agarre empiece a publicar un cero inventado.
        --
        -- 🪤 Y AQUÍ EL ARREGLO OBVIO ABRE UNA PUERTA PEOR QUE LA QUE CIERRA.
        -- Devolver NULL a secas no vale: 'percent_rank()' ordena los NULL al
        -- final y les da **1.0**, el percentil MÁS ALTO de la división.
        -- Comprobado en Postgres. O sea que «no se midió su control» se
        -- publicaría como «es el que más controla de su categoría» — cambiar un
        -- cero falso por un máximo falso es mover el incumplimiento de sitio,
        -- que es exactamente lo que pasó con el hover de los botones.
        -- Por eso el descarte va en el 'having' de abajo: quien no tiene NI UNA
        -- acta con control sale del radar entero, igual que ya sale quien tiene
        -- menos de tres peleas. Un eje que no se puede medir no se dibuja.
        sum(control_time_seconds)::float / nullif(sum(fight_seconds), 0) as ctrl_share,
        coalesce(1 - sum(opp_sig_landed)::float / nullif(sum(opp_sig_attempted), 0), 0) as str_def,
        coalesce(1 - sum(opp_td_landed)::float / nullif(sum(opp_td_attempted), 0), 0) as td_def,
        coalesce(sum(opp_sig_landed)::float * 60 / nullif(sum(fight_seconds), 0), 0) as sapm,
        sum(fight_seconds)::float / count(*) as avg_fight_seconds
      from per_fight
      group by fighter_id
      having count(*) >= 3
        and sum(fight_seconds) > 0
        -- Sin una sola acta con tiempo de control no hay eje de agarre que
        -- calcular. Ver la nota de 'ctrl_share': publicarlo como 0 miente, y
        -- publicarlo como NULL miente MÁS, porque percent_rank lo asciende al
        -- percentil más alto. Hoy no excluye a nadie (medido: 0 de 1.811).
        and count(control_time_seconds) > 0
    ),
    latest_wc as (
      select distinct on (a.fighter_id)
        a.fighter_id,
        fi2.weight_class
      from agg a
      join fights fi2
        on (fi2.fighter_red_id = a.fighter_id or fi2.fighter_blue_id = a.fighter_id)
      where fi2.status is distinct from 'cancelled'
        and fi2.weight_class is not null
      order by a.fighter_id,
        (fi2.weight_class ~* '(catch|open)\\s*weight') asc,
        fi2.updated_at desc nulls last,
        fi2.id desc
    ),
    division as (
      select
        fighter_id,
        case
          when weight_class ~* 'women' and weight_class ~* 'strawweight' then 'womens-strawweight'
          when weight_class ~* 'women' and weight_class ~* 'flyweight' then 'womens-flyweight'
          when weight_class ~* 'women' and weight_class ~* 'bantamweight' then 'womens-bantamweight'
          when weight_class ~* 'women' and weight_class ~* 'featherweight' then 'womens-featherweight'
          when weight_class ~* '(catch|open)\\s*weight' then null
          when weight_class ~* 'light heavyweight' then 'light-heavyweight'
          when weight_class ~* 'heavyweight' then 'heavyweight'
          when weight_class ~* 'middleweight' then 'middleweight'
          when weight_class ~* 'welterweight' then 'welterweight'
          when weight_class ~* 'lightweight' then 'lightweight'
          when weight_class ~* 'featherweight' then 'featherweight'
          when weight_class ~* 'bantamweight' then 'bantamweight'
          when weight_class ~* 'flyweight' then 'flyweight'
          when weight_class ~* 'strawweight' then 'strawweight'
          else null
        end as division
      from latest_wc
    ),
    ranked as (
      select
        a.fighter_id,
        d.division,
        percent_rank() over (partition by d.division order by a.slpm) as pct_slpm,
        percent_rank() over (partition by d.division order by a.sig_acc) as pct_sig_acc,
        percent_rank() over (partition by d.division order by a.kd15) as pct_kd15,
        percent_rank() over (partition by d.division order by a.td15) as pct_td15,
        percent_rank() over (partition by d.division order by a.td_acc) as pct_td_acc,
        percent_rank() over (partition by d.division order by a.sub15) as pct_sub15,
        percent_rank() over (partition by d.division order by a.ctrl_share) as pct_ctrl,
        percent_rank() over (partition by d.division order by a.str_def) as pct_str_def,
        percent_rank() over (partition by d.division order by a.td_def) as pct_td_def,
        percent_rank() over (partition by d.division order by a.sapm) as pct_sapm,
        percent_rank() over (partition by d.division order by a.n_fights) as pct_n_fights,
        percent_rank() over (partition by d.division order by a.total_seconds) as pct_total_seconds,
        percent_rank() over (partition by d.division order by a.n_title) as pct_n_title,
        percent_rank() over (partition by d.division order by a.avg_fight_seconds) as pct_avg_seconds
      from agg a
      join division d on d.fighter_id = a.fighter_id
      where d.division is not null
    )
    select
      fighter_id,
      division,
      round((pct_slpm + pct_sig_acc + pct_kd15) / 3 * 100)::int as striking,
      round((pct_td15 + pct_td_acc + pct_sub15 + pct_ctrl) / 4 * 100)::int as grappling,
      round((pct_str_def + pct_td_def + (1 - pct_sapm)) / 3 * 100)::int as defense,
      round((pct_n_fights + pct_total_seconds + pct_n_title) / 3 * 100)::int as experience,
      round((pct_total_seconds + pct_avg_seconds) / 2 * 100)::int as cardio
    from ranked`,
  );

  return rows.map((row) => ({
    fighterId: row.fighter_id,
    division: row.division,
    axes: {
      striking: row.striking,
      grappling: row.grappling,
      defense: row.defense,
      experience: row.experience,
      cardio: row.cardio,
    },
  }));
}

// Cacheada 24 h (los agregados solo cambian tras los eventos del fin de
// semana). El try/catch va FUERA de unstable_cache, como en rankings.ts: un
// fallo transitorio de Neon no debe quedar cacheado un día entero.
const getSkillRadarEntriesCached = unstable_cache(
  getSkillRadarEntriesUncached,
  ["skill-radar-all"],
  { revalidate: 86400, tags: ["radar"] },
);

// unstable_cache NO deduplica ejecuciones concurrentes en cache miss: tras un
// deploy o revalidateTag, N visitas simultáneas a /fights/[id] lanzarían N
// copias de la query más pesada de la app contra un pool de 3 conexiones. El
// memo in-flight (por lambda) colapsa esas ejecuciones en una.
let inFlight: Promise<SkillRadarEntry[]> | null = null;

export async function getSkillRadarEntries(): Promise<SkillRadarEntry[]> {
  try {
    inFlight ??= getSkillRadarEntriesCached().finally(() => {
      inFlight = null;
    });
    return await inFlight;
  } catch (error) {
    console.error("getSkillRadarEntries: fallo calculando percentiles:", error);
    return [];
  }
}
