// QUIÉN ES CAMPEÓN AHORA: una regla, para las tarjetas que lo pintan en oro.
//
// El dueño, 29-oct-2026: «bordear los cuadros donde están los CAMPEONES
// actuales y resaltarlos con un bordeado oro, solo a los actuales campeones y
// así con los que vayan llegando». Por eso no hay lista a mano en ningún sitio:
// campeón es quien lleva `rankings.is_champion` en la ÚLTIMA foto del ranking,
// que el cron semanal refresh-rankings renueva. El que llega gana el oro y el
// que pierde el cinturón lo pierde, solos.
//
// La última foto de TODA la tabla, no la última de cada división, y está
// medido (29-oct-2026, solo lectura): las 13 divisiones comparten la foto del
// 28-oct, y la ingesta escribe la foto entera de una pasada y con una sola
// fecha (mma-ingesta, src/scrapers/rankings.py). Es además la foto que leen
// /clasificacion, el libra por libra de la portada y el orden de /fighters: el
// oro tiene que coincidir con ellos. Con «la última de cada división», el
// campeón de una división que ufc.com dejara de publicar se quedaría el oro
// para siempre.
//
// /fighters no usa este helper: su consulta ya lee esa misma foto en el CTE
// `rel` (el orden por relevancia) y saca de ahí el oro sin volver a la tabla.
// current-champion.test.ts vigila las dos formas.
//
// 🪤 CACHÉ, como current-weight-class.ts: la clave de unstable_cache lleva el
// TEXTO de la función cacheada, que contiene la llamada a este helper y no lo
// que devuelve. Un retoque SOLO de este fichero necesita POST /api/revalidate
// tras desplegar (tag 'home').

const SQL_ALIAS = /^[a-z_][a-z0-9_]*$/i;

/**
 * Expresión SQL booleana (nunca NULL): ¿el luchador `fighterAlias` es campeón
 * en la última foto del ranking? Se usa como columna:
 * `${currentChampionSql("f")} as is_champion`.
 *
 * Un `exists` por fila sobre el índice único (fighter_id, …) de `rankings`, y
 * el max(snapshot_date) lo calcula Postgres una sola vez por consulta: ninguna
 * consulta de más.
 *
 * @param fighterAlias alias de la tabla `fighters` en la consulta que la usa.
 */
export function currentChampionSql(fighterAlias = "f"): string {
  if (!SQL_ALIAS.test(fighterAlias)) {
    throw new Error(`Alias SQL no válido: ${fighterAlias}`);
  }
  return `exists (
        select 1
        from rankings cch_r
        where cch_r.fighter_id = ${fighterAlias}.id
          and cch_r.is_champion
          and cch_r.snapshot_date = (select max(snapshot_date) from rankings)
      )`;
}
