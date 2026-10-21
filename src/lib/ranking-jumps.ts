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
  group: DivisionGroup;
};

// Keyed by the backend's slug (lib/queries/rankings.ts, DIVISION_ORDER).
// «P4P» and not «Libra por libra»: twice 15-19 characters at the head of a
// 390 px row would push every weight class off the first screen, and the
// page's own group title right above the cards says it in full.
const JUMPS: Record<string, Omit<DivisionJump, "group">> = {
  mens_pound_for_pound: { anchor: "libra-por-libra", short: "P4P" },
  womens_pound_for_pound: { anchor: "libra-por-libra-femenino", short: "P4P (F)" },
  flyweight: { anchor: "peso-mosca", short: "Mosca" },
  bantamweight: { anchor: "peso-gallo", short: "Gallo" },
  featherweight: { anchor: "peso-pluma", short: "Pluma" },
  lightweight: { anchor: "peso-ligero", short: "Ligero" },
  welterweight: { anchor: "peso-welter", short: "Wélter" },
  middleweight: { anchor: "peso-medio", short: "Medio" },
  light_heavyweight: { anchor: "peso-semipesado", short: "Semipesado" },
  heavyweight: { anchor: "peso-pesado", short: "Pesado" },
  womens_strawweight: { anchor: "peso-paja-femenino", short: "Paja (F)" },
  womens_flyweight: { anchor: "peso-mosca-femenino", short: "Mosca (F)" },
  womens_bantamweight: { anchor: "peso-gallo-femenino", short: "Gallo (F)" },
  womens_featherweight: { anchor: "peso-pluma-femenino", short: "Pluma (F)" },
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
  return { anchor, short: label, group };
}

export type CardBox = { id: string; top: number; bottom: number };

// Which division the visitor is reading. `line` is a horizontal line just under
// the sticky bar, in viewport px; `boxes` are the cards in page order.
//   1. The cards the line crosses. In a 2-3 column grid that is a whole row:
//      the one just jumped to (`preferred`) wins while the line still crosses
//      it, so clicking «Pluma», third in its row, does not light «Mosca».
//      Otherwise the first in page order (the row's left card).
//   2. The line in a gap (between two cards or two groups): the last card it
//      passed, i.e. the one just read.
//   3. Above every card (the top of the page): the first one, the next to come.
export function pickActiveDivision(
  boxes: CardBox[],
  line: number,
  preferred: string | null,
): string | null {
  const crossed = boxes.filter((box) => box.top <= line && box.bottom > line);
  if (preferred && crossed.some((box) => box.id === preferred)) return preferred;
  if (crossed.length > 0) return crossed[0].id;
  const passed = boxes.filter((box) => box.bottom <= line);
  if (passed.length > 0) return passed[passed.length - 1].id;
  return boxes[0]?.id ?? null;
}
