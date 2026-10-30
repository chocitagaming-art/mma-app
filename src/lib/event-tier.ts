/**
 * El TIPO de velada, y quién puede ser "el evento destacado" del sitio.
 *
 * EL PROBLEMA QUE ARREGLA. El 26-ago-2026 el "Road To UFC: Maheshate vs.
 * Flowers" (2 combates, sin sede, sin póster y sin cuotas) desplazó al UFC
 * Fight Night del sábado en la portada, en /eventos, en /en-vivo, en /ufc-hoy,
 * en /estado y en /directo. Los dos son `promotion_id = 1`, así que la
 * promotora NO los distingue: todas esas consultas ordenaban por fecha y nada
 * más, y el viernes va antes que el sábado.
 *
 * DÓNDE VIVE LA REGLA. No aquí: en la base, en la columna generada
 * `events.tier` (migración 028). Postgres la calcula sola a partir del slug y
 * del nombre, así que no se puede escribir ni desincronizar. Este fichero solo
 * dice DE QUÉ LADO cae cada valor, y lo dice UNA vez para las nueve consultas
 * que preguntan "¿cuál es el próximo evento?".
 *
 * @see db/migrations/028_events_tier.sql en mma-ingesta
 */

/** Los valores que puede tomar `events.tier`. Los fija el CHECK de la 028. */
export const EVENT_TIERS = [
  "numbered",
  "fight_night",
  "tuf_finale",
  "road_to_ufc",
  "dwcs",
  "tuf_series",
  "unknown",
] as const;

export type EventTier = (typeof EVENT_TIERS)[number];

/**
 * De qué lado cae cada tipo. `true` = puede ser el evento destacado.
 *
 * ⚠️ ESTE `Record` ES LA RED. Al estar tipado con la unión completa, añadir un
 * valor nuevo a EVENT_TIERS sin decir de qué lado cae NO COMPILA, y lo caza la
 * puerta 1 del megatest antes de que llegue a producción.
 *
 * 'unknown' cae del lado destacable A PROPÓSITO, y es la decisión de diseño más
 * importante del fichero: un formato que no reconozcamos se VE en la portada
 * (molesto, visible, de un renglón) y nunca se esconde. El fallo contrario —un
 * UFC Fight Night que desaparece del hero, de /en-vivo y del centinela, en
 * silencio, un sábado por la noche— es mucho peor. Los 8 'unknown' que hay en
 * la base son veladas UFC completas y todas pasadas (Ultimate Japan, UFC Macao,
 * UFC Freedom 250...). No lo "corrijas" pensando que es un despiste.
 */
export const TIER_DESTACABLE: Record<EventTier, boolean> = {
  numbered: true,
  fight_night: true,
  tuf_finale: true, // Las 28 "... Finale" son carteles UFC de verdad.
  unknown: true, // Ver arriba. Es deliberado.
  road_to_ufc: false,
  dwcs: false,
  tuf_series: false,
};

/** Los que NO pueden ser el destacado. Derivado, para no escribir la lista dos veces. */
export const TIERS_SECUNDARIOS = EVENT_TIERS.filter(
  (tier) => !TIER_DESTACABLE[tier],
);

/**
 * El predicado SQL de "este evento puede ser el destacado".
 *
 * Va SOLO donde la pregunta es "¿cuál es EL evento que enseño / grabo /
 * vigilo?". Donde la pregunta es "¿qué eventos existen?" —la lista de /eventos,
 * la ficha del evento, el buscador, el sitemap, los favoritos—
 * ponerlo es una REGRESIÓN: dejaría un evento de la UFC inaccesible. (La lista
 * de /eventos tiene su propio filtro, enListaDeEventosSql, que solo saca el
 * Road To UFC.)
 */
export function eventoPrincipalSql(alias = "e"): string {
  const lista = TIERS_SECUNDARIOS.map((tier) => `'${tier}'`).join(",");
  // El alias vacío NO es un caso raro: CARTELERA_SQL de /estado y EVENTO_SQL de
  // /directo consultan `from events` a secas. Sin este guard salía
  // `and .tier NOT IN (...)`, con el punto colgando, y Postgres lo rechaza con
  // un error de sintaxis: las dos consultas REVENTABAN, no es que enseñaran el
  // evento equivocado. Lo cazó event-tier.test.ts antes de desplegar.
  const prefijo = alias ? `${alias}.` : "";
  return `${prefijo}tier NOT IN (${lista})`;
}

/**
 * Qué tipos salen en la LISTA de /eventos («Pasados» y «Próximos»). Es otra
 * pregunta que la del destacado, con otra respuesta: el dueño, el 30-oct-2026,
 * mirando «Pasados», sacó de ahí los Road To UFC (2 combates, sin póster ni
 * sede: «no queda bien») y SOLO ellos. El Contender Series y el TUF, si un día
 * los hay, se listan. La ficha y el buscador no filtran nada: un Road To UFC
 * sigue alcanzable desde la ficha de sus luchadores y buscándolo
 * (event-tier-callsites.test.ts vigila dónde va).
 */
export const TIER_EN_LISTA: Record<EventTier, boolean> = {
  numbered: true,
  fight_night: true,
  tuf_finale: true,
  unknown: true,
  road_to_ufc: false,
  dwcs: true,
  tuf_series: true,
};

/** El predicado SQL de «este evento sale en la lista de /eventos». */
export function enListaDeEventosSql(alias = "e"): string {
  const fuera = EVENT_TIERS.filter((tier) => !TIER_EN_LISTA[tier])
    .map((tier) => `'${tier}'`)
    .join(",");
  const prefijo = alias ? `${alias}.` : "";
  return `${prefijo}tier NOT IN (${fuera})`;
}

/**
 * El rótulo que se pinta en la tarjeta de un evento secundario, para que se vea
 * qué es y no parezca la velada de la semana. `null` = no se pinta nada.
 */
export const ETIQUETA_TIER: Record<EventTier, string | null> = {
  numbered: null,
  fight_night: null,
  tuf_finale: null,
  unknown: null,
  road_to_ufc: "Road To UFC",
  dwcs: "Contender Series",
  tuf_series: "The Ultimate Fighter",
};
