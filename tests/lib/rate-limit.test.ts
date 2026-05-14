import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  RATE_LIMIT_POLICIES,
  applyRateLimit,
  getClientSource,
  getRateLimitKey,
  rateLimitResponse,
} from "@/lib/rate-limit";

const redisMocks = vi.hoisted(() => ({
  incr: vi.fn<() => Promise<number>>(),
  expire: vi.fn<() => Promise<number>>(),
  ttl: vi.fn<() => Promise<number>>(),
}));

vi.mock("@/lib/redis", () => ({
  redis: {
    incr: redisMocks.incr,
    expire: redisMocks.expire,
    ttl: redisMocks.ttl,
  },
}));

function requestWithHeaders(headers: Record<string, string>, url = "https://app.lemonspace.io/api/test") {
  return new Request(url, { headers });
}

describe("Redis rate limiting", () => {
  const originalNodeEnv = process.env.NODE_ENV;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv("NODE_ENV", "production");
    redisMocks.expire.mockResolvedValue(1);
    redisMocks.ttl.mockResolvedValue(42);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    process.env.NODE_ENV = originalNodeEnv;
  });

  it("allows requests under the policy limit and reports remaining quota", async () => {
    redisMocks.incr.mockResolvedValue(3);

    const decision = await applyRateLimit({
      policy: RATE_LIMIT_POLICIES["auth:get"],
      request: requestWithHeaders({ "x-forwarded-for": "203.0.113.10" }),
    });

    expect(decision).toMatchObject({
      allowed: true,
      limited: false,
      limit: 60,
      remaining: 57,
      resetSeconds: 42,
      key: expect.stringMatching(/^rl:v1:auth:get:ip:/),
    });
    expect(redisMocks.expire).not.toHaveBeenCalled();
  });

  it("sets the window expiry for the first hit", async () => {
    redisMocks.incr.mockResolvedValue(1);

    await applyRateLimit({
      policy: RATE_LIMIT_POLICIES["ai-stream:text"],
      request: requestWithHeaders({ "x-forwarded-for": "203.0.113.11" }),
      userId: "user-1",
    });

    expect(redisMocks.expire).toHaveBeenCalledWith(expect.stringContaining("rl:v1:ai-stream:text:user:"), 60);
  });

  it("rejects requests over the policy limit with retry metadata", async () => {
    redisMocks.incr.mockResolvedValue(21);
    redisMocks.ttl.mockResolvedValue(180);

    const decision = await applyRateLimit({
      policy: RATE_LIMIT_POLICIES["auth:post"],
      request: requestWithHeaders({ "cf-connecting-ip": "203.0.113.12" }),
    });

    expect(decision).toMatchObject({
      allowed: false,
      limited: true,
      limit: 20,
      remaining: 0,
      retryAfterSeconds: 180,
      resetSeconds: 180,
    });
  });

  it("prefers authenticated user identity over client source", () => {
    const key = getRateLimitKey({
      policy: RATE_LIMIT_POLICIES["ai-stream:agent"],
      request: requestWithHeaders({ "x-forwarded-for": "203.0.113.13" }),
      userId: "user-123",
    });

    expect(key.identityKind).toBe("user");
    expect(key.key).toMatch(/^rl:v1:ai-stream:agent:user:/);
    expect(key.key).not.toContain("user-123");
  });

  it("falls back to stable client source when unauthenticated", () => {
    const request = requestWithHeaders({ "x-forwarded-for": "203.0.113.14, 198.51.100.20" });
    const first = getRateLimitKey({ policy: RATE_LIMIT_POLICIES["auth:get"], request });
    const second = getRateLimitKey({ policy: RATE_LIMIT_POLICIES["auth:get"], request });

    expect(first.identityKind).toBe("ip");
    expect(first.key).toBe(second.key);
    expect(first.key).toMatch(/^rl:v1:auth:get:ip:/);
    expect(first.key).not.toContain("203.0.113.14");
  });

  it("uses client source header precedence", () => {
    expect(
      getClientSource(
        requestWithHeaders({
          "cf-connecting-ip": "203.0.113.20",
          "x-forwarded-for": "198.51.100.21",
          "x-real-ip": "192.0.2.22",
        }),
      ),
    ).toBe("203.0.113.20");

    expect(
      getClientSource(
        requestWithHeaders({
          "x-forwarded-for": "198.51.100.21, 192.0.2.22",
          "x-real-ip": "192.0.2.22",
        }),
      ),
    ).toBe("198.51.100.21");

    expect(getClientSource(requestWithHeaders({ "x-real-ip": "192.0.2.22" }))).toBe("192.0.2.22");
  });

  it("fails open when Redis throws and logs without leaking internals", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    redisMocks.incr.mockRejectedValue(new Error("redis password=secret timeout"));

    const decision = await applyRateLimit({
      policy: RATE_LIMIT_POLICIES["pexels-video:get"],
      request: requestWithHeaders({ "x-forwarded-for": "203.0.113.15" }),
    });

    expect(decision).toMatchObject({
      allowed: true,
      limited: false,
      redisError: true,
    });
    expect(warn).toHaveBeenCalledWith("[RateLimit] Redis unavailable; allowing request", {
      policy: "pexels-video:get",
    });
    expect(String(warn.mock.calls)).not.toContain("secret");
    warn.mockRestore();
  });

  it("bypasses enforcement outside production", async () => {
    vi.stubEnv("NODE_ENV", "development");

    const decision = await applyRateLimit({
      policy: RATE_LIMIT_POLICIES["auth:post"],
      request: requestWithHeaders({ "x-forwarded-for": "203.0.113.16" }),
    });

    expect(decision).toMatchObject({
      allowed: true,
      limited: false,
      bypassed: true,
      bypassReason: "non-production",
    });
    expect(redisMocks.incr).not.toHaveBeenCalled();
  });

  it("bypasses enforcement for localhost even when running a production build locally", async () => {
    const decision = await applyRateLimit({
      policy: RATE_LIMIT_POLICIES["auth:post"],
      request: requestWithHeaders({}, "http://localhost:3000/api/auth/sign-in"),
    });

    expect(decision).toMatchObject({
      allowed: true,
      limited: false,
      bypassed: true,
      bypassReason: "localhost",
    });
    expect(redisMocks.incr).not.toHaveBeenCalled();
  });

  it("bypasses enforcement for IPv6 localhost", async () => {
    const decision = await applyRateLimit({
      policy: RATE_LIMIT_POLICIES["auth:post"],
      request: requestWithHeaders({}, "http://[::1]:3000/api/auth/sign-in"),
    });

    expect(decision).toMatchObject({
      allowed: true,
      limited: false,
      bypassed: true,
      bypassReason: "localhost",
    });
    expect(redisMocks.incr).not.toHaveBeenCalled();
  });

  it("creates safe 429 responses without internal details", async () => {
    const response = rateLimitResponse({
      allowed: false,
      limited: true,
      policyName: "auth:post",
      limit: 20,
      remaining: 0,
      retryAfterSeconds: 180,
      resetSeconds: 180,
      key: "rl:v1:auth:post:ip:hidden",
      identityKind: "ip",
    });

    expect(response.status).toBe(429);
    expect(response.headers.get("Retry-After")).toBe("180");
    expect(response.headers.get("X-RateLimit-Limit")).toBe("20");
    expect(response.headers.get("X-RateLimit-Remaining")).toBe("0");
    await expect(response.text()).resolves.toBe("Too many requests");
  });
});
