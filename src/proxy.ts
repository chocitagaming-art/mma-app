import { NextResponse, type NextRequest } from "next/server";

import { claveValidaEdge } from "@/lib/estado/clave";
import { buildContentSecurityPolicy } from "@/lib/security-headers";

// Proxy (convención de Next 16; antes se llamaba "middleware"). Genera un nonce único
// por petición y fija la CSP con 'strict-dynamic'. Next lee ese nonce de la cabecera y
// lo estampa automáticamente en los <script> que emite al renderizar en servidor, de
// modo que SOLO se ejecutan los scripts propios. Un script inyectado (XSS) no lleva el
// nonce y el navegador lo bloquea.
//
// Nota: usar nonce obliga a render dinámico (cada petición genera HTML fresco con un
// nonce nuevo); por eso el layout raíz lee headers() y todo el árbol se vuelve dinámico.
// El panel de estado (/estado) tiene que ser INVISIBLE, no solo inaccesible.
//
// El primer intento fue llamar a `notFound()` dentro de la página, y NO bastaba:
// en esta versión de Next eso devuelve HTTP 200 con la página de "no
// encontrado", mientras que una URL que de verdad no existe devuelve 404. Basta
// comparar los dos códigos para descubrir que /estado existe — que es
// exactamente lo que había que evitar. Se vio probándolo, no leyéndolo.
//
// Aquí, en cambio, se reescribe a una ruta inexistente: Next sirve su 404 de
// verdad, con el mismo cuerpo y el mismo código que cualquier URL inventada.
// Indistinguible.
//
// Y por eso /estado NO va en robots.txt: el robots es público, así que un
// `Disallow: /estado` sería un cartel anunciando la ruta.
// EL PANEL SON DOS RUTAS, y hasta el 2-ago solo se escondía una. La página
// `/estado` era indistinguible de una URL inventada, pero su hermana
// `/api/estado` —la que consume el guardián— se delataba sola con CINCO
// señales: 404 con `Content-Length: 0`, SIN `Content-Type`, con
// `X-Matched-Path: /api/estado` y sin `X-Powered-By` ni `Vary`, mientras
// cualquier `/api` inexistente devuelve el 404 HTML de ~78 KB con
// `X-Matched-Path: /_not-found`. Un escaneo de rutas encontraba el panel.
const RUTAS_DEL_PANEL = new Set(["/estado", "/api/estado"]);

function panelSinClave(request: NextRequest): boolean {
  if (!RUTAS_DEL_PANEL.has(request.nextUrl.pathname)) {
    return false;
  }
  const clave =
    request.nextUrl.searchParams.get("k") ?? request.headers.get("x-estado-key");
  // Falla cerrado: sin ESTADO_KEY configurada, el panel no existe para nadie.
  return !claveValidaEdge(clave, process.env.ESTADO_KEY);
}

export function proxy(request: NextRequest) {
  // 🪤 EL ENDPOINT SE ESCONDE DISTINTO QUE LA PÁGINA, y da lo mismo lo que
  // parezca razonable: lo que decide es CONTRA QUÉ se compara. A `/api/estado`
  // se la compara con otra ruta `/api` inventada, no con una página, así que
  // hay que devolver lo que Next devuelve para un endpoint que no existe — y
  // eso NO lleva CSP, porque el proxy no corre sobre `/api`. Ponerle la
  // cabecera aquí sería crear una señal nueva justo al tapar la vieja, que es
  // exactamente el error que se cometió con el tamaño del HTML en julio.
  if (request.nextUrl.pathname === "/api/estado" && panelSinClave(request)) {
    return NextResponse.rewrite(new URL("/api/_ruta-que-no-existe", request.url));
  }

  const nonce = Buffer.from(crypto.randomUUID()).toString("base64");
  const isDev = process.env.NODE_ENV !== "production";
  const csp = buildContentSecurityPolicy({ nonce, isDev });

  // El nonce viaja a Next por un request header (x-nonce). La CSP se pone en el request
  // (para que Next la lea y extraiga el nonce al renderizar) y en el response (para que
  // el navegador la aplique).
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-nonce", nonce);
  requestHeaders.set("Content-Security-Policy", csp);

  // El 404 falso del panel se genera AQUÍ, con el mismo nonce y la misma CSP
  // que cualquier otra página. Devolverlo antes (que fue el primer intento)
  // producía un HTML sin los atributos `nonce`, y eso son 2,5 KB menos de
  // respuesta: /estado medía 78 KB y cualquier ruta inexistente 80,6 KB, de
  // forma constante. La ruta quedaba delatada por el tamaño aunque el código y
  // el cuerpo fueran los mismos. Se vio midiéndolo, no razonándolo.
  const response = panelSinClave(request)
    ? NextResponse.rewrite(new URL("/_ruta-que-no-existe", request.url), {
        request: { headers: requestHeaders },
      })
    : NextResponse.next({ request: { headers: requestHeaders } });
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
    // `/api/estado` entra a proposito, y SOLO ella: es la unica ruta de API que
    // el proxy tiene que poder reescribir para esconderla. El resto de `/api`
    // sigue fuera (no son documentos y no necesitan CSP con nonce).
    "/api/estado",
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
