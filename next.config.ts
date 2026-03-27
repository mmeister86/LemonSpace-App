import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Reduziert in der Entwicklung Strict-Mode-Doppel-Mounts (häufige Ursache für
  // „Hydration“-Lärm). Echte Server/Client-Mismatches können weiterhin auftreten;
  // dann `pnpm dev:strict` zum Debuggen oder Ursache beheben.
  reactStrictMode:
    process.env.NEXT_DEV_SUPPRESS_HYDRATION === "1" ? false : null,
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
