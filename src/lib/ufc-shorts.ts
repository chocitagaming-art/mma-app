import { unstable_cache } from "next/cache";

import { UFC_TV_CHANNELS, normalizeTitle, singleFlight, withCooldown } from "@/lib/ufc-tv";
import { isPlayableInSpain, parseIsoDuration, type VideoDetail } from "@/lib/youtube";

// ⚠️ SERVER-ONLY. Reads process.env.YOUTUBE_API_KEY, which never reaches the
// client (no NEXT_PUBLIC_ prefix). Do not import this module from a
// "use client" component: pass the list down as props.
//
// The UFC shorts for the home page hero: a list cached for 30 min, built only
// through the DOCUMENTED route of the YouTube Data API (DECISIONS.md,
// 29-sep-2026):
//
//   1. playlistItems: ONE page of 50 of the UFC channel uploads (UU…).
//   2. videos.list of those ids with part=contentDetails,status,player and
//      maxHeight=720. `player` with maxHeight is what returns embedWidth and
//      embedHeight, and that is how a short is told apart: vertical
//      (embedHeight > embedWidth) and 6-180 s. The undocumented "shorts only"
//      list (UUSH…) is NOT used.
//
// What stays in the list (toUfcShort):
//   · public and processed, madeForKids === false (explicitly: a missing
//     field does not pass, so dropping `status` from the URL empties the list);
//   · isPlayableInSpain (lib/youtube.ts): embeddable, not age restricted, and
//     the REGION criterion — a short blocked elsewhere but not in Spain passes.
//     That is looser than the mockup's datos.json ("no regionRestriction at
//     all"), on purpose: the site is for Spain, and the blocked ones are removed
//     here, on the server, because with the iframe and no JS API a blocked
//     short would sit on "Video unavailable" until its timer ran out;
//   · vertical and 6-180 s; 9:16, or also 4:5 when INCLUDE_4X5 is on;
//   · not in the blacklist (other sports and podcasts the UFC channel also
//     uploads) and WITH the UFC brand in the title (hasUfcBrand).
//
// QUOTA: 2 units per refresh (1 playlistItems + 1 videos.list; an empty page
// skips the second). Cached 30 min → at most 48 refreshes a day per server
// instance, ~96 units, plus ~3 extra refreshes a day from the
// revalidatePath('/') of refresh-news (see the header of lib/ufc-tv.ts: that
// call also expires this cache when it is read from the home page). The key is
// shared with /videos, UFC TV and the ingest (10,000 units a day).
//
// Like UFC TV's loop: the refresh goes through singleFlight (concurrent calls
// of the instance share one request) and withCooldown (after a failure, no
// retry for 30 min: unstable_cache does not store a callback that throws), and
// the last good list of the instance is kept in memory for when the cache has
// nothing to serve and the refresh fails.
//
// 🪤 NEVER search.list: 100 units per call, 50 times a whole refresh here.
// lib/ufc-shorts.test.ts guards it by reading this file.

// ── Constants ───────────────────────────────────────────────────────────────

export const SHORTS_REVALIDATE_SECONDS = 1800; // 30 min

// The 4:5 shorts (26 % of the UFC ones, measured 29-sep-2026) show black bands
// in a 9:16 frame. Pending the owner's decision: flip this line to let them in.
export const INCLUDE_4X5: boolean = false;

const UFC_UPLOADS = UFC_TV_CHANNELS.find((c) => c.channel === "ufc")?.uploads ?? "";
const UPLOADS_PAGE_SIZE = 50;
// One AbortSignal for both calls: the page does not wait longer than this.
const SHORTS_TIMEOUT_MS = 5_000;
// After a failed refresh, no retry until this has passed (see the header).
const SHORTS_RETRY_AFTER_MS = 30 * 60_000;
const PLAYER_MAX_HEIGHT = 720;
// 🪤 `status` brings embeddable, madeForKids, privacyStatus and uploadStatus;
// `player` (with maxHeight) the embed size. Without either nothing passes.
const VIDEO_PARTS = "contentDetails,status,player";
const MIN_SHORT_SECONDS = 6;
const MAX_SHORT_SECONDS = 180;
// 9:16 is 1.78 (height / width) and 4:5 is 1.25: anything vertical at or
// above the cut is 9:16; below it, it would show bands like a 4:5.
const NINE_SIXTEEN_MIN_RATIO = 1.5;

// ── Types ───────────────────────────────────────────────────────────────────

export type ShortFormat = "9:16" | "4:5";

export type UfcShort = {
  id: string;
  title: string;
  seconds: number;
  format: ShortFormat;
  thumbnail: string;
};

export type UfcShortsList = { fetchedAt: string; shorts: UfcShort[] };

// A videos.list item with part=contentDetails,status,player (maxHeight=720).
// The API sends embedWidth and embedHeight as strings (int64).
export type ShortsVideoItem = {
  id?: string;
  contentDetails?: VideoDetail["contentDetails"];
  status?: {
    embeddable?: boolean;
    madeForKids?: boolean;
    privacyStatus?: string;
    uploadStatus?: string;
  };
  player?: { embedHtml?: string; embedWidth?: string | number; embedHeight?: string | number };
};

type UploadEntry = { videoId: string; title: string };

type FetchLike = (url: string, init?: RequestInit) => Promise<Response>;

type FetchOptions = {
  fetchImpl?: FetchLike;
  apiKey?: string;
  now?: () => Date;
  include4x5?: boolean;
};

// ── Titles ──────────────────────────────────────────────────────────────────

// Other sports and shows the UFC channel also uploads. Measured titles
// (lib/__fixtures__/ufc-tv-2026-09-28.json and lib/ufc-tv.ts): «Zuffa Boxing
// 11: Fisher vs. Pirotton», «Garcia vs Benn: Ceremonial Weigh-In» (boxing
// WITHOUT the word boxing; UFC Español tags it #GarciaBenn), «Power Slap 22: …»
// and «UFC BJJ 8: …» (which does carry the brand). Hashtags are glued after
// normalizeTitle («#PowerSlap» → «powerslap»), hence the optional space.
// 🪤 «boxing» also catches «kickboxing»: losing a short now and then is cheaper
// than a boxing one on the home page.
const SHORTS_BLACKLIST =
  /power ?slap|zuffa|boxing|boxeo|garcia vs\.? benn|garciabenn|podcasts?|\bbjj\b|grappling/;

// The UFC brand: the WORD «ufc» in the normalized title. normalizeTitle
// (lib/ufc-tv.ts) unglues the UFC hashtags, so «#ufc332», «#UFCVegas121»,
// «#ufcparis», «#ufcshorts» and «#NocheUFC» all count; «Tufcat» does not.
// 🪤 Left out on purpose: shorts tagged only «#dwcs» (the Contender Series is
// not an official UFC event and gets its own section, DECISIONS.md 29-sep).
const UFC_BRAND = /(?<![a-z0-9])ufc(?![a-z])/;

export function isBlacklistedShort(title: string): boolean {
  return SHORTS_BLACKLIST.test(normalizeTitle(title));
}

export function hasUfcBrand(title: string): boolean {
  return UFC_BRAND.test(normalizeTitle(title));
}

// ── Filtering ───────────────────────────────────────────────────────────────

/** 9:16 or 4:5 from the embed size, or null when it is not vertical or unknown. */
export function shortFormat(player: ShortsVideoItem["player"]): ShortFormat | null {
  const width = Number(player?.embedWidth);
  const height = Number(player?.embedHeight);
  if (!(width > 0) || !(height > 0) || height <= width) {
    return null;
  }
  return height / width >= NINE_SIXTEEN_MIN_RATIO ? "9:16" : "4:5";
}

export function shortThumbnailUrl(id: string): string {
  return `https://i.ytimg.com/vi/${id}/hqdefault.jpg`;
}

function keepFormat(format: ShortFormat, include4x5: boolean): boolean {
  return format === "9:16" || include4x5;
}

export function toUfcShort(
  entry: UploadEntry,
  item: ShortsVideoItem,
  include4x5: boolean = INCLUDE_4X5,
): UfcShort | null {
  const status = item.status;
  if (
    status?.privacyStatus !== "public" ||
    status.uploadStatus !== "processed" ||
    status.madeForKids !== false
  ) {
    return null;
  }
  if (!isPlayableInSpain({ id: entry.videoId, contentDetails: item.contentDetails, status })) {
    return null;
  }
  const seconds = parseIsoDuration(item.contentDetails?.duration ?? "");
  if (seconds < MIN_SHORT_SECONDS || seconds > MAX_SHORT_SECONDS) {
    return null;
  }
  const format = shortFormat(item.player);
  if (!format || !keepFormat(format, include4x5)) {
    return null;
  }
  if (isBlacklistedShort(entry.title) || !hasUfcBrand(entry.title)) {
    return null;
  }
  return {
    id: entry.videoId,
    title: entry.title,
    seconds,
    format,
    thumbnail: shortThumbnailUrl(entry.videoId),
  };
}

// ── YouTube API ─────────────────────────────────────────────────────────────
//
// Copies of the helpers of lib/ufc-tv.ts, which are not exported. Moving them
// to a shared module means editing ufc-tv.ts, and that waits until after
// UFC 332. This videos.list also takes maxHeight, which ufc-tv's does not.

type PlaylistItemsResponse = {
  items?: { snippet?: { title?: string; resourceId?: { videoId?: string } } }[];
};

// One page of the uploads list (1 unit).
async function fetchUploadsPage(
  fetchImpl: FetchLike,
  apiKey: string,
  uploads: string,
  maxResults: number,
  signal: AbortSignal,
): Promise<UploadEntry[]> {
  const url =
    `https://www.googleapis.com/youtube/v3/playlistItems?part=snippet` +
    `&maxResults=${maxResults}&playlistId=${uploads}&key=${apiKey}`;
  const res = await fetchImpl(url, { signal });
  if (!res.ok) {
    throw new Error(`YouTube API ${res.status}`);
  }
  const data = (await res.json()) as PlaylistItemsResponse;
  const entries: UploadEntry[] = [];
  for (const item of data.items ?? []) {
    const videoId = item.snippet?.resourceId?.videoId;
    const title = item.snippet?.title;
    if (videoId && title && title !== "Private video" && title !== "Deleted video") {
      entries.push({ videoId, title });
    }
  }
  return entries;
}

// videos.list of up to 50 ids (1 unit), with the player size.
async function fetchShortItems(
  fetchImpl: FetchLike,
  apiKey: string,
  ids: string[],
  signal: AbortSignal,
): Promise<ShortsVideoItem[]> {
  const url =
    `https://www.googleapis.com/youtube/v3/videos?part=${VIDEO_PARTS}` +
    `&maxHeight=${PLAYER_MAX_HEIGHT}&id=${ids.slice(0, UPLOADS_PAGE_SIZE).join(",")}&key=${apiKey}`;
  const res = await fetchImpl(url, { signal });
  if (!res.ok) {
    throw new Error(`YouTube API ${res.status}`);
  }
  const data = (await res.json()) as { items?: ShortsVideoItem[] };
  return data.items ?? [];
}

// The shorts list, WITHOUT cache.
//
// 🪤 It THROWS instead of returning [] when the result cannot be trusted (no
// key, a call failed, nothing passed the filters): unstable_cache does not
// store a callback that throws, so a previous list keeps being served, and
// returning [] would store "no shorts" for 30 min.
export async function fetchUfcShorts(opts: FetchOptions = {}): Promise<UfcShortsList> {
  // globalThis.fetch is read WHEN CALLED: inside unstable_cache Next patches
  // it, and the tests replace it.
  const fetchImpl =
    opts.fetchImpl ?? ((url: string, init?: RequestInit) => globalThis.fetch(url, init));
  const apiKey = "apiKey" in opts ? opts.apiKey : process.env.YOUTUBE_API_KEY;
  const now = opts.now ?? (() => new Date());
  const include4x5 = opts.include4x5 ?? INCLUDE_4X5;
  if (!apiKey) {
    throw new Error("UFC shorts: no YOUTUBE_API_KEY");
  }

  const signal = AbortSignal.timeout(SHORTS_TIMEOUT_MS);
  const entries = await fetchUploadsPage(fetchImpl, apiKey, UFC_UPLOADS, UPLOADS_PAGE_SIZE, signal);
  if (entries.length === 0) {
    throw new Error("UFC shorts: empty uploads page");
  }
  const items = await fetchShortItems(
    fetchImpl,
    apiKey,
    entries.map((e) => e.videoId),
    signal,
  );
  const byId = new Map(items.map((item) => [item.id, item] as const));
  const shorts: UfcShort[] = [];
  for (const entry of entries) {
    const item = byId.get(entry.videoId);
    const short = item ? toUfcShort(entry, item, include4x5) : null;
    if (short) {
      shorts.push(short);
    }
  }
  if (shorts.length === 0) {
    throw new Error("UFC shorts: no short passed the filters");
  }
  return { fetchedAt: now().toISOString(), shorts };
}

// ── Fixture mode (deterministic e2e) ────────────────────────────────────────
//
// With UFC_SHORTS_FIXTURE = 'list' | 'empty' the list is CANNED and nothing
// touches the network: made-up ids (11 characters, like a YouTube id, starting
// with «fixShort-») and inline SVG thumbnails, so an e2e never reaches
// YouTube, not even its image CDN. playwright.config.ts will set it in its
// webServer (task of the hero's e2e).
//
// ⚠️ NOT SET IN VERCEL. In production the variable does not exist; any other
// value (or none) is the real path.

export type ShortsFixtureMode = "list" | "empty";

const SHORTS_FIXTURE_MODES: readonly ShortsFixtureMode[] = ["list", "empty"];

export function readShortsFixtureMode(
  env: Record<string, string | undefined> = process.env,
): ShortsFixtureMode | null {
  const value = env.UFC_SHORTS_FIXTURE;
  return SHORTS_FIXTURE_MODES.find((mode) => mode === value) ?? null;
}

const FIXTURE_THUMBNAIL = `data:image/svg+xml,${encodeURIComponent(
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 9 16"><rect width="9" height="16" fill="#27272a"/></svg>',
)}`;

const FIXTURE_SHORTS: UfcShort[] = (
  [
    ["fixShort-01", "Fixture short one: the finish #ufc332", 15, "9:16"],
    ["fixShort-02", "Fixture short two: career so far #ufc332", 58, "9:16"],
    ["fixShort-03", "Fixture short three: top 3 finishes #ufcvegas121", 41, "9:16"],
    ["fixShort-04", "Fixture short four: the knockout #nocheufc", 11, "9:16"],
    ["fixShort-05", "Fixture short five: in slow motion #ufc", 26, "9:16"],
    ["fixShort-06", "Fixture short six: the corners #ufcshorts", 32, "9:16"],
    ["fixShort-07", "Fixture short seven: a 4:5 one #ufcvegas121", 16, "4:5"],
    ["fixShort-08", "Fixture short eight: another 4:5 #ufc331", 25, "4:5"],
  ] as const
).map(([id, title, seconds, format]) => ({ id, title, seconds, format, thumbnail: FIXTURE_THUMBNAIL }));

function fixtureShorts(mode: ShortsFixtureMode, now: Date): UfcShortsList {
  return {
    fetchedAt: now.toISOString(),
    shorts: mode === "empty" ? [] : FIXTURE_SHORTS.filter((s) => keepFormat(s.format, INCLUDE_4X5)),
  };
}

// ── What the pages use ──────────────────────────────────────────────────────

const refreshUfcShorts = withCooldown(
  singleFlight(() => fetchUfcShorts()),
  SHORTS_RETRY_AFTER_MS,
);

// INCLUDE_4X5 goes in the key: flipping it must not serve for 30 min a list
// cached with the other filter.
const getUfcShortsCached = unstable_cache(
  () => refreshUfcShorts(),
  ["ufc-shorts", INCLUDE_4X5 ? "9x16+4x5" : "9x16"],
  { revalidate: SHORTS_REVALIDATE_SECONDS },
);

// The last good list THIS instance has seen: the net for when the cache has
// nothing to serve and the refresh fails (after a revalidatePath('/') or with
// the cooldown open).
let lastGoodShorts: UfcShortsList | null = null;

// The shorts, cached 30 min. NEVER throws: with nothing to show it returns an
// empty list, and the hero keeps its poster.
export async function getUfcShorts(): Promise<UfcShortsList> {
  const mode = readShortsFixtureMode();
  if (mode) {
    return fixtureShorts(mode, new Date());
  }
  try {
    const list = await getUfcShortsCached();
    lastGoodShorts = list;
    return list;
  } catch {
    return lastGoodShorts ?? { fetchedAt: new Date(0).toISOString(), shorts: [] };
  }
}
