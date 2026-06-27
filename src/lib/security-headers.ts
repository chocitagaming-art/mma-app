// Cabeceras de seguridad aplicadas globalmente desde next.config.ts.
// La CSP se define como un mapa directiva -> fuentes y se serializa a string al
// final, para que sea legible y auditable. Módulo puro (sin Next ni DOM) para
// poder testearlo con vitest.

// Content Security Policy. Cada directiva está comentada con por qué existe.
const cspDirectives: Record<string, string[]> = {
  // Fallback: cualquier recurso no cubierto por una directiva específica solo
  // puede cargarse desde el propio origen.
  "default-src": ["'self'"],
  // next-themes inyecta un <script> inline para fijar el tema antes de hidratar
  // (evita el flash claro/oscuro) y Next emite scripts de bootstrap inline. Sin
  // nonce no hay forma de permitirlos salvo con 'unsafe-inline'.
  "script-src": ["'self'", "'unsafe-inline'"],
  // Tailwind v4, recharts y next/image (modo fill) aplican estilos inline.
  "style-src": ["'self'", "'unsafe-inline'"],
  // 'self' = imágenes optimizadas por next/image. data: = placeholders/blur.
  // https: = posters y headshots servidos por CDNs de terceros arbitrarios
  // (a.espncdn.com, ufc.com, *.ytimg.com, sherdog, …) que se pintan con <img>
  // nativo o next/image y no se pueden enumerar de antemano.
  "img-src": ["'self'", "data:", "https:"],
  // Fuentes locales; data: por si alguna se inlinea como base64.
  "font-src": ["'self'", "data:"],
  // Las llamadas del cliente van solo a nuestras propias rutas /api.
  "connect-src": ["'self'"],
  // Único embed de terceros: los reproductores de YouTube del componente yt-lite.
  "frame-src": ["https://www.youtube.com", "https://www.youtube-nocookie.com"],
  // No usamos <object>/<embed>/<applet>.
  "object-src": ["'none'"],
  // Evita que un <base> inyectado reescriba las URLs relativas.
  "base-uri": ["'self'"],
  // Equivalente moderno de X-Frame-Options: solo nuestro origen puede enmarcarnos.
  "frame-ancestors": ["'self'"],
};

export function buildContentSecurityPolicy(
  directives: Record<string, string[]> = cspDirectives,
): string {
  return Object.entries(directives)
    .map(([directive, sources]) => `${directive} ${sources.join(" ")}`)
    .join("; ");
}

// En desarrollo, Turbopack/React Refresh evalúan código (eval) y el HMR usa un
// WebSocket; añadimos esas fuentes SOLO en dev para no llenar la consola de
// violaciones ni romper el hot-reload. En producción la CSP se mantiene estricta.
const DEV_CSP_EXTRAS: Record<string, string[]> = {
  "script-src": ["'unsafe-eval'"],
  "connect-src": ["ws:", "wss:"],
};

function cspForEnv(isDev: boolean): Record<string, string[]> {
  if (!isDev) return cspDirectives;
  const merged: Record<string, string[]> = {};
  for (const [directive, sources] of Object.entries(cspDirectives)) {
    merged[directive] = [...sources, ...(DEV_CSP_EXTRAS[directive] ?? [])];
  }
  return merged;
}

export type SecurityHeader = { key: string; value: string };

/**
 * Cabeceras de seguridad. En dev la CSP se relaja lo justo para el HMR de
 * Turbopack; en producción (isDev=false) es estricta.
 */
export function buildSecurityHeaders(isDev: boolean = false): SecurityHeader[] {
  return [
    // Fuerza HTTPS durante 2 años en este dominio y subdominios; 'preload' lo
    // habilita para la lista de precarga HSTS de los navegadores.
    {
      key: "Strict-Transport-Security",
      value: "max-age=63072000; includeSubDomains; preload",
    },
    // Impide el MIME sniffing del navegador.
    { key: "X-Content-Type-Options", value: "nosniff" },
    // Anti-clickjacking para navegadores antiguos (frame-ancestors lo cubre en
    // los modernos).
    { key: "X-Frame-Options", value: "SAMEORIGIN" },
    // Envía el origen al navegar a otros sitios solo en HTTPS->HTTPS.
    { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
    // Deshabilita APIs sensibles que la app no usa.
    {
      key: "Permissions-Policy",
      value: "camera=(), microphone=(), geolocation=()",
    },
    {
      key: "Content-Security-Policy",
      value: buildContentSecurityPolicy(cspForEnv(isDev)),
    },
  ];
}

// Cabeceras de producción (compat con consumidores/tests que las importan).
export const securityHeaders: SecurityHeader[] = buildSecurityHeaders(false);
