// ⚠️ SERVER-ONLY. Lee process.env.YOUTUBE_API_KEY, que NUNCA se expone al cliente
// (sin prefijo NEXT_PUBLIC_ → Next.js lo elimina de los bundles de cliente). No
// importes este módulo desde un componente "use client".
//
// Fuente de vídeos oficiales de UFC en YouTube. Interfaz ESTABLE e independiente de
// la fuente: hoy usa la YouTube Data API v3 (si hay key) con respaldo automático al
// feed RSS del canal (sin key, sin cuota). Cambiar RSS↔API es trivial: solo se toca
// este archivo; el resto de la app consume getUfcVideos()/searchFightVideo().

export type YouTubeCategory =
  | "historias"
  | "resumenes"
  | "analisis"
  | "entrevistas"
  | "busqueda"; // interno: resultados de searchFightVideo (no se renderiza)

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
  // Si está, filtra las subidas del canal por TÍTULO (subcadena, case-insensitive).
  // Útil para canales multideporte (Eurosport → "UFC") o para acotar por tema.
  query?: string;
  // Cuántos vídeos pedir antes de filtrar (default CANDIDATES_PER_CHANNEL).
  candidates?: number;
};

// Canales en español verificados (channelId real comprobado contra el RSS).
// Cada categoría puede tener varias entradas (Next MMA aparece en resumenes y
// analisis). Los canales de creador (IQ Fight, Next MMA) casi nunca geo-bloquean;
// los broadcaster (Eurosport, UFC Español) se filtran por disponibilidad.
const CHANNELS: ChannelDef[] = [
  {
    id: "UCecCKyD4-ABQK76dTHmsZ2Q",
    uploads: "UUecCKyD4-ABQK76dTHmsZ2Q",
    label: "IQ Fight",
    category: "historias",
  },
  {
    id: "UCcDVs7ZH1I3Z1vKqjQuSBBg",
    uploads: "UUcDVs7ZH1I3Z1vKqjQuSBBg",
    label: "Eurosport España",
    category: "resumenes",
    query: "UFC", // canal multideporte → solo sus vídeos de UFC (filtro por título)
    candidates: 50,
  },
  {
    id: "UC3v8OQyx4D_WP3RDiQ9I9_A",
    uploads: "UU3v8OQyx4D_WP3RDiQ9I9_A",
    label: "Next MMA",
    category: "resumenes",
    query: "resumen", // solo sus resúmenes de evento
  },
  {
    id: "UC3v8OQyx4D_WP3RDiQ9I9_A",
    uploads: "UU3v8OQyx4D_WP3RDiQ9I9_A",
    label: "Next MMA",
    category: "analisis",
  },
  {
    id: "UCYXJFtx4SUkrb2p_8mhLPzQ",
    uploads: "UUYXJFtx4SUkrb2p_8mhLPzQ",
    label: "UFC Español",
    category: "entrevistas",
  },
];

// Solo las 4 secciones VISIBLES (orden = orden de render). "busqueda" es interno.
export const YOUTUBE_CATEGORIES: { key: YouTubeCategory; label: string }[] = [
  { key: "historias", label: "Historias de luchadores" },
  { key: "resumenes", label: "Resúmenes de eventos" },
  { key: "analisis", label: "Análisis y predicciones" },
  { key: "entrevistas", label: "Entrevistas y previas" },
];

// ── Directorio de CANALES (página /videos) ───────────────────────────────────
// A diferencia de CHANNELS (feed por categoría que consumen Tendencias y la
// columna del inicio), esto lista canales de MMA en español como TARJETAS. El
// avatar/título/suscriptores se piden en vivo a channels.list (logos automáticos,
// decisión del dueño) y las subidas se filtran igual (Shorts/región/embed).
export type DirectoryChannel = {
  handle: string; // @handle (enlace "Ver canal")
  channelId: string; // UC…
  uploads: string; // UU… (playlist de subidas)
  query?: string; // filtra por título (Eurosport multideporte → solo "UFC")
};

// 12 canales verificados contra channels.list (channelId → uploads confirmados).
export const CHANNEL_DIRECTORY: DirectoryChannel[] = [
  { handle: "@IQFight", channelId: "UCecCKyD4-ABQK76dTHmsZ2Q", uploads: "UUecCKyD4-ABQK76dTHmsZ2Q" },
  { handle: "@NextMMA", channelId: "UC3v8OQyx4D_WP3RDiQ9I9_A", uploads: "UU3v8OQyx4D_WP3RDiQ9I9_A" },
  { handle: "@GreenFits", channelId: "UCvOoVW1ghB0Nxt2duEBGJKw", uploads: "UUvOoVW1ghB0Nxt2duEBGJKw" },
  { handle: "@GeneracionMMA", channelId: "UCbInCoZGXwjtmyE-qe6KAvw", uploads: "UUbInCoZGXwjtmyE-qe6KAvw" },
  { handle: "@ImpactoMMA", channelId: "UCsOqRu-Y0vUS5tt8jJhud4A", uploads: "UUsOqRu-Y0vUS5tt8jJhud4A" },
  { handle: "@ufc_latino", channelId: "UC9d4-iitZZ-PPud1B7JqJRg", uploads: "UU9d4-iitZZ-PPud1B7JqJRg" },
  { handle: "@MMAconCarlosSantacruz", channelId: "UC9J4wJP73kIu00qvnhNSdFQ", uploads: "UU9J4wJP73kIu00qvnhNSdFQ" },
  { handle: "@octagondoctor", channelId: "UCaLU-asYQlqBm9Ntv9eRXKw", uploads: "UUaLU-asYQlqBm9Ntv9eRXKw" },
  { handle: "@NoticiasdeMMA", channelId: "UCnwLCAqDt7bpsvlknmq_Ksw", uploads: "UUnwLCAqDt7bpsvlknmq_Ksw" },
  { handle: "@EurosportEspana", channelId: "UCcDVs7ZH1I3Z1vKqjQuSBBg", uploads: "UUcDVs7ZH1I3Z1vKqjQuSBBg", query: "UFC" },
  { handle: "@Las8esquinas", channelId: "UCgh6J7Mh7doIP4eSGmAyW7w", uploads: "UUgh6J7Mh7doIP4eSGmAyW7w" },
  { handle: "@MARC_MMA", channelId: "UCHv-5z-zz3ks_tb3z_7-Heg", uploads: "UUHv-5z-zz3ks_tb3z_7-Heg" },
];

export type ChannelWithVideos = {
  handle: string;
  channelId: string;
  title: string;
  avatar: string | null;
  subscriberCount: number | null;
  channelUrl: string;
  videos: YouTubeVideo[];
};

const REVALIDATE_SECONDS = 1800; // 30 min: fresco sin quemar cuota.
const MIN_DURATION_SECONDS = 75; // descarta Shorts / clips muy cortos.
const CANDIDATES_PER_CHANNEL = 25; // cuántos pedir antes de filtrar.

// Detalle de un vídeo (videos.list?part=contentDetails,status) usado SOLO para
// filtrar disponibilidad y formato; los campos visibles vienen del snippet.
export type VideoDetail = {
  id: string;
  contentDetails?: {
    duration?: string;
    regionRestriction?: { blocked?: string[]; allowed?: string[] };
    contentRating?: { ytRating?: string };
  };
  status?: { embeddable?: boolean };
};

// ── Helpers de filtrado (puros, testeables) ──────────────────────────────────
export function parseIsoDuration(iso: string): number {
  const m = /^PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/.exec(iso ?? "");
  if (!m) return 0;
  return Number(m[1] ?? 0) * 3600 + Number(m[2] ?? 0) * 60 + Number(m[3] ?? 0);
}

export function regionAllows(
  region: { blocked?: string[]; allowed?: string[] } | undefined,
  country = "ES",
): boolean {
  if (!region) return true;
  if (region.blocked?.includes(country)) return false;
  if (region.allowed && !region.allowed.includes(country)) return false;
  return true;
}

export function isAgeRestricted(detail: VideoDetail): boolean {
  return detail.contentDetails?.contentRating?.ytRating === "ytAgeRestricted";
}

export function isShort(detail: VideoDetail): boolean {
  const dur = parseIsoDuration(detail.contentDetails?.duration ?? "");
  return dur > 0 && dur < MIN_DURATION_SECONDS;
}

export function isPlayableInSpain(detail: VideoDetail): boolean {
  return (
    detail.status?.embeddable !== false &&
    regionAllows(detail.contentDetails?.regionRestriction) &&
    !isAgeRestricted(detail)
  );
}

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

type ChannelMeta = {
  title: string;
  avatar: string | null;
  subscriberCount: number | null;
};

// Título + avatar + suscriptores de varios canales en UNA llamada (1 unidad de
// cuota, ≤50 ids). Cacheado como el resto.
async function fetchChannelMeta(
  ids: string[],
  key: string,
): Promise<Map<string, ChannelMeta>> {
  const map = new Map<string, ChannelMeta>();
  if (!ids.length) return map;
  const url =
    `https://www.googleapis.com/youtube/v3/channels?part=snippet,statistics` +
    `&id=${ids.slice(0, 50).join(",")}&key=${key}`;
  const res = await fetch(url, { next: { revalidate: REVALIDATE_SECONDS } });
  if (!res.ok) throw new Error(`YouTube API ${res.status}`);
  const data = (await res.json()) as ChannelsResponse;
  for (const it of data.items ?? []) {
    if (!it.id) continue;
    const t = it.snippet?.thumbnails;
    const subs = it.statistics?.hiddenSubscriberCount
      ? null
      : Number(it.statistics?.subscriberCount ?? "") || null;
    map.set(it.id, {
      title: decodeEntities(it.snippet?.title ?? ""),
      avatar: t?.high?.url ?? t?.medium?.url ?? t?.default?.url ?? null,
      subscriberCount: subs,
    });
  }
  return map;
}

// Directorio de canales de MMA para /videos: cada canal con su avatar/título/subs
// (channels.list, logos automáticos) + sus últimos `perChannel` vídeos ya filtrados
// (mismo motor que getUfcVideos). Degrada con gracia: sin key o con error de API,
// las tarjetas muestran el canal + enlace aunque falten avatar/vídeos.
export async function getChannelDirectory(
  perChannel = 6,
): Promise<ChannelWithVideos[]> {
  const key = process.env.YOUTUBE_API_KEY;
  let meta = new Map<string, ChannelMeta>();
  if (key) {
    try {
      meta = await fetchChannelMeta(
        CHANNEL_DIRECTORY.map((c) => c.channelId),
        key,
      );
    } catch {
      meta = new Map();
    }
  }
  return Promise.all(
    CHANNEL_DIRECTORY.map(async (c) => {
      const def: ChannelDef = {
        id: c.channelId,
        uploads: c.uploads,
        label: c.handle.replace(/^@/, ""),
        category: "resumenes", // etiqueta interna; el directorio no usa category
        query: c.query,
        candidates: c.query ? 50 : undefined,
      };
      const videos = await fetchChannelVideos(def, perChannel);
      const m = meta.get(c.channelId);
      return {
        handle: c.handle,
        channelId: c.channelId,
        title: m?.title ?? c.handle.replace(/^@/, ""),
        avatar: m?.avatar ?? null,
        subscriberCount: m?.subscriberCount ?? null,
        channelUrl: `https://www.youtube.com/${c.handle}`,
        videos,
      };
    }),
  );
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
      category: "busqueda",
    };
  } catch {
    return null;
  }
}

function applyQuery(c: ChannelDef, videos: YouTubeVideo[]): YouTubeVideo[] {
  const q = c.query?.toLowerCase();
  return q ? videos.filter((v) => v.title.toLowerCase().includes(q)) : videos;
}

// Candidatos (videoId + snippet) desde la playlist de subidas del canal. maxResults
// es CONSTANTE por canal (candidates) para que la URL —y la caché— sea estable.
async function fetchCandidatesFromApi(
  c: ChannelDef,
  key: string,
): Promise<YouTubeVideo[]> {
  const max = c.candidates ?? CANDIDATES_PER_CHANNEL;
  const url =
    `https://www.googleapis.com/youtube/v3/playlistItems?part=snippet` +
    `&maxResults=${max}&playlistId=${c.uploads}&key=${key}`;
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

// Detalles (duración/región/embed/edad) por lote (≤50 ids). Cacheado igual que el
// resto; la clave depende del conjunto de ids (estable dentro de la ventana).
async function fetchVideoDetails(
  ids: string[],
  key: string,
): Promise<Map<string, VideoDetail>> {
  const map = new Map<string, VideoDetail>();
  if (!ids.length) return map;
  const url =
    `https://www.googleapis.com/youtube/v3/videos?part=contentDetails,status` +
    `&id=${ids.slice(0, 50).join(",")}&key=${key}`;
  const res = await fetch(url, { next: { revalidate: REVALIDATE_SECONDS } });
  if (!res.ok) throw new Error(`YouTube API ${res.status}`);
  const data = (await res.json()) as { items?: VideoDetail[] };
  for (const item of data.items ?? []) if (item.id) map.set(item.id, item);
  return map;
}

// Conserva el snippet del candidato (title/fecha/etc.); usa el detail SOLO para
// filtrar. Un candidato ausente en videos.list (privado/borrado) se descarta.
async function filterByDetails(
  videos: YouTubeVideo[],
  key: string,
): Promise<YouTubeVideo[]> {
  if (!videos.length) return [];
  const details = await fetchVideoDetails(
    videos.map((v) => v.videoId),
    key,
  );
  return videos.filter((v) => {
    const d = details.get(v.videoId);
    return d ? isPlayableInSpain(d) && !isShort(d) : false;
  });
}

async function fetchChannelVideos(
  c: ChannelDef,
  perChannel: number,
): Promise<YouTubeVideo[]> {
  const key = process.env.YOUTUBE_API_KEY;
  if (key) {
    // Camino API: AUTORITATIVO aunque devuelva []. NO caemos a RSS (no reintroducir
    // geo-bloqueados/Shorts). Un error de API también prefiere [] a RSS sin filtrar.
    try {
      const candidates = applyQuery(c, await fetchCandidatesFromApi(c, key));
      const valid = await filterByDetails(candidates, key);
      return valid.slice(0, perChannel);
    } catch {
      return [];
    }
  }
  // Sin key: RSS best-effort (sin filtros finos), con filtro de título si hay query.
  try {
    const rss = await fetchFromRss(c, c.candidates ?? CANDIDATES_PER_CHANNEL);
    return applyQuery(c, rss).slice(0, perChannel);
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

type ChannelsResponse = {
  items?: {
    id?: string;
    snippet?: { title?: string; thumbnails?: Thumbnails };
    statistics?: { subscriberCount?: string; hiddenSubscriberCount?: boolean };
  }[];
};

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

// Nota: la obtención por canal vive ahora en fetchChannelVideos (arriba), que usa
// la playlist de subidas + videos.list. search.list solo lo usa searchFightVideo.

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
