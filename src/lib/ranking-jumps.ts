// The /clasificacion jump bar (components/ranking-jump-bar.tsx): one link per
// division card, in the page's order. Pure, so the page (server) and the bar
// (client) agree on every id and the rules are unit-tested here.

export type DivisionGroup = "p4p" | "men" | "women";

export type DivisionJump = {
  // The card's id: /clasificacion#peso-pluma. Readable Spanish and STABLE:
  // links get shared, so it follows the division (the slug), never the label.
  anchor: string;
  // What the bar shows. The site's own convention for women's divisions is
  // «(F)» (the cards say «Peso Mosca (F)»), kept here: «Mosca» exists twice,
  // and in the phone's scrolling row the group divider that tells them apart
  // may be off screen.
  short: string;
  // What a screen reader says: the link's aria-label. «P4P» is read letter by
  // letter and «(F)» as a lone «F», so it spells the division out, and it
  // CONTAINS the visible label (WCAG 2.5.3, Label in Name: someone who says
  // «pulsa Mosca F» to their speech software still hits it).
  name: string;
  group: DivisionGroup;
};

// Keyed by the backend's slug (lib/queries/rankings.ts, DIVISION_ORDER).
// «P4P» and not «Libra por libra»: twice 15-19 characters at the head of a
// 390 px row would push every weight class off the first screen, and the
// page's own group title right above the cards says it in full.
const JUMPS: Record<string, Omit<DivisionJump, "group">> = {
  mens_pound_for_pound: { anchor: "libra-por-libra", short: "P4P", name: "P4P, libra por libra" },
  womens_pound_for_pound: {
    anchor: "libra-por-libra-femenino",
    short: "P4P (F)",
    name: "P4P (F), libra por libra femenino",
  },
  flyweight: { anchor: "peso-mosca", short: "Mosca", name: "Peso Mosca" },
  bantamweight: { anchor: "peso-gallo", short: "Gallo", name: "Peso Gallo" },
  featherweight: { anchor: "peso-pluma", short: "Pluma", name: "Peso Pluma" },
  lightweight: { anchor: "peso-ligero", short: "Ligero", name: "Peso Ligero" },
  welterweight: { anchor: "peso-welter", short: "Wélter", name: "Peso Wélter" },
  middleweight: { anchor: "peso-medio", short: "Medio", name: "Peso Medio" },
  light_heavyweight: { anchor: "peso-semipesado", short: "Semipesado", name: "Peso Semipesado" },
  heavyweight: { anchor: "peso-pesado", short: "Pesado", name: "Peso Pesado" },
  womens_strawweight: { anchor: "peso-paja-femenino", short: "Paja (F)", name: "Peso Paja (F), femenino" },
  womens_flyweight: { anchor: "peso-mosca-femenino", short: "Mosca (F)", name: "Peso Mosca (F), femenino" },
  womens_bantamweight: { anchor: "peso-gallo-femenino", short: "Gallo (F)", name: "Peso Gallo (F), femenino" },
  womens_featherweight: { anchor: "peso-pluma-femenino", short: "Pluma (F)", name: "Peso Pluma (F), femenino" },
};
// The page's three groups, by slug: the same split the page renders.
export function divisionGroup(slug: string): DivisionGroup {
  if (slug.endsWith("pound_for_pound")) return "p4p";
  if (slug.startsWith("womens_")) return "women";
  return "men";
}

// A division the backend adds before it is mapped here (rankings.ts shows it
// with its raw slug as the label) still gets a working link: an id made of the
// slug, prefixed so it can never collide with one of the page's own ids.
export function divisionJump(slug: string, label: string): DivisionJump {
  const known = JUMPS[slug];
  const group = divisionGroup(slug);
  if (known) return { ...known, group };
  const anchor = `division-${slug.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")}`;
  return { anchor, short: label, name: label, group };
}

export type CardBox = { id: string; top: number; bottom: number };

// The bar watches a band this tall at the reading line (ranking-jump-bar.tsx,
// the IntersectionObserver's rootMargin), and the rule below counts a card as
// crossing the line by that SAME band. 🪤 With the band on one side and a bare
// `top <= line` on the other, a card whose top reached the band but not yet the
// line (top in (line, line + 1]) was «in» for the observer and «out» for the
// rule: the bar lit the previous division and, the observer having no further
// change to report, kept it for the whole card (1,415 px of «Pluma» read as
// «Gallo» at 390; measured 21-oct, both engines, 3 to 7 px scroll steps).
export const READING_BAND_PX = 1;

// Which division the visitor is reading. `line` is the top of the band just
// under the sticky bar, in viewport px; `boxes` are the cards in page order.
//   1. A card crosses the band (as the observer sees it: edges touching
//      count): its grid row is the one being read, two or three divisions side
//      by side on a desktop. The one just jumped to (`preferred`) wins while
//      its row is read, so clicking «Pluma», third in its row, does not light
//      «Mosca»; otherwise the row's first (left) card. The whole row, and not
//      just the cards still crossing: in a row of unequal cards, the one left
//      crossing would flash on for the few px the others are shorter.
//   2. The band in a gap (between two rows, or on a group's title): the NEXT
//      card, the one on screen right under it. 🪤 Not the last one passed: in
//      a grid that is the right end of the row above, or the last card of the
//      group above, both off screen by then (1280: «Pluma» flashed for 20 px
//      between «Mosca» and «Ligero», and «Pesado» stayed lit over the whole
//      women's row; measured 21-oct).
//   3. Above every card (the top of the page): none. Nothing is being read
//      yet, and a lit «P4P» there read as a selected tab, a filter, rather
//      than an index.
//   4. Below every card (the footer): the last row, the last one read.
export function pickActiveDivision(
  boxes: CardBox[],
  line: number,
  preferred: string | null,
): string | null {
  const crossing = boxes.find((box) => box.top <= line + READING_BAND_PX && box.bottom >= line);
  if (crossing) {
    const row = divisionRow(boxes, crossing.id);
    return preferred && row.includes(preferred) ? preferred : row[0];
  }
  if (!boxes.some((box) => box.bottom < line)) return null;
  const next = boxes.find((box) => box.top > line + READING_BAND_PX);
  return next ? next.id : divisionRow(boxes, boxes[boxes.length - 1].id)[0];
}

// The cards on the same grid row as `id` (`id` included, in page order). The
// grid cells of a row share their top (items-start), whatever each card's
// height; two groups never do, they are stacked. On a phone (one column) it
// is `id` alone. 🪤 Without it, in a 3 column row only the left card ever lit:
// 7 of the 13 divisions never showed as being read at 1280 and 1920.
export function divisionRow(boxes: CardBox[], id: string): string[] {
  const card = boxes.find((box) => box.id === id);
  if (!card) return [];
  return boxes.filter((box) => Math.abs(box.top - card.top) < 1).map((box) => box.id);
}
