import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,

  experimental: {
    serverActions: {
      bodySizeLimit: "8mb",
    },
  },

  serverExternalPackages: ["pdf-parse", "@napi-rs/canvas"],

  eslint: {
    ignoreDuringBuilds: true,
  },
};

export default nextConfig;
