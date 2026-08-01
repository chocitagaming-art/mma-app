// Helpers puros para construir patrones LIKE/ILIKE parametrizados.
// Postgres trata '\' como carácter de escape por defecto en LIKE/ILIKE, así
// que escapamos los metacaracteres del PATRÓN (%, _, \) para que un valor
// como "100% Fighter" busque el texto literal y no un comodín.

export function escapeLikePattern(value: string): string {
  return value.replace(/[\\%_]/g, (char) => `\\${char}`);
}

// Patrón "contiene" listo para pasar como parámetro de ILIKE ('%valor%').
export function containsPattern(value: string): string {
  return `%${escapeLikePattern(value.trim())}%`;
}

// Patrón "empieza por" ('valor%'), para ordenar poniendo delante las
// coincidencias por prefijo. Mismo escapado que `containsPattern`: sin él, un
// usuario que teclea "%" convierte el criterio de orden en "casa con todo".
export function startsWithPattern(value: string): string {
  return `${escapeLikePattern(value.trim())}%`;
}
