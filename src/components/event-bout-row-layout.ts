// The two ways of drawing a bout row (EventBoutRow's headshotSize), in a file
// of their own so the loading skeletons draw the SAME boxes as the real row
// without importing the component.

export type RowLayout = {
  // The real row's class. Its geometry (grid, gaps, padding, alignment) is
  // what the skeletons share (rowGeometry); ROW_INTERACTION is what makes it a
  // link (group, hover, transition), and only the real row carries it: a
  // skeleton row that lit up on hover would look clickable. 🪤 Kept as ONE
  // string, in the order it always had: the "default" row's HTML stays the
  // same byte for byte (src/components/__snapshots__/).
  row: string;
  redCorner: string;
  blueCorner: string;
  // The box of each face (twMerge overrides the size-* of FighterHeadshot's
  // `size`, which then only picks the initials' text size).
  headshot: string;
  // Spread onto FighterHeadshot. 🪤 Leave a prop OUT rather than undefined: it
  // is a client component, and React Flight writes a present undefined prop
  // into the RSC payload as "$undefined" (on every /en-vivo refresh).
  photo: { size: "sm" | "lg"; quality?: "hd"; sizes?: string };
  text: string;
  // The name inside its line, next to the flag and the rank badge (#12).
  name: string;
  centre: string;
};

// What makes the real row a link. Every layout's `row` carries all of it.
export const ROW_INTERACTION = ["group", "transition-colors", "hover:bg-muted/50"] as const;

/** The row's geometry without ROW_INTERACTION: what a skeleton row draws. */
export function rowGeometry(layout: RowLayout): string {
  const interaction: readonly string[] = ROW_INTERACTION;
  return layout.row
    .split(" ")
    .filter((token) => !interaction.includes(token))
    .join(" ");
}

// "default" is the row as it always was, class for class and prop for prop.
// Since 30-oct-2026 only the «Peleas canceladas» of /eventos/[id] draw it:
// folded, at 70 % and small on purpose (src/lib/bout-row-callsites.test.ts).
//
// "large" is the home's «Último evento» (owner, 29-oct-2026: «ponemos las
// fotos de las cabezas más grandes y nítidas») and, since 30-oct, the card of
// /eventos/[id], /ufc-hoy and /en-vivo (whose live player sits BELOW the card,
// so on phones it moves down with it): a 72 px face on phones and 96 from sm,
// where it used to be 36/48. Measured on 29-oct (UFC 333 on the home,
// 360 to 1920): side by side, a bigger face eats the NAME's width — at 768 the
// red corner of the main event is 231 px and «Alexander Volkanovski» with his
// flag needs 151, so any face over 68 px beside it truncates it (and at 640
// the corners are 151-167 px). So below lg each corner STACKS
// (face on top, name and record under it, full corner width: 98 px at 360
// where the name had 52), and only from lg (corners of 335+ px) does the face
// go back beside the text, which still keeps 223+ px. The centre column stays
// as tall as the faces, so «VS» sits on their midline.
//
// Sharpness = file px / painted px × DPR. The 1.6:1 ufc.com face covers the
// square box minus its 1 px border: painted 112 px wide in the 72 box and 150
// in the 96 one, which is the exact `sizes`. The 256 copy is kept up to DPR
// 2.29 on phones (1x 2.29 · 2x 1.14) and 1.70 from sm (1x 1.70); above that
// the browser takes the ufc.com original (500-520 px): phone 3x 1.5, tablet
// and desktop 2x 1.7, 3x 1.1. Checked in Chromium and WebKit at 2x: phones
// keep the 256 copy, 768 and up take the original. ESPN faces (600×436, no
// srcset) are 4.6 at 1x and 1.5 at 3x in the 96 box.
export const ROW_LAYOUTS: Record<"default" | "large", RowLayout> = {
  default: {
    row: "group grid grid-cols-[1fr_auto_1fr] items-center gap-2 px-3 py-3 transition-colors hover:bg-muted/50 sm:gap-4 sm:px-5",
    redCorner: "flex min-w-0 items-center gap-2.5 sm:gap-3",
    blueCorner: "flex min-w-0 flex-row-reverse items-center gap-2.5 text-right sm:gap-3",
    // F4: headshot más pequeño en móvil (36px) para dar aire al nombre; en sm+
    // vuelve a 48px (twMerge sobreescribe el size-12 de sizeClasses).
    headshot: "size-9 shrink-0 sm:size-12",
    photo: { size: "sm" },
    text: "min-w-0",
    name: "min-w-0 flex-1 truncate",
    centre: "flex shrink-0 flex-col items-center text-center",
  },
  large: {
    // items-start below lg: the corners grow downwards with their record, and
    // a centred short corner would put its face lower than the other one.
    row: "group grid grid-cols-[1fr_auto_1fr] items-start gap-2 px-3 py-3 transition-colors hover:bg-muted/50 sm:gap-4 sm:px-5 lg:items-center",
    redCorner: "flex min-w-0 flex-col items-start gap-2 lg:flex-row lg:items-center lg:gap-4",
    blueCorner:
      "flex min-w-0 flex-col items-end gap-2 text-right lg:flex-row-reverse lg:items-center lg:gap-4",
    headshot: "size-18 shrink-0 sm:size-24",
    // "lg" only for the initials (text-2xl in a 72-96 px box).
    photo: { size: "lg", quality: "hd", sizes: "(min-width: 640px) 150px, 112px" },
    // w-full while stacked: the name truncates against the corner, not
    // against its own width.
    text: "w-full min-w-0 lg:w-auto",
    // No flex-1: stacked, the name's line is the whole corner, and a name that
    // grew to fill it pushed the rank badge (#12) to the far end, under the VS
    // — 27-135 px away from the name (/eventos/1099 at 390 and 768, 29-oct).
    // min-w-0 + truncate still cut a name that does not fit.
    name: "min-w-0 truncate",
    centre:
      "flex min-h-18 shrink-0 flex-col items-center justify-center text-center sm:min-h-24 lg:min-h-0",
  },
};
