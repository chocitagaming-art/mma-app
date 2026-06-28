import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  getUfcVideos,
  parseIsoDuration,
  regionAllows,
  isAgeRestricted,
  isShort,
  isPlayableInSpain,
  YOUTUBE_CATEGORIES,
  type VideoDetail,
} from "@/lib/youtube";

describe("parseIsoDuration", () => {
  it("parsea horas/minutos/segundos", () => {
    expect(parseIsoDuration("PT45S")).toBe(45);
    expect(parseIsoDuration("PT2M10S")).toBe(130);
    expect(parseIsoDuration("PT1H2M3S")).toBe(3723);
    expect(parseIsoDuration("PT0S")).toBe(0);
    expect(parseIsoDuration("")).toBe(0);
  });
});

describe("regionAllows", () => {
  it("aplica blocked/allowed para ES", () => {
    expect(regionAllows({ blocked: ["ES"] })).toBe(false);
    expect(regionAllows({ allowed: ["MX"] })).toBe(false);
    expect(regionAllows({ allowed: ["ES", "MX"] })).toBe(true);
    expect(regionAllows(undefined)).toBe(true);
  });
});

describe("isAgeRestricted", () => {
  it("detecta ytAgeRestricted", () => {
    const yes: VideoDetail = {
      id: "a",
      contentDetails: { contentRating: { ytRating: "ytAgeRestricted" } },
    };
    const no: VideoDetail = { id: "b", contentDetails: { contentRating: {} } };
    expect(isAgeRestricted(yes)).toBe(true);
    expect(isAgeRestricted(no)).toBe(false);
  });
});

describe("isShort", () => {
  it("descarta < 75s; conserva >= 75s", () => {
    expect(isShort({ id: "a", contentDetails: { duration: "PT60S" } })).toBe(true);
    expect(isShort({ id: "b", contentDetails: { duration: "PT75S" } })).toBe(false);
    expect(isShort({ id: "c", contentDetails: { duration: "PT2M" } })).toBe(false);
  });
});

describe("isPlayableInSpain", () => {
  it("rechaza no-embebibles, geo-bloqueados y age-restricted", () => {
    expect(
      isPlayableInSpain({
        id: "a",
        status: { embeddable: false },
        contentDetails: { duration: "PT5M" },
      }),
    ).toBe(false);
    expect(
      isPlayableInSpain({
        id: "b",
        contentDetails: { duration: "PT5M", regionRestriction: { blocked: ["ES"] } },
      }),
    ).toBe(false);
    expect(
      isPlayableInSpain({
        id: "c",
        contentDetails: {
          duration: "PT5M",
          contentRating: { ytRating: "ytAgeRestricted" },
        },
      }),
    ).toBe(false);
    expect(
      isPlayableInSpain({
        id: "d",
        status: { embeddable: true },
        contentDetails: { duration: "PT5M" },
      }),
    ).toBe(true);
  });
});

describe("YOUTUBE_CATEGORIES", () => {
  it("expone exactamente las 4 secciones visibles en orden", () => {
    expect(YOUTUBE_CATEGORIES.map((c) => c.key)).toEqual([
      "historias",
      "resumenes",
      "analisis",
      "entrevistas",
    ]);
    expect(YOUTUBE_CATEGORIES.find((c) => c.key === "historias")?.label).toBe(
      "Historias de luchadores",
    );
  });
});

// ── Integración: getUfcVideos con fetch mockeado ─────────────────────────────
function json(body: unknown) {
  return { ok: true, json: async () => body } as unknown as Response;
}
function snippet(videoId: string, title: string, publishedAt: string) {
  return {
    snippet: { resourceId: { videoId }, title, publishedAt, thumbnails: {} },
  };
}

describe("getUfcVideos (con API key)", () => {
  beforeEach(() => {
    process.env.YOUTUBE_API_KEY = "test-key";
  });
  afterEach(() => {
    vi.restoreAllMocks();
    delete process.env.YOUTUBE_API_KEY;
  });

  it("descarta Shorts, geo-bloqueados, no-embebibles y age-restricted", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        json({
          items: [
            snippet("ok1", "Historia larga", "2026-06-20T00:00:00Z"),
            snippet("short1", "Short", "2026-06-21T00:00:00Z"),
            snippet("geo1", "Bloqueado", "2026-06-22T00:00:00Z"),
            snippet("age1", "Brutal KO", "2026-06-23T00:00:00Z"),
          ],
        }),
      )
      .mockResolvedValueOnce(
        json({
          items: [
            { id: "ok1", contentDetails: { duration: "PT10M" }, status: { embeddable: true } },
            { id: "short1", contentDetails: { duration: "PT45S" }, status: { embeddable: true } },
            {
              id: "geo1",
              contentDetails: { duration: "PT10M", regionRestriction: { blocked: ["ES"] } },
              status: { embeddable: true },
            },
            {
              id: "age1",
              contentDetails: {
                duration: "PT10M",
                contentRating: { ytRating: "ytAgeRestricted" },
              },
              status: { embeddable: true },
            },
          ],
        }),
      );
    vi.stubGlobal("fetch", fetchMock);

    const videos = await getUfcVideos({ category: "historias", limit: 6 });
    expect(videos.map((v) => v.videoId)).toEqual(["ok1"]);
  });

  it("con key, si el filtrado deja 0, NO cae a RSS", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(json({ items: [snippet("short1", "x", "2026-06-21T00:00:00Z")] }))
      .mockResolvedValueOnce(
        json({
          items: [{ id: "short1", contentDetails: { duration: "PT30S" }, status: { embeddable: true } }],
        }),
      );
    vi.stubGlobal("fetch", fetchMock);

    const videos = await getUfcVideos({ category: "historias", limit: 6 });
    expect(videos).toEqual([]);
    for (const call of fetchMock.mock.calls) {
      expect(String(call[0])).not.toContain("feeds/videos.xml");
    }
  });

  it("descarta candidatos ausentes en videos.list (privado/borrado)", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        json({
          items: [
            snippet("ok1", "A", "2026-06-20T00:00:00Z"),
            snippet("gone", "B", "2026-06-21T00:00:00Z"),
          ],
        }),
      )
      .mockResolvedValueOnce(
        json({ items: [{ id: "ok1", contentDetails: { duration: "PT10M" }, status: { embeddable: true } }] }),
      );
    vi.stubGlobal("fetch", fetchMock);

    const videos = await getUfcVideos({ category: "historias", limit: 6 });
    expect(videos.map((v) => v.videoId)).toEqual(["ok1"]);
  });

  it("filtra por título (query) en la rama API", async () => {
    // categoría 'resumenes' = Eurosport(query 'UFC') + Next MMA(query 'resumen').
    // Los 2 canales se piden EN PARALELO (Promise.all), así que el mock responde
    // según la URL, no por orden de invocación.
    const fetchMock = vi.fn((input: unknown) => {
      const u = String(input);
      if (u.includes("playlistItems") && u.includes("UUcDVs7ZH1I3Z1vKqjQuSBBg")) {
        return Promise.resolve(
          json({
            items: [
              snippet("e1", "Ciclismo Tour", "2026-06-20T00:00:00Z"),
              snippet("e2", "Combate UFC Bakú", "2026-06-21T00:00:00Z"),
            ],
          }),
        );
      }
      if (u.includes("playlistItems") && u.includes("UU3v8OQyx4D_WP3RDiQ9I9_A")) {
        return Promise.resolve(
          json({
            items: [
              snippet("n1", "Predicciones picks", "2026-06-22T00:00:00Z"),
              snippet("n2", "UFC Bakú Resumen", "2026-06-23T00:00:00Z"),
            ],
          }),
        );
      }
      if (u.includes("/videos?") && u.includes("id=e2")) {
        return Promise.resolve(
          json({ items: [{ id: "e2", contentDetails: { duration: "PT8M" }, status: { embeddable: true } }] }),
        );
      }
      if (u.includes("/videos?") && u.includes("n2")) {
        return Promise.resolve(
          json({ items: [{ id: "n2", contentDetails: { duration: "PT12M" }, status: { embeddable: true } }] }),
        );
      }
      return Promise.resolve(json({ items: [] }));
    });
    vi.stubGlobal("fetch", fetchMock);

    const videos = await getUfcVideos({ category: "resumenes", limit: 6 });
    expect(videos.map((v) => v.videoId).sort()).toEqual(["e2", "n2"]);
  });
});
