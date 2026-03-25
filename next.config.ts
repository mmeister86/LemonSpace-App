import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "*.convex.cloud",
        pathname: "/**",
      },
      {
        protocol: "https",
        hostname: "api.lemonspace.io",
        pathname: "/api/storage/**",
      },
    ],
  },
};

export default nextConfig;
