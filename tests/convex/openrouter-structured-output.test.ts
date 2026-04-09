import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { generateStructuredObjectViaOpenRouter } from "@/convex/openrouter";

type MockResponseInit = {
  ok: boolean;
  status: number;
  json?: unknown;
  text?: string;
};

function createMockResponse(init: MockResponseInit): Response {
  return {
    ok: init.ok,
    status: init.status,
    json: vi.fn(async () => init.json),
    text: vi.fn(async () => init.text ?? JSON.stringify(init.json ?? {})),
  } as unknown as Response;
}

describe("generateStructuredObjectViaOpenRouter", () => {
  const fetchMock = vi.fn<typeof fetch>();

  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("posts chat completion request with strict json_schema and parses response content", async () => {
    fetchMock.mockResolvedValueOnce(
      createMockResponse({
        ok: true,
        status: 200,
        json: {
          choices: [
            {
              message: {
                content: '{"title":"LemonSpace","confidence":0.92}',
              },
            },
          ],
        },
      }),
    );

    const schema = {
      type: "object",
      additionalProperties: false,
      required: ["title", "confidence"],
      properties: {
        title: { type: "string" },
        confidence: { type: "number" },
      },
    };

    const result = await generateStructuredObjectViaOpenRouter<{
      title: string;
      confidence: number;
    }>("test-api-key", {
      model: "openai/gpt-5-mini",
      messages: [
        { role: "system", content: "Extract a JSON object." },
        { role: "user", content: "Title is LemonSpace with confidence 0.92" },
      ],
      schemaName: "extract_title",
      schema,
    });

    expect(result).toEqual({ title: "LemonSpace", confidence: 0.92 });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith(
      "https://openrouter.ai/api/v1/chat/completions",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          Authorization: "Bearer test-api-key",
          "Content-Type": "application/json",
          "HTTP-Referer": "https://app.lemonspace.io",
          "X-Title": "LemonSpace",
        }),
      }),
    );

    const firstCallArgs = fetchMock.mock.calls[0];
    const init = firstCallArgs?.[1] as RequestInit | undefined;
    const bodyRaw = init?.body;
    const body = JSON.parse(typeof bodyRaw === "string" ? bodyRaw : "{}");

    expect(body).toMatchObject({
      model: "openai/gpt-5-mini",
      messages: [
        { role: "system", content: "Extract a JSON object." },
        { role: "user", content: "Title is LemonSpace with confidence 0.92" },
      ],
      response_format: {
        type: "json_schema",
        json_schema: {
          name: "extract_title",
          strict: true,
          schema,
        },
      },
    });
  });

  it("throws ConvexError code when response content is missing", async () => {
    fetchMock.mockResolvedValueOnce(
      createMockResponse({
        ok: true,
        status: 200,
        json: {
          choices: [
            {
              message: {},
            },
          ],
        },
      }),
    );

    await expect(
      generateStructuredObjectViaOpenRouter("test-api-key", {
        model: "openai/gpt-5-mini",
        messages: [{ role: "user", content: "hello" }],
        schemaName: "test_schema",
        schema: { type: "object" },
      }),
    ).rejects.toMatchObject({
      data: { code: "OPENROUTER_STRUCTURED_OUTPUT_MISSING_CONTENT" },
    });
  });

  it("throws ConvexError code when response content is invalid JSON", async () => {
    fetchMock.mockResolvedValueOnce(
      createMockResponse({
        ok: true,
        status: 200,
        json: {
          choices: [
            {
              message: {
                content: "not valid json",
              },
            },
          ],
        },
      }),
    );

    await expect(
      generateStructuredObjectViaOpenRouter("test-api-key", {
        model: "openai/gpt-5-mini",
        messages: [{ role: "user", content: "hello" }],
        schemaName: "test_schema",
        schema: { type: "object" },
      }),
    ).rejects.toMatchObject({
      data: { code: "OPENROUTER_STRUCTURED_OUTPUT_INVALID_JSON" },
    });
  });

  it("throws ConvexError code when OpenRouter responds with non-ok status", async () => {
    fetchMock.mockResolvedValueOnce(
      createMockResponse({
        ok: false,
        status: 503,
        text: "service unavailable",
      }),
    );

    await expect(
      generateStructuredObjectViaOpenRouter("test-api-key", {
        model: "openai/gpt-5-mini",
        messages: [{ role: "user", content: "hello" }],
        schemaName: "test_schema",
        schema: { type: "object" },
      }),
    ).rejects.toMatchObject({
      data: {
        code: "OPENROUTER_STRUCTURED_OUTPUT_HTTP_ERROR",
        status: 503,
      },
    });
  });
});
