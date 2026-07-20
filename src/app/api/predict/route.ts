import { NextResponse } from "next/server";
import { z } from "zod";

import { clientIpFromHeaders, isAllowedOrigin } from "@/lib/maestro/security";
import { generatePredictionExplanation, type PredictionResponse } from "@/lib/prediction";
import { parsePredictionPayload, type RawPrediction } from "@/lib/prediction-schema";
import { checkRateLimit } from "@/lib/rate-limit";

export const runtime = "nodejs";
// El microservicio (Render free) se duerme a los 15 min y su arranque en frío
// MEDIDO ronda los ~50s (el keepalive de GitHub Actions no lo sostiene siempre
// caliente). 60s es el TOPE de maxDuration en el plan Hobby de Vercel para
// funciones serverless clásicas: no subir sin pasar a Pro o Fluid compute.
export const maxDuration = 60;

// Presupuesto total del handler en ms, derivado de maxDuration para que ambos
// no se desincronicen si algún día cambia el tope.
const MAX_DURATION_MS = maxDuration * 1000;
// Reserva para serializar y enviar la respuesta tras la explicación IA.
const RESPONSE_RESERVE_MS = 2_000;

const requestSchema = z.object({
  redFighterId: z.number().int().positive(),
  blueFighterId: z.number().int().positive(),
});

// Valida en runtime la respuesta del microservicio; un núcleo inválido corta con
// 503 (la UI ya sabe degradar) y un methodPrediction roto se descarta solo él.
function parsePrediction(payload: unknown): RawPrediction {
  const result = parsePredictionPayload(payload);
  if (!result.ok) {
    console.error(
      "[predict] respuesta del microservicio con forma inesperada:",
      result.error,
    );
    throw new PredictionUnavailableError(
      "El servicio de predicción devolvió una respuesta inesperada.",
    );
  }
  if (result.warning) console.error("[predict]", result.warning);
  return result.data;
}

// Thrown when the prediction microservice is not configured or unreachable, so
// the UI can degrade gracefully (503) instead of showing a hard error.
class PredictionUnavailableError extends Error {}

// The request to the microservice was rejected as invalid (400).
class InvalidPredictionRequestError extends Error {}

async function fetchPrediction(
  redFighterId: number,
  blueFighterId: number,
): Promise<RawPrediction> {
  const baseUrl = process.env.PREDICTION_SERVICE_URL;

  if (!baseUrl) {
    throw new PredictionUnavailableError(
      "La predicción con IA está temporalmente no disponible.",
    );
  }

  const apiKey = process.env.PREDICTION_SERVICE_API_KEY;

  // Hasta 2 intentos: el 1º puede morir por el arranque en frío de Render
  // (~50s MEDIDO); ese mismo intento ya ha despertado el servicio, así que el
  // 2º responde en cuanto termina de arrancar. 25s + 1s + 30s = 56s: cubre el
  // frío de ~50s con margen y deja ~4s de holgura hasta maxDuration=60. El
  // presupuesto anterior (20s+1s+25s ≈ 46s) se quedaba CORTO y la primera
  // predicción en frío fallaba con 503 aunque el servicio estuviera sano. La
  // explicación IA ya no tiene timeout fijo: recibe solo el presupuesto
  // restante del handler (ver POST) y cae al resumen local si no le llega.
  const ATTEMPT_TIMEOUTS_MS = [25_000, 30_000];
  for (let attempt = 0; attempt < ATTEMPT_TIMEOUTS_MS.length; attempt += 1) {
    const isLastAttempt = attempt === ATTEMPT_TIMEOUTS_MS.length - 1;
    try {
      const response = await fetch(`${baseUrl.replace(/\/$/u, "")}/predict`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(apiKey ? { "X-API-Key": apiKey } : {}),
        },
        body: JSON.stringify({ red: redFighterId, blue: blueFighterId }),
        signal: AbortSignal.timeout(ATTEMPT_TIMEOUTS_MS[attempt]),
      });
      // El proxy de Render responde 502/503/504 mientras la instancia
      // arranca: cuenta como "aún dormido" y se reintenta. Se cancela el body
      // para no dejar la conexión del pool retenida.
      if ([502, 503, 504].includes(response.status) && !isLastAttempt) {
        await response.body?.cancel().catch(() => {});
        await new Promise((resolve) => setTimeout(resolve, 1_000));
        continue;
      }
      if (!response.ok) {
        await response.body?.cancel().catch(() => {});
        if (response.status === 400) {
          throw new InvalidPredictionRequestError(
            "Identificadores de peleador no válidos.",
          );
        }
        throw new PredictionUnavailableError(
          `El servicio de predicción falló (${response.status}).`,
        );
      }
      // La lectura del body va DENTRO del try: el AbortSignal del intento
      // también puede abortar json() (cabeceras a tiempo, body tardío) y ese
      // timeout debe contar como reintentable, no como 500 genérico.
      return parsePrediction(await response.json());
    } catch (error) {
      if (
        error instanceof InvalidPredictionRequestError ||
        error instanceof PredictionUnavailableError
      ) {
        throw error;
      }
      // Fallo de red, timeout o body abortado alcanzando el microservicio.
      if (isLastAttempt) {
        throw new PredictionUnavailableError(
          "El servicio de predicción no responde. Inténtalo de nuevo en un momento.",
        );
      }
      await new Promise((resolve) => setTimeout(resolve, 1_000));
    }
  }

  // Inalcanzable (el bucle siempre devuelve o lanza), pero satisface a TS.
  throw new PredictionUnavailableError(
    "El servicio de predicción no responde. Inténtalo de nuevo en un momento.",
  );
}

// Caché en memoria de predicciones por par (red, blue). Una predicción es
// determinista para los mismos dos peleadores, así que repetir la MISMA pareja
// no debe re-llamar a Render ni a Anthropic (denial-of-wallet). Best-effort (por
// instancia en serverless) y con TTL corto para no servir datos rancios.
type PredictionCacheEntry = { value: PredictionResponse; expires: number };
const PREDICTION_CACHE_TTL_MS = 30 * 60_000;
// Una explicación de respaldo (sin IA: presupuesto agotado tras el arranque en
// frío de Render, o Anthropic caído) caduca pronto para que la siguiente
// petición de la misma pareja regenere la explicación IA en cuanto se pueda.
const PREDICTION_FALLBACK_TTL_MS = 2 * 60_000;
const PREDICTION_CACHE_MAX = 500;
const predictionCache = new Map<string, PredictionCacheEntry>();

function getCachedPrediction(key: string): PredictionResponse | null {
  const hit = predictionCache.get(key);
  if (!hit) return null;
  if (Date.now() > hit.expires) {
    predictionCache.delete(key);
    return null;
  }
  // LRU: al leer, refresca el orden de inserción (se evicta el más viejo).
  predictionCache.delete(key);
  predictionCache.set(key, hit);
  return hit.value;
}

function setCachedPrediction(key: string, value: PredictionResponse): void {
  if (predictionCache.size >= PREDICTION_CACHE_MAX) {
    const oldest = predictionCache.keys().next().value;
    if (oldest !== undefined) predictionCache.delete(oldest);
  }
  const ttl =
    value.explanationSource === "fallback"
      ? PREDICTION_FALLBACK_TTL_MS
      : PREDICTION_CACHE_TTL_MS;
  predictionCache.set(key, { value, expires: Date.now() + ttl });
}

export async function POST(request: Request) {
  // Ancla del presupuesto total: la explicación IA solo recibirá lo que quede
  // de maxDuration tras los reintentos contra Render (ver más abajo).
  const startedAt = Date.now();

  // 1) Solo peticiones desde el propio origen (anti-CSRF / hotlinking), igual
  //    que el Maestro. Un cliente no-navegador sin Origin se rechaza aquí.
  const origin = request.headers.get("origin") ?? request.headers.get("referer");
  const allowLoopback = process.env.NODE_ENV !== "production";
  if (!isAllowedOrigin(origin, request.headers.get("host"), allowLoopback)) {
    return NextResponse.json({ error: "Origen no permitido." }, { status: 403 });
  }

  // 2) Rate-limit por IP: /api/predict es el endpoint MÁS caro (microservicio
  //    Render + explicación con Anthropic por request). Antes de parsear el body
  //    para que un flood de peticiones también quede limitado.
  const ip = clientIpFromHeaders(request.headers);
  const limit = await checkRateLimit(`predict:${ip}`);
  if (!limit.allowed) {
    return NextResponse.json(
      { error: "Vas demasiado rápido. Espera unos segundos e inténtalo de nuevo." },
      { status: 429, headers: { "Retry-After": String(limit.retryAfter) } },
    );
  }

  try {
    const body = await request.json();
    const parsed = requestSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: "Identificadores de peleador no válidos." },
        { status: 400 },
      );
    }

    if (parsed.data.redFighterId === parsed.data.blueFighterId) {
      return NextResponse.json(
        { error: "Elige dos peleadores diferentes." },
        { status: 400 },
      );
    }

    // 3) Caché por par: evita re-llamar a Render + Anthropic en repeticiones.
    const cacheKey = `${parsed.data.redFighterId}-${parsed.data.blueFighterId}`;
    const cached = getCachedPrediction(cacheKey);
    if (cached) {
      return NextResponse.json(cached);
    }

    const prediction = await fetchPrediction(
      parsed.data.redFighterId,
      parsed.data.blueFighterId,
    );
    // Tras un arranque en frío los reintentos contra Render pueden haber
    // consumido ~56s de los 60 disponibles: la explicación IA recibe SOLO el
    // presupuesto restante (menos la reserva de respuesta). Si es demasiado
    // pequeño, prediction.ts salta directo al resumen local en vez de arriesgar
    // un 504 de Vercel; en caliente conserva sus 10s habituales.
    const explanation = await generatePredictionExplanation(prediction, {
      timeoutMs: MAX_DURATION_MS - (Date.now() - startedAt) - RESPONSE_RESERVE_MS,
    });
    const payload = {
      ...prediction,
      ...explanation,
    } satisfies PredictionResponse;
    setCachedPrediction(cacheKey, payload);

    return NextResponse.json(payload);
  } catch (error) {
    // Service not configured / unreachable → 503 so the UI degrades gracefully.
    if (error instanceof PredictionUnavailableError) {
      return NextResponse.json({ error: error.message }, { status: 503 });
    }

    // Bad request reaching the microservice → 400.
    if (error instanceof InvalidPredictionRequestError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    // Error inesperado (JSON malformado, fallo del microservicio, etc.):
    // se loggea server-side y al cliente solo le llega un mensaje genérico,
    // nunca el stack ni el mensaje crudo.
    console.error("[api/predict] error inesperado", error);
    return NextResponse.json(
      { error: "El servicio de predicción falló de forma inesperada." },
      { status: 500 },
    );
  }
}
