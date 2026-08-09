// Regla ÚNICA para decidir el desenlace de una fila de `fights`.
//
// Por qué existe este fichero: la tabla `fights` no tiene columna de resultado
// (001_initial_schema.sql). Solo hay `winner_id` y `method`, y un no-contest
// comparte con un empate la misma firma: winner_id NULL. Durante meses tres
// queries distintas resolvieron eso cada una por su cuenta con
// `when winner_id is null then 'draw'`, así que la web llamaba "Empate" a 92
// combates que no lo fueron — y a la vez el récord W-L-D de la ficha SÍ los
// excluía. La misma pantalla decía las dos cosas.
//
// Reparto real de `fights` medido contra Neon el 9-ago-2026 (8.851 filas):
//   win/loss 8627 · nc 92 · scheduled 68 · draw 64
// y dentro de las 224 filas con winner_id NULL:
//   CNC 33 · Overturned* 59 · M-DEC 38 · S-DEC 17 · U-DEC 7 · Other 2 · NULL 68

/**
 * Si el `method` de un combate lo marca como **no contest**.
 *
 * Dos familias, y ninguna aparece jamás con ganador (0 filas el 9-ago-2026):
 * - `CNC`, el código de ufcstats. (`NC` a secas no existe hoy en la BD, pero lo
 *   emite `espn_fight_history.py`, así que se cubre.)
 * - `Overturned`, con o sin el detalle concatenado detrás
 *   (`Overturned - Guillotine Choke`): 41 secas + 18 con detalle.
 *
 * `Other` NO entra. Sus dos únicas filas son Gracie-Shamrock (UFC 5, 1995) y
 * Taktarov-Shamrock (UFC 7, 1995): los empates históricos por límite de tiempo.
 */
export function isNoContestMethod(method: string | null): boolean {
  if (!method) {
    return false;
  }

  const key = method.trim().toLowerCase();
  return key.startsWith("overturn") || key === "cnc" || key === "nc";
}

/**
 * Si un combate **ya tiene desenlace**, sea el que sea.
 *
 * Un empate y un no contest no tienen ganador y no se lo va a dar nadie: para
 * ellos `method` es la señal de que la pelea se celebró y quedó resuelta. El
 * panel `/estado` preguntaba solo por `winner_id is not null`, así que toda
 * velada que contuviera uno de los dos se quedaba incompleta PARA SIEMPRE —
 * 143 eventos el 9-ago-2026— y el guardián mandaba un correo rojo cada hora
 * aconsejando relanzar la ingesta, que no podía arreglar nada porque no había
 * ningún ganador que traer.
 *
 * Es el mismo criterio que ya usa el panel `/directo` (`consulta.ts`), donde el
 * cartel se da por cerrado por el mayor de (con ganador, con método).
 */
export function resueltoSqlPredicate(alias = "f"): string {
  return `(${alias}.winner_id is not null or ${alias}.method is not null)`;
}

/**
 * El mismo criterio de {@link isNoContestMethod}, como predicado SQL suelto.
 *
 * Lo usan el CASE del historial y el recuento del récord W-L-D. Que salgan de
 * aquí los dos es el objetivo del fichero: tener el criterio escrito dos veces
 * es lo que dejó la ficha de un luchador diciendo el récord SIN el no contest
 * arriba y "Empate" sobre esa misma pelea en la tabla de abajo.
 */
export function noContestSqlPredicate(alias = "fi"): string {
  return `(${alias}.method ilike 'overturn%' or ${alias}.method in ('CNC', 'NC'))`;
}

/**
 * El mismo criterio, como fragmento SQL para las queries del historial.
 *
 * **El orden de las ramas es la parte frágil** y por eso está fijado con test:
 * - `scheduled` va primero. `method is null` es la única señal fiable de un
 *   combate no disputado: por fecha se escaparían las 7 peleas canceladas de
 *   eventos ya celebrados.
 * - `nc` va ANTES del empate. Todos los no-contests tienen winner_id NULL, así
 *   que con las ramas al revés la de 'nc' es inalcanzable y el bug vuelve.
 *
 * @param fighterParam placeholder del luchador cuya perspectiva se pinta ($1…).
 * @param alias alias de la tabla `fights` en la query que lo consume.
 */
export function fightResultCaseSql(fighterParam: string, alias = "fi"): string {
  return `case
          when ${alias}.method is null then 'scheduled'
          when ${noContestSqlPredicate(alias)} then 'nc'
          when ${alias}.winner_id is null then 'draw'
          when ${alias}.winner_id = ${fighterParam} then 'win'
          else 'loss'
        end`;
}
