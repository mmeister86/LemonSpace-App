import { convexBetterAuthNextJs } from "@convex-dev/better-auth/nextjs";

import { api } from "@/convex/_generated/api";

export const {
  handler,              // Route Handler für /api/auth/*
  preloadAuthQuery,     // SSR: Query mit Auth vorladen
  isAuthenticated,      // Check ob User eingeloggt ist
  getToken,             // JWT Token abrufen
  fetchAuthQuery,       // Server-side: Convex Query mit Auth
  fetchAuthMutation,    // Server-side: Convex Mutation mit Auth
  fetchAuthAction,      // Server-side: Convex Action mit Auth
} = convexBetterAuthNextJs({
  convexUrl: process.env.NEXT_PUBLIC_CONVEX_URL!,
  convexSiteUrl: process.env.NEXT_PUBLIC_CONVEX_SITE_URL!,
  // JWT-Caching für schnellere SSR (optional, aber empfohlen)
  jwtCache: {
    enabled: true,
    isAuthError: (error) => /auth/i.test(String(error)),
  },
});

/** Aktueller User für SSR (z. B. Sentry `setUser`), oder `null`. */
export async function getAuthUser() {
  return fetchAuthQuery(api.auth.safeGetAuthUser, {});
}
