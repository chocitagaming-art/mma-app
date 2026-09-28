/**
 * A qué pestaña mueve una tecla, en una lista de pestañas HORIZONTAL.
 *
 * Es el patrón WAI-ARIA APG «Tabs with automatic activation»: ← y → mueven la
 * selección y dan la vuelta en los extremos, Inicio y Fin saltan al primero y al
 * último. Cualquier otra tecla devuelve null y el componente no la toca: el Tab
 * tiene que seguir saliendo de la lista, y ↑/↓ siguen haciendo scroll.
 *
 * Vive fuera del componente para poder probarla sin DOM (vitest corre en
 * environment "node": la interfaz se prueba con Playwright).
 */
export function nextTabIndex(current: number, key: string, count: number): number | null {
  if (count <= 0) {
    return null;
  }
  switch (key) {
    case "ArrowRight":
      return (current + 1) % count;
    case "ArrowLeft":
      return (current - 1 + count) % count;
    case "Home":
      return 0;
    case "End":
      return count - 1;
    default:
      return null;
  }
}
