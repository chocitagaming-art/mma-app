import type { NextConfig } from "next";
import { fileURLToPath } from "node:url";

import { buildSecurityHeaders } from "./src/lib/security-headers";

const nextConfig: NextConfig = {
  serverExternalPackages: ["@anthropic-ai/sdk"],
  images: {
    // Servimos las imágenes SIN pasar por el optimizador de Vercel (/_next/image).
    // Con ~1.000+ fotos externas (ufc.com/espn) el plan Hobby agota su cuota de
    // Image Optimization y /_next/image devuelve 402 → las fotos aún no cacheadas
    // caen a iniciales. `unoptimized` sirve el src directo (ufc.com responde 200;
    // la CSP ya permite img-src https:). `remotePatterns` se conserva por si algún
    // día se reactiva la optimización (p.ej. tras subir de plan).
    unoptimized: true,
    remotePatterns: [
      {
        protocol: "https",
        hostname: "a.espncdn.com",
      },
      {
        protocol: "https",
        hostname: "ufc.com",
      },
      {
        protocol: "https",
        hostname: "www.ufc.com",
      },
      // Miniaturas de YouTube (Data API + RSS) para la columna/página de vídeos.
      {
        protocol: "https",
        hostname: "i.ytimg.com",
      },
      {
        protocol: "https",
        hostname: "*.ytimg.com",
      },
      // Avatares de canal de YouTube (channels.list) para el directorio de vídeos.
      {
        protocol: "https",
        hostname: "yt3.ggpht.com",
      },
    ],
  },
  turbopack: {
    // Portable project root: resolves to this repo's directory both locally and
    // on Vercel (Linux). Avoids hardcoding a machine-specific absolute path.
    root: fileURLToPath(new URL(".", import.meta.url)),
  },
  // T3-B: /news se fusionó en /tendencias. Redirección aquí (edge, 308 REAL
  // para SEO) y no con permanentRedirect en una page: en esta versión de Next
  // el redirect de página en un GET de documento llega como 200 + redirección
  // en cliente. Los query params antiguos (?category, ?page) se PASAN solos al
  // destino y la página de Tendencias los acepta como alias legados.
  async redirects() {
    return [
      {
        source: "/news",
        destination: "/tendencias?tipo=noticias",
        permanent: true,
      },
    ];
  },
  // Cabeceras de seguridad ESTÁTICAS (HSTS, nosniff, …) a toda respuesta. La CSP NO
  // va aquí: la emite src/proxy.ts porque lleva un nonce único por petición (definirla
  // también aquí mandaría dos cabeceras Content-Security-Policy en conflicto).
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: buildSecurityHeaders(),
      },
    ];
  },
};

export default nextConfig;
