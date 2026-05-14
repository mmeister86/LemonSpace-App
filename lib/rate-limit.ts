/**
 * Onboarding note:
 * Server-side Redis-backed rate limiting helpers. Keep it out of client components and fail safely when Redis is unavailable.
 */

import { createHash } from "node:crypto";

export type RateLimitPolicyName =
  | "auth:get"
  | "auth:post"
  | "pexels-video:get"
  | "ai-stream:text"
  | "ai-stream:agent";

export type RateLimitPolicy = {
  name: RateLimitPolicyName;
  limit: number;
  windowSeconds: number;
};

export type RateLimitIdentityKind = "user" | "ip";

export type RateLimitDecision = {
  allowed: boolean;
  limited: boolean;
  policyName: RateLimitPolicyName;
  limit: number;
  remaining: number;
  resetSeconds: number;
  retryAfterSeconds?: number;
  key: string;
  identityKind: RateLimitIdentityKind;
  redisError?: boolean;
  bypassed?: boolean;
  bypassReason?: "non-production" | "localhost";
};

export const RATE_LIMIT_POLICIES: Record<RateLimitPolicyName, RateLimitPolicy> = {
  "auth:get": { name: "auth:get", limit: 60, windowSeconds: 60 },
  "auth:post": { name: "auth:post", limit: 20, windowSeconds: 300 },
  "pexels-video:get": { name: "pexels-video:get", limit: 240, windowSeconds: 60 },
  "ai-stream:text": { name: "ai-stream:text", limit: 12, windowSeconds: 60 },
  "ai-stream:agent": { name: "ai-stream:agent", limit: 8, windowSeconds: 60 },
};

type RedisClient = typeof import("./redis")["redis"];

async function getRedisClient(): Promise<RedisClient> {
  return (await import("./redis")).redis;
}

function hashIdentity(value: string): string {
  return createHash("sha256").update(value).digest("hex").slice(0, 32);
}

function getRequestHost(request: Request): string {
  const hostHeader = request.headers.get("host")?.trim();
  if (hostHeader) return hostHeader;

  try {
    return new URL(request.url).host;
  } catch {
    return "";
  }
}

function getRequestHostname(request: Request): string {
  try {
    return new URL(request.url).hostname.toLowerCase().replace(/^\[|\]$/g, "");
  } catch {
    return getRequestHost(request).replace(/^\[|\]$/g, "").split(":")[0]?.toLowerCase() ?? "";
  }
}

function isLocalhostRequest(request: Request): boolean {
  const hostname = getRequestHostname(request);
  return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1";
}

export function getClientSource(request: Request): string {
  const cloudflareIp = request.headers.get("cf-connecting-ip")?.trim();
  if (cloudflareIp) return cloudflareIp;

  const forwardedFor = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  if (forwardedFor) return forwardedFor;

  return request.headers.get("x-real-ip")?.trim() || "unknown";
}

export function getRateLimitKey(args: {
  policy: RateLimitPolicy;
  request: Request;
  userId?: string | null;
}): { key: string; identityKind: RateLimitIdentityKind } {
  const userId = args.userId?.trim();
  const identityKind: RateLimitIdentityKind = userId ? "user" : "ip";
  const identity = userId || getClientSource(args.request);

  return {
    key: `rl:v1:${args.policy.name}:${identityKind}:${hashIdentity(identity)}`,
    identityKind,
  };
}

function bypassDecision(args: {
  policy: RateLimitPolicy;
  request: Request;
  userId?: string | null;
  reason: "non-production" | "localhost";
}): RateLimitDecision {
  const { key, identityKind } = getRateLimitKey(args);
  return {
    allowed: true,
    limited: false,
    policyName: args.policy.name,
    limit: args.policy.limit,
    remaining: args.policy.limit,
    resetSeconds: args.policy.windowSeconds,
    key,
    identityKind,
    bypassed: true,
    bypassReason: args.reason,
  };
}

export async function applyRateLimit(args: {
  policy: RateLimitPolicy;
  request: Request;
  userId?: string | null;
}): Promise<RateLimitDecision> {
  if (process.env.NODE_ENV !== "production") {
    return bypassDecision({ ...args, reason: "non-production" });
  }

  if (isLocalhostRequest(args.request)) {
    return bypassDecision({ ...args, reason: "localhost" });
  }

  const { key, identityKind } = getRateLimitKey(args);

  try {
    const redis = await getRedisClient();
    const count = await redis.incr(key);
    if (count === 1) {
      await redis.expire(key, args.policy.windowSeconds);
    }

    const ttl = await redis.ttl(key);
    const resetSeconds = ttl > 0 ? ttl : args.policy.windowSeconds;
    const remaining = Math.max(0, args.policy.limit - count);
    const limited = count > args.policy.limit;

    return {
      allowed: !limited,
      limited,
      policyName: args.policy.name,
      limit: args.policy.limit,
      remaining,
      resetSeconds,
      retryAfterSeconds: limited ? resetSeconds : undefined,
      key,
      identityKind,
    };
  } catch {
    console.warn("[RateLimit] Redis unavailable; allowing request", {
      policy: args.policy.name,
    });

    return {
      allowed: true,
      limited: false,
      policyName: args.policy.name,
      limit: args.policy.limit,
      remaining: args.policy.limit,
      resetSeconds: args.policy.windowSeconds,
      key,
      identityKind,
      redisError: true,
    };
  }
}

export function rateLimitResponse(decision: RateLimitDecision): Response {
  return new Response("Too many requests", {
    status: 429,
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Retry-After": String(decision.retryAfterSeconds ?? decision.resetSeconds),
      "X-RateLimit-Limit": String(decision.limit),
      "X-RateLimit-Remaining": String(decision.remaining),
    },
  });
}

export async function rateLimit(
  key: string,
  limit: number,
  windowSeconds: number
): Promise<{ success: boolean; remaining: number }> {
  const redis = await getRedisClient();
  const count = await redis.incr(key);
  if (count === 1) {
    await redis.expire(key, windowSeconds);
  }
  return {
    success: count <= limit,
    remaining: Math.max(0, limit - count),
  };
}
