// ⚠️ SERVER-ONLY. Lee process.env.YOUTUBE_API_KEY, que NUNCA se expone al cliente
// (sin prefijo NEXT_PUBLIC_ → Next.js lo elimina de los bundles de cliente). No
// importes este módulo desde un componente "use client".
//
// Fuente de vídeos oficiales de UFC en YouTube. Interfaz ESTABLE e independiente de
// la fuente: hoy usa la YouTube Data API v3 (si hay key) con respaldo automático al
// feed RSS del canal (sin key, sin cuota). Cambiar RSS↔API es trivial: solo se toca
// este archivo; el resto de la app consume getUfcVideos()/searchFightVideo().

export type YouTubeCategory = "destacados" | "resumenes" | "entrevistas";

export type YouTubeVideo = {
  videoId: string;
  title: string;
  thumbnail: string;
  publishedAt: string | null;
  url: string;
  channelTitle: string;
  category: YouTubeCategory;
};

type ChannelDef = {
  id: string; // channelId (UC…)
  uploads: string; // playlist de subidas (UC… → UU…)
  label: string;
  category: YouTubeCategory;
  // Si está, el canal es multideporte (p. ej. Eurosport) y se filtra por esta
  // búsqueda en vez de tirar de TODAS sus subidas.
  query?: string;
};

// Canales oficiales verificados (id real comprobado con la API).
const CHANNELS: ChannelDef[] = [
  {
    id: "UCvgfXK4nTYKudb0rFR6noLA",
    uploads: "UUvgfXK4nTYKudb0rFR6noLA",
    label: "UFC",
    category: "destacados",
  },
  {
    id: "UCcDVs7ZH1I3Z1vKqjQuSBBg",
    uploads: "UUcDVs7ZH1I3Z1vKqjQuSBBg",
    label: "Eurosport España",
    category: "resumenes",
    query: "UFC", // canal multideporte → solo sus vídeos de UFC
  },
  {
    id: "UCS-uZIRjDlmyYHw2jUyCxzQ",
    uploads: "UUS-uZIRjDlmyYHw2jUyCxzQ",
    label: "UFC on Paramount+",
    category: "entrevistas",
  },
];

export const YOUTUBE_CATEGORIES: { key: YouTubeCategory; label: string }[] = [
  { key: "destacados", label: "Destacados" },
  { key: "resumenes", label: "Resúmenes" },
  { key: "entrevistas", label: "Entrevistas" },
];

const REVALIDATE_SECONDS = 1800; // 30 min: fresco sin quemar cuota.

type GetVideosOptions = {
  limit?: number;
  category?: YouTubeCategory;
  perChannel?: number;
};

export async function getUfcVideos(
  opts: GetVideosOptions = {},
): Promise<YouTubeVideo[]> {
  const { limit = 12, category, perChannel = 8 } = opts;
  const channels = category
    ? CHANNELS.filter((c) => c.category === category)
    : CHANNELS;
  const lists = await Promise.all(
    channels.map((c) => fetchChannelVideos(c, perChannel)),
  );
  const all = lists.flat();
  // Más reciente primero (las fechas ISO 8601 ordenan lexicográficamente).
  all.sort((a, b) => (b.publishedAt ?? "").localeCompare(a.publishedAt ?? ""));
  return all.slice(0, limit);
}

// Futuro (#42): el combate concreto por nombres. Requiere la Data API (search).
export async function searchFightVideo(
  red: string,
  blue: string,
  event?: string,
): Promise<YouTubeVideo | null> {
  const key = process.env.YOUTUBE_API_KEY;
  if (!key) return null;
  const q = [red, "vs", blue, event, "full fight"].filter(Boolean).join(" ");
  try {
    const url =
      `https://www.googleapis.com/youtube/v3/search?part=snippet&type=video&maxResults=1` +
      `&q=${encodeURIComponent(q)}&key=${key}`;
    const res = await fetch(url, { next: { revalidate: REVALIDATE_SECONDS } });
    if (!res.ok) return null;
    const data = (await res.json()) as SearchResponse;
    const item = data.items?.[0];
    const videoId = item?.id?.videoId;
    if (!item || !videoId) return null;
    return {
      videoId,
      title: decodeEntities(item.snippet?.title ?? ""),
      thumbnail: pickThumb(item.snippet?.thumbnails, videoId),
      publishedAt: item.snippet?.publishedAt ?? null,
      url: `https://www.youtube.com/watch?v=${videoId}`,
      channelTitle: item.snippet?.channelTitle ?? "",
      category: "destacados",
    };
  } catch {
    return null;
  }
}

async function fetchChannelVideos(
  c: ChannelDef,
  perChannel: number,
): Promise<YouTubeVideo[]> {
  const key = process.env.YOUTUBE_API_KEY;
  if (key) {
    try {
      const fromApi = await fetchFromApi(c, perChannel, key);
      if (fromApi.length) return fromApi;
    } catch {
      // cuota agotada / error → caemos al RSS sin romper.
    }
  }
  try {
    return await fetchFromRss(c, perChannel);
  } catch {
    return [];
  }
}

type Thumbnails = Record<string, { url?: string } | undefined>;

type PlaylistSnippet = {
  title?: string;
  publishedAt?: string;
  resourceId?: { videoId?: string };
  videoOwnerChannelTitle?: string;
  thumbnails?: Thumbnails;
};

type PlaylistResponse = { items?: { snippet?: PlaylistSnippet }[] };

type SearchResponse = {
  items?: {
    id?: { videoId?: string };
    snippet?: {
      title?: string;
      publishedAt?: string;
      channelTitle?: string;
      thumbnails?: Thumbnails;
    };
  }[];
};

async function fetchFromApi(
  c: ChannelDef,
  perChannel: number,
  key: string,
): Promise<YouTubeVideo[]> {
  // Multideporte (query) → search filtrada; 100% UFC → playlist de subidas
  // (más barato: 1 unidad de cuota vs 100 de search).
  return c.query
    ? fetchViaSearch(c, perChannel, key)
    : fetchViaPlaylist(c, perChannel, key);
}

async function fetchViaPlaylist(
  c: ChannelDef,
  perChannel: number,
  key: string,
): Promise<YouTubeVideo[]> {
  const url =
    `https://www.googleapis.com/youtube/v3/playlistItems?part=snippet` +
    `&maxResults=${perChannel}&playlistId=${c.uploads}&key=${key}`;
  const res = await fetch(url, { next: { revalidate: REVALIDATE_SECONDS } });
  if (!res.ok) throw new Error(`YouTube API ${res.status}`);
  const data = (await res.json()) as PlaylistResponse;
  const out: YouTubeVideo[] = [];
  for (const item of data.items ?? []) {
    const s = item.snippet;
    const videoId = s?.resourceId?.videoId;
    if (!s || !videoId) continue;
    const title = decodeEntities(s.title ?? "");
    if (!title || title === "Private video" || title === "Deleted video") {
      continue;
    }
    out.push({
      videoId,
      title,
      thumbnail: pickThumb(s.thumbnails, videoId),
      publishedAt: s.publishedAt ?? null,
      url: `https://www.youtube.com/watch?v=${videoId}`,
      channelTitle: s.videoOwnerChannelTitle ?? c.label,
      category: c.category,
    });
  }
  return out;
}

async function fetchViaSearch(
  c: ChannelDef,
  perChannel: number,
  key: string,
): Promise<YouTubeVideo[]> {
  const url =
    `https://www.googleapis.com/youtube/v3/search?part=snippet&type=video&order=date` +
    `&maxResults=${perChannel}&channelId=${c.id}&q=${encodeURIComponent(
      c.query ?? "",
    )}&key=${key}`;
  const res = await fetch(url, { next: { revalidate: REVALIDATE_SECONDS } });
  if (!res.ok) throw new Error(`YouTube API ${res.status}`);
  const data = (await res.json()) as SearchResponse;
  const out: YouTubeVideo[] = [];
  for (const item of data.items ?? []) {
    const videoId = item.id?.videoId;
    const s = item.snippet;
    if (!videoId || !s) continue;
    const title = decodeEntities(s.title ?? "");
    if (!title) continue;
    out.push({
      videoId,
      title,
      thumbnail: pickThumb(s.thumbnails, videoId),
      publishedAt: s.publishedAt ?? null,
      url: `https://www.youtube.com/watch?v=${videoId}`,
      channelTitle: s.channelTitle ?? c.label,
      category: c.category,
    });
  }
  return out;
}

async function fetchFromRss(
  c: ChannelDef,
  perChannel: number,
): Promise<YouTubeVideo[]> {
  const url = `https://www.youtube.com/feeds/videos.xml?channel_id=${c.id}`;
  const res = await fetch(url, { next: { revalidate: REVALIDATE_SECONDS } });
  if (!res.ok) throw new Error(`YouTube RSS ${res.status}`);
  const xml = await res.text();
  const entries = xml.split("<entry>").slice(1, perChannel + 1);
  const out: YouTubeVideo[] = [];
  for (const e of entries) {
    const videoId = matchOne(e, /<yt:videoId>([^<]+)<\/yt:videoId>/);
    if (!videoId) continue;
    out.push({
      videoId,
      title: decodeEntities(matchOne(e, /<title>([^<]*)<\/title>/) ?? ""),
      thumbnail:
        matchOne(e, /<media:thumbnail[^>]*url="([^"]+)"/) ??
        `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
      publishedAt: matchOne(e, /<published>([^<]+)<\/published>/),
      url: `https://www.youtube.com/watch?v=${videoId}`,
      channelTitle: c.label,
      category: c.category,
    });
  }
  // En canales multideporte (con query) el RSS no filtra por tema: lo hacemos
  // aquí por título como aproximación de respaldo.
  const q = c.query?.toLowerCase();
  return q ? out.filter((v) => v.title.toLowerCase().includes(q)) : out;
}

function pickThumb(thumbs: Thumbnails | undefined, videoId: string): string {
  return (
    thumbs?.maxres?.url ??
    thumbs?.high?.url ??
    thumbs?.medium?.url ??
    thumbs?.default?.url ??
    `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`
  );
}

function matchOne(s: string, re: RegExp): string | null {
  const m = s.match(re);
  return m ? m[1] : null;
}

function decodeEntities(s: string): string {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#3?9;/g, "'");
}
