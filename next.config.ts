import type { NextConfig } from "next";
import { fileURLToPath } from "node:url";

const nextConfig: NextConfig = {
  serverExternalPackages: ["@anthropic-ai/sdk"],
  images: {
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
};

export default nextConfig;
