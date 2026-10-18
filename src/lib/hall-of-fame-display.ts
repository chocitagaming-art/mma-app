import {
  PORTRAIT_ASPECT,
  hdHeadshotUrl,
  hdPortraitUrl,
  headshotSrcSet,
  portraitSrcSet,
} from "@/lib/headshot-hd";
import { localHeadshot, localHeadshotOverride } from "@/lib/local-headshots";
import { isYouTubeVideoId, normalizeClipRange } from "@/lib/playback-turn";
import type { HallOfFameData, HofInductee, HofWing } from "@/lib/queries/hall-of-fame";

// What the Hall of Fame page decides about each card, kept pure (no React, no
// DOM, no database) so vitest can pin it down: hall-of-fame-display.test.ts.

export const WING_ORDER: readonly HofWing[] = ["modern", "pioneer", "contributor", "fight"];

export const WING_LABEL: Record<HofWing, string> = {
  modern: "Ala Moderna",
  pioneer: "Ala Pionera",
  contributor: "Ala Contribuidora",
  fight: "Ala de Combate",
};

// ── Which photo, and how it is shown ───────────────────────────────────────

/**
 * The photo the page actually paints, in the same order as FighterHeadshot:
 * the curated override (local-headshots.ts), what the database gives, the
 * local fallback. null = silhouette.
 */
export function resolveHofPhotoUrl(name: string | null, dbUrl: string | null): string | null {
  const key = name ?? "";
  return localHeadshotOverride(key) ?? dbUrl ?? localHeadshot(key);
}

/** The photo a person card paints (contributors keep theirs in photo_url). */
export function personPhotoUrl(inductee: HofInductee): string | null {
  return resolveHofPhotoUrl(inductee.displayName, inductee.photoUrl ?? inductee.headshotUrl);
}

/**
 * Every URL mma-ingesta measured, with its verdict: the person photos and both
 * corners of every fight. A corner whose painted photo is another card's
 * measured one (Forrest Griffin's local override: measured through his Modern
 * Wing card, whose photo_url is that file) gets that verdict too.
 */
export function buildCutoutIndex(data: HallOfFameData): Map<string, boolean> {
  const index = new Map<string, boolean>();
  const add = (url: string | null, cutout: boolean | null) => {
    if (url && cutout != null) index.set(url, cutout);
  };
  for (const wing of WING_ORDER) {
    for (const i of data[wing]) {
      add(i.photoMeasuredUrl, i.photoIsCutout);
      add(i.cornerAMeasuredUrl, i.cornerACutout);
      add(i.cornerBMeasuredUrl, i.cornerBCutout);
    }
  }
  return index;
}

export type PhotoMode = "cut" | "framed";

/**
 * Relief ("cut") ONLY when the photo the page paints is the one that was
 * measured and the measure says it is a cut-out (transparent background).
 * Anything else —not measured, measured with a background, a local fallback,
 * the silhouette, no photo_cutout table yet— goes in the gold frame: a photo
 * with a background shown as a cut-out reads as a loose rectangle.
 */
export function photoMode(paintedUrl: string | null, cutouts: ReadonlyMap<string, boolean>): PhotoMode {
  return paintedUrl != null && cutouts.get(paintedUrl) === true ? "cut" : "framed";
}

export const FRAME_ZOOM = 1.7;

export type PhotoFocus = { position: string; zoom: number };

// "68% 22%", optionally with a zoom: "68% 22% 1.5". Percentages only: it ends
// up in an inline style.
const FOCUS = /^(\d{1,3}(?:\.\d+)?)% (\d{1,3}(?:\.\d+)?)%(?: (\d(?:\.\d+)?))?$/;

/**
 * Where the face is in a 16:9 portrait from ufc.com, to fill the square frame
 * with it: object-position AND transform-origin at that point, and a ~1.7 zoom
 * (measured on 17 portraits: without it the face is small). null = a normal
 * photo, framed as it comes.
 */
export function parsePhotoFocus(raw: string | null | undefined): PhotoFocus | null {
  const match = raw?.trim().match(FOCUS);
  if (!match) return null;
  const x = Number(match[1]);
  const y = Number(match[2]);
  if (x > 100 || y > 100) return null;
  const zoom = match[3] ? Number(match[3]) : FRAME_ZOOM;
  if (zoom < 1 || zoom > 3) return null;
  return { position: `${x}% ${y}%`, zoom };
}

// ── Sharper photos (Salón HD, 18-oct-2026) ─────────────────────────────────

export type HofPhotoVariant = "card" | "feature" | "corner" | "modal";

export type HofPhotoHd = { srcSet: string; sizes: string };

// Width the FACE (a 256×160, 1.6:1 ufc.com headshot) is painted at in each
// variant, measured on production at 360-1920 px: in relief it is contained in
// its stage (as wide as the card or stage height × 1.6, whichever is smaller),
// in the frame it covers the square box (box × 1.6). With a 256w/500w srcset
// only the band matters: ≤ 256 at 1x keeps the stored copy, and every
// variant is > 128, so 2x and 3x take the original.
//   · card: 154 (360), 169 (390), 227 (768), 226-228 (1024-1920).
//   · feature (the «Clase» block): 160, 175, 318, 291 (1024), 278 (1280+). At
//     1024+ 1x it is painted wider than 256, so it takes the original there
//     too: one card, +13 KB in AVIF.
//   · corner (the Ala de Combate poster): 150, 164, 161, 141-181; 220 at most
//     in the «Clase» feature poster.
//   · modal: the 224 px box (frame) or a 224 px high stage (relief) → 358.
// 🪤 The fluid part must stop where the box hits its cap, not at 640: below
// 640 the card's stage is 150 px high, so a relief face is never wider than
// 240 (150 × 1.6), which `calc(50vw - 24px)` reaches at 528 px; and a corner
// is at most 185 px in the grid and 220 in the «Clase» poster, which
// `calc(46vw - 14px)` reaches at ~504 px. With the old 640 cut-off a 1x
// window of 528-639 px asked for 260-296 px and downloaded the 500 original
// for a face painted at 240 (review, 18-oct).
const FACE_SIZES: Record<HofPhotoVariant, string> = {
  card: "(min-width: 528px) 240px, calc(50vw - 24px)",
  feature: "(min-width: 1024px) 292px, (min-width: 640px) 320px, calc(50vw - 20px)",
  corner: "(min-width: 504px) 220px, calc(46vw - 14px)",
  modal: "358px",
};

// The portrait's boxes (salon.css): the feature frame is at most 160 px, the
// modal frame 224 px, and the modal's 16:9 one as wide as the panel (512 px
// max-w-lg minus 2 × 24 px of padding, and the 16 px gutter on a phone).
const FEATURE_FRAME = 160;
const MODAL_FRAME = 224;
const MODAL_WIDE = "(min-width: 544px) 464px, calc(100vw - 80px)";

/**
 * The srcset and sizes that make a Hall of Fame photo sharp on a retina
 * screen, or null to paint the stored URL as it is.
 *   · A ufc.com face (event_results_athlete_headshot): in every variant, the
 *     same 256 → 500 upgrade as R5 (src/lib/headshot-hd.ts).
 *   · A 382x217_2 portrait: ONLY where it is shown alone (feature, modal);
 *     never in the grid or a corner (see headshot-hd.ts for the weights).
 *     🪤 The feature cap is in the DATA, not here: every portrait of the
 *     newest class gets it. Counted on 18-oct-2026 (read-only): a class has
 *     carried 0-2 of them (2 in 2018, 2016 and 2017; 1 in 2026, Gerbasi,
 *     whose original is the lightest: 42 KB AVIF). So the «Clase» may cost
 *     up to ~2 × 102-187 KB in AVIF (233-351 KB each in WebP) at 2x/3x, and
 *     it is preloaded: React preloads every non-lazy <img> of the shell, so
 *     dropping fetchPriority would not avoid it, and a lazy LCP card is worse.
 *     A modal costs one original per click: +85-161 KB AVIF, +200-316 KB
 *     WebP over the 764 copy, for 0.83 → 1.6-2.3 of sharpness (no style in
 *     between can be had: see headshot-hd.ts).
 *   · Anything else (ESPN, local files, silhouettes): null.
 * `zoom` is the --hof-zoom the photo is painted with (1 when none), `wide`
 * the modal's 16:9 frame.
 */
export function hofPhotoHd(
  url: string | null,
  variant: HofPhotoVariant,
  { wide = false, zoom = 1 }: { wide?: boolean; zoom?: number } = {},
): HofPhotoHd | null {
  if (!url) return null;
  if (hdHeadshotUrl(url)) {
    const srcSet = headshotSrcSet(url);
    return srcSet ? { srcSet, sizes: FACE_SIZES[variant] } : null;
  }
  if (hdPortraitUrl(url) && (variant === "feature" || variant === "modal")) {
    const srcSet = portraitSrcSet(url);
    if (!srcSet) return null;
    // Framed, the portrait covers the square box: box high, box × aspect wide,
    // times its zoom.
    const framed = (box: number) => `${Math.round(box * PORTRAIT_ASPECT * zoom)}px`;
    const sizes =
      variant === "feature" ? framed(FEATURE_FRAME) : wide ? MODAL_WIDE : framed(MODAL_FRAME);
    return { srcSet, sizes };
  }
  return null;
}

// ── Order by class ─────────────────────────────────────────────────────────

/** Newest class first; inside a class, the seed's order. No year goes last. */
export function compareByClass(a: HofInductee, b: HofInductee): number {
  const ya = a.inducteeYear ?? -Infinity;
  const yb = b.inducteeYear ?? -Infinity;
  if (ya !== yb) return yb - ya;
  return a.sortOrder - b.sortOrder;
}

export function orderByClass(items: readonly HofInductee[]): HofInductee[] {
  return [...items].sort(compareByClass);
}

export type LatestClass = { year: number; items: HofInductee[] };

/**
 * The newest class across the four wings, shown above the tabs: the people
 * first (Modern, Pioneer, Contributor, in the seed's order), the fight last.
 */
export function latestClass(data: HallOfFameData): LatestClass | null {
  let year: number | null = null;
  for (const wing of WING_ORDER) {
    for (const i of data[wing]) {
      if (i.inducteeYear != null && (year == null || i.inducteeYear > year)) year = i.inducteeYear;
    }
  }
  if (year == null) return null;
  const items = WING_ORDER.flatMap((wing) =>
    data[wing].filter((i) => i.inducteeYear === year).sort((a, b) => a.sortOrder - b.sortOrder),
  );
  return { year, items };
}

// ── The fight's video ──────────────────────────────────────────────────────

export type FightClip = { videoId: string; start: number | null; end: number | null };

/** The full fight to play inside the modal, or null (then: search YouTube). */
export function fightClip(inductee: HofInductee): FightClip | null {
  if (inductee.wing !== "fight" || !isYouTubeVideoId(inductee.videoId)) return null;
  const { start, end } = normalizeClipRange({ start: inductee.videoStart, end: inductee.videoEnd });
  return { videoId: inductee.videoId, start, end };
}

// ── The corners' names ─────────────────────────────────────────────────────

// Same person, spelled differently: accents, spaces and case aside.
function nameKey(name: string): string {
  return name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z]/g, "");
}

/**
 * What each corner of a fight says. fighters.name has no accents and its own
 * spacing («JOANNA JEDRZEJCZYK», «DOOHO CHOI») under a title that has them
 * («Zhang Weili vs. Joanna Jędrzejczyk I»), so the title's spelling wins, but
 * ONLY when it is the same name once accents, spaces and case are set aside.
 * Anything else (a title that says just «Hughes») keeps fighters.name.
 */
export function cornerLabels(inductee: HofInductee): { a: string | null; b: string | null } {
  const parts = inductee.displayName
    .split(/\s+vs\.?\s+/i)
    .map((part) => part.replace(/\s+(?:[IVX]+|\d+)$/, "").trim())
    .filter(Boolean);
  const pick = (name: string | null): string | null => {
    if (!name) return name;
    const key = nameKey(name);
    return parts.find((part) => key !== "" && nameKey(part) === key) ?? name;
  };
  return { a: pick(inductee.cornerAName), b: pick(inductee.cornerBName) };
}
