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

// Intrinsic widths for the srcset descriptors. The stored copy is 256 wide;
// the original is 500 or 520: declaring the smaller one never claims pixels
// the file does not have.
export const BASE_HEADSHOT_WIDTH = 256;
export const HD_HEADSHOT_WIDTH = 500;

// The full-size original behind a stored ufc.com face, or null when the URL is
// anything else (ESPN, local files, other ufc.com styles, an original already).
export function hdHeadshotUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  const match = HD_SOURCE.exec(url.trim());
  if (!match) return null;
  return `https://www.ufc.com/images/${match[1]}`;
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
  const hd = hdHeadshotUrl(url);
  if (!url || !hd) return undefined;
  return `${srcSetSafe(url.trim())} ${BASE_HEADSHOT_WIDTH}w, ${srcSetSafe(hd)} ${HD_HEADSHOT_WIDTH}w`;
}
