import type { FighterHistoryItem } from "@/lib/types";

// Badge de promoción (S3-G): UFC rojo, Bellator ámbar, resto (regionales) gris
// con su nombre corto. Compartido entre la tabla del historial de la ficha y el
// tile "Última pelea" del hero (fallback regional): mismo label y mismas clases
// en ambos sitios. Helper puro para poder testear el mapping aislado.
export type PromotionBadge = {
  label: string;
  className: string;
};

export function promotionBadge(
  fight: Pick<FighterHistoryItem, "origin" | "promotion">,
): PromotionBadge {
  const isEspnRow = fight.origin === "espn";
  const label = isEspnRow ? (fight.promotion ?? "Otra") : "UFC";
  // amber-800 en claro: amber-600 daba 2.84:1 sobre la card blanca, bajo el
  // 4.5:1 de WCAG AA (revisión adversarial).
  const className = !isEspnRow
    ? "bg-primary/10 text-primary"
    : fight.promotion === "Bellator"
      ? "bg-amber-500/15 text-amber-800 dark:bg-amber-400/15 dark:text-amber-400"
      : "bg-muted text-muted-foreground";

  return { label, className };
}
