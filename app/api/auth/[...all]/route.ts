/**
 * Onboarding note:
 * Next.js route handler for route. Keep secrets server-side and preserve the request/response contract expected by the client.
 */

import { getAuthUser, handler } from "@/lib/auth-server";
import {
  RATE_LIMIT_POLICIES,
  applyRateLimit,
  rateLimitResponse,
} from "@/lib/rate-limit";

async function getRateLimitUserId(): Promise<string | undefined> {
  try {
    const user = await getAuthUser();
    return user?.userId ?? user?._id;
  } catch {
    return undefined;
  }
}

export async function GET(request: Request): Promise<Response> {
  const decision = await applyRateLimit({
    policy: RATE_LIMIT_POLICIES["auth:get"],
    request,
    userId: await getRateLimitUserId(),
  });
  if (!decision.allowed) {
    return rateLimitResponse(decision);
  }

  return handler.GET(request);
}

export async function POST(request: Request): Promise<Response> {
  const decision = await applyRateLimit({
    policy: RATE_LIMIT_POLICIES["auth:post"],
    request,
    userId: await getRateLimitUserId(),
  });
  if (!decision.allowed) {
    return rateLimitResponse(decision);
  }

  return handler.POST(request);
}
