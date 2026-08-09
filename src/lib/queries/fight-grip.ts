import { cache } from "react";

import { sql } from "@/lib/db";
import type { GripRoundInput } from "@/lib/fight-grip";

// El acta de un combate para la película, con los nulos INTACTOS.
//
// 🪤 Por qué esto no reutiliza getFightRoundStats, que ya lee la misma tabla:
// aquel mapea `row.control_time_seconds ?? 0` (queries/fights.ts:438, y :131
// para el acumulado) y su tipo FightRoundStats declara `controlTimeSeconds:
// number`. Con ese contrato, un asalto SIN ACTA llega como 0 y es
// indistinguible de un asalto en el que nadie sujetó a nadie: la barra cerrada
// dibujaría "nadie sujetaba, el 100 %" sobre un dato que no existe. Son 374
// filas de fight_stats_rounds —toda la era 1995-1998— y 304 de fight_stats.
//
// Es el mismo bug que el de los 568 medidores que decían "0 %" sin denominador,
// entrando por otra puerta. La regla de la casa: un ratio sin denominador es
// null y NO SE PINTA; un 0 solo se publica si es un cero de verdad.
//
// No se toca FightRoundStats para arreglarlo: de él cuelga "Asalto a asalto",
// que está publicado y funcionando. Esta es una tubería nueva al lado.

export type FightGripRow = {
  // null en la fila del acumulado del combate; el número del asalto en el resto.
  round: number | null;
  corner: "red" | "blue";
  control_time_seconds: number | null;
};

export type FightGripStats = {
  redControlSeconds: number | null;
  blueControlSeconds: number | null;
  rounds: GripRoundInput[];
};

const VACIO: FightGripStats = {
  redControlSeconds: null,
  blueControlSeconds: null,
  rounds: [],
};

export function mapFightGripRows(rows: FightGripRow[]): FightGripStats {
  let red: number | null = null;
  let blue: number | null = null;
  const porAsalto = new Map<number, GripRoundInput>();

  for (const row of rows) {
    // Ni `?? 0` ni `Number(...)`: lo que venga null se queda null. Es todo el
    // objetivo del fichero.
    const control = row.control_time_seconds;

    if (row.round == null) {
      if (row.corner === "red") {
        red = control;
      } else {
        blue = control;
      }
      continue;
    }

    const asalto = porAsalto.get(row.round) ?? {
      round: row.round,
      redControlSeconds: null,
      blueControlSeconds: null,
    };
    if (row.corner === "red") {
      asalto.redControlSeconds = control;
    } else {
      asalto.blueControlSeconds = control;
    }
    porAsalto.set(row.round, asalto);
  }

  return {
    redControlSeconds: red,
    blueControlSeconds: blue,
    // El orden es un invariante del dibujo, no una casualidad de la consulta.
    rounds: [...porAsalto.values()].sort((a, b) => a.round - b.round),
  };
}

// Un solo viaje para el acumulado y el desglose por asaltos. La esquina se
// resuelve en SQL contra fights, así que el consumidor no necesita saber qué
// fighter_id es cuál.
//
// DEGRADA a vacío ante cualquier error, igual que getFightSampleSeries: la
// película es un extra y nunca puede tumbar la ficha. Importa de verdad porque
// la página resuelve sus consultas en un Promise.all contra un pool de 3
// conexiones: una promesa que rechaza se lleva por delante toda la página.
export const getFightGripStats = cache(async (
  fightId: number,
): Promise<FightGripStats> => {
  try {
    const rows = await sql<FightGripRow>(
      `select
        null::int as round,
        case when s.fighter_id = f.fighter_red_id then 'red' else 'blue' end as corner,
        s.control_time_seconds
      from fight_stats s
      join fights f on f.id = s.fight_id
      where s.fight_id = $1
        and s.fighter_id in (f.fighter_red_id, f.fighter_blue_id)
      union all
      select
        r.round,
        case when r.fighter_id = f.fighter_red_id then 'red' else 'blue' end as corner,
        r.control_time_seconds
      from fight_stats_rounds r
      join fights f on f.id = r.fight_id
      where r.fight_id = $1
        and r.fighter_id in (f.fighter_red_id, f.fighter_blue_id)
      order by 1 nulls first, 2`,
      [fightId],
    );
    return mapFightGripRows(rows);
  } catch (error) {
    console.error("getFightGripStats degraded to empty:", error);
    return VACIO;
  }
});
