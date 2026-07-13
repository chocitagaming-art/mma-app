// Cabeceras de seguridad de la app. Módulo puro (sin Next ni DOM) para poder
// testearlo con vitest. Hay DOS piezas:
//
//  1. buildSecurityHeaders(): cabeceras estáticas (HSTS, nosniff, …) que NO cambian
//     por petición. Se aplican globalmente desde next.config.ts a TODA respuesta.
//  2. buildContentSecurityPolicy({ nonce }): la CSP, que SÍ cambia por petición
//     (lleva un nonce único). La fija el proxy (src/proxy.ts), NO next.config, para
//     que cada documento reciba su propio nonce. Definir la CSP en los dos sitios
//     mandaría dos cabeceras Content-Security-Policy en conflicto.

export type SecurityHeader = { key: string; value: string };

// La CSP se define como un mapa directiva -> fuentes y se serializa al final, para
// que sea legible y auditable. Cada directiva va comentada con por qué existe.
type CspOptions = {
  // Nonce único de la petición (lo genera el proxy). Solo los scripts que lo lleven
  // se ejecutan; un <script> inyectado (XSS) no lo tiene y el navegador lo bloquea.
  nonce: string;
  // En desarrollo se relaja lo justo para el HMR de Turbopack (eval + WebSocket).
  isDev?: boolean;
};

function cspDirectives({ nonce, isDev = false }: CspOptions): Record<string, string[]> {
  return {
    // Fallback: cualquier recurso no cubierto por una directiva específica solo
    // puede cargarse desde el propio origen.
    "default-src": ["'self'"],
    // Endurecido con nonce + 'strict-dynamic': en navegadores modernos 'strict-dynamic'
    // ignora 'self' y las listas de hosts y confía SOLO en los scripts con nonce y en
    // los que estos carguen (los chunks de Next). Ya NO hay 'unsafe-inline': un script
    // inline inyectado sin el nonce queda bloqueado. 'self' se conserva como fallback
    // para navegadores antiguos que no entienden 'strict-dynamic'. 'unsafe-eval' solo
    // en dev (React usa eval para mejores trazas de error; en producción no hace falta).
    "script-src": [
      "'self'",
      `'nonce-${nonce}'`,
      "'strict-dynamic'",
      ...(isDev ? ["'unsafe-eval'"] : []),
    ],
    // style-src MANTIENE 'unsafe-inline' a propósito: Tailwind v4, recharts y next/image
    // (modo fill) aplican estilos vía atributo style="" inline, que un nonce NO puede
    // cubrir (el nonce solo vale para <style>/<script>, no para atributos). Los estilos
    // no ejecutan JavaScript, así que el vector XSS real queda cerrado por script-src.
    "style-src": ["'self'", "'unsafe-inline'"],
    // 'self' = imágenes locales. data: = placeholders/blur. https: = posters y headshots
    // de CDNs de terceros arbitrarios (a.espncdn.com, ufc.com, *.ytimg.com, sherdog,
    // tile.openstreetmap.org, upload.wikimedia.org, …) que no se pueden enumerar.
    "img-src": ["'self'", "data:", "https:"],
    // Fuentes locales (next/font las auto-hospeda); data: por si alguna se inlinea.
    "font-src": ["'self'", "data:"],
    // Las llamadas del cliente van solo a nuestras propias rutas /api. En dev, el HMR
    // de Turbopack usa un WebSocket.
    "connect-src": ["'self'", ...(isDev ? ["ws:", "wss:"] : [])],
    // Único embed de terceros: los reproductores de YouTube del componente yt-lite.
    "frame-src": ["https://www.youtube.com", "https://www.youtube-nocookie.com"],
    // No usamos <object>/<embed>/<applet>.
    "object-src": ["'none'"],
    // Evita que un <base> inyectado reescriba las URLs relativas.
    "base-uri": ["'self'"],
    // Los formularios solo pueden enviarse a nuestro propio origen. NO hereda de
    // default-src (es una directiva de navegación), así que hay que declararla: sin
    // ella, un <form action="https://atacante"> inyectado podría exfiltrar datos por
    // submit nativo aunque 'strict-dynamic' bloquee la EJECUCIÓN de scripts. Los forms
    // reales de la app usan onSubmit+fetch al mismo origen, así que no rompe nada.
    "form-action": ["'self'"],
    // Equivalente moderno de X-Frame-Options: solo nuestro origen puede enmarcarnos.
    "frame-ancestors": ["'self'"],
  };
}

/**
 * Serializa la CSP a string. Requiere el `nonce` de la petición (lo genera el proxy).
 */
export function buildContentSecurityPolicy(options: CspOptions): string {
  return Object.entries(cspDirectives(options))
    .map(([directive, sources]) => `${directive} ${sources.join(" ")}`)
    .join("; ");
}

/**
 * Cabeceras de seguridad ESTÁTICAS (sin CSP), aplicadas globalmente desde
 * next.config.ts. La CSP se emite aparte en el proxy porque lleva nonce por petición.
 */
export function buildSecurityHeaders(): SecurityHeader[] {
  return [
    // Fuerza HTTPS durante 2 años en este dominio y subdominios; 'preload' lo habilita
    // para la lista de precarga HSTS de los navegadores.
    {
      key: "Strict-Transport-Security",
      value: "max-age=63072000; includeSubDomains; preload",
    },
    // Impide el MIME sniffing del navegador.
    { key: "X-Content-Type-Options", value: "nosniff" },
    // Anti-clickjacking para navegadores antiguos (frame-ancestors lo cubre en los
    // modernos).
    { key: "X-Frame-Options", value: "SAMEORIGIN" },
    // Envía el origen al navegar a otros sitios solo en HTTPS->HTTPS.
    { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
    // Deshabilita APIs sensibles que la app no usa.
    {
      key: "Permissions-Policy",
      value: "camera=(), microphone=(), geolocation=()",
    },
  ];
}

// Cabeceras estáticas de producción (compat con consumidores/tests que las importan).
export const securityHeaders: SecurityHeader[] = buildSecurityHeaders();
