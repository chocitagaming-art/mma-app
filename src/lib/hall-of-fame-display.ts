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
