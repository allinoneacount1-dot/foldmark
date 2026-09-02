import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    optimizePackageImports: ["viem", "wagmi"],
  },
};

export default nextConfig;
