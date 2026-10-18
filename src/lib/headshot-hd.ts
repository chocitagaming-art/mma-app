// Sharper ufc.com faces, rewritten AT RENDER TIME (R5, approved by the owner on
// 18-oct-2026). Nothing is written to the database: reverting this file and its
// callers brings back exactly what was served before.
//
// Every ufc.com face we store is Drupal's `event_results_athlete_headshot`
// style, a 256×160 copy of an original that lives at the SAME path without the
// "/styles/<style>/s3" chunk:
//
//   https://www.ufc.com/images/styles/event_results_athlete_headshot/s3/2026-05/VOLKOV_ALEXANDER_05-09.png?itok=…
//   https://www.ufc.com/images/2026-05/VOLKOV_ALEXANDER_05-09.png
//
// Measured on 18-oct-2026 (read-only, the numbers are kept HERE on purpose):
//   · 1,423 stored faces are this style (of 2,329 fighters with a face).
//   · Sample of 30 stored URLs: the original answers 200 in 30/30; for the 25
//     faces of this style it is the same picture, bigger in 25/25 (15 at
//     520×325, 10 at 500×325), with the transparent background kept.
//   · Weight depends on the format ufc.com NEGOTIATES (S3 answers with
//     `Vary: Accept`). Volkanovski, 256 copy → original: AVIF 6.6 → 19.7 KB
//     (+13 KB, the Accept of Chromium and Safari 16+), WebP 22.4 → 85.6 KB
//     (+63 KB, iOS 15 or older, and Playwright's WebKit on Windows), PNG 36.5
//     → 148.6 KB (median of the sample in PNG: 32.8 → 135.7 KB, ×4.1). So a
//     +700 KB /fighters in a WebKit test browser is the WebP case, not a
//     regression; a real iPhone on iOS 16+ pays the AVIF one.
// That is why it is only offered where a face is shown big, and through srcset
// so a 1x phone still downloads the 256 one.
//
// 🪤 ONLY this style. The originals behind athlete_bio_full_body (the ~60
// "faces" that are really a head-to-thigh cut) and the standing shots weigh
// between 1.7 and 5 MB each (JONES_JON_L 1024×2048, 1,723 KB in PNG;
// BUCKLEY_JOAQUIN_L 1128×3324, 4,978 KB): rewriting them would be a disaster.
//
// 🪤 The path is copied AS IS, never decoded: paths with %252F work (Kazula
// Vargas, Khama Worthy…). The query (VersionId, itok, and the 643 stored URLs
// that carry a literal "&amp;": 633 faces and 10 bodies) is dropped: S3
// ignores it.

const HD_SOURCE =
  /^https?:\/\/(?:www\.)?ufc\.com\/images\/styles\/event_results_athlete_headshot\/s3\/([^?#]+)/i;

// The original behind a stored ufc.com style URL that `source` matches: the
// same path under /images/, with the query dropped and the path copied as is.
function originalBehind(source: RegExp, url: string | null | undefined): string | null {
  if (!url) return null;
  const match = source.exec(url.trim());
  if (!match) return null;
  return `https://www.ufc.com/images/${match[1]}`;
}

// Intrinsic widths for the srcset descriptors. The stored copy is 256 wide;
// the original is 500 or 520: declaring the smaller one never claims pixels
// the file does not have.
export const BASE_HEADSHOT_WIDTH = 256;
export const HD_HEADSHOT_WIDTH = 500;

// The full-size original behind a stored ufc.com face, or null when the URL is
// anything else (ESPN, local files, other ufc.com styles, an original already).
export function hdHeadshotUrl(url: string | null | undefined): string | null {
  return originalBehind(HD_SOURCE, url);
}

// A srcset candidate URL may not contain whitespace nor end in a comma (the
// parser would split it). No stored URL has either today (checked on 18-oct),
// but one that did must not break the whole attribute.
function srcSetSafe(url: string): string {
  return url.replace(/[\s,]/g, (c) => encodeURIComponent(c));
}

// srcset for a face that may be shown big: the stored 256 copy and the
// original, so the browser picks by the painted size × devicePixelRatio. No
// srcset (undefined) when there is no original to offer.
export function headshotSrcSet(url: string | null | undefined): string | undefined {
  return twoStepSrcSet(url, hdHeadshotUrl(url), BASE_HEADSHOT_WIDTH, HD_HEADSHOT_WIDTH);
}

function twoStepSrcSet(
  url: string | null | undefined,
  hd: string | null,
  baseWidth: number,
  hdWidth: number,
): string | undefined {
  if (!url || !hd) return undefined;
  return `${srcSetSafe(url.trim())} ${baseWidth}w, ${srcSetSafe(hd)} ${hdWidth}w`;
}

// ── The Hall of Fame's 16:9 portraits (Salón HD, 18-oct-2026) ──────────────
//
// mma-ingesta seeds 12 official Hall of Fame portraits from ufc.com
// (seed_hall_of_fame.py, _UFC_HOF) in the `382x217_2` style: the 9
// contributors and 3 pioneers (Severn, Frye, Maurice Smith). Measured on
// 18-oct-2026 (read-only, all 12):
//   · The stored copy is already a 2x one: 764×434 (1.760:1), 8-26 KB in AVIF,
//     13-35 KB in WebP.
//   · The original at the same path without "/styles/382x217_2/s3" answers 200
//     in 12/12: 2000×1125 in 10, 1920×1080 (Gerbasi) and 1439×862 (Piligian,
//     1.669:1). Weight: AVIF 42-187 KB (median ~140), WebP 79-351 KB, JPEG
//     143-358 KB. Ten times the stored copy.
//   · No intermediate style can be had: any other style of these paths
//     answers 403 without its itok (an HMAC only ufc.com can sign).
//   · The style is a focal-point crop (the `h=` in the query) from 16:9 to
//     1.760:1, ~1% of the width for the 16:9 originals. Piligian's 1.669:1 one
//     loses ~5% of its height in the style, so his original shows a hair more
//     at the bottom of the modal; the face stays where photo_focus puts it.
// Sharpness of the stored copy (file px / painted px × DPR), measured on
// production: grid card 0.69 at 3x and 1.03 at 2x; the «Clase» feature card
// 0.55-0.61 at 3x and 0.82 at 2x; the modal 0.84-0.93 at 3x and 0.83 at 2x.
// So the original is offered ONLY where the portrait is shown alone (the
// feature card and the modal, one image each), through srcset so a 1x screen
// keeps the 764 copy. Never in the grid: 9 contributors at 3x would add
// ~1.3 MB in AVIF (~2.7 MB in WebP) for a card that is already 1.03 at 2x.

const PORTRAIT_SOURCE = /^https?:\/\/(?:www\.)?ufc\.com\/images\/styles\/382x217_2\/s3\/([^?#]+)/i;

// The stored copy is 764 wide; the smallest original measured is 1439
// (Piligian): declaring it never claims pixels a file does not have.
export const BASE_PORTRAIT_WIDTH = 764;
export const HD_PORTRAIT_WIDTH = 1439;
// Width ÷ height of the stored portrait, to know how wide it is painted.
export const PORTRAIT_ASPECT = 764 / 434;

/** The full-size original behind a stored 382x217_2 Hall of Fame portrait. */
export function hdPortraitUrl(url: string | null | undefined): string | null {
  return originalBehind(PORTRAIT_SOURCE, url);
}

/** srcset for a portrait shown alone: the stored 764 copy and the original. */
export function portraitSrcSet(url: string | null | undefined): string | undefined {
  return twoStepSrcSet(url, hdPortraitUrl(url), BASE_PORTRAIT_WIDTH, HD_PORTRAIT_WIDTH);
}
