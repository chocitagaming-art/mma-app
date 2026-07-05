// BE2: conversión y formato del pesaje oficial. La UFC publica los pesos en
// libras; la web los muestra también en kilos para el público hispano.

// Definición exacta de la libra internacional (avoirdupois).
const KG_PER_LB = 0.45359237;

export function lbsToKg(lbs: number): number {
  return lbs * KG_PER_LB;
}

// "145.5 lb" con un decimal, como las planillas oficiales de pesaje.
// null/no finito => "—" (fila de báscula sin peso registrado).
export function formatLbs(lbs: number | null): string {
  if (lbs == null || !Number.isFinite(lbs)) {
    return "—";
  }

  return `${lbs.toFixed(1)} lb`;
}

// Equivalencia en kilos con un decimal ("66.0 kg"), derivada de las libras.
export function formatKgFromLbs(lbs: number | null): string {
  if (lbs == null || !Number.isFinite(lbs)) {
    return "—";
  }

  return `${lbsToKg(lbs).toFixed(1)} kg`;
}
