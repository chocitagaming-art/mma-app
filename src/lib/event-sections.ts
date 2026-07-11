import type { EventBout } from "@/lib/types";

// Agrupación de la cartelera por card_segment, compartida por la página del
// evento y /en-vivo (T3-A). Mantiene el orden de aparición (los bouts ya vienen
// ordenados por bout_order). Si todos los segmentos son NULL → una sola "Cartelera".

export const CARD_SEGMENT_LABELS: Record<string, string> = {
  main: "Cartelera estelar",
  prelims: "Preliminares",
  early_prelims: "Preliminares iniciales",
};

export const CARD_SEGMENT_ORDER = ["main", "prelims", "early_prelims"];

export type BoutSection = {
  key: string;
  label: string;
  bouts: EventBout[];
};

export function groupBoutsBySegment(bouts: EventBout[]): BoutSection[] {
  const hasSegments = bouts.some((bout) => bout.cardSegment != null);

  if (!hasSegments) {
    return bouts.length > 0
      ? [{ key: "cartelera", label: "Cartelera", bouts }]
      : [];
  }

  const groups = new Map<string, EventBout[]>();
  for (const bout of bouts) {
    const key = bout.cardSegment ?? "main";
    const group = groups.get(key);
    if (group) {
      group.push(bout);
    } else {
      groups.set(key, [bout]);
    }
  }

  const orderedKeys = [
    ...CARD_SEGMENT_ORDER.filter((key) => groups.has(key)),
    ...[...groups.keys()].filter((key) => !CARD_SEGMENT_ORDER.includes(key)),
  ];

  return orderedKeys.map((key) => ({
    key,
    label: CARD_SEGMENT_LABELS[key] ?? "Cartelera",
    bouts: groups.get(key) ?? [],
  }));
}
