import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["@anthropic-ai/sdk"],
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "a.espncdn.com",
        pathname: "/i/headshots/**",
      },
    ],
  },
  turbopack: {
    root: "C:/Users/gpico/Projects/mma-app",
  },
};

export default nextConfig;
