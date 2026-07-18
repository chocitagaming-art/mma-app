import { NextResponse } from "next/server";
import { z } from "zod";

import { clientIpFromHeaders, isAllowedOrigin } from "@/lib/maestro/security";
import { generatePredictionExplanation, type PredictionResponse } from "@/lib/prediction";
import { checkRateLimit } from "@/lib/rate-limit";

export const runtime = "nodejs";
// El microservicio (Render free) se duerme a los 15 min: el primer request lo
// despierta y puede tardar ~50s. Presupuesto amplio + reintento (abajo) para
// que el usuario nunca vea el fallo de arranque en frío (dueño, 11-jul).
export const maxDuration = 60;

const requestSchema = z.object({
  redFighterId: z.number().int().positive(),
  blueFighterId: z.number().int().positive(),
});

type RawPrediction = Omit<PredictionResponse, "explanation" | "explanationSource">;

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
  // (~50s); ese mismo intento ya ha despertado el servicio, así que el 2º
  // responde en caliente. 20s + 1s + 25s ≈ 46s: el resto del maxDuration de 60
  // queda reservado para la explicación IA (que tiene su propio timeout corto
  // y cae al resumen local si no llega — ver prediction.ts).
  const ATTEMPT_TIMEOUTS_MS = [20_000, 25_000];
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
      return (await response.json()) as RawPrediction;
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
  predictionCache.set(key, {
    value,
    expires: Date.now() + PREDICTION_CACHE_TTL_MS,
  });
}

export async function POST(request: Request) {
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
    const explanation = await generatePredictionExplanation(prediction);
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
