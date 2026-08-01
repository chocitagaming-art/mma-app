// Saneado puro de la query de búsqueda compartido por las API routes.
// Mantenerlo libre de dependencias de Next/DB para poder testearlo aislado.

export const MAX_SEARCH_QUERY_LENGTH = 100;

// Mínimo por debajo del cual la búsqueda no compensa. No es una cifra redonda
// elegida a ojo: medida con EXPLAIN ANALYZE contra la BD real, con 1-2 letras
// el planificador descarta el índice trigram de la migración 020 y hace Seq
// Scan sobre las 2.852 filas de `fighters` (8,1 ms con "j", 6,3 con "jo");
// desde 3 usa Bitmap Index Scan (3,1 ms con "jon", 1,65 con "jones"). Y la
// tabla `news` no tiene índice trigram ninguno, así que ahí el escaneo es
// siempre completo. Como la búsqueda global lanza TRES consultas en paralelo
// contra un pool de 3 conexiones, una ráfaga de queries de una letra ocupa el
// pool entero de esa instancia.
// Comprobado que no rompe nada real: no hay ni un luchador cuyo nombre tenga
// menos de 3 caracteres.
export const MIN_SEARCH_QUERY_LENGTH = 3;

export type NormalizedSearchQuery =
  | { ok: true; value: string }
  | { ok: false };

// Recorta espacios, descarta entradas vacías y limita la longitud para no
// pasar queries arbitrariamente largas a la base de datos.
export function normalizeSearchQuery(
  raw: string | null | undefined,
): NormalizedSearchQuery {
  if (typeof raw !== "string") {
    return { ok: false };
  }

  const trimmed = raw.trim();

  // Se mide DESPUÉS de recortar: "  jo  " son dos caracteres de búsqueda, no
  // seis. Y con [...trimmed] se cuentan caracteres y no unidades UTF-16, para
  // no penalizar los nombres acentuados ni los alfabetos no latinos.
  if ([...trimmed].length < MIN_SEARCH_QUERY_LENGTH) {
    return { ok: false };
  }

  return { ok: true, value: trimmed.slice(0, MAX_SEARCH_QUERY_LENGTH) };
}
