// CUÁNTAS PELEAS TIENE UN LUCHADOR, según lo que la tarjeta enseña.
//
// Hasta el 28-sep-2026 el pie de la tarjeta de la portada decía «19 peleas» al
// lado de un récord 29-1-0 (Makhachev). Contaba filas de `fights`: solo UFC y
// con los combates PROGRAMADOS dentro (Volkanovski sumaba ya el del 24-oct). La
// regla del dueño es que el número salga del MISMO récord que se pinta al lado,
// para que cuadre por construcción.
//
// 🪤 Por qué no se suma `fight_history_espn` a las de UFC, que da el mismo 30
// para Makhachev: el 28-sep-2026 solo cuadraba con el récord en 1.511 de 2.884
// luchadores. Se quedaba corta en 1.327 (sin historial ESPN, o con peleas del
// Contender Series, que el scraper saltó hasta el 29-sep-2026) y se pasaba en
// 46 (solo 3 de ellos por duplicados Road to UFC, que la web esconde desde ese
// día). El récord de `fighters` es el que se enseña, y el que manda.

/**
 * Victorias + derrotas + empates del récord que se enseña.
 *
 * Los no contests NO entran, y es a propósito: la tabla `fighters` no los
 * guarda y la tarjeta pinta V-D-E. Jon Jones enseña 28-1-0 → 29, no 30.
 *
 * Devuelve null —no un número inventado— si falta alguna pieza, y también con
 * 0-0-0: las tres columnas son `default 0`, y un luchador que está en la base
 * tiene como mínimo un combate UFC, así que ese cero es «sin dato».
 */
export function recordFightTotal(
  wins: number | null | undefined,
  losses: number | null | undefined,
  draws: number | null | undefined,
): number | null {
  const parts = [wins, losses, draws];
  if (!parts.every((n): n is number => typeof n === "number" && Number.isFinite(n))) {
    return null;
  }
  const total = parts.reduce((sum, n) => sum + n, 0);
  return total > 0 ? total : null;
}

type FightCounts = {
  /** Total según el récord ({@link recordFightTotal}); null si no hay récord. */
  fightCount: number | null;
  /** Peleas UFC ya disputadas (sin programados); null si no se calcularon. */
  ufcFightCount: number | null;
};

/**
 * Rótulo del pie de la tarjeta de luchador.
 *
 * - Con récord: «30 peleas» (y «1 pelea»).
 * - Sin récord: cae a las UFC disputadas y lo DICE en el rótulo, «3 en UFC»,
 *   para no hacer pasar una cifra parcial por el total de su carrera.
 * - Sin ninguna de las dos: null, y la tarjeta no pinta contador.
 *
 * Cabe en una línea, medido con navegador el 28-sep-2026: a 360 px el pie deja
 * ~88 px libres junto a «Comparar» y «Ver perfil →» (171 px), y «30 peleas»
 * ocupa 60. Una frase más larga («30 peleas · 19 en UFC», 137 px medidos a
 * 375) ya NO cabe. Remedido el 29-sep-2026 con el contador en
 * `whitespace-nowrap`: los 6 pies del masculino caben en una línea a 390, 360 y
 * 320 px (320 queda fuera de los proyectos e2e, que empiezan en 390).
 * e2e/portada-p4p.spec.ts vigila que ningún pie parta en dos líneas, midiendo
 * el ALTO del pie entero (ver allí por qué no vale contar cajas).
 */
export function fightCountLabel({ fightCount, ufcFightCount }: FightCounts): string | null {
  if (fightCount !== null) {
    return `${fightCount} ${fightCount === 1 ? "pelea" : "peleas"}`;
  }
  if (ufcFightCount !== null && ufcFightCount > 0) {
    return `${ufcFightCount} en UFC`;
  }
  return null;
}
