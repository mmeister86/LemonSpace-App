import { beforeEach, describe, expect, it, vi } from "vitest";

const rateLimitDecision = vi.fn();
const authHandlerGet = vi.fn();
const authHandlerPost = vi.fn();
const fetchAuthAction = vi.fn();
const streamText = vi.fn();

vi.mock("@/lib/rate-limit", () => {
  return {
    RATE_LIMIT_POLICIES: {
      "auth:get": { name: "auth:get", limit: 60, windowSeconds: 60 },
      "auth:post": { name: "auth:post", limit: 20, windowSeconds: 300 },
      "pexels-video:get": { name: "pexels-video:get", limit: 240, windowSeconds: 60 },
      "ai-stream:text": { name: "ai-stream:text", limit: 12, windowSeconds: 60 },
      "ai-stream:agent": { name: "ai-stream:agent", limit: 8, windowSeconds: 60 },
    },
    applyRateLimit: rateLimitDecision,
    rateLimitResponse: (decision: { retryAfterSeconds?: number; resetSeconds: number; limit: number; remaining: number }) =>
      new Response("Too many requests", {
        status: 429,
        headers: {
          "Retry-After": String(decision.retryAfterSeconds ?? decision.resetSeconds),
          "X-RateLimit-Limit": String(decision.limit),
          "X-RateLimit-Remaining": String(decision.remaining),
        },
      }),
  };
});

vi.mock("@/lib/auth-server", () => ({
  handler: {
    GET: authHandlerGet,
    POST: authHandlerPost,
  },
  fetchAuthAction,
  getAuthUser: vi.fn().mockResolvedValue({ _id: "convex-user-1", userId: "user-1" }),
}));

vi.mock("@/convex/_generated/api", () => ({
  api: {
    ai: {
      prepareTextStream: "ai.prepareTextStream",
      finalizeTextStreamFailure: "ai.finalizeTextStreamFailure",
      finalizeTextStreamSuccess: "ai.finalizeTextStreamSuccess",
    },
    agents: {
      prepareAgentStream: "agents.prepareAgentStream",
      finalizeAgentStreamSummary: "agents.finalizeAgentStreamSummary",
    },
  },
}));

vi.mock("@/lib/ai-stream/openrouter-provider", () => ({
  getOpenRouterModel: vi.fn((modelId: string) => ({ modelId })),
}));

vi.mock("@/lib/ai-stream/text-messages", () => ({
  buildAiTextStreamMessages: vi.fn(() => [
    { role: "system", content: "Text stream system rule" },
    { role: "user", content: "hello" },
  ]),
}));

vi.mock("@/lib/ai-text-models", () => ({
  DEFAULT_AI_TEXT_MODEL_ID: "openai/gpt-5.4-mini",
  getAiTextModel: vi.fn(() => ({ id: "openai/gpt-5.4-mini", supportsVision: true })),
}));

vi.mock("ai", () => ({
  generateText: vi.fn(),
  streamText,
}));

function allowedDecision() {
  return {
    allowed: true,
    limited: false,
    policyName: "test",
    limit: 1,
    remaining: 0,
    resetSeconds: 60,
    key: "rl:v1:test:ip:hidden",
    identityKind: "ip",
  };
}

function rejectedDecision() {
  return {
    allowed: false,
    limited: true,
    policyName: "test",
    limit: 1,
    remaining: 0,
    retryAfterSeconds: 60,
    resetSeconds: 60,
    key: "rl:v1:test:ip:hidden",
    identityKind: "ip",
  };
}

describe("rate limited route handlers", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    rateLimitDecision.mockResolvedValue(allowedDecision());
    authHandlerGet.mockResolvedValue(new Response("auth ok"));
    authHandlerPost.mockResolvedValue(new Response("auth post ok"));
    fetchAuthAction.mockResolvedValue({
      modelId: "openai/gpt-5.4-mini",
      outputNodeId: "node-output",
      instruction: "write",
      inputText: "draft",
      visualReferences: [],
      modelSupportsVision: true,
      reservationId: "reservation-1",
      shouldDecrementConcurrency: true,
      userId: "user-1",
    });
    streamText.mockReturnValue({
      toTextStreamResponse: (init?: ResponseInit) => new Response("stream ok", init),
    });
  });

  it("auth wrapper calls Better Auth handler when allowed", async () => {
    const route = await import("@/app/api/auth/[...all]/route");
    const response = await route.GET(new Request("https://app.lemonspace.io/api/auth/session"));

    expect(response.status).toBe(200);
    expect(rateLimitDecision).toHaveBeenCalledWith(
      expect.objectContaining({
        policy: expect.objectContaining({ name: "auth:get" }),
        userId: "user-1",
      }),
    );
    expect(authHandlerGet).toHaveBeenCalledOnce();
  });

  it("auth wrapper skips Better Auth handler when rejected", async () => {
    rateLimitDecision.mockResolvedValue(rejectedDecision());
    const route = await import("@/app/api/auth/[...all]/route");
    const response = await route.POST(new Request("https://app.lemonspace.io/api/auth/sign-in", { method: "POST" }));

    expect(response.status).toBe(429);
    expect(authHandlerPost).not.toHaveBeenCalled();
  });

  it("Pexels proxy does not call upstream fetch when rejected", async () => {
    rateLimitDecision.mockResolvedValue(rejectedDecision());
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const route = await import("@/app/api/pexels-video/route");
    const response = await route.GET(
      new Request("https://app.lemonspace.io/api/pexels-video?u=https%3A%2F%2Fvideos.pexels.com%2Fvideo.mp4") as never,
    );

    expect(response.status).toBe(429);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("AI text stream route does not reserve credits when rejected", async () => {
    rateLimitDecision.mockResolvedValue(rejectedDecision());
    const route = await import("@/app/api/ai-stream/text/route");
    const response = await route.POST(
      new Request("https://app.lemonspace.io/api/ai-stream/text", {
        method: "POST",
        body: JSON.stringify({
          canvasId: "canvas-1",
          sourceNodeId: "source-1",
          outputNodeId: "output-1",
          modelId: "openai/gpt-5.4-mini",
          inputText: "draft",
        }),
      }),
    );

    expect(response.status).toBe(429);
    expect(fetchAuthAction).not.toHaveBeenCalled();
  });

  it("AI text stream route passes system messages through instructions", async () => {
    const route = await import("@/app/api/ai-stream/text/route");
    const response = await route.POST(
      new Request("https://app.lemonspace.io/api/ai-stream/text", {
        method: "POST",
        body: JSON.stringify({
          canvasId: "canvas-1",
          sourceNodeId: "source-1",
          outputNodeId: "output-1",
          modelId: "openai/gpt-5.4-mini",
          inputText: "draft",
        }),
      }),
    );

    expect(response.status).toBe(200);
    expect(streamText).toHaveBeenCalledWith(
      expect.objectContaining({
        instructions: "Text stream system rule",
        messages: [{ role: "user", content: "hello" }],
      }),
    );
  });

  it("AI agent stream route does not prepare a run when rejected", async () => {
    rateLimitDecision.mockResolvedValue(rejectedDecision());
    const route = await import("@/app/api/ai-stream/agent/route");
    const response = await route.POST(
      new Request("https://app.lemonspace.io/api/ai-stream/agent", {
        method: "POST",
        body: JSON.stringify({
          canvasId: "canvas-1",
          nodeId: "agent-1",
          modelId: "openai/gpt-5.4-mini",
          locale: "de",
        }),
      }),
    );

    expect(response.status).toBe(429);
    expect(fetchAuthAction).not.toHaveBeenCalled();
  });

  it("AI agent stream route passes prepared system messages through instructions", async () => {
    fetchAuthAction.mockResolvedValueOnce({
      modelId: "openai/gpt-5.4-mini",
      outputNodeId: "agent-output-1",
      messages: [
        { role: "system", content: "Agent stream system rule" },
        { role: "user", content: "Agent status" },
      ],
      userId: "user-1",
    });

    const route = await import("@/app/api/ai-stream/agent/route");
    const response = await route.POST(
      new Request("https://app.lemonspace.io/api/ai-stream/agent", {
        method: "POST",
        body: JSON.stringify({
          canvasId: "canvas-1",
          nodeId: "agent-1",
          modelId: "openai/gpt-5.4-mini",
          locale: "de",
        }),
      }),
    );

    expect(response.status).toBe(200);
    expect(streamText).toHaveBeenCalledWith(
      expect.objectContaining({
        instructions: "Agent stream system rule",
        messages: [{ role: "user", content: "Agent status" }],
      }),
    );
  });

  it("Redis fail-open decisions still reach the underlying handler", async () => {
    rateLimitDecision.mockResolvedValue({
      ...allowedDecision(),
      redisError: true,
    });
    const route = await import("@/app/api/auth/[...all]/route");
    const response = await route.GET(new Request("https://app.lemonspace.io/api/auth/session"));

    expect(response.status).toBe(200);
    expect(authHandlerGet).toHaveBeenCalledOnce();
  });
});
