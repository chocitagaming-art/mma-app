// Densidad de marcadores de "la película del combate".
//
// El backfill de UFC 329 venía de capturas cada 120 s, así que la película
// completa nunca ha pintado más de ~6 puntos por esquina. El bucle del directo
// muestrea cada ~20 s: un combate de 3 asaltos deja ~40 puntos y uno de 5 (con
// los descansos) ~70-90. Pintar un marcador por muestra sobre 700 px convierte
// la línea en un rosario y tapa justo lo que la película cuenta: la FORMA de la
// pelea y el instante de cada evento.
//
// Reparto: la LÍNEA se sigue dibujando con todos los puntos (la fidelidad no se
// toca) y solo se adelgazan los MARCADORES, conservando siempre los que llevan
// evento (knockdown o derribo) y el último de la serie. Por debajo del tope no
// descarta nada, así que las películas ya publicadas se ven exactamente igual.

// ~28 marcadores sobre los 700 px útiles del viewBox = uno cada ~25 px, que es
// la densidad del patrón ranking-trajectory ya aprobado.
export const MAX_TIMELINE_MARKERS = 28;

type MarkerCandidate = {
  kdDelta: number;
  tdDelta: number;
};

// Índices de `points` que llevan marcador. Devuelve un Set para que el
// componente decida punto a punto sin recorrer el array otra vez.
export function selectMarkerIndices(
  points: readonly MarkerCandidate[],
  maxMarkers: number = MAX_TIMELINE_MARKERS,
): Set<number> {
  const total = points.length;
  const budget = Math.max(1, Math.floor(maxMarkers));
  if (total <= budget) {
    return new Set(points.map((_, idx) => idx));
  }
  const stride = Math.ceil(total / budget);
  const keep = new Set<number>();
  for (let idx = 0; idx < total; idx++) {
    const point = points[idx];
    // Un evento jamás se decima: el anillo de knockdown es el momento que
    // cambia la pelea y perderlo sería perder el dato, no resolución.
    if (
      idx % stride === 0 ||
      idx === total - 1 ||
      point.kdDelta > 0 ||
      point.tdDelta > 0
    ) {
      keep.add(idx);
    }
  }
  return keep;
}
