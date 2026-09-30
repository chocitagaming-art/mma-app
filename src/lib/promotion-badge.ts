import type { FighterHistoryItem } from "@/lib/types";

// Badge de promoción (S3-G): UFC rojo, Bellator ámbar, Contender Series
// violeta, resto (regionales) gris con su nombre corto. Compartido entre la
// tabla del historial de la ficha y el tile "Última pelea" del hero (fallback
// regional): mismo label y mismas clases en ambos sitios. Helper puro para
// poder testear el mapping aislado.
export type PromotionBadge = {
  label: string;
  className: string;
};

// Promociones con color propio. La clave es el nombre EXACTO que guarda
// fight_history_espn.promotion: 'BFC Contender Series' o 'Contenders' son
// regionales y se quedan en gris. El contraste de estas clases lo mide
// contrast.test.ts leyendo la paleta real de Tailwind, en los dos temas y
// también con la fila del historial en hover (--muted).
const TINTED_PROMOTIONS = new Map<string, string>([
  // amber-800 en claro: amber-600 daba 2.84:1 sobre la card blanca, bajo el
  // 4.5:1 de WCAG AA (revisión adversarial).
  [
    "Bellator",
    "bg-amber-500/15 text-amber-800 dark:bg-amber-400/15 dark:text-amber-400",
  ],
  // Dana White's Contender Series: ESPN lo publica bajo la liga UFC, pero no
  // es un combate UFC. En oscuro, violet-300 y no -400: con la fila en hover
  // el 400 se queda en 4,56:1, sin margen; el 300 da 7,0.
  [
    "Contender Series",
    "bg-violet-500/15 text-violet-800 dark:bg-violet-400/15 dark:text-violet-300",
  ],
]);

export function promotionBadge(
  fight: Pick<FighterHistoryItem, "origin" | "promotion">,
): PromotionBadge {
  const isEspnRow = fight.origin === "espn";
  const label = isEspnRow ? (fight.promotion ?? "Otra") : "UFC";
  const className = !isEspnRow
    ? "bg-primary/10 text-primary"
    : (TINTED_PROMOTIONS.get(fight.promotion ?? "") ??
      "bg-muted text-muted-foreground");

  return { label, className };
}
