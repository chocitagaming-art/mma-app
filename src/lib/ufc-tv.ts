import { unstable_cache } from "next/cache";

import { parseEventTimestamp } from "@/lib/event-time";
import { firstSegmentStart, type LiveEventTimes } from "@/lib/live-event";
import { isPlayableInSpain, parseIsoDuration, type VideoDetail } from "@/lib/youtube";

// ⚠️ SERVER-ONLY. Lee process.env.YOUTUBE_API_KEY, que NUNCA se expone al cliente
// (sin prefijo NEXT_PUBLIC_ → Next.js lo elimina de los bundles de cliente). No
// importes este módulo desde un componente "use client".
//
// UFC TV: el reproductor SIEMPRE ENCENDIDO de la portada, bajo el hero del
// próximo evento. Decide, por este orden:
//
//   1. Si el directo OFICIAL DE LA VELADA está en el aire (previa, pre-show,
//      preliminares del PRÓXIMO evento) → ese vídeo va al bloque grande de
//      siempre, «Retransmisión oficial» (<EventLiveEmbed>), en la portada, en la
//      ficha del evento y en /en-vivo.
//   2. Si el canal de la UFC o UFC Español está en directo con PELEAS
//      (maratones, recopilatorios, «Pelea Gratis» en estreno…) → UFC TV en
//      directo.
//   3. Si no, un BUCLE de peleas completas de los dos canales, barajado por día.
//
// Y por encima de todo, la columna manda (migración 027): un
// events.live_video_id escrito a mano gana siempre al detectado, y el valor
// 'off' apaga todo lo automático sin desplegar (ver resolveEventVideo).
//
// 🪤 «SIN DESPLEGAR» NO ES «AL INSTANTE» EN LA PORTADA. El hueco de la portada
// lee la columna de getNextEventHero, cacheada 30 min con el tag 'home'
// (queries/events.ts); la ficha y /en-vivo la leen de getEventDetail, 60 s.
// Por eso scripts/fijar_videos_evento.py (mma-ingesta) llama a /api/revalidate
// al tocar el directo si tiene REVALIDATE_SECRET, y si no avisa del retraso.
//
// CUOTA. La clave es la misma que usan /videos y la columna de vídeos de la
// portada (~1.650 unidades/día medidas el 28-sep-2026, tope 10.000):
//
//   · directos: 2 playlistItems (50 subidas del canal inglés + 25 de UFC
//     Español) + 2 videos.list (75 ids, de 50 en 50) = 4 unidades por
//     refresco. La clave de la caché lleva el TRAMO de 120 s (liveBucket), así
//     que hay como mucho un refresco por tramo → 720 × 4 = 2.880/día.
//   · bucle: 12 + 6 páginas de subidas + 2-3 videos.list ≈ 20 unidades por
//     refresco, cacheado 6 h → ~80/día, más ~60 por el 🪤 de revalidatePath
//     de abajo → ~140/día.
//
// Esos techos son POR INSTANCIA del servidor. unstable_cache solo agrupa las
// revalidaciones dentro de una misma petición (workStore.pendingRevalidates),
// no entre peticiones: sin más, cada visita que llegase mientras un refresco
// está en vuelo lanzaría el suyo. Por eso los dos refrescos pasan por
// singleFlight (las llamadas simultáneas de la instancia comparten la misma
// petición) y el del bucle además por withCooldown (ver fetchFullFightPool).
//
// 🪤 revalidatePath('/') TAMBIÉN VACÍA ESTAS CACHÉS, cuando se leen desde la
// portada. unstable_cache les pega las etiquetas implícitas de la página
// (`_N_T_/` y `_N_T_/index`, ver next/dist/server/lib/implicit-tags.js), y son
// justo las que expira revalidatePath('/') en /api/revalidate, que dispara
// refresh-news.yml 3 veces al día. La visita siguiente vuelve a pedir el bucle
// en primer plano, y si ese refresco falla ya no hay «bucle anterior» en la
// caché al que volver: por eso getFullFightPool guarda en memoria el último
// bueno.
//
// 🪤 NUNCA search.list: cuesta 100 unidades por llamada (25 veces más que un
// refresco entero de directos). La lista de subidas ya trae los directos en
// curso cerca de arriba —se ordena por hora de arranque— y eso basta.
// lib/ufc-tv.test.ts lo vigila leyendo este fichero.

// ── Constantes ──────────────────────────────────────────────────────────────

// El interruptor sin desplegar: con events.live_video_id = 'off' no se pinta
// NADA automático para ese evento (ni el bloque del evento ni UFC TV en la
// portada). El escritor soportado (fijar_videos_evento.py) escribe esta cadena
// exacta; al leer se compara sin mayúsculas ni espacios, y cualquier otro id a
// mano sin forma de YouTube cuenta igual como apagado (ver resolveEventVideo).
export const LIVE_VIDEO_OFF = "off";

export const LIVE_REVALIDATE_SECONDS = 120;
export const POOL_REVALIDATE_SECONDS = 21_600; // 6 h

// unstable_cache sirve el dato CADUCADO mientras revalida en segundo plano
// (comprobado en node_modules/next/dist/server/web/spec-extension/
// unstable-cache.js: `cacheEntry.isStale` → devuelve el viejo y lanza la
// revalidación). Con una sola clave, tras un rato sin visitas la primera
// petición recibiría una foto de hace media hora y enseñaría un directo que ya
// acabó; y con la guarda de edad sola, con poco tráfico NADIE vería nunca el
// directo (medido: con visitas cada más de 240 s, 1 de cada 20 lo veía).
//
// Por eso la clave de la caché lleva el TRAMO de 120 s (liveBucket): un tramo
// nuevo es un fallo de caché y se pregunta a YouTube en primer plano (con el
// tope de LIVE_TIMEOUT_MS), así que la foto que llega tiene como mucho un
// tramo de edad. La guarda de edad se queda como segunda red: más de 2 × TTL
// es «no sé», y «no sé» es «sin directo» (cae al bucle, que no afirma nada).
const LIVE_MAX_AGE_MS = 2 * LIVE_REVALIDATE_SECONDS * 1000;

// Un único AbortSignal por consulta de directos: si YouTube se atasca, la
// portada no espera más de esto (y el hueco va en <Suspense>, así que el resto
// de la página tampoco). La ficha y /en-vivo sí la esperan: como mucho esto,
// y solo la primera petición de cada tramo.
const LIVE_TIMEOUT_MS = 3_000;

// El bucle se refresca cada 6 h y casi siempre en segundo plano, así que puede
// permitirse más margen que el directo: son ~18 páginas en serie.
const POOL_PAGES_TIMEOUT_MS = 8_000;
const POOL_DETAILS_TIMEOUT_MS = 5_000;
const POOL_PAGE_SIZE = 50;
const LOOP_MAX_IDS = 50;

// Tras un refresco del bucle que falla, no se reintenta hasta pasado esto.
// unstable_cache NO guarda un callback que lanza, así que sin esta pausa cada
// visita a la portada volvería a pagar el refresco entero (18-36 unidades
// según dónde falle). Con 30 min el peor caso, un fallo que dure todo el día,
// es 48 intentos por instancia.
const POOL_RETRY_AFTER_MS = 30 * 60_000;

// videos.list acepta como mucho 50 ids por llamada.
const VIDEOS_PER_CALL = 50;

// Ventana de la velada para casar un directo con el evento: desde 6 h antes
// del primer tramo hasta 8 h después del inicio de la cartelera estelar (el
// mismo cierre que usa resolveLivePhase en live-event.ts). Un acto
// «programado» cuenta solo si empieza en menos de 60 min: antes de eso el
// reproductor enseñaría una cuenta atrás de YouTube, no la velada.
const EVENT_WINDOW_BEFORE_MS = 6 * 3_600_000;
const EVENT_WINDOW_AFTER_MS = 8 * 3_600_000;
const UPCOMING_EVENT_MS = 60 * 60_000;

// Un estreno (duración > 0) solo entra si dura al menos 2 min. Medido en UFC
// Español: hay «Pelea Gratis» de 2:55 (KO rápidos) y la subida corta de menos
// de eso es un clip o un anuncio, no un combate.
const MIN_PREMIERE_SECONDS = 120;
const MIN_LOOP_SECONDS = 120;

// ── Canales ─────────────────────────────────────────────────────────────────

export type UfcChannel = "ufc" | "ufc-es";

export const UFC_TV_CHANNELS: { channel: UfcChannel; uploads: string; label: string }[] = [
  // Subidas de UCvgfXK4nTYKudb0rFR6noLA (UC… → UU…).
  { channel: "ufc", uploads: "UUvgfXK4nTYKudb0rFR6noLA", label: "UFC" },
  // Subidas de UCYXJFtx4SUkrb2p_8mhLPzQ.
  { channel: "ufc-es", uploads: "UUYXJFtx4SUkrb2p_8mhLPzQ", label: "UFC Español" },
];

// Páginas de subidas que se leen para el bucle. El inglés sube mucho más
// (shorts, clips) y sus ~27 peleas completas de 6 semanas caben en 600; UFC
// Español sube menos y 300 le dan varios meses de «Pelea Gratis».
const POOL_PAGES: Record<UfcChannel, number> = { ufc: 12, "ufc-es": 6 };

// Subidas por canal que se miran para la foto de directos (una página cada uno,
// 1 unidad cada una da igual el tamaño).
//
// 🪤 EL INGLÉS LLEVA 50, NO 25. La lista de subidas coloca un directo por su
// hora de ARRANQUE, y en noche de velada el canal sube clips sin parar: 28
// durante las 3 h de la cartelera estelar del UFC 331 (20-sep-2026), 58 en todo
// el día. Con 25, un directo largo se salía de la ventana antes de acabar y
// caía al bucle. UFC Español sube mucho menos (menos de 10 durante sus
// directos medidos).
const LIVE_UPLOADS: Record<UfcChannel, number> = { ufc: 50, "ufc-es": 25 };

// ── Tipos ───────────────────────────────────────────────────────────────────

type RegionRestriction = { blocked?: string[]; allowed?: string[] };

// Un elemento de videos.list tal cual llega de la API
// (part=snippet,liveStreamingDetails,contentDetails,status). Es también la
// forma de src/lib/__fixtures__/ufc-tv-2026-09-28.json.
export type YouTubeVideoItem = {
  id?: string;
  snippet?: { title?: string; publishedAt?: string; liveBroadcastContent?: string };
  liveStreamingDetails?: {
    scheduledStartTime?: string;
    actualStartTime?: string;
    actualEndTime?: string;
  };
  contentDetails?: {
    duration?: string;
    regionRestriction?: RegionRestriction;
    contentRating?: { ytRating?: string };
  };
  // madeForKids no está en la fixture (se guardó solo embeddable), pero la API
  // sí lo manda con part=status: 50 de 50 vídeos en la medida del 29-sep-2026.
  status?: { embeddable?: boolean; madeForKids?: boolean };
};

// Un vídeo en directo o programado, CRUDO: sin clasificar. La clasificación
// contra el evento se hace fuera de la caché (classifyLive), porque depende de
// la hora y del evento, y la caché no sabe de ninguno de los dos.
export type LiveCandidate = {
  videoId: string;
  title: string;
  channel: UfcChannel;
  liveBroadcastContent: "live" | "upcoming" | "none";
  scheduledStartTime: string | null;
  actualStartTime: string | null;
  actualEndTime: string | null;
  // ISO 8601 crudo. Un directo EN CURSO da 'P0D'; un estreno, la duración del
  // vídeo. Es lo que distingue uno de otro.
  duration: string;
  embeddable: boolean;
  // 🪤 Una foto de directos cacheada antes de existir este campo no lo trae
  // (undefined). Se lee siempre con `!== true` (isPlayableInSpain), así que esa
  // foto pasa igual que antes.
  madeForKids: boolean;
  regionRestriction: RegionRestriction | null;
  ageRestricted: boolean;
};

// Lo que hace falta de un evento para casar un directo con él. Tanto
// NextEventHero (portada) como EventDetail (ficha, /en-vivo) lo cumplen tal
// cual, sin adaptar nada.
export type UfcTvEvent = LiveEventTimes & { name: string; location: string | null };

export type LiveKind = "evento" | "peleas";

export type LivePick = { evento?: LiveCandidate; peleas?: LiveCandidate };

export type LoopVideo = { videoId: string; title: string; channel: UfcChannel };

export type UfcLiveSnapshot = { fetchedAt: string; items: LiveCandidate[] };

export type FullFightPool = { fetchedAt: string; videos: LoopVideo[] };

// `channel` es null para un id escrito a mano: la columna no dice de qué canal
// es, y el rótulo no se lo inventa.
export type EventVideo = { videoId: string; title: string | null; channel: UfcChannel | null };

type FetchLike = (url: string, init?: RequestInit) => Promise<Response>;

type FetchOptions = {
  fetchImpl?: FetchLike;
  apiKey?: string;
  now?: () => Date;
};

// ── Títulos ─────────────────────────────────────────────────────────────────

// Minúsculas, sin tildes y con los hashtags de la UFC despegados: la UFC
// escribe «#UFC332», «#UFCVegas121» y «#NocheUFC», y sin esto «UFC 332» no
// casaría con «#UFC332». Regla medida sobre las 1.200 subidas del 28-sep.
//
// 🪤 «#NocheUFC» también se despega («noche ufc»): sin eso la palabra «noche»
// no está entera en el título y la previa de la Noche UFC del 12-sep no casaba
// con su evento. Lo cazó el test con la fixture real.
export function normalizeTitle(title: string): string {
  return title
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/#?ufc(?=[a-z0-9])/g, "ufc ")
    .replace(/noche(?=ufc)/g, "noche ")
    .replace(/#/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

// SOLO PELEAS. Todo lo que lleve una de estas palabras queda fuera, sea de
// UFC TV o del bloque del evento, diga lo que diga el resto del título.
//
// 🪤 Tres de ellas no son obvias y están medidas:
//   · «bjj»: UFC Español emite «UFC BJJ 8: … | Prelims (ESPAÑOL)». Lleva
//     «Prelims» y es jiu-jitsu, otro deporte, como el boxeo o Power Slap.
//   · «behind the scenes»: «Behind The Scenes of Jon Jones Coaching | NO
//     COMMENTARY» lleva «no commentary», que en el maratón de 12 h sí es de
//     peleas.
//   · «#shorts»/«shorts», en plural: «short» suelto aparece en «short notice».
//
// 🪤 EL BOXEO NO SIEMPRE SE LLAMA BOXEO. El canal de la UFC emitió en directo
// «Garcia vs Benn: Ceremonial Weigh-In» y su rueda de prensa, y UFC Español lo
// etiqueta #GarciaBenn: ninguno lleva «zuffa», «boxing» ni «boxeo». Aquí van
// los carteles de boxeo medidos que llegan SIN la marca; los que aparezcan se
// añaden a mano. La otra red, la de verdad, es que un «Prelims» sin marca UFC
// no cuenta como pelea (ver isFightTitle), y es la que para al que no esté en
// esta lista.
const BOXING_CARDS = /garcia vs\.? benn|garciabenn/;

const EXCLUDE =
  /press conference|conferencia|rueda de prensa|weigh[- ]?ins?|pesajes?|media day|dia de medios|\binterviews?\b|entrevistas?|podcasts?|countdown|conteo regresivo|embedded|\bvlogs?\b|face[- ]?offs?|\bcareos?\b|cara a cara|post[- ]?fight|post[- ]?show|zuffa|boxing|boxeo|power slap|\bbjj\b|grappling|behind the scenes|\bshorts\b/;

function isExcluded(title: string): boolean {
  return EXCLUDE.test(title) || BOXING_CARDS.test(title);
}

// Palabras de PELEA para un directo de UFC TV.
//
// 🪤 «pelea» SUELTA NO VALE, y está medido: UFC Español la usa en reportajes
// («Waldo Cortes Acosta Pelea Ante Su Gente», «Mucho Más Que Una Pelea», «No
// Sabe Dar Peleas Aburridas»). Por eso van las formas que sí son combates:
// «pelea gratis», «peleas completas», «mejores peleas», «evento completo».
// En inglés «fights» sí va suelto (plural): «fight» en singular está en
// «UFC Fight Night», que es el nombre de medio calendario.
const FIGHT_WORDS =
  /full fights?|free fights?|marathon|maraton|pelea gratis|peleas? completas?|mejores peleas|evento completo|\bfights\b|knockouts?|\bkos\b|nocauts?|finishes|finalizaciones|greatest|best of|moments|rising stars|no commentary/;

// Los actos de una velada («previa del evento», «pre-show», preliminares)
// también van a UFC TV cuando NO son del próximo evento (o la detección del
// evento no los casa): el dueño los quiere ahí, y el título real que se pinta
// dice lo que son. Pero SOLO con la marca UFC en el título: «Garcia vs Benn |
// Prelims» son unas preliminares de boxeo, y sin la marca no hay forma de
// saber de qué deporte son. Todos los actos UFC medidos la llevan («UFC 332:
// Pre-Show», «#UFCVegas121: Previa», «#NocheUFC: Previa»).
const UFC_TV_ACT = /\bprelims?\b|preliminares|previa del evento|pre-?show/;

function isFightTitle(title: string): boolean {
  return FIGHT_WORDS.test(title) || (UFC_TV_ACT.test(title) && title.includes("ufc"));
}

// Actos de la VELADA: lo que va al bloque «Retransmisión oficial».
const EVENT_ACT =
  /pre-?show|previa del evento|early prelims?|\bprelims?\b|preliminares|main card|cartelera estelar/;

// 🪤 LA RETRANSMISIÓN DEL CANAL INGLÉS NO LLEVA PALABRA DE ACTO. Sus dos
// directos de velada medidos se llaman «Crypto.com UFC 331: Van vs Pantoja 2 |
// September 19» y «UFC 330: Makhachev vs Machado Garry | August 15» (3 h cada
// uno): el nombre del evento y la FECHA detrás de la barra. Aquellos estaban
// bloqueados en España, pero si uno no lo está es justo lo que hay que pintar.
// Va con los meses en inglés y en español («Power Slap 22: … | Julio 30», que
// además queda fuera por EXCLUDE).
const EVENT_BROADCAST =
  /\|\s*(?:january|february|march|april|may|june|july|august|september|october|november|december|enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|setiembre|octubre|noviembre|diciembre)\s+\d{1,2}\b/;

// Recopilatorios y resúmenes: nunca son el acto de la velada, aunque lleven el
// número del evento («GREATEST UFC RISING STARS | UFC 332», «Crypto.com UFC
// 331: Free Fight Marathon»). Lleva todas las palabras de recopilatorio de
// FIGHT_WORDS: «UFC 332: Prelims Fighters' Best Fights» no es la velada.
const COMPILATION =
  /marathon|maraton|greatest|best of|full fights?|free fights?|pelea gratis|peleas? completas?|mejores peleas|evento completo|\bfights\b|moments|rising stars|no commentary|\btop \d+|knockouts?|\bkos\b|nocauts?|finishes|finalizaciones|highlights|resumen|recap|recapitulacion/;

const LOOP_FIGHT = /full fight|free fight|pelea gratis/;
const LOOP_EXCLUDE = /marathon|maraton|evento completo/;

// Bucle: SOLO peleas completas sueltas. Los maratones y los eventos completos
// grabados quedan fuera por decisión del dueño (duran horas y se comerían el
// bucle entero).
export function isLoopFightTitle(title: string): boolean {
  const t = normalizeTitle(title);
  return LOOP_FIGHT.test(t) && !LOOP_EXCLUDE.test(t) && !isExcluded(t);
}

// ── Casar un directo con el evento ──────────────────────────────────────────

// Palabras de sitio que no identifican nada («Delta Center», «Meta APEX»…).
const LOCATION_STOPWORDS = new Set([
  "arena",
  "center",
  "centre",
  "stadium",
  "district",
  "sports",
  "mobile",
  "garden",
  "place",
  "field",
  "pavilion",
  "coliseum",
  "forum",
  "theater",
  "theatre",
  "national",
  "convention",
  "complex",
  "united",
  "states",
]);

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// Una palabra o frase entera. Detrás se permiten DÍGITOS a propósito:
// «#UFCVegas121» se normaliza a «ufc vegas121» y tiene que casar con «vegas».
function hasToken(title: string, token: string): boolean {
  return new RegExp(`(?<![a-z0-9])${escapeRegExp(token)}(?![a-z])`).test(title);
}

type EventTokens = { number: string | null; words: string[] };

// Lo que puede aparecer en el título de YouTube de la velada: el número
// («UFC 332»), «noche» (Noche UFC), los apellidos del estelar y la ciudad
// («UFC Paris», «UFC Vegas 121», «UFC Salt Lake City»).
function eventTokens(event: UfcTvEvent): EventTokens {
  const name = normalizeTitle(event.name);
  const words = new Set<string>();

  const number = /(?<![a-z0-9])ufc\s*(\d{2,4})\b/.exec(name)?.[1] ?? null;
  if (/\bnoche\b/.test(name)) {
    words.add("noche");
  }

  const headliners = /:\s*(.+?)\s+vs\.?\s+(.+)$/.exec(name);
  for (const side of headliners?.slice(1) ?? []) {
    const parts = side
      .replace(/\./g, "")
      .split(" ")
      .filter((w) => w && !/^(jr|sr|ii|iii|\d+)$/.test(w));
    const surname = parts.at(-1);
    if (surname && surname.length >= 3) {
      words.add(surname);
    }
  }

  // «Sede, Ciudad, Estado, País»: todo menos el país, que no identifica.
  const places = (event.location ?? "").split(",").map((p) => normalizeTitle(p));
  for (const place of places.length > 1 ? places.slice(0, -1) : places) {
    if (place.length >= 4) {
      words.add(place);
    }
    for (const w of place.split(" ")) {
      if (w.length >= 5 && !LOCATION_STOPWORDS.has(w)) {
        words.add(w);
      }
    }
  }

  return { number, words: [...words] };
}

function matchesEvent(title: string, event: UfcTvEvent): boolean {
  const { number, words } = eventTokens(event);
  if (number && new RegExp(`(?<![a-z0-9])ufc\\s*${number}(?![0-9])`).test(title)) {
    return true;
  }
  return words.some((w) => hasToken(title, w));
}

function parseInstant(value: string | null): number | null {
  if (!value) {
    return null;
  }
  const ms = new Date(value).getTime();
  return Number.isNaN(ms) ? null : ms;
}

function isEventAct(c: LiveCandidate, title: string, event: UfcTvEvent, now: Date): boolean {
  // Marca UFC (incluye «#NocheUFC»), palabra de acto de la velada (o la fecha
  // detrás de la barra, ver EVENT_BROADCAST) y nada de recopilatorios.
  if (
    !title.includes("ufc") ||
    !(EVENT_ACT.test(title) || EVENT_BROADCAST.test(title)) ||
    COMPILATION.test(title)
  ) {
    return false;
  }
  if (!matchesEvent(title, event)) {
    return false;
  }

  const first = firstSegmentStart(event);
  if (!first) {
    // Sin ningún horario no hay ventana que comprobar: mejor no afirmar que
    // ese directo es la velada (caerá, si acaso, en UFC TV con su título real).
    return false;
  }
  const main = parseEventTimestamp(event.startTime) ?? first;
  const from = first.getTime() - EVENT_WINDOW_BEFORE_MS;
  const to = main.getTime() + EVENT_WINDOW_AFTER_MS;
  const nowMs = now.getTime();
  if (nowMs > to) {
    return false;
  }

  if (c.liveBroadcastContent === "live") {
    const start = parseInstant(c.actualStartTime) ?? parseInstant(c.scheduledStartTime) ?? nowMs;
    return start >= from && start <= to;
  }

  const scheduled = parseInstant(c.scheduledStartTime);
  return (
    scheduled != null &&
    scheduled - nowMs <= UPCOMING_EVENT_MS &&
    scheduled >= from &&
    scheduled <= to
  );
}

// ── Clasificación ───────────────────────────────────────────────────────────

function toVideoDetail(c: LiveCandidate): VideoDetail {
  return {
    id: c.videoId,
    contentDetails: {
      duration: c.duration,
      regionRestriction: c.regionRestriction ?? undefined,
      contentRating: c.ageRestricted ? { ytRating: "ytAgeRestricted" } : undefined,
    },
    status: { embeddable: c.embeddable, madeForKids: c.madeForKids },
  };
}

// ¿Qué es este directo, respecto a ESTE evento y a ESTA hora?
//
//   'evento' → un acto de la velada del evento (previa, pre-show,
//              preliminares), en su ventana. Va al bloque del evento.
//   'peleas' → algo que son peleas y está en el aire. Va a UFC TV.
//   null     → nada que enseñar: rueda de prensa, pesaje, otro deporte, algo
//              que no se ve en España o marcado para niños, ya terminado, o
//              programado y lejos.
export function classifyLive(
  c: LiveCandidate,
  event: UfcTvEvent | null,
  now: Date,
): LiveKind | null {
  if (c.liveBroadcastContent !== "live" && c.liveBroadcastContent !== "upcoming") {
    return null;
  }
  if (c.actualEndTime) {
    return null;
  }
  if (!isPlayableInSpain(toVideoDetail(c))) {
    return null;
  }

  const title = normalizeTitle(c.title);
  if (isExcluded(title)) {
    return null;
  }
  if (event && isEventAct(c, title, event, now)) {
    return "evento";
  }

  // UFC TV solo enseña lo que YA está en el aire: un programado sería una
  // cuenta atrás en un reproductor que se anuncia como «EN DIRECTO».
  if (c.liveBroadcastContent !== "live" || !isFightTitle(title)) {
    return null;
  }
  const seconds = parseIsoDuration(c.duration);
  if (seconds > 0 && seconds < MIN_PREMIERE_SECONDS) {
    return null;
  }
  return "peleas";
}

function channelRank(c: LiveCandidate): number {
  return c.channel === "ufc-es" ? 0 : 1;
}

// Un directo de verdad trae P0D; un estreno, la duración del vídeo.
export function isRealLive(c: LiveCandidate): boolean {
  return parseIsoDuration(c.duration) === 0;
}

// Uno de cada: el mejor acto del evento y el mejor directo de peleas.
//
//   evento: el que ya está en el aire antes que el programado, y a igualdad
//           español antes que inglés (la web es en español).
//   peleas: un directo de verdad antes que un estreno (el estreno acaba en
//           minutos; un maratón dura horas), y luego español antes que inglés.
//
// 🪤 En «evento» el orden era el contrario (idioma primero), y con él una previa
// en español PROGRAMADA —que en el reproductor es una cuenta atrás— tapaba unas
// preliminares en inglés que ya se estaban emitiendo. Lo que está en el aire
// manda, igual que en UFC TV.
//
// Quién pinta qué lo decide el llamador: la portada pinta como mucho UNO.
export function pickLive(
  candidates: LiveCandidate[],
  event: UfcTvEvent | null,
  now: Date,
): LivePick {
  const evento: LiveCandidate[] = [];
  const peleas: LiveCandidate[] = [];
  for (const c of candidates) {
    const kind = classifyLive(c, event, now);
    if (kind === "evento") {
      evento.push(c);
    } else if (kind === "peleas") {
      peleas.push(c);
    }
  }

  // Array.prototype.sort es estable: a igualdad manda el orden de la lista de
  // subidas, que es el de arranque.
  evento.sort(
    (a, b) =>
      Number(a.liveBroadcastContent !== "live") - Number(b.liveBroadcastContent !== "live") ||
      channelRank(a) - channelRank(b),
  );
  peleas.sort(
    (a, b) => Number(!isRealLive(a)) - Number(!isRealLive(b)) || channelRank(a) - channelRank(b),
  );

  const pick: LivePick = {};
  if (evento[0]) {
    pick.evento = evento[0];
  }
  if (peleas[0]) {
    pick.peleas = peleas[0];
  }
  return pick;
}

// ── El bucle: barajado por día ──────────────────────────────────────────────

const YOUTUBE_ID = /^[A-Za-z0-9_-]{11}$/;

export function isYouTubeVideoId(id: string): boolean {
  return YOUTUBE_ID.test(id);
}

// La semilla del día: la fecha UTC. Cambia a las 00:00 UTC (las 02:00 de
// Madrid en verano), no a medianoche española, y da igual: lo que importa es
// que todo el mundo vea el mismo orden el mismo día y que mañana sea otro.
export function utcDaySeed(now: Date): string {
  return now.toISOString().slice(0, 10);
}

// FNV-1a de 32 bits: convierte un texto en un número. Math.random no sirve:
// cada visita vería un orden distinto y el test no podría fijarlo.
function hashSeed(seed: string): number {
  let h = 2_166_136_261;
  for (let i = 0; i < seed.length; i += 1) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16_777_619);
  }
  return h >>> 0;
}

// Los ids del bucle: sin repetidos, barajados con la semilla y como mucho 50
// (la URL del reproductor los lleva todos en `playlist`).
//
// 🪤 SE ORDENA POR hash(semilla + id), NO CON UN FISHER-YATES. El barajado
// clásico depende del tamaño y del orden de la lista: cuando el pool se
// refresca a media jornada (cada 6 h) con UNA subida nueva, el orden del día
// cambiaba entero, primer vídeo incluido (medido: 0 de 50 posiciones
// iguales). Con el hash cada vídeo tiene su sitio fijo del día, y uno nuevo
// solo se intercala.
//
// Y se repite por TÍTULO, no solo por id: UFC Español subió dos veces
// «#UFC329 Pelea Gratis: Pimblett vs. Chandler» con ids distintos, y los dos
// entraban en el bucle.
export function buildLoopIds(videos: LoopVideo[], seed: string): string[] {
  const seenIds = new Set<string>();
  const seenTitles = new Set<string>();
  const unique: { id: string; rank: number }[] = [];
  for (const v of videos) {
    const title = normalizeTitle(v.title);
    if (!isYouTubeVideoId(v.videoId) || seenIds.has(v.videoId) || seenTitles.has(title)) {
      continue;
    }
    seenIds.add(v.videoId);
    seenTitles.add(title);
    unique.push({ id: v.videoId, rank: hashSeed(`${seed}:${v.videoId}`) });
  }
  unique.sort((a, b) => a.rank - b.rank || (a.id < b.id ? -1 : 1));
  return unique.slice(0, LOOP_MAX_IDS).map((v) => v.id);
}

// ── URLs del reproductor ────────────────────────────────────────────────────

const EMBED_BASE = "https://www.youtube-nocookie.com/embed/";

// 🪤 ARRANCA SOLO Y ARRANCA MUDO, las dos cosas: `autoplay=1` sin `mute=1` no
// arranca (Chrome y Safari lo bloquean) y `playsinline=1` evita que el iPhone
// se lo lleve a pantalla completa. Ver event-live-embed.tsx, que lleva el mismo
// acuerdo, y live-embed-callsites.test.ts, que lo vigila en los dos.
const AUTOPLAY_PARAMS = "autoplay=1&mute=1&playsinline=1";

// La versión QUIETA, para quien pide menos movimiento
// (prefers-reduced-motion): ni arranca sola ni va muda —si le da a play, lo
// ha pedido él y quiere oírlo—. Solo `playsinline`. La elige el navegador en
// components/home/ufc-tv-player.tsx.
const CALM_PARAMS = "playsinline=1";

type EmbedOptions = { autoplay?: boolean };

function embedParams({ autoplay = true }: EmbedOptions): string {
  return autoplay ? AUTOPLAY_PARAMS : CALM_PARAMS;
}

// Devuelve null si el id no es de YouTube: así 'off' (o cualquier otra cosa
// que se cuele en la columna) no llega nunca a un iframe.
export function liveEmbedUrl(videoId: string, opts: EmbedOptions = {}): string | null {
  return isYouTubeVideoId(videoId) ? `${EMBED_BASE}${videoId}?${embedParams(opts)}` : null;
}

// 🪤 CÓMO SE COMBINAN `playlist` Y `loop` (doc de parámetros del reproductor
// de YouTube, developers.google.com/youtube/player_parameters, leída el
// 28-sep-2026):
//
//   · playlist: «el primer vídeo que se reproduce es el VIDEO_ID de la ruta, y
//     los de `playlist` se reproducen después».
//   · loop: «en un reproductor de lista, reproduce la lista entera y vuelve a
//     empezar por el primer vídeo». Y la nota: para repetir UN vídeo hay que
//     poner loop=1 y playlist=ese mismo id.
//
// 🪤 PERO CON `loop=1` LA DOC NO ES LO QUE PASA. Medido con los ojos el
// 28-sep-2026 (Playwright, portada en local): con el primero en la ruta y el
// resto en `playlist`, el reproductor arrancó directamente por el SEGUNDO
// (Delgado vs Juárez, 10:43) y el de la ruta (Green vs Zellhuber, 12:02) no
// sonó nunca. Con loop, YouTube reproduce la LISTA y la ruta solo le dice por
// dónde empezar dentro de ella: si no está en la lista, se la salta.
//
// Así que `playlist` lleva TODOS los ids, el primero incluido, y la ruta es ese
// mismo primero. Medido igual: arranca por Green vs Zellhuber (0:01 de 12:02),
// una sola vez. Con un solo vídeo sale playlist = él mismo, que es además lo
// que pide la nota de la doc para repetirlo.
export function loopEmbedUrl(ids: string[], opts: EmbedOptions = {}): string | null {
  const valid = [...new Set(ids)].filter(isYouTubeVideoId);
  if (valid.length === 0) {
    return null;
  }
  return `${EMBED_BASE}${valid[0]}?playlist=${valid.join(",")}&loop=1&${embedParams(opts)}`;
}

// ── La columna manda ────────────────────────────────────────────────────────

// Qué vídeo va en el bloque «Retransmisión oficial» de un evento:
//
//   · events.live_video_id = 'off' → 'off': el dueño lo ha apagado a mano;
//     no se pinta nada automático para este evento, en ningún sitio.
//   · escrito a mano → ese, SIEMPRE, aunque se haya detectado otro (migración
//     027: la columna manda). Con su título, que puede ser null: entonces
//     EventLiveEmbed decide no pintarse, porque sin título no sabe decir qué es.
//   · si no, el detectado, con su TÍTULO REAL de YouTube y su canal.
//   · y si el detectado ya lo enseña la propia página (careo o pesaje del
//     mismo evento), no se repite.
//
// 🪤 'OFF', ' off' o una URL pegada a mano con SQL también son 'off'. El
// escritor soportado solo escribe 'off' exacto, pero lo que llegue por otro
// camino no puede acabar en un iframe (`embed/OFF`) ni, con 'off' y espacios,
// en el carril vacío de 80 px de la portada. Un id a mano sin forma de YouTube
// no es un vídeo: se trata como el interruptor, no como «sin fijar», porque
// quien lo escribió quería mandar sobre lo automático.
export function resolveEventVideo(
  manualId: string | null | undefined,
  manualTitle: string | null | undefined,
  detected: LiveCandidate | null | undefined,
  alreadyShown: readonly (string | null | undefined)[] = [],
): EventVideo | null | "off" {
  const manual = manualId?.trim() ?? "";
  if (manual) {
    if (manual.toLowerCase() === LIVE_VIDEO_OFF || !isYouTubeVideoId(manual)) {
      return "off";
    }
    return { videoId: manual, title: manualTitle ?? null, channel: null };
  }
  if (!detected || alreadyShown.includes(detected.videoId)) {
    return null;
  }
  return { videoId: detected.videoId, title: detected.title, channel: detected.channel };
}

// ¿Hace falta preguntar a YouTube por el directo de este evento? Con cualquier
// cosa escrita a mano en la columna, no: gana ella ('off' incluido).
export function needsLiveDetection(manualId: string | null | undefined): boolean {
  return !manualId?.trim();
}

// Lo que pinta el hueco de la portada, decidido sin tocar la red ni React.
// Como mucho UNA cosa, por este orden:
//
//   1. 'off' en la columna                  → nada (el interruptor del dueño).
//   2. id escrito a mano con título         → el bloque del evento, ese.
//      id escrito a mano SIN título         → nada: EventLiveEmbed no pinta un
//                                             vídeo que no sabe nombrar, y la
//                                             columna manda sobre UFC TV.
//   3. el acto de la velada detectado       → el bloque del evento.
//   4. un directo de PELEAS                 → UFC TV en directo.
//   5. si no                                → UFC TV en bucle (si hay bucle).
//
// «nada» lleva el motivo cuando es A PROPÓSITO: el hueco deja una marca
// invisible con él y el e2e de la portada se salta en vez de ponerse rojo por
// un estado de la base de producción que es legítimo.
export type HomeSlotPlan =
  | { kind: "nada"; reason: "off" | "manual-sin-titulo" }
  | { kind: "evento"; video: EventVideo & { title: string } }
  | { kind: "peleas"; video: LiveCandidate }
  | { kind: "bucle" };

export function planHomeSlot(
  manualId: string | null | undefined,
  manualTitle: string | null | undefined,
  pick: LivePick,
): HomeSlotPlan {
  const eventVideo = resolveEventVideo(manualId, manualTitle, pick.evento);
  if (eventVideo === "off") {
    return { kind: "nada", reason: "off" };
  }
  if (eventVideo) {
    return eventVideo.title
      ? { kind: "evento", video: { ...eventVideo, title: eventVideo.title } }
      : { kind: "nada", reason: "manual-sin-titulo" };
  }
  if (pick.peleas) {
    return { kind: "peleas", video: pick.peleas };
  }
  return { kind: "bucle" };
}

// ── Frescura ────────────────────────────────────────────────────────────────

export function isSnapshotFresh(
  fetchedAt: string,
  now: Date,
  maxAgeMs: number = LIVE_MAX_AGE_MS,
): boolean {
  const at = parseInstant(fetchedAt);
  return at != null && now.getTime() - at <= maxAgeMs;
}

export function freshLiveItems(snapshot: UfcLiveSnapshot, now: Date): LiveCandidate[] {
  return isSnapshotFresh(snapshot.fetchedAt, now) ? snapshot.items : [];
}

// ── API de YouTube ──────────────────────────────────────────────────────────

export function toLiveCandidate(item: YouTubeVideoItem, channel: UfcChannel): LiveCandidate | null {
  const videoId = item.id;
  const title = item.snippet?.title;
  if (!videoId || !title) {
    return null;
  }
  const lbc = item.snippet?.liveBroadcastContent;
  const live = item.liveStreamingDetails;
  return {
    videoId,
    title,
    channel,
    liveBroadcastContent: lbc === "live" || lbc === "upcoming" ? lbc : "none",
    scheduledStartTime: live?.scheduledStartTime ?? null,
    actualStartTime: live?.actualStartTime ?? null,
    actualEndTime: live?.actualEndTime ?? null,
    duration: item.contentDetails?.duration ?? "",
    embeddable: item.status?.embeddable !== false,
    madeForKids: item.status?.madeForKids === true,
    regionRestriction: item.contentDetails?.regionRestriction ?? null,
    ageRestricted: item.contentDetails?.contentRating?.ytRating === "ytAgeRestricted",
  };
}

type UploadEntry = { videoId: string; title: string };

type PlaylistItemsResponse = {
  items?: { snippet?: { title?: string; resourceId?: { videoId?: string } } }[];
  nextPageToken?: string;
};

// Una página de la lista de subidas (1 unidad). pageToken va DETRÁS de
// playlistId en la URL: el test de «falla la primera página» lo usa para
// distinguirlas.
async function fetchUploadsPage(
  fetchImpl: FetchLike,
  apiKey: string,
  uploads: string,
  maxResults: number,
  pageToken: string | undefined,
  signal: AbortSignal,
): Promise<{ entries: UploadEntry[]; nextPageToken: string | null }> {
  const url =
    `https://www.googleapis.com/youtube/v3/playlistItems?part=snippet` +
    `&maxResults=${maxResults}&playlistId=${uploads}` +
    (pageToken ? `&pageToken=${encodeURIComponent(pageToken)}` : "") +
    `&key=${apiKey}`;
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
  return { entries, nextPageToken: data.nextPageToken ?? null };
}

// videos.list de hasta 50 ids (1 unidad).
async function fetchVideoItems(
  fetchImpl: FetchLike,
  apiKey: string,
  ids: string[],
  parts: string,
  signal: AbortSignal,
): Promise<YouTubeVideoItem[]> {
  if (ids.length === 0) {
    return [];
  }
  const url =
    `https://www.googleapis.com/youtube/v3/videos?part=${parts}` +
    `&id=${ids.slice(0, VIDEOS_PER_CALL).join(",")}&key=${apiKey}`;
  const res = await fetchImpl(url, { signal });
  if (!res.ok) {
    throw new Error(`YouTube API ${res.status}`);
  }
  const data = (await res.json()) as { items?: YouTubeVideoItem[] };
  return data.items ?? [];
}

function resolveOptions(opts: FetchOptions & { timeoutMs?: number }) {
  return {
    // globalThis.fetch se lee AL LLAMAR, no al cargar el módulo: dentro de
    // unstable_cache Next lo parchea, y en los tests se sustituye.
    fetchImpl: opts.fetchImpl ?? ((url: string, init?: RequestInit) => globalThis.fetch(url, init)),
    apiKey: "apiKey" in opts ? opts.apiKey : process.env.YOUTUBE_API_KEY,
    now: opts.now ?? (() => new Date()),
  };
}

// Los directos y programados de los dos canales, SIN caché. Nunca lanza: si
// YouTube falla, tarda o se queda sin cuota, la respuesta es «ninguno» y la
// portada cae al bucle.
export async function fetchUfcLiveNow(
  opts: FetchOptions & { timeoutMs?: number } = {},
): Promise<UfcLiveSnapshot> {
  const { fetchImpl, apiKey, now } = resolveOptions(opts);
  const fetchedAt = now().toISOString();
  if (!apiKey) {
    return { fetchedAt, items: [] };
  }
  try {
    const signal = AbortSignal.timeout(opts.timeoutMs ?? LIVE_TIMEOUT_MS);
    const pages = await Promise.all(
      UFC_TV_CHANNELS.map(async ({ channel, uploads }) => {
        const page = await fetchUploadsPage(
          fetchImpl,
          apiKey,
          uploads,
          LIVE_UPLOADS[channel],
          undefined,
          signal,
        );
        return page.entries.map((e) => ({ ...e, channel }));
      }),
    );
    const channelOf = new Map(pages.flat().map((e) => [e.videoId, e.channel] as const));
    // 75 ids no caben en una llamada de videos.list: van de 50 en 50, en
    // paralelo y con el mismo tope de tiempo.
    const ids = [...channelOf.keys()];
    const batches: string[][] = [];
    for (let i = 0; i < ids.length; i += VIDEOS_PER_CALL) {
      batches.push(ids.slice(i, i + VIDEOS_PER_CALL));
    }
    const details = (
      await Promise.all(
        batches.map((batch) =>
          fetchVideoItems(
            fetchImpl,
            apiKey,
            batch,
            "snippet,liveStreamingDetails,contentDetails,status",
            signal,
          ),
        ),
      )
    ).flat();
    const items: LiveCandidate[] = [];
    for (const item of details) {
      const channel = item.id ? channelOf.get(item.id) : undefined;
      const candidate = channel ? toLiveCandidate(item, channel) : null;
      if (candidate && candidate.liveBroadcastContent !== "none") {
        items.push(candidate);
      }
    }
    return { fetchedAt, items };
  } catch {
    return { fetchedAt, items: [] };
  }
}

// Recorre las subidas de un canal página a página. La primera página que
// falla hace fallar el canal entero; una posterior solo corta la lectura.
async function collectLoopEntries(
  fetchImpl: FetchLike,
  apiKey: string,
  uploads: string,
  pages: number,
  signal: AbortSignal,
): Promise<UploadEntry[]> {
  const found: UploadEntry[] = [];
  let pageToken: string | undefined;
  for (let page = 0; page < pages; page += 1) {
    let result: Awaited<ReturnType<typeof fetchUploadsPage>>;
    try {
      result = await fetchUploadsPage(fetchImpl, apiKey, uploads, POOL_PAGE_SIZE, pageToken, signal);
    } catch (error) {
      if (page === 0) {
        throw error;
      }
      break;
    }
    found.push(...result.entries.filter((e) => isLoopFightTitle(e.title)));
    if (!result.nextPageToken || result.entries.length === 0) {
      break;
    }
    pageToken = result.nextPageToken;
  }
  return found;
}

// El bucle de peleas completas, SIN caché.
//
// 🪤 LANZA en vez de devolver [] cuando no puede fiarse del resultado (sin
// clave, primera página caída, detalles caídos, bucle vacío). unstable_cache
// NO guarda un resultado que lanza: si ya había un bucle en caché, sigue
// sirviendo ese, y si no lo había, el llamador lo captura y no pinta nada en
// esta visita. Devolver [] sería guardar «no hay peleas» durante 6 h.
//
// 🪤 Y lanzar tiene un precio: como no se guarda, el siguiente refresco lo
// vuelve a intentar. Quien lo llama desde la página lo hace a través de
// withCooldown (ver refreshFullFightPool, abajo), que corta los reintentos.
export async function fetchFullFightPool(opts: FetchOptions = {}): Promise<FullFightPool> {
  const { fetchImpl, apiKey, now } = resolveOptions(opts);
  if (!apiKey) {
    throw new Error("UFC TV: sin YOUTUBE_API_KEY no hay bucle");
  }

  // Si un canal falla en su primera página, el refresco entero va a lanzar:
  // se aborta también el otro, que si no seguiría paginando (hasta 12
  // unidades) para un resultado que se va a tirar.
  const channelFailed = new AbortController();
  const pagesSignal = AbortSignal.any([
    AbortSignal.timeout(POOL_PAGES_TIMEOUT_MS),
    channelFailed.signal,
  ]);
  const perChannel = await Promise.all(
    UFC_TV_CHANNELS.map(async ({ channel, uploads }) => {
      try {
        const entries = await collectLoopEntries(
          fetchImpl,
          apiKey,
          uploads,
          POOL_PAGES[channel],
          pagesSignal,
        );
        return entries.map((e) => ({ ...e, channel }));
      } catch (error) {
        channelFailed.abort(error);
        throw error;
      }
    }),
  );

  const channelOf = new Map(perChannel.flat().map((e) => [e.videoId, e.channel] as const));
  const ids = [...channelOf.keys()];
  const detailsSignal = AbortSignal.timeout(POOL_DETAILS_TIMEOUT_MS);
  const videos: LoopVideo[] = [];
  for (let i = 0; i < ids.length; i += VIDEOS_PER_CALL) {
    let batch: YouTubeVideoItem[];
    try {
      batch = await fetchVideoItems(
        fetchImpl,
        apiKey,
        ids.slice(i, i + VIDEOS_PER_CALL),
        "snippet,contentDetails,status",
        detailsSignal,
      );
    } catch (error) {
      if (i === 0) {
        throw error;
      }
      break;
    }
    for (const item of batch) {
      const channel = item.id ? channelOf.get(item.id) : undefined;
      const c = channel ? toLiveCandidate(item, channel) : null;
      if (
        c &&
        // Ni en directo ni programado: un estreno que aún no se ha emitido no
        // se puede reproducir, y el bucle saltaría a un marco vacío.
        c.liveBroadcastContent === "none" &&
        isLoopFightTitle(c.title) &&
        isPlayableInSpain(toVideoDetail(c)) &&
        parseIsoDuration(c.duration) >= MIN_LOOP_SECONDS
      ) {
        videos.push({ videoId: c.videoId, title: c.title, channel: c.channel });
      }
    }
  }

  if (videos.length === 0) {
    throw new Error("UFC TV: el bucle ha salido vacío");
  }
  return { fetchedAt: now().toISOString(), videos };
}

// ── Modo fixture (e2e determinista) ─────────────────────────────────────────
//
// Con UFC_TV_FIXTURE = 'off' | 'loop' | 'live' | 'evento', las dos consultas
// devuelven datos ENLATADOS sin tocar la red, con ids reales medidos el
// 28-sep-2026. Lo pone playwright.config.ts en su webServer para que el e2e
// de la portada no dependa de lo que emita la UFC ese día.
//
// ⚠️ NO SE CONFIGURA EN VERCEL. En producción la variable no existe y esto no
// hace nada. Cualquier otro valor (o ninguno) es el camino real.
//
// Lo que 'evento' NO puede garantizar: devuelve una previa en directo de UFC
// Español, pero que se clasifique como acto de la velada depende del próximo
// evento REAL de la base y de su ventana horaria, que el fixture no controla.
// Fuera de semana de velada esa previa cae en UFC TV (con su título real).

export type UfcTvFixtureMode = "off" | "loop" | "live" | "evento";

const FIXTURE_MODES: readonly UfcTvFixtureMode[] = ["off", "loop", "live", "evento"];

export function readFixtureMode(
  env: Record<string, string | undefined> = process.env,
): UfcTvFixtureMode | null {
  const value = env.UFC_TV_FIXTURE;
  return FIXTURE_MODES.find((mode) => mode === value) ?? null;
}

const FIXTURE_LOOP: LoopVideo[] = [
  { videoId: "4jCfhpKS4Wg", title: "King Green vs Daniel Zellhuber | Full Fight", channel: "ufc" },
  {
    videoId: "a4Q81kbvOXk",
    title: "Payton Talbott vs Henry Cejudo | FULL FIGHT | UFC 332",
    channel: "ufc",
  },
  {
    videoId: "_3gKbsCRtEc",
    title: "Deiveson Figueiredo vs Brandon Moreno 3 | FULL FIGHT | UFC 332",
    channel: "ufc",
  },
  {
    videoId: "A09GMoVm9S8",
    title: "Wang Cong vs Tracy Cortez | FULL FIGHT | UFC 332",
    channel: "ufc",
  },
  { videoId: "eolk1_qxI28", title: "#NocheUFC Pelea Gratis: Delgado vs. Juárez", channel: "ufc-es" },
  {
    videoId: "NcCPNVPx3O4",
    title: "#UFCShanghai Pelea Gratis: Nurmagomedov vs Sandhagen",
    channel: "ufc-es",
  },
  {
    videoId: "X7k1eTCC3_w",
    title: "#NocheUFC Pelea Gratis: Garcia vs. Maheshate",
    channel: "ufc-es",
  },
  {
    videoId: "n3TSfUrKZ0E",
    title: "#NocheUFC Pelea Gratis: Garcia vs Hernandez",
    channel: "ufc-es",
  },
];

function fixtureLive(
  videoId: string,
  title: string,
  channel: UfcChannel,
  now: Date,
): LiveCandidate {
  const started = new Date(now.getTime() - 10 * 60_000).toISOString();
  return {
    videoId,
    title,
    channel,
    liveBroadcastContent: "live",
    scheduledStartTime: started,
    actualStartTime: started,
    actualEndTime: null,
    duration: "P0D",
    embeddable: true,
    madeForKids: false,
    regionRestriction: null,
    ageRestricted: false,
  };
}

function fixtureLiveSnapshot(mode: UfcTvFixtureMode, now: Date): UfcLiveSnapshot {
  const fetchedAt = now.toISOString();
  switch (mode) {
    case "live":
      return {
        fetchedAt,
        items: [fixtureLive("z1PhY6ix2XY", "GREATEST UFC RISING STARS | UFC 332", "ufc", now)],
      };
    case "evento":
      return {
        fetchedAt,
        items: [
          fixtureLive("yLuMxIVAIaI", "#UFCVegas121: Previa del Evento ¡EN VIVO!", "ufc-es", now),
        ],
      };
    default:
      return { fetchedAt, items: [] };
  }
}

// ── Agrupar y frenar los refrescos ──────────────────────────────────────────

// Las llamadas que llegan mientras hay una en vuelo comparten su promesa en
// vez de lanzar otra. Es por instancia del servidor (vive en el módulo) y
// solo mientras la petición está en vuelo: al acabar, bien o mal, se olvida.
export function singleFlight<T>(fn: () => Promise<T>): () => Promise<T> {
  let pending: Promise<T> | null = null;
  return () => {
    if (!pending) {
      pending = fn().finally(() => {
        pending = null;
      });
    }
    return pending;
  };
}

// Tras un fallo, las llamadas de los `cooldownMs` siguientes fallan SIN hacer
// nada. Es el cortacircuitos del bucle: unstable_cache no guarda un callback
// que lanza, así que sin esto cada visita volvería a pagar el refresco.
export function withCooldown<T>(
  fn: () => Promise<T>,
  cooldownMs: number,
  now: () => number = Date.now,
): () => Promise<T> {
  let retryAfter = 0;
  return async () => {
    if (now() < retryAfter) {
      throw new Error("UFC TV: en pausa tras un fallo reciente");
    }
    try {
      return await fn();
    } catch (error) {
      retryAfter = now() + cooldownMs;
      throw error;
    }
  };
}

// El tramo de 120 s al que pertenece un instante (ver LIVE_MAX_AGE_MS).
export function liveBucket(now: Date): number {
  return Math.floor(now.getTime() / (LIVE_REVALIDATE_SECONDS * 1000));
}

// ── Lo que usan las páginas ─────────────────────────────────────────────────

const refreshUfcLiveNow = singleFlight(() => fetchUfcLiveNow());

// 🪤 EL TRAMO VA EN LA CLAVE (en keyParts, que unstable_cache mete en ella): un
// tramo nuevo es un fallo de caché, no una entrada caducada que se sirve
// mientras revalida. Con revalidate = el largo del tramo, la entrada de un
// tramo nunca caduca dentro de él. Crear el envoltorio en cada llamada es lo
// que hace el propio ejemplo de la doc de unstable_cache con claves que
// cambian (node_modules/next/dist/docs/.../unstable_cache.md).
function getUfcLiveNowCached(bucket: number): Promise<UfcLiveSnapshot> {
  return unstable_cache(() => refreshUfcLiveNow(), ["ufc-tv-live-now", String(bucket)], {
    revalidate: LIVE_REVALIDATE_SECONDS,
  })();
}

const refreshFullFightPool = withCooldown(
  singleFlight(() => fetchFullFightPool()),
  POOL_RETRY_AFTER_MS,
);

const getFullFightPoolCached = unstable_cache(
  () => refreshFullFightPool(),
  ["ufc-tv-full-fights"],
  { revalidate: POOL_REVALIDATE_SECONDS },
);

// El último bucle bueno que ha visto ESTA instancia. Es la red para cuando la
// caché no tiene nada que servir y el refresco falla: tras un
// revalidatePath('/') (ver la cabecera) o con el cortacircuitos abierto.
let lastGoodPool: FullFightPool | null = null;

// La foto de directos del tramo actual. Nunca lanza hacia la página. Léela con
// freshLiveItems igualmente (ver LIVE_MAX_AGE_MS).
export async function getUfcLiveNow(): Promise<UfcLiveSnapshot> {
  const mode = readFixtureMode();
  if (mode) {
    return fixtureLiveSnapshot(mode, new Date());
  }
  try {
    return await getUfcLiveNowCached(liveBucket(new Date()));
  } catch {
    return { fetchedAt: new Date(0).toISOString(), items: [] };
  }
}

// El bucle, cacheado 6 h. PUEDE LANZAR (ver fetchFullFightPool) si no hay ni
// caché ni un bucle anterior en memoria: el llamador lo captura y no pinta.
export async function getFullFightPool(): Promise<FullFightPool> {
  const mode = readFixtureMode();
  if (mode) {
    return {
      fetchedAt: new Date().toISOString(),
      videos: mode === "off" ? [] : FIXTURE_LOOP,
    };
  }
  try {
    const pool = await getFullFightPoolCached();
    lastGoodPool = pool;
    return pool;
  } catch (error) {
    if (lastGoodPool) {
      return lastGoodPool;
    }
    throw error;
  }
}

// Directo del evento y directo de peleas, ya clasificados contra `event` y con
// la guarda de frescura aplicada. Nunca lanza.
export async function getLivePick(event: UfcTvEvent | null, now: Date = new Date()): Promise<LivePick> {
  try {
    return pickLive(freshLiveItems(await getUfcLiveNow(), now), event, now);
  } catch {
    return {};
  }
}
