// Minigráfico de barras divergentes de factores del modelo (maqueta aprobada
// 19-jul). Helpers puros sin dependencias de Next/DOM para testearlos aislados
// (mismo patrón que skill-radar.ts / svg-donut.ts): el componente solo pinta
// lo que buildShapBars devuelve.

import type { PredictionFeature } from "@/lib/prediction";

export type ShapBarRow = {
  // Nombre de feature del modelo (con sufijo _diff), o "rest" para la barra
  // agregada de los factores no mostrados.
  name: string;
  // Contribución simetrizada en log-odds (con signo: >= 0 empuja a la roja).
  contribution: number;
  side: "red" | "blue";
  // Ancho de la barra en % del ÁREA de barra de su mitad (100 = la barra más
  // larga del gráfico). El área excluye el hueco fijo del número, así el valor
  // nunca se sale de la caja (petición del dueño al aprobar la maqueta).
  widthPct: number;
  // Valor (diff rojo−azul imputado) que vio el modelo; null en la fila "rest".
  value: number | null;
  isRest: boolean;
  // Nº de factores agregados en la fila "rest" (solo cuando isRest).
  restCount?: number;
};

// Las contribuciones por debajo de este ancho se pintan con un mínimo visible
// para que la barra no desaparezca (sigue siendo honesta: el número manda).
export const MIN_BAR_WIDTH_PCT = 2;

export function buildShapBars(
  topFeatures: PredictionFeature[],
  featureContributions: Record<string, number> | null | undefined,
  maxFactors: number,
): ShapBarRow[] {
  const shown = topFeatures.slice(0, maxFactors);
  const rows: ShapBarRow[] = shown.map((feature) => ({
    name: feature.name,
    contribution: feature.contribution,
    side: feature.contribution >= 0 ? "red" : "blue",
    widthPct: 0,
    value: feature.value,
    isRest: false,
  }));

  // Barra "resto de factores": suma de las contribuciones NO mostradas, desde
  // el mapa completo (si el servicio aún no lo envía, simplemente no hay fila
  // de resto). Como las contribuciones simetrizadas suman el margen del
  // modelo, factores + resto cierran la balanza exactamente.
  if (featureContributions) {
    const shownNames = new Set(shown.map((feature) => feature.name));
    let rest = 0;
    let restCount = 0;
    for (const [name, contribution] of Object.entries(featureContributions)) {
      if (!shownNames.has(name)) {
        rest += contribution;
        restCount += 1;
      }
    }
    if (restCount > 0) {
      rows.push({
        name: "rest",
        contribution: rest,
        side: rest >= 0 ? "red" : "blue",
        widthPct: 0,
        value: null,
        isRest: true,
        restCount,
      });
    }
  }

  const maxAbs = Math.max(...rows.map((row) => Math.abs(row.contribution)), 0);
  for (const row of rows) {
    row.widthPct =
      maxAbs === 0
        ? MIN_BAR_WIDTH_PCT
        : Math.max(
            MIN_BAR_WIDTH_PCT,
            round1((Math.abs(row.contribution) / maxAbs) * 100),
          );
  }
  return rows;
}

// Magnitud de una contribución para mostrar junto a la barra (sin signo: el
// lado ya lo da la dirección de la barra). Mismo formato toFixed(2) que los
// badges actuales de "Factores clave".
export function formatContribution(contribution: number): string {
  return Math.abs(contribution).toFixed(2);
}

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}
