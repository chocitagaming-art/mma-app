// FE5b: parseo de los timestamptz de eventos (start_time, prelims_time,
// early_prelims_time). Postgres los entrega como texto "2026-08-16 01:00:00+00",
// que no es ISO 8601 estricto (espacio en vez de "T", offset sin minutos) y no
// todos los motores JS lo parsean. Mismo criterio que EventStartTime (FE5a),
// extraído aquí para reutilizarlo en los horarios por sección.
export function parseEventTimestamp(value: string | null): Date | null {
  if (!value) {
    return null;
  }

  const iso = value.trim().replace(" ", "T");
  const normalized = /[+-]\d{2}$/.test(iso) ? `${iso}:00` : iso;
  const date = new Date(normalized);
  return Number.isNaN(date.getTime()) ? null : date;
}
