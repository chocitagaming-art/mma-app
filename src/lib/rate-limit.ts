import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";

import {
  rateLimit as inMemoryRateLimit,
  type RateLimitResult,
} from "@/lib/maestro/security";

// Rate-limit DISTRIBUIDO con fallback en memoria.
//
// Si están UPSTASH_REDIS_REST_URL + UPSTASH_REDIS_REST_TOKEN, el contador vive en
// Redis y se comparte entre TODAS las lambdas de Vercel → el límite es efectivo
// aunque el tráfico se reparta entre instancias (que es justo lo que rompía el
// limitador en memoria al escalar). Si NO están, se cae al limitador en memoria
// (best-effort, por instancia): mismo comportamiento que antes, así que el código
// funciona sin credenciales y se "activa" solo al añadirlas + redeploy.
//
// Reglas (idénticas al limitador en memoria): ráfaga 5/10s + sostenido 20/60s.
// Se bloquea si CUALQUIERA se supera.

type Limiters = { burst: Ratelimit; sustained: Ratelimit };

// Singleton perezoso por instancia. `undefined` = sin comprobar; `null` = sin
// config (usar fallback); objeto = Upstash activo.
let limiters: Limiters | null | undefined;

function getLimiters(): Limiters | null {
  if (limiters !== undefined) return limiters;

  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) {
    limiters = null;
    return null;
  }

  const redis = new Redis({ url, token });
  // ephemeralCache: recuerda en memoria los identificadores ya bloqueados para no
  // pegar a Redis en cada request de un abusador (ahorra llamadas/coste).
  const ephemeralCache = new Map<string, number>();
  limiters = {
    burst: new Ratelimit({
      redis,
      limiter: Ratelimit.slidingWindow(5, "10 s"),
      prefix: "rl:burst",
      ephemeralCache,
      analytics: false,
    }),
    sustained: new Ratelimit({
      redis,
      limiter: Ratelimit.slidingWindow(20, "60 s"),
      prefix: "rl:sustained",
      ephemeralCache,
      analytics: false,
    }),
  };
  return limiters;
}

// Combina los resultados de los limitadores: bloquea si alguno falla y calcula el
// retryAfter (segundos, redondeo arriba, mínimo 1). Pura y exportada para tests.
export function combineLimitResults(
  results: readonly { success: boolean; reset: number }[],
  now: number,
): RateLimitResult {
  const failed = results.filter((r) => !r.success);
  if (failed.length === 0) return { allowed: true, retryAfter: 0 };
  const reset = Math.max(...failed.map((r) => r.reset));
  return {
    allowed: false,
    retryAfter: Math.max(1, Math.ceil((reset - now) / 1000)),
  };
}

// True si el rate-limit distribuido (Upstash) está activo (para health/logs).
export function isDistributedRateLimitEnabled(): boolean {
  return getLimiters() !== null;
}

// Punto de entrada único para los endpoints (Maestro, predict). Async.
export async function checkRateLimit(key: string): Promise<RateLimitResult> {
  const l = getLimiters();
  if (!l) {
    // Sin Redis: fallback en memoria (best-effort, por instancia).
    return inMemoryRateLimit(key);
  }
  try {
    const [burst, sustained] = await Promise.all([
      l.burst.limit(key),
      l.sustained.limit(key),
    ]);
    return combineLimitResults([burst, sustained], Date.now());
  } catch {
    // Si Redis falla (red/caído), NO castigamos al usuario legítimo: caemos al
    // limitador en memoria (fail-open hacia el best-effort, no hacia "sin límite").
    return inMemoryRateLimit(key);
  }
}
