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
    ],
  },
  turbopack: {
    // Portable project root: resolves to this repo's directory both locally and
    // on Vercel (Linux). Avoids hardcoding a machine-specific absolute path.
    root: fileURLToPath(new URL(".", import.meta.url)),
  },
  // Apply the security headers to every route.
  async headers() {
    // CSP estricta en producción; en desarrollo se relaja para el HMR de Turbopack.
    const isDev = process.env.NODE_ENV !== "production";
    return [
      {
        source: "/(.*)",
        headers: buildSecurityHeaders(isDev),
      },
    ];
  },
};

export default nextConfig;
