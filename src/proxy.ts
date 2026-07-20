import { NextResponse, type NextRequest } from "next/server";

import { buildContentSecurityPolicy } from "@/lib/security-headers";

// Proxy (convención de Next 16; antes se llamaba "middleware"). Genera un nonce único
// por petición y fija la CSP con 'strict-dynamic'. Next lee ese nonce de la cabecera y
// lo estampa automáticamente en los <script> que emite al renderizar en servidor, de
// modo que SOLO se ejecutan los scripts propios. Un script inyectado (XSS) no lleva el
// nonce y el navegador lo bloquea.
//
// Nota: usar nonce obliga a render dinámico (cada petición genera HTML fresco con un
// nonce nuevo); por eso el layout raíz lee headers() y todo el árbol se vuelve dinámico.
export function proxy(request: NextRequest) {
  const nonce = Buffer.from(crypto.randomUUID()).toString("base64");
  const isDev = process.env.NODE_ENV !== "production";
  const csp = buildContentSecurityPolicy({ nonce, isDev });

  // El nonce viaja a Next por un request header (x-nonce). La CSP se pone en el request
  // (para que Next la lea y extraiga el nonce al renderizar) y en el response (para que
  // el navegador la aplique).
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-nonce", nonce);
  requestHeaders.set("Content-Security-Policy", csp);

  const response = NextResponse.next({ request: { headers: requestHeaders } });
  response.headers.set("Content-Security-Policy", csp);
  return response;
}

export const config = {
  matcher: [
    // Todas las rutas EXCEPTO las API, los estáticos de Next, la optimización de
    // imágenes, el favicon y las rutas de metadata (sitemap, robots, iconos, OG): no
    // son documentos, no necesitan CSP con nonce y excluirlas evita forzar a dinámico
    // robots.ts/sitemap.ts. Además se ignoran los prefetch de <Link> (cargan payloads
    // RSC, no documentos): recomendación oficial de Next para no forzar render dinámico
    // en cada prefetch.
    {
      source:
        "/((?!api|_next/static|_next/image|favicon.ico|icon.png|apple-icon.png|opengraph-image.png|sitemap.xml|robots.txt|manifest.webmanifest|sw.js).*)",
      missing: [
        { type: "header", key: "next-router-prefetch" },
        { type: "header", key: "purpose", value: "prefetch" },
      ],
    },
  ],
};
