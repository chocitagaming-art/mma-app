// Tratamiento de borde "premium" reutilizable para los tiles/cards de la ficha
// de luchador (#47). Se mantiene `rounded-2xl` para casar con los tiles ya
// existentes. En light se afirma más (ring rojo al 10%, suelo cálido al 60% y
// sombra con tinte de marca); en dark conserva la receta original píxel a píxel.
export const PREMIUM_TILE =
  "rounded-2xl border border-border/70 bg-gradient-to-b from-card to-[color-mix(in_oklab,var(--card),var(--background)_45%)] ring-1 ring-primary/10 shadow-[0_1px_3px_rgba(190,30,20,0.07),0_14px_36px_-18px_rgba(140,35,25,0.24)] transition hover:ring-primary/25 hover:shadow-[0_2px_6px_rgba(190,30,20,0.09),0_20px_44px_-20px_rgba(140,35,25,0.32)] dark:ring-primary/5 dark:shadow-sm dark:hover:shadow-md";
