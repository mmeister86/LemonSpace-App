import { afterEach, describe, expect, it, vi } from "vitest";

describe("rate limit development imports", () => {
  const originalNodeEnv = process.env.NODE_ENV;

  afterEach(() => {
    vi.resetModules();
    vi.doUnmock("@/lib/redis");
    vi.unstubAllEnvs();
    process.env.NODE_ENV = originalNodeEnv;
  });

  it("does not import Redis when development requests are bypassed", async () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.doMock("@/lib/redis", () => {
      throw new Error("Redis should not be imported for development bypasses");
    });

    const { RATE_LIMIT_POLICIES, applyRateLimit } = await import("@/lib/rate-limit");
    const decision = await applyRateLimit({
      policy: RATE_LIMIT_POLICIES["auth:post"],
      request: new Request("http://localhost:3000/api/auth/sign-in"),
    });

    expect(decision).toMatchObject({
      allowed: true,
      limited: false,
      bypassed: true,
      bypassReason: "non-production",
    });
  });
});
