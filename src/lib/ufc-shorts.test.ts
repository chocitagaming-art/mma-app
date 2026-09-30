import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// unstable_cache needs Next's request context, which does not exist here
// (environment: "node"): it becomes a pass-through, as in ufc-tv.test.ts. The
// TTL is guarded separately, reading the source (see "source guards").
vi.mock("next/cache", () => ({
  unstable_cache: (fn: (...args: never[]) => unknown) => fn,
}));

import {
  INCLUDE_4X5,
  SHORTS_REVALIDATE_SECONDS,
  fetchUfcShorts,
  hasUfcBrand,
  isBlacklistedShort,
  readShortsFixtureMode,
  shortFormat,
  type ShortsVideoItem,
} from "@/lib/ufc-shorts";

const MEASURED = new Date("2026-09-29T17:52:11Z");
const UFC_UPLOADS = "UUvgfXK4nTYKudb0rFR6noLA";

// ── A fake YouTube Data API ─────────────────────────────────────────────────

function response(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

type FakeVideo = {
  id: string;
  title: string;
  seconds?: number;
  // The player size that videos.list returns with part=player and maxHeight=720.
  width?: number;
  height?: number;
  // null: the field does not come at all.
  madeForKids?: boolean | null;
  embeddable?: boolean;
  privacyStatus?: string;
  uploadStatus?: string;
  regionRestriction?: { blocked?: string[]; allowed?: string[] };
  ageRestricted?: boolean;
};

// 9:16 and 4:5 at maxHeight=720, as the API sizes them.
const VERTICAL = { width: 405, height: 720 };
const FOUR_FIVE = { width: 576, height: 720 };

function isoDuration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `PT${m ? `${m}M` : ""}${s || !m ? `${s}S` : ""}`;
}

// The FULL videos.list item: every part. The fake API strips what the URL did
// not ask for.
function fullItem(v: FakeVideo): Record<string, unknown> {
  const { width, height } = { ...VERTICAL, ...v };
  return {
    id: v.id,
    contentDetails: {
      duration: isoDuration(v.seconds ?? 30),
      ...(v.regionRestriction ? { regionRestriction: v.regionRestriction } : {}),
      ...(v.ageRestricted ? { contentRating: { ytRating: "ytAgeRestricted" } } : {}),
    },
    status: {
      uploadStatus: v.uploadStatus ?? "processed",
      privacyStatus: v.privacyStatus ?? "public",
      embeddable: v.embeddable ?? true,
      ...(v.madeForKids === null ? {} : { madeForKids: v.madeForKids ?? false }),
    },
    // Without maxHeight/maxWidth the real API only sends embedHtml: the size
    // comes back only when it is asked for. It sends the numbers as strings.
    player: { embedHtml: "<iframe></iframe>", embedWidth: String(width), embedHeight: String(height) },
  };
}

type FakeApiOptions = { failOn?: RegExp; empty?: boolean };

function fakeApi(videos: FakeVideo[], { failOn, empty = false }: FakeApiOptions = {}) {
  const urls: string[] = [];
  const fetchImpl = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input);
    urls.push(url);
    if (init?.signal?.aborted) {
      throw init.signal.reason;
    }
    if (failOn?.test(url)) {
      return response({ error: { code: 403 } }, 403);
    }
    const u = new URL(url);
    if (u.pathname.endsWith("/playlistItems")) {
      const max = Number(u.searchParams.get("maxResults"));
      const mine = u.searchParams.get("playlistId") === UFC_UPLOADS;
      return response({
        items: empty || !mine
          ? []
          : videos.slice(0, max).map((v) => ({
              snippet: { title: v.title, resourceId: { videoId: v.id } },
            })),
        nextPageToken: "NEXT",
      });
    }
    if (u.pathname.endsWith("/videos")) {
      const ids = new Set((u.searchParams.get("id") ?? "").split(","));
      // Like the real API: the id and ONLY the parts in the URL. And inside
      // `player`, the size only when maxHeight is in the URL too.
      const parts = new Set((u.searchParams.get("part") ?? "").split(","));
      const sized = u.searchParams.has("maxHeight");
      return response({
        items: videos
          .filter((v) => ids.has(v.id))
          .map((v) => {
            const item = fullItem(v);
            const out: Record<string, unknown> = { id: item.id };
            for (const part of parts) {
              if (part in item) out[part] = item[part];
            }
            if (out.player && !sized) {
              out.player = { embedHtml: "<iframe></iframe>" };
            }
            return out;
          }),
      });
    }
    return response({}, 404);
  });
  return { fetchImpl, urls };
}

// Real titles of the UFC channel: the shorts of maqueta-shorts/datos.json
// (29-sep-2026) and uploads of lib/__fixtures__/ufc-tv-2026-09-28.json.
const REAL: FakeVideo[] = [
  { id: "IuRvqcEmJr0", title: "Raul Rosas Jr. finishes Barcelos #ufcvegas121", seconds: 15 },
  { id: "WicY_TxKy8o", title: "Wang Cong's Career So Far #ufc332", seconds: 58 },
  { id: "YVQeQxGEHM8", title: "TOP 3 PAYTON TALBOTT FINISHES 🚨 #ufc332", seconds: 41 },
  {
    id: "PnNuUcbZ9FA",
    title: "Justin Gaethje and Ilia Topuria's Corners were going crazy! #ufcshorts",
    seconds: 52,
  },
  { id: "svmM02mrD9s", title: "Disqualification due to an illegal knee #ufcvegas121", seconds: 32, ...FOUR_FIVE },
  // A full fight: horizontal and long.
  {
    id: "4jCfhpKS4Wg",
    title: "King Green vs Daniel Zellhuber | Full Fight",
    seconds: 722,
    width: 1280,
    height: 720,
  },
];

async function ids(videos: FakeVideo[], opts: { include4x5?: boolean } = {}) {
  const { fetchImpl } = fakeApi(videos);
  const list = await fetchUfcShorts({ fetchImpl, apiKey: "k", now: () => MEASURED, ...opts });
  return list.shorts.map((s) => s.id);
}

// ── fetchUfcShorts ──────────────────────────────────────────────────────────

describe("fetchUfcShorts · the documented route, 2 quota units", () => {
  it("one playlistItems page of 50 from the UFC uploads and one videos.list with contentDetails, status and player at maxHeight=720", async () => {
    const { fetchImpl, urls } = fakeApi(REAL);
    await fetchUfcShorts({ fetchImpl, apiKey: "k", now: () => MEASURED });
    expect(urls).toHaveLength(2);
    const [list, videos] = urls.map((u) => new URL(u));
    expect(list.pathname).toBe("/youtube/v3/playlistItems");
    expect(list.searchParams.get("playlistId")).toBe(UFC_UPLOADS);
    expect(list.searchParams.get("maxResults")).toBe("50");
    expect(list.searchParams.has("pageToken")).toBe(false);
    expect(videos.pathname).toBe("/youtube/v3/videos");
    expect(videos.searchParams.get("part")?.split(",").sort()).toEqual(["contentDetails", "player", "status"]);
    expect(videos.searchParams.get("maxHeight")).toBe("720");
    expect(videos.searchParams.get("id")?.split(",")).toEqual(REAL.map((v) => v.id));
  });

  it("returns id, title, seconds, format and thumbnail, in upload order (newest first)", async () => {
    const { fetchImpl } = fakeApi(REAL);
    const list = await fetchUfcShorts({ fetchImpl, apiKey: "k", now: () => MEASURED });
    expect(list.fetchedAt).toBe(MEASURED.toISOString());
    expect(list.shorts).toEqual([
      {
        id: "IuRvqcEmJr0",
        title: "Raul Rosas Jr. finishes Barcelos #ufcvegas121",
        seconds: 15,
        format: "9:16",
        thumbnail: "https://i.ytimg.com/vi/IuRvqcEmJr0/hqdefault.jpg",
      },
      {
        id: "WicY_TxKy8o",
        title: "Wang Cong's Career So Far #ufc332",
        seconds: 58,
        format: "9:16",
        thumbnail: "https://i.ytimg.com/vi/WicY_TxKy8o/hqdefault.jpg",
      },
      {
        id: "YVQeQxGEHM8",
        title: "TOP 3 PAYTON TALBOTT FINISHES 🚨 #ufc332",
        seconds: 41,
        format: "9:16",
        thumbnail: "https://i.ytimg.com/vi/YVQeQxGEHM8/hqdefault.jpg",
      },
      {
        id: "PnNuUcbZ9FA",
        title: "Justin Gaethje and Ilia Topuria's Corners were going crazy! #ufcshorts",
        seconds: 52,
        format: "9:16",
        thumbnail: "https://i.ytimg.com/vi/PnNuUcbZ9FA/hqdefault.jpg",
      },
    ]);
  });

  it("the 4:5 ones stay out while INCLUDE_4X5 is false, and come in tagged '4:5' when it is flipped", async () => {
    expect(INCLUDE_4X5).toBe(false);
    expect(await ids(REAL)).not.toContain("svmM02mrD9s");
    const { fetchImpl } = fakeApi(REAL);
    const list = await fetchUfcShorts({ fetchImpl, apiKey: "k", include4x5: true });
    expect(list.shorts.find((s) => s.id === "svmM02mrD9s")?.format).toBe("4:5");
  });

  it("only vertical videos: horizontal and square ones stay out", async () => {
    const base = REAL[0];
    expect(
      await ids([
        base,
        { ...base, id: "horizontal1", width: 1280, height: 720 },
        { ...base, id: "square00001", width: 720, height: 720 },
      ]),
    ).toEqual([base.id]);
  });

  it("from 6 to 180 seconds, both included", async () => {
    const base = REAL[0];
    expect(
      await ids([
        { ...base, id: "five5555555", seconds: 5 },
        { ...base, id: "six66666666", seconds: 6 },
        { ...base, id: "s180s180s18", seconds: 180 },
        { ...base, id: "s181s181s18", seconds: 181 },
      ]),
    ).toEqual(["six66666666", "s180s180s18"]);
  });

  it("the region criterion is isPlayableInSpain: blocked elsewhere passes, blocked in Spain does not", async () => {
    const base = REAL[0];
    expect(
      await ids([
        { ...base, id: "blockedBRKR", regionRestriction: { blocked: ["BR", "KR"] } },
        { ...base, id: "blockedES00", regionRestriction: { blocked: ["ES"] } },
        { ...base, id: "onlyKorea00", regionRestriction: { allowed: ["KR"] } },
        { ...base, id: "allowsES000", regionRestriction: { allowed: ["ES", "MX"] } },
        { ...base, id: "noEmbed0000", embeddable: false },
        { ...base, id: "ageLimit000", ageRestricted: true },
      ]),
    ).toEqual(["blockedBRKR", "allowsES000"]);
  });

  it("madeForKids has to be false: true stays out, and so does a short without the field", async () => {
    const base = REAL[0];
    expect(
      await ids([
        base,
        { ...base, id: "forKids0000", madeForKids: true },
        { ...base, id: "kidsUnknown", madeForKids: null },
      ]),
    ).toEqual([base.id]);
  });

  it("only public and processed videos", async () => {
    const base = REAL[0];
    expect(
      await ids([
        base,
        { ...base, id: "unlisted000", privacyStatus: "unlisted" },
        { ...base, id: "uploading00", uploadStatus: "uploaded" },
      ]),
    ).toEqual([base.id]);
  });

  it("the blacklist wins over the UFC brand: Power Slap, Zuffa Boxing, boxing cards, podcasts, BJJ", async () => {
    const base = REAL[0];
    expect(
      await ids([
        base,
        { ...base, id: "powerSlap01", title: "Power Slap 22: HUGE slap #powerslap #ufc" },
        { ...base, id: "powerSlap02", title: "the loudest slap ever #PowerSlap" },
        { ...base, id: "zuffa000001", title: "Zuffa Boxing 11: Fisher vs. Pirotton #ufc" },
        { ...base, id: "zuffa000002", title: "what a finish #ZuffaBoxing" },
        { ...base, id: "benn0000001", title: "Garcia vs Benn: Ceremonial Weigh-In #ufc" },
        { ...base, id: "podcast0001", title: "UFC Podcast: the fight week" },
        { ...base, id: "bjj00000001", title: "UFC BJJ 8: what a sweep" },
      ]),
    ).toEqual([base.id]);
  });

  it("a short without the UFC brand stays out (the DWCS one of 29-sep, «#dwcs» only)", async () => {
    const base = REAL[0];
    expect(
      await ids([
        base,
        { ...base, id: "dwcs0000001", title: "Reactions to Sanchez's knockout #dwcs" },
        { ...base, id: "nobrand0001", title: "the fights over!!" },
      ]),
    ).toEqual([base.id]);
  });

  it("without the key: no calls and it throws (nothing to cache)", async () => {
    const { fetchImpl } = fakeApi(REAL);
    await expect(fetchUfcShorts({ fetchImpl, apiKey: undefined })).rejects.toThrow();
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("an HTTP error in either call throws", async () => {
    const a = fakeApi(REAL, { failOn: /playlistItems/ });
    await expect(fetchUfcShorts({ fetchImpl: a.fetchImpl, apiKey: "k" })).rejects.toThrow("403");
    expect(a.urls).toHaveLength(1);
    const b = fakeApi(REAL, { failOn: /\/videos\?/ });
    await expect(fetchUfcShorts({ fetchImpl: b.fetchImpl, apiKey: "k" })).rejects.toThrow("403");
  });

  it("an empty uploads page does not spend the videos.list unit, and throws", async () => {
    const { fetchImpl, urls } = fakeApi(REAL, { empty: true });
    await expect(fetchUfcShorts({ fetchImpl, apiKey: "k" })).rejects.toThrow();
    expect(urls).toHaveLength(1);
  });

  it("no short passes the filters: throws instead of caching an empty list for 30 min", async () => {
    await expect(ids([REAL[5]])).rejects.toThrow();
  });
});

// ── The pure pieces ─────────────────────────────────────────────────────────

describe("shortFormat · from the embed size that part=player returns with maxHeight", () => {
  it("9:16 and 4:5, with the numbers as strings (as the API sends them) or numbers", () => {
    expect(shortFormat({ embedWidth: "405", embedHeight: "720" })).toBe("9:16");
    expect(shortFormat({ embedWidth: 405, embedHeight: 720 })).toBe("9:16");
    expect(shortFormat({ embedWidth: "576", embedHeight: "720" })).toBe("4:5");
  });

  it("not vertical, or no size at all: null", () => {
    expect(shortFormat({ embedWidth: "1280", embedHeight: "720" })).toBeNull();
    expect(shortFormat({ embedWidth: "720", embedHeight: "720" })).toBeNull();
    expect(shortFormat({ embedHtml: "<iframe></iframe>" } as ShortsVideoItem["player"])).toBeNull();
    expect(shortFormat(undefined)).toBeNull();
  });
});

describe("hasUfcBrand · the word «ufc» in the title, hashtags included", () => {
  it.each([
    "Raul Rosas Jr. finishes Barcelos #ufcvegas121",
    "TOP 3 PAYTON TALBOTT FINISHES 🚨 #ufc332",
    "still one of the craziest knockouts we've ever seen #nocheufc",
    "NEVER take a punch to the gut like this 💀 #ufc #mma #knockout",
    "Justin Gaethje and Ilia Topuria's Corners were going crazy! #ufcshorts",
    "OH MY WHAT A KNOCKOUT #ufcparis",
    "The GREATEST ROOKIES in the UFC!",
  ])("yes: %s", (title) => {
    expect(hasUfcBrand(title)).toBe(true);
  });

  it.each(["Reactions to Sanchez's knockout #dwcs", "the fights over!!", "Tufcat rocks"])(
    "no: %s",
    (title) => {
      expect(hasUfcBrand(title)).toBe(false);
    },
  );
});

describe("isBlacklistedShort", () => {
  it.each([
    "Zuffa Boxing 11: Fisher vs. Pirotton | Pre-Show + 1st Prelim",
    "Garcia vs Benn: Ceremonial Weigh-In",
    "#GarciaBenn the stare down",
    "Power Slap 22: Main Event | Julio 30",
    "#PowerSlap what a slap",
    "The UFC Podcast #ufc",
    "UFC BJJ 8: Prelims",
    "boxeo de verdad #ufc",
  ])("out: %s", (title) => {
    expect(isBlacklistedShort(title)).toBe(true);
  });

  it.each(["Raul Rosas Jr. finishes Barcelos #ufcvegas121", "AND STILL 🏆 #ufc331"])(
    "in: %s",
    (title) => {
      expect(isBlacklistedShort(title)).toBe(false);
    },
  );
});

describe("readShortsFixtureMode", () => {
  it("only 'list' and 'empty'; anything else is the real path", () => {
    expect(readShortsFixtureMode({ UFC_SHORTS_FIXTURE: "list" })).toBe("list");
    expect(readShortsFixtureMode({ UFC_SHORTS_FIXTURE: "empty" })).toBe("empty");
    expect(readShortsFixtureMode({ UFC_SHORTS_FIXTURE: "loop" })).toBeNull();
    expect(readShortsFixtureMode({})).toBeNull();
  });
});

// ── getUfcShorts: cache, cooldown, last good list, fixture ──────────────────

describe("getUfcShorts · never throws and does not burn the quota", () => {
  // A NEW module in every test: the cooldown and the last good list live in
  // the module (per server instance, on purpose).
  const original = {
    fixture: process.env.UFC_SHORTS_FIXTURE,
    key: process.env.YOUTUBE_API_KEY,
  };

  beforeEach(() => {
    vi.resetModules();
    delete process.env.UFC_SHORTS_FIXTURE;
    process.env.YOUTUBE_API_KEY = "k";
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    for (const [name, value] of [
      ["UFC_SHORTS_FIXTURE", original.fixture],
      ["YOUTUBE_API_KEY", original.key],
    ] as const) {
      if (value === undefined) {
        delete process.env[name];
      } else {
        process.env[name] = value;
      }
    }
  });

  it("with the API healthy: the list", async () => {
    const { fetchImpl } = fakeApi(REAL);
    vi.stubGlobal("fetch", fetchImpl);
    const fresh = await import("@/lib/ufc-shorts");
    const list = await fresh.getUfcShorts();
    expect(list.shorts.map((s) => s.id)).toEqual(["IuRvqcEmJr0", "WicY_TxKy8o", "YVQeQxGEHM8", "PnNuUcbZ9FA"]);
  });

  it("a persistent failure is paid ONCE, and the page gets an empty list, not an exception", async () => {
    const { fetchImpl, urls } = fakeApi(REAL, { failOn: /playlistItems/ });
    vi.stubGlobal("fetch", fetchImpl);
    const fresh = await import("@/lib/ufc-shorts");
    await expect(fresh.getUfcShorts()).resolves.toMatchObject({ shorts: [] });
    const afterFirst = urls.length;
    expect(afterFirst).toBe(1);
    await fresh.getUfcShorts();
    await fresh.getUfcShorts();
    expect(urls.length, "every visit paid the refresh again").toBe(afterFirst);
  });

  it("if the refresh fails, it serves the last good list of the instance", async () => {
    const healthy = fakeApi(REAL);
    let down = false;
    vi.stubGlobal("fetch", (url: string, init?: RequestInit) =>
      down ? Promise.resolve(response({}, 403)) : healthy.fetchImpl(url, init),
    );
    const fresh = await import("@/lib/ufc-shorts");
    const good = await fresh.getUfcShorts();
    expect(good.shorts.length).toBeGreaterThan(0);
    down = true;
    await expect(fresh.getUfcShorts()).resolves.toEqual(good);
  });

  it("UFC_SHORTS_FIXTURE=list: fake ids and local thumbnails, and not a single request", async () => {
    process.env.UFC_SHORTS_FIXTURE = "list";
    const { fetchImpl } = fakeApi(REAL);
    vi.stubGlobal("fetch", fetchImpl);
    const fresh = await import("@/lib/ufc-shorts");
    const list = await fresh.getUfcShorts();
    expect(fetchImpl).not.toHaveBeenCalled();
    expect(list.shorts.length).toBeGreaterThanOrEqual(3);
    for (const s of list.shorts) {
      // 11 characters like a YouTube id (the client's URL builders accept
      // it), but marked as a fixture so it is never mistaken for a real one.
      expect(s.id).toMatch(/^[A-Za-z0-9_-]{11}$/);
      expect(s.id).toMatch(/^fixShort-/);
      expect(s.thumbnail).toMatch(/^data:image\/svg\+xml,/);
      expect(s.seconds).toBeGreaterThanOrEqual(6);
      expect(s.seconds).toBeLessThanOrEqual(180);
    }
    // INCLUDE_4X5 applies to the fixture too.
    expect(list.shorts.every((s) => s.format === "9:16")).toBe(true);
  });

  it("UFC_SHORTS_FIXTURE=empty: an empty list, for the poster path", async () => {
    process.env.UFC_SHORTS_FIXTURE = "empty";
    const { fetchImpl } = fakeApi(REAL);
    vi.stubGlobal("fetch", fetchImpl);
    const fresh = await import("@/lib/ufc-shorts");
    expect((await fresh.getUfcShorts()).shorts).toEqual([]);
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});

// ── Source guards ───────────────────────────────────────────────────────────

describe("source guards of ufc-shorts.ts", () => {
  const source = readFileSync(fileURLToPath(new URL("./ufc-shorts.ts", import.meta.url)), "utf8");

  it("NEVER uses search.list (100 units per call)", () => {
    expect(source).not.toContain("youtube/v3/search");
  });

  it("the TTL stays between 30 and 60 min", () => {
    expect(SHORTS_REVALIDATE_SECONDS).toBeGreaterThanOrEqual(1800);
    expect(SHORTS_REVALIDATE_SECONDS).toBeLessThanOrEqual(3600);
  });

  it("and it is THAT one that unstable_cache uses, not a number typed by hand", () => {
    const used = [...source.matchAll(/revalidate:\s*([A-Za-z0-9_]+)/g)].map((m) => m[1]);
    expect(used).toEqual(["SHORTS_REVALIDATE_SECONDS"]);
  });

  it("the refresh goes through withCooldown and singleFlight", () => {
    expect(source).toMatch(/withCooldown\(\s*singleFlight\(\(\) => fetchUfcShorts\(\)\)/);
  });

  it("4:5 is a one-line switch, off until the owner decides", () => {
    expect(source).toMatch(/^export const INCLUDE_4X5: boolean = false;$/m);
  });

  it("ufc-tv.ts is only imported, never re-exported from here", () => {
    expect(source).not.toMatch(/export \* from|export \{[^}]*\} from "@\/lib\/ufc-tv"/);
  });
});
