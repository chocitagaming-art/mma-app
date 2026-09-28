// EL TEXTO BAJO «MEJORES LIBRA POR LIBRA» DE LA PORTADA.
//
// Dice qué paneles hay y DE DÓNDE salen, no cuál se está viendo: se pinta en
// servidor y no cambia al alternar pestaña.
//
// 🪤 Si la última foto de rankings no trae el libra por libra masculino,
// getFeaturedFighters cae al plan B «los de más peleas UFC» (Jim Miller,
// Arlovski, Magny, Cerrone, Guida, Oliveira, medido el 29-sep-2026), que no es
// ningún ranking. Hasta ese día el texto decía «ranking oficial» igualmente.

/** De dónde salen las tarjetas de un panel. */
export type P4PSource = "ranking" | "most-fights";

export type P4PPanelSummary = {
  key: "masculino" | "femenino";
  source: P4PSource;
};

const MOST_FIGHTS = "los luchadores con más peleas en UFC";

/**
 * Descripción del bloque según los paneles que se pintan (ya sin los vacíos).
 * null si no hay ninguno: la portada no pinta el bloque.
 *
 * El femenino nunca llega del plan B (fighters.list.ts lo deja en []), pero la
 * función no lo da por hecho: cualquier panel del plan B se nombra como tal.
 */
export function p4pDescription(panels: P4PPanelSummary[]): string | null {
  const men = panels.find((panel) => panel.key === "masculino");
  const women = panels.find((panel) => panel.key === "femenino");
  const menRanked = men?.source === "ranking";
  const womenRanked = women?.source === "ranking";

  if (menRanked && womenRanked) {
    return "Los mejores del ranking oficial de UFC sin importar el peso, en masculino y en femenino.";
  }
  if (womenRanked && men) {
    // Masculino del plan B junto a un femenino de verdad.
    return `Las mejores del ranking oficial femenino de UFC y, sin el masculino a mano, ${MOST_FIGHTS}.`;
  }
  if (menRanked && women) {
    return `Los mejores del ranking oficial masculino de UFC y, sin el femenino a mano, ${MOST_FIGHTS}.`;
  }
  if (menRanked) {
    return "Los mejores del ranking oficial masculino de UFC, sin importar el peso.";
  }
  if (womenRanked) {
    return "Las mejores del ranking oficial femenino de UFC, sin importar el peso.";
  }
  if (men || women) {
    return `Sin el ranking oficial a mano: ${MOST_FIGHTS}.`;
  }
  return null;
}
