import { createAuthClient } from "better-auth/react";
import { convexClient } from "@convex-dev/better-auth/client/plugins";
import { polarClient } from "@polar-sh/better-auth/client";

// Next.js: kein crossDomainClient nötig (same-origin via API Route Proxy)
export const authClient = createAuthClient({
  plugins: [convexClient(), polarClient()],
});
