import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,

  experimental: {
    serverActions: {},
  },

  serverExternalPackages: [
    "pdf-parse",
    "@napi-rs/canvas",
  ],

  eslint: {
    ignoreDuringBuilds: true,
  },
};

export default nextConfig;