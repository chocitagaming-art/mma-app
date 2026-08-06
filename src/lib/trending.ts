import type { NewsArticle } from "@/lib/types";
import type { YouTubeVideo } from "@/lib/youtube";

// T3-B: feed unificado de /tendencias — noticias (tabla news) + vídeos
// (getUfcVideos) mezclados por fecha desc, estilo ufc.com/trending.
// Helper PURO (patrón mergeFightHistories): sin Next, sin BD; el import de
// YouTubeVideo es solo de tipo (youtube.ts es server-only en runtime).

export type TrendingItem =
  | { type: "news"; date: string | null; article: NewsArticle }
  | { type: "video"; date: string | null; video: YouTubeVideo };

// news.published_at llega como ISO string o como Date del driver de pg
// (mismo gotcha que eventTime en fight-history.ts); los vídeos traen ISO
// string o null. Normalizamos a ISO string parseable o null.
export function normalizeDateValue(value: unknown): string | null {
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value.toISOString();
  }
  if (typeof value === "string" && value.trim()) {
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? null : value;
  }
  return null;
}

function itemTime(item: TrendingItem): number {
  if (!item.date) {
    return Number.NEGATIVE_INFINITY;
  }
  const parsed = new Date(item.date).getTime();
  return Number.isNaN(parsed) ? Number.NEGATIVE_INFINITY : parsed;
}

// Ordenar SOLO por fecha dejaba que una tanda de vídeos subidos a la vez
// (ufcespanol sube cinco de golpe) copara la cabecera: medido en producción,
// los cinco primeros del feed eran vídeos y la primera noticia caía al 6.º.
// Dos reglas puras y deterministas sobre el mismo material, sin tocar fechas
// ni descartar nada (decisión del dueño, 6-ago: «12 h y tope de 2 vídeos»):
//   1) BONUS: 12 h de plus a las noticias AL PUNTUAR. La fecha que se PINTA no
//      cambia. Una noticia hasta 12 h más vieja que un vídeo lo adelanta;
//      pasado ese margen vuelve a mandar la fecha.
//   2) TOPE: nunca más de 2 vídeos seguidos mientras queden noticias con las
//      que separar. El feed sigue MEZCLADO —es la misma lista con un separador
//      forzado—, no dos bloques.
export const NEWS_BOOST_MS = 12 * 60 * 60 * 1000;
export const MAX_CONSECUTIVE_VIDEOS = 2;

// El bonus solo mueve la PUNTUACIÓN. -Infinity + bonus sigue siendo -Infinity:
// una noticia sin fecha (o con fecha rota) NO sube, se queda al fondo igual
// que antes.
function itemScore(item: TrendingItem): number {
  const time = itemTime(item);
  return item.type === "news" ? time + NEWS_BOOST_MS : time;
}

// Comparador desc explícito: `b - a` daría NaN con dos -Infinity (dos fechas
// nulas). El motor trata ese NaN como 0 y el sort estable las deja como
// estaban, que es justo lo que queremos, pero mejor escribirlo que heredarlo
// por accidente.
function compareByScoreDesc(a: TrendingItem, b: TrendingItem): number {
  const scoreA = itemScore(a);
  const scoreB = itemScore(b);
  if (scoreA === scoreB) {
    return 0;
  }
  return scoreB > scoreA ? 1 : -1;
}

export function mergeTrendingItems(
  news: NewsArticle[],
  videos: YouTubeVideo[],
): TrendingItem[] {
  // .map() ya devuelve un array nuevo: el .sort() de abajo ordena LA COPIA,
  // nunca `news` ni `videos` (hay test que lo exige). sort es estable, así que
  // a puntuación igual se conserva el orden con el que llegó cada fuente.
  const newsQueue: TrendingItem[] = news
    .map(
      (article): TrendingItem => ({
        type: "news",
        date: normalizeDateValue(article.publishedAt),
        article,
      }),
    )
    .sort(compareByScoreDesc);
  const videoQueue: TrendingItem[] = videos
    .map(
      (video): TrendingItem => ({
        type: "video",
        date: normalizeDateValue(video.publishedAt),
        video,
      }),
    )
    .sort(compareByScoreDesc);

  // Fusión por puntuación con dos punteros. Dentro de cada cola el orden
  // relativo es intocable, así que la salida es DETERMINISTA: mismas entradas
  // → mismo orden en cada recarga. Y no se descarta ni se duplica ningún ítem:
  // «Cargar más» pagina con slice(0, N) sobre esta misma lista.
  const merged: TrendingItem[] = [];
  let newsIndex = 0;
  let videoIndex = 0;
  let videoRun = 0; // vídeos consecutivos ya emitidos

  while (newsIndex < newsQueue.length || videoIndex < videoQueue.length) {
    const hasNews = newsIndex < newsQueue.length;
    const hasVideo = videoIndex < videoQueue.length;
    // Se coge vídeo cuando queda vídeo y, o bien ya no quedan noticias —sin
    // noticias NO HAY con qué separar, así que los vídeos sobrantes salen
    // seguidos al final: es la degradación consciente del tope—, o bien aún no
    // se ha llegado al tope y su puntuación gana. Empate → noticia.
    const takeVideo =
      hasVideo &&
      (!hasNews ||
        (videoRun < MAX_CONSECUTIVE_VIDEOS &&
          itemScore(videoQueue[videoIndex]) > itemScore(newsQueue[newsIndex])));

    if (takeVideo) {
      merged.push(videoQueue[videoIndex]);
      videoIndex += 1;
      videoRun += 1;
    } else {
      // Si no queda vídeo, la condición del while garantiza que hay noticia.
      merged.push(newsQueue[newsIndex]);
      newsIndex += 1;
      videoRun = 0;
    }
  }

  return merged;
}

// Cuántos ítems enseña /tendencias: "Cargar más" enlaza a ?mostrar=N+PASO
// (paginación del feed fusionado EN MEMORIA — los vídeos no tienen offset).
export const TRENDING_STEP = 12;

export function parseShowParam(value: string | undefined, total: number): number {
  const parsed = Number.parseInt(value ?? "", 10);
  const requested =
    Number.isFinite(parsed) && parsed > 0 ? parsed : TRENDING_STEP;
  // Nunca menos que un paso ni más que el feed disponible.
  return Math.min(Math.max(requested, TRENDING_STEP), Math.max(total, TRENDING_STEP));
}

// Tarjeta destacada (grande, 2 columnas) cada ~7 ítems, como ufc.com/trending.
export function isFeaturedIndex(index: number): boolean {
  return index % 7 === 0;
}
