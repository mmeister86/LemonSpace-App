/**
 * Onboarding note:
 * Shared TypeScript utility for auth client. Keep it framework-light and reusable from both frontend and Convex-adjacent code where applicable.
 */

import { createAuthClient } from "better-auth/react";
import { magicLinkClient, usernameClient } from "better-auth/client/plugins";
import { convexClient } from "@convex-dev/better-auth/client/plugins";
import { polarClient } from "@polar-sh/better-auth/client";

// Next.js: kein crossDomainClient nötig (same-origin via API Route Proxy)
export const authClient = createAuthClient({
  plugins: [magicLinkClient(), usernameClient(), convexClient(), polarClient()],
});
