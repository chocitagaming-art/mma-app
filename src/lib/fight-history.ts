import type { FighterHistoryItem } from "@/lib/types";

// S3-G: fusión del historial UFC (`fights`) con el no-UFC (fight_history_espn)
// SOLO para la tabla del historial de la ficha. Las stats, rachas, forma y
// divisiones de la ficha siguen consumiendo el historial UFC puro (guarda 2
// del plan tanda 2): este helper no debe usarse para nada que calcule números.

function eventTime(item: FighterHistoryItem): number {
  if (!item.eventDate) {
    return Number.NEGATIVE_INFINITY;
  }
  // eventDate llega como ISO string o como Date del driver de pg; new Date()
  // absorbe ambos. Fechas rotas al fondo, como los NULL.
  const parsed = new Date(item.eventDate).getTime();
  return Number.isNaN(parsed) ? Number.NEGATIVE_INFINITY : parsed;
}

export function mergeFightHistories(
  ufcHistory: FighterHistoryItem[],
  espnHistory: FighterHistoryItem[],
): FighterHistoryItem[] {
  if (espnHistory.length === 0) {
    return ufcHistory;
  }
  // sort es estable: a fecha igual (misma noche) se conserva el orden que ya
  // traía cada fuente (ambas llegan desc por fecha).
  return [...ufcHistory, ...espnHistory].sort((a, b) => eventTime(b) - eventTime(a));
}
