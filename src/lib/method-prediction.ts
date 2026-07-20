// Barras de probabilidad por MÉTODO de victoria (decisión / KO/TKO / sumisión).
// Helpers puros sin dependencias de Next/DOM para testearlos aislados (mismo
// patrón que shap-bars.ts): el componente solo pinta lo que buildMethodBars
// devuelve. El campo methodPrediction es OPCIONAL en el contrato (caches
// antiguas / bundle pre-método) — cualquier dato inválido devuelve null y la
// sección entera no se renderiza, nunca crashea.

import type { MethodPrediction } from "@/lib/prediction";

export type MethodKind = MethodPrediction["predicted"];

export type MethodBarRow = {
  method: MethodKind;
  label: string;
  // Probabilidad 0..1 (clampada por defensa; el número mostrado manda).
  probability: number;
  isPredicted: boolean;
};

export const METHOD_LABELS_ES: Record<MethodKind, string> = {
  ko: "KO/TKO",
  submission: "Sumisión",
  decision: "Decisión",
};

// Orden estable para empates exactos de probabilidad (finales primero: son la
// lectura interesante; "decisión" es la clase base).
const TIE_ORDER: MethodKind[] = ["ko", "submission", "decision"];

export function buildMethodBars(
  method: MethodPrediction | null | undefined,
): MethodBarRow[] | null {
  if (!method || !method.probabilities) {
    return null;
  }
  const rows: MethodBarRow[] = [];
  for (const kind of TIE_ORDER) {
    const raw = method.probabilities[kind];
    if (typeof raw !== "number" || !Number.isFinite(raw)) {
      return null;
    }
    rows.push({
      method: kind,
      label: METHOD_LABELS_ES[kind],
      probability: Math.max(0, Math.min(1, raw)),
      isPredicted: method.predicted === kind,
    });
  }
  rows.sort(
    (a, b) =>
      b.probability - a.probability ||
      TIE_ORDER.indexOf(a.method) - TIE_ORDER.indexOf(b.method),
  );
  return rows;
}
