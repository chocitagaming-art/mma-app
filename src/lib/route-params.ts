// Parseo puro de parámetros de ruta compartido por las páginas. Sin dependencias
// de Next ni de la BD para poder testearlo aislado.

function firstValue(raw: string | string[] | undefined): string | undefined {
  return Array.isArray(raw) ? raw[0] : raw;
}

// El tipo de las columnas id es integer (int4) en Postgres: su máximo es
// 2.147.483.647. Un entero mayor —aunque sea "seguro" en JS— dispara el error
// 22003 (value out of range) en la query y un 500. Lo tratamos como no encontrado.
const PG_INT4_MAX = 2_147_483_647;

// Parsea un id de ruta dinámica ("/fighters/[id]"). Devuelve el entero positivo
// dentro del rango int4 de Postgres, o null cuando no lo es (no numérico,
// decimal, <= 0, vacío, fuera del rango seguro o mayor que int4). El guard evita
// que un "NaN" o un número fuera de rango llegue a la query SQL y provoque un 500.
export function parseId(raw: string | string[] | undefined): number | null {
  const value = firstValue(raw);

  if (typeof value !== "string" || !/^\d+$/.test(value.trim())) {
    return null;
  }

  const parsed = Number(value.trim());

  if (!Number.isSafeInteger(parsed) || parsed <= 0 || parsed > PG_INT4_MAX) {
    return null;
  }

  return parsed;
}

// Normaliza el parámetro ?page de las listas. Devuelve un entero >= 1, usando 1
// como fallback cuando el valor falta o no es un entero válido en rango seguro.
export function parsePageParam(raw: string | string[] | undefined): number {
  const value = firstValue(raw);

  if (typeof value !== "string" || !/^\d+$/.test(value.trim())) {
    return 1;
  }

  const parsed = Number(value.trim());

  if (!Number.isSafeInteger(parsed) || parsed < 1) {
    return 1;
  }

  return parsed;
}
