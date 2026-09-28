import { resueltoSqlPredicate } from "@/lib/fight-result";

// LA CATEGORÍA ACTUAL DE UN LUCHADOR: una sola regla para toda la web.
//
// Por qué existe este fichero: hasta el 28-sep-2026 había seis copias de la
// misma subconsulta (portada, /fighters, ficha, cara a cara, Maestro…) y todas
// elegían la categoría ordenando los combates por `fights.updated_at`, que es la
// fecha en la que el scraper tocó la fila, no la del combate. Shevchenko salía
// «Peso Gallo (F)» por una pelea de 2015, y el cara a cara Shevchenko–Natalia
// Silva avisaba de un «Enfrentamiento hipotético» entre dos pesos mosca.
//
// Ordenar por fecha a secas tampoco era la regla buena, y está medido (175
// rankeados en la foto del 23-sep): coincidían con su división oficial 158 por
// `updated_at` y 170 por fecha. Lo de la fecha rompía a Zhang Weili (#1 del
// paja; perdió por el título del mosca y volvió), a Holloway y a Usman, y
// Johnny Walker salía pesado por un combate que aún no se ha peleado.
//
// La regla, decidida por el dueño, en este orden:
//   1. La división de su RANKING en la última foto, sin los libra por libra, la
//      de mejor puesto (0 = campeón). Así la ficha dice lo mismo que
//      /clasificacion por construcción: 175 de 175.
//   2. Si no está rankeado: su último combate DISPUTADO por fecha del evento,
//      con catch/open weight solo si no tiene otra (misma semántica que
//      division-history.ts) y desempate por id.
//   3. Si solo tiene combates programados: el programado.
//
// 🪤 CACHÉ. `unstable_cache` construye su clave con `cb.toString()`
// (node_modules/next/dist/server/web/spec-extension/unstable-cache.js:55), y ese
// texto es el cuerpo de la función cacheada: lleva la LLAMADA
// `${currentWeightClassSql("f")}`, no lo que devuelve. Si algún día se retoca
// SOLO este fichero, la clave de getFeaturedFighters (tag 'home') y de
// getFighterDetail (tag 'fighters') NO cambia y la Data Cache, que sobrevive a
// los despliegues, sigue sirviendo la categoría vieja hasta 30 min. Tras
// desplegar un cambio así: POST /api/revalidate, que invalida 'home' y
// 'fighters' (src/app/api/revalidate/route.ts).
//
// Fuera de esta regla, a propósito y apuntado en el BACKLOG:
//   - src/lib/queries/skill-radar.ts: su categoría decide el grupo de
//     percentiles del radar; cambiarla mueve las cifras, no solo la etiqueta.
//   - mma-ingesta/src/prediction/api.py: `latest_weight_class` del perfil de la
//     predicción, con su propio ORDER BY.

/**
 * Slug de división del ranking → categoría tal como la escribe ufcstats en
 * `fights.weight_class`.
 *
 * Se traduce al texto de `fights` y no al revés porque todo lo que pinta la
 * categoría ya sabe leer ese texto: `formatWeightClass` lo pasa a español y la
 * silueta decide el sexo con `/women/i`. Un slug que no esté aquí (uno nuevo de
 * la ingesta) no rompe nada: se ignora y manda la regla de los combates.
 */
export const RANKING_DIVISION_WEIGHT_CLASS: Readonly<Record<string, string>> = {
  flyweight: "Flyweight",
  bantamweight: "Bantamweight",
  featherweight: "Featherweight",
  lightweight: "Lightweight",
  welterweight: "Welterweight",
  middleweight: "Middleweight",
  light_heavyweight: "Light Heavyweight",
  heavyweight: "Heavyweight",
  womens_strawweight: "Women's Strawweight",
  womens_flyweight: "Women's Flyweight",
  womens_bantamweight: "Women's Bantamweight",
  // Hoy no hay ranking del pluma femenino (desapareció en 2023), pero el
  // Maestro y /clasificacion lo siguen conociendo.
  womens_featherweight: "Women's Featherweight",
};

const SQL_ALIAS = /^[a-z_][a-z0-9_]*$/i;

/** Literal SQL con la comilla escapada: `Women's` → `'Women''s'`. */
function sqlLiteral(value: string): string {
  return `'${value.replace(/'/g, "''")}'`;
}

/**
 * Expresión SQL (escalar) con la categoría actual del luchador `fighterAlias`,
 * en el texto de `fights.weight_class`. Se usa como columna:
 * `${currentWeightClassSql("f")} as latest_weight_class`.
 *
 * Los alias de dentro (`cwc_*`) son propios para no chocar con los de la
 * consulta que la contiene, que suele tener ya un `fi` o un `r`.
 *
 * @param fighterAlias alias de la tabla `fighters` en la consulta que la usa.
 */
export function currentWeightClassSql(fighterAlias = "f"): string {
  if (!SQL_ALIAS.test(fighterAlias)) {
    throw new Error(`Alias SQL no válido: ${fighterAlias}`);
  }
  const a = fighterAlias;
  const entries = Object.entries(RANKING_DIVISION_WEIGHT_CLASS);
  const whens = entries
    .map(([slug, weightClass]) => `when ${sqlLiteral(slug)} then ${sqlLiteral(weightClass)}`)
    .join(" ");
  const slugs = entries.map(([slug]) => sqlLiteral(slug)).join(", ");

  return `coalesce(
        (
          select case cwc_r.division ${whens} end
          from rankings cwc_r
          where cwc_r.fighter_id = ${a}.id
            and cwc_r.snapshot_date = (select max(snapshot_date) from rankings)
            and cwc_r.division in (${slugs})
          order by cwc_r.rank_position asc, cwc_r.division asc
          limit 1
        ),
        (
          select cwc_fi.weight_class
          from fights cwc_fi
          left join events cwc_e on cwc_e.id = cwc_fi.event_id
          where (cwc_fi.fighter_red_id = ${a}.id or cwc_fi.fighter_blue_id = ${a}.id)
            and cwc_fi.status is distinct from 'cancelled'
            and cwc_fi.weight_class is not null
          order by ${resueltoSqlPredicate("cwc_fi")} desc,
            (cwc_fi.weight_class ~* '(catch|open)\\s*weight') asc,
            cwc_e.event_date desc nulls last,
            cwc_fi.id desc
          limit 1
        )
      )`;
}
