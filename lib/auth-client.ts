import { createAuthClient } from "better-auth/react";
import { convexClient } from "@convex-dev/better-auth/client/plugins";

// Next.js: kein crossDomainClient nötig (same-origin via API Route Proxy)
export const authClient = createAuthClient({
  plugins: [convexClient()],
});
