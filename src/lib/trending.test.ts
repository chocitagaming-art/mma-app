import { describe, expect, it } from "vitest";

import {
  TRENDING_STEP,
  isFeaturedIndex,
  mergeTrendingItems,
  normalizeDateValue,
  parseShowParam,
} from "@/lib/trending";
import type { NewsArticle } from "@/lib/types";
import type { YouTubeVideo } from "@/lib/youtube";

function article(overrides: Partial<NewsArticle> = {}): NewsArticle {
  return {
    id: 1,
    headline: "Titular",
    summary: null,
    source: "ESPN",
    url: "https://example.com/a",
    publishedAt: "2026-07-10T08:00:00Z",
    fighterId: null,
    fighterName: null,
    category: "fight_announcement",
    relevance: null,
    imageUrl: null,
    ...overrides,
  };
}

function video(overrides: Partial<YouTubeVideo> = {}): YouTubeVideo {
  return {
    videoId: "abc123",
    title: "Resumen",
    thumbnail: "https://i.ytimg.com/vi/abc123/hqdefault.jpg",
    publishedAt: "2026-07-11T10:00:00Z",
    url: "https://www.youtube.com/watch?v=abc123",
    channelTitle: "Canal",
    category: "resumenes",
    ...overrides,
  };
}

describe("normalizeDateValue", () => {
  it("acepta ISO string y objetos Date del driver de pg", () => {
    expect(normalizeDateValue("2026-07-10T08:00:00Z")).toBe("2026-07-10T08:00:00Z");
    expect(normalizeDateValue(new Date("2026-07-10T08:00:00Z"))).toBe(
      "2026-07-10T08:00:00.000Z",
    );
  });

  it("degrada lo no parseable a null", () => {
    expect(normalizeDateValue(null)).toBeNull();
    expect(normalizeDateValue("no es fecha")).toBeNull();
    expect(normalizeDateValue(new Date("rota"))).toBeNull();
    expect(normalizeDateValue(42)).toBeNull();
    expect(normalizeDateValue("   ")).toBeNull();
  });
});

describe("mergeTrendingItems", () => {
  it("intercala por fecha descendente conservando el tipo", () => {
    const merged = mergeTrendingItems(
      [article({ id: 1, publishedAt: "2026-07-10T08:00:00Z" }), article({ id: 2, publishedAt: "2026-07-08T08:00:00Z" })],
      [video({ videoId: "v1", publishedAt: "2026-07-11T10:00:00Z" }), video({ videoId: "v2", publishedAt: "2026-07-09T10:00:00Z" })],
    );
    expect(merged.map((item) => item.type)).toEqual(["video", "news", "video", "news"]);
    expect(merged[0]).toMatchObject({ type: "video", video: { videoId: "v1" } });
  });

  it("fechas nulas o rotas al fondo", () => {
    const merged = mergeTrendingItems(
      [article({ id: 1, publishedAt: null }), article({ id: 2, publishedAt: "2026-07-08T08:00:00Z" })],
      [video({ videoId: "v1", publishedAt: "fecha rota" })],
    );
    expect(merged.map((item) => (item.type === "news" ? item.article.id : item.video.videoId))).toEqual([
      2, 1, "v1",
    ]);
    expect(merged[1].date).toBeNull();
    expect(merged[2].date).toBeNull();
  });

  it("a fecha igual conserva noticia antes que vídeo (sort estable)", () => {
    const merged = mergeTrendingItems(
      [article({ id: 1, publishedAt: "2026-07-10T08:00:00Z" })],
      [video({ videoId: "v1", publishedAt: "2026-07-10T08:00:00Z" })],
    );
    expect(merged.map((item) => item.type)).toEqual(["news", "video"]);
  });

  it("no muta los arrays de entrada", () => {
    const news = [article({ id: 1, publishedAt: "2026-07-01T08:00:00Z" }), article({ id: 2, publishedAt: "2026-07-05T08:00:00Z" })];
    const videos = [video()];
    const newsCopy = [...news];
    mergeTrendingItems(news, videos);
    expect(news).toEqual(newsCopy);
  });

  it("una fuente vacía devuelve solo la otra, ya envuelta", () => {
    expect(mergeTrendingItems([], [video()])[0].type).toBe("video");
    expect(mergeTrendingItems([article()], []).length).toBe(1);
    expect(mergeTrendingItems([], [])).toEqual([]);
  });
});

describe("parseShowParam", () => {
  it("por defecto un paso; clamp entre el paso y el total", () => {
    expect(parseShowParam(undefined, 60)).toBe(TRENDING_STEP);
    expect(parseShowParam("24", 60)).toBe(24);
    expect(parseShowParam("999", 60)).toBe(60);
    expect(parseShowParam("3", 60)).toBe(TRENDING_STEP);
    expect(parseShowParam("-5", 60)).toBe(TRENDING_STEP);
    expect(parseShowParam("x", 60)).toBe(TRENDING_STEP);
  });

  it("con feeds diminutos nunca devuelve menos que el paso (la UI recorta sola)", () => {
    expect(parseShowParam("24", 5)).toBe(TRENDING_STEP);
  });
});

describe("isFeaturedIndex", () => {
  it("destaca la primera tarjeta y una de cada ~7", () => {
    expect(isFeaturedIndex(0)).toBe(true);
    expect(isFeaturedIndex(1)).toBe(false);
    expect(isFeaturedIndex(7)).toBe(true);
    expect(isFeaturedIndex(13)).toBe(false);
    expect(isFeaturedIndex(14)).toBe(true);
  });
});
