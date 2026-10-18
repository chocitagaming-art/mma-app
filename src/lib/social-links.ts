// R6 — a fighter's Instagram and X, as ufc.com publishes them.
//
// WHERE THEY COME FROM: mma-ingesta reads them ONLY from the `Person.sameAs`
// list of the JSON-LD block on the athlete's ufc.com page (never from the
// page's <a> tags: the ufc.com footer links @ufc on every page, and a
// page-wide search would hand the UFC's own account to every fighter). It
// normalises them before writing (twitter.com -> x.com, no query string,
// Instagram in lower case) and the database CHECKs on `fighters.instagram_url`
// and `fighters.x_url` (migration 032) enforce that exact shape.
//
// WHY VALIDATE AGAIN HERE: this is the last gate before an href reaches the
// page and before a URL is published to search engines in the JSON-LD. The
// patterns are the SAME as the database CHECKs, so a valid row always passes;
// anything else (a hand-edited row, a database without the CHECK, a future
// scraper bug) is simply not drawn. No normalisation on this side on purpose:
// a value the ingest did not normalise is a bug to fix there, not here.
//
// This is NOT `fighterExternalLinks` (external-links.ts): the owner removed
// the ESPN/UFCStats links on 18-jul and a test freezes that function at [].
// Instagram and X were approved separately on 17-oct.
//
// Pure module (no Next, no DOM) so vitest can test it.

export const INSTAGRAM_URL_PATTERN = /^https:\/\/www\.instagram\.com\/[a-z0-9._]{1,30}\/$/;
export const X_URL_PATTERN = /^https:\/\/x\.com\/[A-Za-z0-9_]{1,15}$/;

// The UFC's own accounts. They are what a page-wide scrape would assign to
// everyone (the footer trap above), so if one ever reaches a fighter row it is
// that bug, not the fighter's profile. Compared in lower case.
const ORGANISATION_HANDLES = new Set(["ufc", "ufcespanol", "ufc_espanol", "ufceurope"]);

export type SocialNetwork = "instagram" | "x";

// Both links open in a new tab (target="_blank"): said in their name.
const NEW_TAB = " (se abre en otra pestaña)";

export type FighterSocialLink = {
  network: SocialNetwork;
  url: string;
  // Accessible name of the icon-only link: «Instagram de <nombre> (se abre en
  // otra pestaña)», so a screen reader warns before the new tab (like «Ver en
  // YouTube» in the video modal).
  label: string;
  // Visible on hover (title) so a mouse user can see which account it is.
  handle: string;
};

// What the detail query hands over. Optional and nullable: the columns arrive
// through `select f.*`, so before migration 032 they are simply absent.
export type FighterSocialUrls = {
  instagramUrl?: string | null;
  xUrl?: string | null;
};

function handleOf(url: string): string {
  return url.replace(/\/$/, "").split("/").pop() ?? "";
}

function validated(value: unknown, pattern: RegExp): string | null {
  if (typeof value !== "string") return null;
  if (!pattern.test(value)) return null;
  if (ORGANISATION_HANDLES.has(handleOf(value).toLowerCase())) return null;
  return value;
}

/** The Instagram URL if it has exactly the shape the database stores, or null. */
export function safeInstagramUrl(value: unknown): string | null {
  return validated(value, INSTAGRAM_URL_PATTERN);
}

/** The X URL if it has exactly the shape the database stores, or null. */
export function safeXUrl(value: unknown): string | null {
  return validated(value, X_URL_PATTERN);
}

/**
 * The fighter's profile links, Instagram first, only the valid ones. An empty
 * list means "draw nothing" (no row, no heading, no placeholder).
 */
export function buildFighterSocialLinks(
  urls: FighterSocialUrls,
  fighterName: string,
): FighterSocialLink[] {
  const links: FighterSocialLink[] = [];
  const instagram = safeInstagramUrl(urls.instagramUrl);
  if (instagram) {
    links.push({
      network: "instagram",
      url: instagram,
      label: `Instagram de ${fighterName}${NEW_TAB}`,
      handle: `@${handleOf(instagram)}`,
    });
  }
  const x = safeXUrl(urls.xUrl);
  if (x) {
    links.push({
      network: "x",
      url: x,
      label: `X de ${fighterName}${NEW_TAB}`,
      handle: `@${handleOf(x)}`,
    });
  }
  return links;
}

/** The same profiles, as the `sameAs` list of the page's schema.org Person. */
export function socialSameAs(urls: FighterSocialUrls): string[] {
  return [safeInstagramUrl(urls.instagramUrl), safeXUrl(urls.xUrl)].filter(
    (url): url is string => url != null,
  );
}
