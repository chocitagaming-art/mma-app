import { describe, expect, it } from "vitest";

import {
  TRENDING_STEP,
  isFeaturedIndex,
  mergeTrendingItems,
  normalizeDateValue,
  parseShowParam,
  type TrendingItem,
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

  it("a fecha igual la noticia va antes que el vídeo (la adelanta el bonus de 12 h)", () => {
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

// ---------------------------------------------------------------------------
// T3-B2 · ATAQUES: bonus de 12 h a las noticias + tope de 2 vídeos seguidos.
// Escritos ANTES del parche. Los marcados [ATAQUE] tienen que salir ROJOS con
// el código actual; los marcados [GUARDIA] ya están verdes hoy y sirven para
// que el parche no los rompa (se dice en voz alta: no son ataques).
// ---------------------------------------------------------------------------

function keys(items: TrendingItem[]): string[] {
  return items.map((item) =>
    item.type === "news" ? `n${item.article.id}` : item.video.videoId,
  );
}

// Racha máxima de vídeos consecutivos en la salida.
function longestVideoRun(items: TrendingItem[]): number {
  let best = 0;
  let run = 0;
  for (const item of items) {
    run = item.type === "video" ? run + 1 : 0;
    best = Math.max(best, run);
  }
  return best;
}

// Índice del primer vídeo que rompe el tope (el 3.º seguido). -1 si ninguno.
// El 2 va como literal a propósito: si alguien sube la constante del módulo,
// este test tiene que cantarlo, no seguirle la corriente.
function firstOverflowIndex(items: TrendingItem[]): number {
  let run = 0;
  for (let i = 0; i < items.length; i += 1) {
    run = items[i].type === "video" ? run + 1 : 0;
    if (run > 2) {
      return i;
    }
  }
  return -1;
}

function lastNewsIndex(items: TrendingItem[]): number {
  let last = -1;
  items.forEach((item, i) => {
    if (item.type === "news") {
      last = i;
    }
  });
  return last;
}

describe("mergeTrendingItems · bonus de noticias y tope de vídeos", () => {
  it("[ATAQUE] una tanda de 5 vídeos del mismo día no copa la cabecera", () => {
    // El caso real: ufcespanol sube 5 vídeos de golpe hoy, las noticias son de
    // ayer. Hoy el feed sale V,V,V,V,V,N,N,N,N,N.
    const videos = ["18", "17", "16", "15", "14"].map((hour, i) =>
      video({ videoId: `v${i + 1}`, publishedAt: `2026-08-06T${hour}:00:00Z` }),
    );
    const news = ["20", "19", "18", "17", "16"].map((hour, i) =>
      article({ id: i + 1, publishedAt: `2026-08-05T${hour}:00:00Z` }),
    );

    const merged = mergeTrendingItems(news, videos);

    expect(longestVideoRun(merged)).toBeLessThanOrEqual(2);
    // Y sigue MEZCLADO, no dos bloques: el vídeo manda mientras su fecha gana.
    expect(merged.map((item) => item.type)).toEqual([
      "video",
      "video",
      "news",
      "video",
      "video",
      "news",
      "video",
      "news",
      "news",
      "news",
    ]);
    expect(keys(merged)).toEqual([
      "v1", "v2", "n1", "v3", "v4", "n2", "v5", "n3", "n4", "n5",
    ]);
  });

  it("[ATAQUE] una noticia 10 h más vieja adelanta al vídeo (bonus de 12 h)", () => {
    const merged = mergeTrendingItems(
      [article({ id: 1, publishedAt: "2026-08-05T14:00:00Z" })],
      [video({ videoId: "v1", publishedAt: "2026-08-06T00:00:00Z" })],
    );
    expect(keys(merged)).toEqual(["n1", "v1"]);
  });

  it("[ATAQUE] el empate de puntuación (noticia justo 12 h más vieja) lo gana la noticia", () => {
    const merged = mergeTrendingItems(
      [article({ id: 1, publishedAt: "2026-08-05T12:00:00Z" })],
      [video({ videoId: "v1", publishedAt: "2026-08-06T00:00:00Z" })],
    );
    expect(keys(merged)).toEqual(["n1", "v1"]);
  });

  it("[GUARDIA] pasadas las 12 h el vídeo recupera la cabeza: el bonus no es un pase libre", () => {
    const merged = mergeTrendingItems(
      [article({ id: 1, publishedAt: "2026-08-05T10:59:00Z" })],
      [video({ videoId: "v1", publishedAt: "2026-08-06T00:00:00Z" })],
    );
    expect(keys(merged)).toEqual(["v1", "n1"]);
  });

  it("[ATAQUE] sin noticias con que separar, la racha larga solo puede quedar en la COLA", () => {
    // DECISIÓN, dicha en voz alta: "nunca 3 vídeos seguidos" es IMPOSIBLE de
    // cumplir si se agotan las noticias. No se tira ningún vídeo (el feed
    // pagina sobre esta lista) ni se inventan huecos. El tope es una regla de
    // SEPARACIÓN: se cumple mientras queden noticias con las que separar, y
    // los vídeos sobrantes salen seguidos AL FINAL. El invariante exigible es
    // que ninguna racha de 3+ empiece ANTES de la última noticia.
    const videos = ["18", "17", "16", "15", "14"].map((hour, i) =>
      video({ videoId: `v${i + 1}`, publishedAt: `2026-08-06T${hour}:00:00Z` }),
    );
    const merged = mergeTrendingItems(
      [article({ id: 1, publishedAt: "2026-08-05T09:00:00Z" })],
      videos,
    );

    expect(keys(merged)).toEqual(["v1", "v2", "n1", "v3", "v4", "v5"]);
    expect(firstOverflowIndex(merged)).toBeGreaterThan(lastNewsIndex(merged));
  });

  it("[GUARDIA] un día sin noticias degrada: los vídeos salen por fecha desc y no rompe", () => {
    const videos = ["18", "14", "16"].map((hour, i) =>
      video({ videoId: `v${i + 1}`, publishedAt: `2026-08-06T${hour}:00:00Z` }),
    );
    const merged = mergeTrendingItems([], videos);
    expect(keys(merged)).toEqual(["v1", "v3", "v2"]);
    expect(merged).toHaveLength(3);
  });

  it("[GUARDIA] es determinista: dos llamadas idénticas dan el mismo orden", () => {
    const news = [
      article({ id: 1, publishedAt: "2026-08-06T09:00:00Z" }),
      article({ id: 2, publishedAt: "2026-08-06T09:00:00Z" }),
      article({ id: 3, publishedAt: "2026-08-05T09:00:00Z" }),
    ];
    const videos = ["18", "17", "16", "15"].map((hour, i) =>
      video({ videoId: `v${i + 1}`, publishedAt: `2026-08-06T${hour}:00:00Z` }),
    );
    expect(keys(mergeTrendingItems(news, videos))).toEqual(
      keys(mergeTrendingItems(news, videos)),
    );
  });

  it("[GUARDIA] no muta NINGUNA de las dos entradas, ni el array de vídeos", () => {
    // Los vídeos llegan a propósito DESORDENADOS: un .sort() in situ sobre la
    // entrada los reordenaría y este test lo cantaría.
    const news = [
      article({ id: 1, publishedAt: "2026-08-01T08:00:00Z" }),
      article({ id: 2, publishedAt: "2026-08-05T08:00:00Z" }),
    ];
    const videos = [
      video({ videoId: "v1", publishedAt: "2026-08-02T10:00:00Z" }),
      video({ videoId: "v2", publishedAt: "2026-08-06T10:00:00Z" }),
      video({ videoId: "v3", publishedAt: "2026-08-04T10:00:00Z" }),
    ];
    const newsSnapshot = [...news];
    const videosSnapshot = [...videos];

    mergeTrendingItems(news, videos);

    expect(news).toEqual(newsSnapshot);
    expect(videos).toEqual(videosSnapshot);
    expect(news.every((item, i) => item === newsSnapshot[i])).toBe(true);
    expect(videos.every((item, i) => item === videosSnapshot[i])).toBe(true);
  });

  it("[GUARDIA] el bonus no rescata fechas nulas: siguen al fondo", () => {
    const merged = mergeTrendingItems(
      [
        article({ id: 1, publishedAt: null }),
        article({ id: 2, publishedAt: "2026-08-01T00:00:00Z" }),
      ],
      [
        video({ videoId: "v1", publishedAt: "2026-08-05T00:00:00Z" }),
        video({ videoId: "v2", publishedAt: "fecha rota" }),
      ],
    );
    expect(keys(merged)).toEqual(["v1", "n2", "n1", "v2"]);
    expect(merged[2].date).toBeNull();
    expect(merged[3].date).toBeNull();
  });

  it("[GUARDIA] no pierde ni duplica ítems: 'Cargar más' pagina sobre esta lista", () => {
    const videos = ["18", "17", "16", "15", "14", "13", "12"].map((hour, i) =>
      video({ videoId: `v${i + 1}`, publishedAt: `2026-08-06T${hour}:00:00Z` }),
    );
    const news = ["20", "19", "18"].map((hour, i) =>
      article({ id: i + 1, publishedAt: `2026-08-05T${hour}:00:00Z` }),
    );
    const merged = mergeTrendingItems(news, videos);
    expect(merged).toHaveLength(10);
    expect(new Set(keys(merged)).size).toBe(10);
  });

  it("[ATAQUE] el tope se respeta también en el primer PASO de 12 que se pinta", () => {
    // El consumidor real corta con feed.slice(0, shown): lo que importa es que
    // el prefijo visible no tenga 3 vídeos seguidos.
    const videos = Array.from({ length: 12 }, (_, i) =>
      video({
        videoId: `v${i + 1}`,
        publishedAt: `2026-08-06T${String(23 - i).padStart(2, "0")}:00:00Z`,
      }),
    );
    const news = Array.from({ length: 12 }, (_, i) =>
      article({
        id: i + 1,
        publishedAt: `2026-08-04T${String(23 - i).padStart(2, "0")}:00:00Z`,
      }),
    );
    const primeraPagina = mergeTrendingItems(news, videos).slice(0, TRENDING_STEP);
    expect(longestVideoRun(primeraPagina)).toBeLessThanOrEqual(2);
  });
});
