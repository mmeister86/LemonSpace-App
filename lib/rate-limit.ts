/**
 * Onboarding note:
 * Server-side Redis-backed rate limiting helpers. Keep it out of client components and fail safely when Redis is unavailable.
 */

import { redis } from "./redis";

export async function rateLimit(
  key: string,
  limit: number,
  windowSeconds: number
): Promise<{ success: boolean; remaining: number }> {
  const count = await redis.incr(key);
  if (count === 1) {
    await redis.expire(key, windowSeconds);
  }
  return {
    success: count <= limit,
    remaining: Math.max(0, limit - count),
  };
}
