import { describe, expect, it } from "vitest";

import { HOME_FEED_TOTAL, HOME_FEED_VIDEOS, homeFeedKey, pickHomeFeed } from "@/lib/home-feed";
import type { TrendingItem } from "@/lib/trending";
import type { NewsArticle } from "@/lib/types";
import type { YouTubeVideo } from "@/lib/youtube";

// R10: the home's «Noticias y vídeos», 6 news + 3 videos with the /tendencias
// rule (12 h of advantage to the news, never more than 2 videos in a row).

const HOUR = 60 * 60 * 1000;
const NOW = Date.parse("2026-10-18T12:00:00Z");
const at = (hoursAgo: number) => new Date(NOW - hoursAgo * HOUR).toISOString();

function article(id: number, hoursAgo: number, imageUrl: string | null = `https://img.example/${id}.jpg`): NewsArticle {
  return {
    id,
    headline: `Noticia ${id}`,
    summary: null,
    source: "Marca",
    url: `https://example.com/n/${id}`,
    publishedAt: at(hoursAgo),
    fighterId: null,
    fighterName: null,
    category: null,
    relevance: null,
    imageUrl,
  };
}

function video(videoId: string, hoursAgo: number): YouTubeVideo {
  return {
    videoId,
    title: `Vídeo ${videoId}`,
    thumbnail: `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
    publishedAt: at(hoursAgo),
    url: `https://www.youtube.com/watch?v=${videoId}`,
    channelTitle: "UFC Español",
    category: "entrevistas",
  };
}

const shape = (items: TrendingItem[]) => items.map((i) => (i.type === "news" ? "N" : "V")).join("");
const keys = (items: TrendingItem[]) => items.map(homeFeedKey);

// Twelve news, one every 8 h (the home asks for 12: getRecentNews(12)).
const twelveNews = () => Array.from({ length: 12 }, (_, i) => article(i + 1, 30 + i * 8));
// Five fresh videos, the morning after an event (the old column showed 5).
const fiveVideos = () => ["v1", "v2", "v3", "v4", "v5"].map((id, i) => video(id, 1 + i));

describe("pickHomeFeed · the quota", () => {
  it("9 pieces by default: 6 news and 3 videos", () => {
    expect(HOME_FEED_TOTAL).toBe(9);
    expect(HOME_FEED_VIDEOS).toBe(3);
    const feed = pickHomeFeed(twelveNews(), fiveVideos());
    expect(feed).toHaveLength(9);
    expect(feed.filter((i) => i.type === "news")).toHaveLength(6);
    expect(feed.filter((i) => i.type === "video")).toHaveLength(3);
  });

  it("the NEWEST of each: the 6 latest news and the 3 latest videos, whatever order they came in", () => {
    const shuffledNews = [...twelveNews()].reverse();
    const shuffledVideos = [...fiveVideos()].reverse();
    const feed = pickHomeFeed(shuffledNews, shuffledVideos);
    const newsIds = feed.flatMap((i) => (i.type === "news" ? [i.article.id] : [])).sort((a, b) => a - b);
    const videoIds = feed.flatMap((i) => (i.type === "video" ? [i.video.videoId] : [])).sort();
    expect(newsIds).toEqual([1, 2, 3, 4, 5, 6]);
    expect(videoIds).toEqual(["v1", "v2", "v3"]);
  });

  it("only news with a photo", () => {
    const news = [article(1, 1, null), article(2, 2, ""), ...twelveNews().slice(2)];
    const feed = pickHomeFeed(news, fiveVideos());
    expect(feed.some((i) => i.type === "news" && (i.article.id === 1 || i.article.id === 2))).toBe(false);
    expect(feed.filter((i) => i.type === "news")).toHaveLength(6);
  });
});

describe("pickHomeFeed · the /tendencias rule (6-ago: «12 h y tope de 2 vídeos»)", () => {
  it("three videos newer than every news: never more than 2 in a row → V V N V N N N N N", () => {
    expect(shape(pickHomeFeed(twelveNews(), fiveVideos()))).toBe("VVNVNNNNN");
  });

  it("a video less than 12 h newer than a news goes AFTER it (the news' advantage)", () => {
    // News 10 h old, video 2 h old: 8 h newer, under the 12 h of advantage.
    const feed = pickHomeFeed([article(1, 10)], [video("a", 2)]);
    expect(keys(feed)).toEqual(["n-1", "v-a"]);
  });

  it("a quiet week: videos older than the news end up at the bottom", () => {
    const old = ["o1", "o2", "o3"].map((id, i) => video(id, 200 + i));
    expect(shape(pickHomeFeed(twelveNews(), old))).toBe("NNNNNNVVV");
  });
});

describe("pickHomeFeed · filling up", () => {
  it("without videos (YouTube down): 9 news", () => {
    const feed = pickHomeFeed(twelveNews(), []);
    expect(shape(feed)).toBe("NNNNNNNNN");
  });

  it("one video only: 8 news fill the rest", () => {
    const feed = pickHomeFeed(twelveNews(), [video("solo", 1)]);
    expect(feed).toHaveLength(9);
    expect(feed.filter((i) => i.type === "news")).toHaveLength(8);
  });

  it("and the other way round: short of news, videos fill up to 9", () => {
    const tenVideos = Array.from({ length: 10 }, (_, i) => video(`v${i}`, 1 + i));
    const feed = pickHomeFeed([article(1, 40), article(2, 50)], tenVideos);
    expect(feed).toHaveLength(9);
    expect(feed.filter((i) => i.type === "news")).toHaveLength(2);
    expect(feed.filter((i) => i.type === "video")).toHaveLength(7);
  });

  it("less than 9 in all: everything there is, and nothing invented", () => {
    expect(pickHomeFeed([article(1, 1)], [video("a", 2)])).toHaveLength(2);
    expect(pickHomeFeed([], [])).toEqual([]);
  });

  it("the size and the quota can be passed", () => {
    const feed = pickHomeFeed(twelveNews(), fiveVideos(), { total: 4, videos: 1 });
    expect(shape(feed)).toBe("VNNN");
  });
});

describe("pickHomeFeed · no repeats, same order every time", () => {
  it("the same news id or videoId twice counts once", () => {
    const news = [article(1, 30), article(1, 30), ...twelveNews().slice(1)];
    const videos = [video("dup", 1), video("dup", 1), video("b", 2), video("c", 3)];
    const feed = pickHomeFeed(news, videos);
    const k = keys(feed);
    expect(new Set(k).size).toBe(k.length);
    expect(k.filter((key) => key === "v-dup")).toHaveLength(1);
    expect(k.filter((key) => key === "n-1")).toHaveLength(1);
    expect(feed.filter((i) => i.type === "video")).toHaveLength(3);
  });

  it("deterministic, and the inputs are not touched", () => {
    const news = twelveNews();
    const videos = fiveVideos();
    const before = [JSON.stringify(news), JSON.stringify(videos)];
    const first = keys(pickHomeFeed(news, videos));
    const second = keys(pickHomeFeed(news, videos));
    expect(second).toEqual(first);
    expect([JSON.stringify(news), JSON.stringify(videos)]).toEqual(before);
  });

  it("never more than 2 videos in a row while there are news to separate them", () => {
    for (let quota = 0; quota <= 9; quota += 1) {
      const many = Array.from({ length: 9 }, (_, i) => video(`m${i}`, i));
      const feed = pickHomeFeed(twelveNews(), many, { videos: quota });
      const s = shape(feed);
      // Videos left over once the news ran out are the only exception.
      const lastNews = s.lastIndexOf("N");
      expect(s.slice(0, lastNews + 1), `quota ${quota}: ${s}`).not.toMatch(/VVV/);
    }
  });
});
