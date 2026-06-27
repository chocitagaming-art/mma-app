// Saneado puro de la query de búsqueda compartido por las API routes.
// Mantenerlo libre de dependencias de Next/DB para poder testearlo aislado.

export const MAX_SEARCH_QUERY_LENGTH = 100;

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

  if (trimmed.length === 0) {
    return { ok: false };
  }

  return { ok: true, value: trimmed.slice(0, MAX_SEARCH_QUERY_LENGTH) };
}
