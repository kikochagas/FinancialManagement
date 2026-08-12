import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // Ensure server actions are enabled
  experimental: {
    serverActions: {},
  },
};

export default nextConfig;
