import type { AuthConfig } from "convex/server";

const issuer = (process.env.CONVEX_SITE_URL ?? process.env.SITE_URL ?? "").replace(/\/$/, "");

if (!issuer) {
  throw new Error(
    "Missing CONVEX_SITE_URL (or SITE_URL) for Better Auth JWT issuer in convex/auth.config.ts",
  );
}

export default {
  providers: [
    {
      type: "customJwt",
      issuer,
      applicationID: "convex",
      algorithm: "RS256",
      jwks: `${issuer}/api/auth/convex/jwks`,
    },
  ],
} satisfies AuthConfig;
