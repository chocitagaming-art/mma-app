import { z } from "zod";

// Helpers PUROS de seguridad para el endpoint del Maestro.
// Sin dependencias de Next ni de la BD: todo es testeable de forma aislada.

// --- 1) Validación de origen (anti-CSRF / hotlinking) -----------------------

const LOOPBACK_HOSTNAMES = new Set(["localhost", "127.0.0.1", "[::1]", "::1"]);

/**
 * Acepta la petición si el Origin (o Referer) apunta al mismo host que sirve la
 * app. En desarrollo se permite cualquier loopback (localhost / 127.0.0.1).
 * Un Origin ausente o no parseable se rechaza: las peticiones legítimas del
 * navegador siempre lo envían en un fetch POST con JSON.
 *
 * Nota: esto solo protege frente a navegadores (CSRF); un cliente no-navegador
 * puede forjar cabeceras. El rate-limit y la validación de entrada cubren el resto.
 */
export function isAllowedOrigin(
  originHeader: string | null | undefined,
  hostHeader: string | null | undefined,
  allowLoopback: boolean = true,
): boolean {
  if (!originHeader) return false;

  let url: URL;
  try {
    url = new URL(originHeader);
  } catch {
    return false;
  }

  const hostname = url.hostname.toLowerCase();
  // En producción no aceptamos loopback como origen (un navegador real nunca lo
  // tiene); en desarrollo sí, para poder probar en localhost.
  if (allowLoopback && LOOPBACK_HOSTNAMES.has(hostname)) return true;

  if (!hostHeader) return false;
  return url.host.toLowerCase() === hostHeader.toLowerCase();
}

/**
 * Extrae la IP del cliente de las cabeceras de proxy.
 *
 * Importante (anti-spoofing): en Vercel, `x-real-ip` lo fija la plataforma con
 * la IP real de la conexión y el cliente no puede sobreescribirlo, así que es
 * la fuente de confianza preferida. `x-forwarded-for` puede llevar valores
 * ANTEPUESTOS por el cliente; por eso NO usamos el primero. Como fallback
 * (entornos sin `x-real-ip`) tomamos el último salto, que es el añadido por el
 * proxy de confianza más cercano.
 */
export function clientIpFromHeaders(headers: Headers): string {
  const realIp = headers.get("x-real-ip");
  if (realIp?.trim()) return realIp.trim();

  const forwarded = headers.get("x-forwarded-for");
  if (forwarded) {
    const parts = forwarded
      .split(",")
      .map((p) => p.trim())
      .filter(Boolean);
    if (parts.length > 0) return parts[parts.length - 1];
  }
  return "unknown";
}

// --- 2) Rate-limit en memoria (ventana deslizante, best-effort) -------------

type RateLimitRule = { limit: number; windowMs: number };

// Ráfaga corta + cuota sostenida. Si se supera CUALQUIERA, se bloquea.
const RATE_LIMIT_RULES: readonly RateLimitRule[] = [
  { limit: 20, windowMs: 60_000 },
  { limit: 5, windowMs: 10_000 },
];

const MAX_WINDOW_MS = Math.max(...RATE_LIMIT_RULES.map((r) => r.windowMs));

/**
 * Store por defecto compartido a nivel de módulo.
 *
 * BEST-EFFORT: en serverless (Vercel) cada instancia tiene su propia memoria,
 * así que este contador NO se comparte entre instancias ni sobrevive a un cold
 * start. Para un rate-limit robusto en producción se usaría Vercel KV / Upstash
 * Redis. Aquí mitiga abuso/denial-of-wallet en el caso común (misma instancia).
 */
const defaultStore = new Map<string, number[]>();

// Límite de claves vivas en memoria. Al superarlo, barremos las muertas (IPs
// cuya ventana ya expiró) para acotar el crecimiento ante IPs rotatorias.
const MAX_STORE_KEYS = 10_000;

export type RateLimitResult = { allowed: boolean; retryAfter: number };

/** Elimina del store las claves cuya ventana ya expiró (libera memoria). */
export function sweepRateLimitStore(
  now: number = Date.now(),
  store: Map<string, number[]> = defaultStore,
): void {
  for (const [k, times] of store) {
    if (times.length === 0 || now - times[times.length - 1] >= MAX_WINDOW_MS) {
      store.delete(k);
    }
  }
}

/**
 * Ventana deslizante por clave (p.ej. IP). El store es inyectable para tests.
 * Devuelve `retryAfter` en segundos cuando bloquea.
 */
export function rateLimit(
  key: string,
  now: number = Date.now(),
  store: Map<string, number[]> = defaultStore,
): RateLimitResult {
  // Barrido de claves muertas si el store crece demasiado (anti memory-leak).
  if (store.size > MAX_STORE_KEYS) sweepRateLimitStore(now, store);

  const recent = (store.get(key) ?? []).filter((t) => now - t < MAX_WINDOW_MS);

  for (const rule of RATE_LIMIT_RULES) {
    const inWindow = recent.filter((t) => now - t < rule.windowMs);
    if (inWindow.length >= rule.limit) {
      const oldest = Math.min(...inWindow);
      const retryAfter = Math.ceil((rule.windowMs - (now - oldest)) / 1000);
      // No registramos la petición bloqueada: así no extiende la ventana.
      store.set(key, recent);
      return { allowed: false, retryAfter: Math.max(1, retryAfter) };
    }
  }

  recent.push(now);
  store.set(key, recent);
  return { allowed: true, retryAfter: 0 };
}

/** Limpia el store por defecto (solo para tests). */
export function _resetRateLimitStore(): void {
  defaultStore.clear();
}

// --- 3) Validación / sanitización de entrada --------------------------------

export const MAX_MESSAGE_LENGTH = 2000;
export const MAX_HISTORY_TURNS = 16;
export const MAX_TOTAL_CHARS = 12_000;

// Solo se aceptan turnos de usuario/asistente. El rol "system" NUNCA viene del
// cliente: el system prompt lo fija siempre el servidor (anti prompt-injection).
const messageSchema = z.object({
  role: z.enum(["user", "assistant"]),
  content: z.string().trim().min(1).max(MAX_MESSAGE_LENGTH),
});

export const chatRequestSchema = z
  .object({
    messages: z.array(messageSchema).min(1).max(MAX_HISTORY_TURNS),
  })
  .strict()
  .superRefine((data, ctx) => {
    const total = data.messages.reduce((sum, m) => sum + m.content.length, 0);
    if (total > MAX_TOTAL_CHARS) {
      ctx.addIssue({ code: "custom", message: "El historial es demasiado largo." });
    }
    if (data.messages[data.messages.length - 1]?.role !== "user") {
      ctx.addIssue({ code: "custom", message: "El último mensaje debe ser del usuario." });
    }
  });

export type ChatRequest = z.infer<typeof chatRequestSchema>;

// --- 4) Normalización del historial para la API de Anthropic ----------------

/**
 * Anthropic exige que el primer turno sea de rol "user". Tras recortar la
 * ventana del historial puede quedar un turno "assistant" al principio; lo
 * descartamos para no provocar un 400. El schema garantiza que el último turno
 * es "user", así que el resultado nunca queda vacío.
 */
export function normalizeConversation<T extends { role: "user" | "assistant" }>(
  messages: T[],
): T[] {
  let start = 0;
  while (start < messages.length && messages[start].role !== "user") start++;
  return messages.slice(start);
}
