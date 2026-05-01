/**
 * Onboarding note:
 * Next.js route handler for route. Keep secrets server-side and preserve the request/response contract expected by the client.
 */

import { handler } from "@/lib/auth-server";

export const { GET, POST } = handler;
